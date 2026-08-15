/**
 * src/retrieval.ts
 * ---------------------------------------------------------------------------
 * Hybrid retrieval: BM25 and sentence embeddings, fused on rank.
 *
 * The two disagree in useful ways. BM25 is exact: it finds `data-test` and
 * `checkout-step-two` because those literal strings are in the text. Embeddings
 * are approximate: they connect "how do I know the cart is empty" to a section
 * that never uses the word "empty". Neither subsumes the other, so both vote.
 *
 * When the model is unavailable this is BM25 alone, by design and not by
 * accident: see src/embeddings.ts for why the dependency is optional.
 * ---------------------------------------------------------------------------
 */
import {
  embed,
  type EmbeddingIndex,
  fuseRankings,
  loadEmbeddingIndex,
  rankByVector,
} from './embeddings';
import { type Chunk, loadChunks, search as bm25Search } from './knowledge';

/** `vector` exists so the evaluation can show what each half contributes alone. */
/**
 * `semantic` is the default: embeddings when they are available, BM25 when they
 * are not. `bm25` forces the lexical path. `hybrid` fuses both and is kept
 * because `npm run kb:eval` has to be able to re-measure it.
 */
export type Mode = 'semantic' | 'bm25' | 'hybrid';

/**
 * How much more the semantic ranking counts than the lexical one when fusing.
 *
 * Only reachable through `mode: 'hybrid'`, which is not the default: see the
 * note above `retrieve`.
 */
export const VECTOR_WEIGHT = Number(process.env.KB_VECTOR_WEIGHT ?? 3);

export interface Hit {
  chunk: Chunk;
  /** Fused rank score, or the raw BM25 score in lexical-only mode. */
  score: number;
}

export interface RetrievalResult {
  hits: Hit[];
  /** What actually happened, not what was asked for. */
  mode: Mode;
}

/**
 * Retrieve for one query.
 *
 * The default is embeddings, not the fusion, and that is a measured decision
 * rather than a fashionable one. `npm run kb:eval` scores all three against two
 * suites, one paraphrased and one written in exact tokens. Over 25 queries:
 *
 *   BM25 only        recall@3 64%   MRR 0.593
 *   Embeddings only  recall@3 84%   MRR 0.780
 *   Hybrid, fused    recall@3 76%   MRR 0.660
 *
 * Fusion lost. On a paraphrased question BM25 does not merely rank worse, it
 * votes confidently for wrong sections and displaces correct ones. Weighting
 * the fusion towards the vectors was tried across weights 1 to 10 and the curve
 * came back non-monotonic, 76, 80, 80, 80, 76, 84, which is the shape of fitting
 * noise on a 25-query set rather than of a real gain. So the simpler thing ships
 * and the harness stays, because the balance will shift as the corpus grows.
 *
 * The result reports the mode it actually used, so a caller never has to guess
 * whether the semantic half ran.
 */
export async function retrieve(
  query: string,
  options: { limit?: number; mode?: Mode; chunks?: Chunk[]; index?: EmbeddingIndex | null } = {},
): Promise<RetrievalResult> {
  const limit = options.limit ?? 3;
  const chunks = options.chunks ?? loadChunks();
  const pool = Math.max(limit * 4, 10);

  const lexical = bm25Search(query, chunks, pool);

  if (options.mode === 'bm25') {
    return { hits: lexical.slice(0, limit), mode: 'bm25' };
  }

  const index = options.index === undefined ? loadEmbeddingIndex() : options.index;
  if (!index) {
    return { hits: lexical.slice(0, limit), mode: 'bm25' };
  }

  const queryVectors = await embed([query]);
  if (!queryVectors?.[0]) {
    return { hits: lexical.slice(0, limit), mode: 'bm25' };
  }

  const semantic = rankByVector(queryVectors[0], index, pool);
  const byId = new Map(chunks.map((c) => [c.id, c]));

  const ranked =
    options.mode === 'hybrid'
      ? fuseRankings([lexical.map((h) => h.chunk.id), semantic.map((h) => h.id)], {
          weights: [1, VECTOR_WEIGHT],
        })
      : semantic;

  const hits = ranked
    .map(({ id, score }) => ({ chunk: byId.get(id), score }))
    .filter((hit): hit is Hit => hit.chunk !== undefined)
    .slice(0, limit);

  return { hits, mode: options.mode === 'hybrid' ? 'hybrid' : 'semantic' };
}
