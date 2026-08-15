/**
 * src/embeddings.ts
 * ---------------------------------------------------------------------------
 * Local sentence embeddings, and the arithmetic for combining them with BM25.
 *
 * Three deliberate constraints:
 *
 * 1. **Local.** The model runs on this machine. No second API key, no text
 *    leaving the repository, nothing to rotate.
 * 2. **Optional.** `@huggingface/transformers` is an optional dependency and is
 *    loaded dynamically. It pulls `onnxruntime-node` and `sharp`, which carry
 *    high-severity advisories with no fix available, so CI installs with
 *    `--omit=optional` and never has that code present at all. Retrieval
 *    degrades to BM25 rather than failing when the model is absent.
 * 3. **Precomputed.** Chunk vectors are built once by `npm run kb:index` and
 *    committed as data. Only the query needs the model at search time.
 *
 * The advisories are worth stating plainly rather than waving through: adm-zip
 * is used by onnxruntime to unpack its own bundled binaries, not attacker
 * input, and sharp handles images this project never touches. That is a triage,
 * and the reason CI is kept clear of the dependency entirely is that a triage
 * is a judgement, not a guarantee.
 * ---------------------------------------------------------------------------
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Small, fast, and good enough for short technical English. */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export const EMBEDDINGS_FILE = join(__dirname, '..', 'knowledge', 'embeddings.json');

export interface EmbeddingIndex {
  model: string;
  dimensions: number;
  /** Chunk id -> unit-length vector. */
  vectors: Record<string, number[]>;
}

/**
 * Cosine similarity of two vectors.
 *
 * The vectors are already normalised, so this is a dot product, but the
 * division is kept: an un-normalised vector reaching here would otherwise
 * produce a confidently wrong score instead of a correct one.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Reciprocal rank fusion of several ranked lists.
 *
 * Chosen over adding the scores together because BM25 scores and cosine
 * similarities are not on the same scale and never will be: one is unbounded
 * and corpus-dependent, the other sits in [-1, 1]. Fusing on rank sidesteps
 * that entirely and needs no weight to tune per corpus.
 *
 * `k` damps the influence of the top position; 60 is the value from the
 * original paper and behaves sensibly on lists this short.
 */
export function fuseRankings(
  rankings: string[][],
  options: { k?: number; weights?: number[] } = {},
): Array<{ id: string; score: number }> {
  const k = options.k ?? 60;
  const scores = new Map<string, number>();

  rankings.forEach((ranking, source) => {
    const weight = options.weights?.[source] ?? 1;
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + index + 1));
    });
  });

  return (
    [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      // Ties break on id so the output is reproducible, which matters when it
      // feeds an agent prompt.
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  );
}

/** Rank chunk ids by similarity to a query vector. */
export function rankByVector(
  queryVector: number[],
  index: EmbeddingIndex,
  limit: number,
): Array<{ id: string; score: number }> {
  return Object.entries(index.vectors)
    .map(([id, vector]) => ({ id, score: cosine(queryVector, vector) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Read the committed index. Absent index simply means "no semantic ranking". */
export function loadEmbeddingIndex(file: string = EMBEDDINGS_FILE): EmbeddingIndex | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as EmbeddingIndex;
  } catch {
    return null;
  }
}

/** Shape of the one function used from the optional dependency. */
type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

let extractor: FeatureExtractor | null = null;

/**
 * Load the model, or explain why it is not there.
 *
 * Returns null instead of throwing: every caller has a working fallback, and a
 * missing optional dependency is a configuration, not a fault.
 */
export async function loadExtractor(): Promise<FeatureExtractor | null> {
  if (extractor) return extractor;

  try {
    const transformers = (await import('@huggingface/transformers')) as unknown as {
      pipeline: (task: string, model: string) => Promise<FeatureExtractor>;
    };
    extractor = await transformers.pipeline('feature-extraction', EMBEDDING_MODEL);
    return extractor;
  } catch {
    return null;
  }
}

/** Embed texts into unit-length vectors. Null when the model is unavailable. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const model = await loadExtractor();
  if (!model) return null;

  const output = await model(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}
