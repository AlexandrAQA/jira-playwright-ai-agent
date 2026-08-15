/**
 * scripts/kb-index.ts
 * ---------------------------------------------------------------------------
 * Build the embedding index for the knowledge base.
 *
 *   npm run kb:index
 *
 * Run this after editing anything in `knowledge/` and commit the result. The
 * index is data: it lets the repository ship semantic retrieval without every
 * checkout having to install a native ONNX runtime.
 *
 * The first run downloads the model (about 25 MB) into the transformers.js
 * cache. Later runs are offline.
 * ---------------------------------------------------------------------------
 */
import { writeFileSync } from 'node:fs';

import { embed, EMBEDDING_MODEL, EMBEDDINGS_FILE, type EmbeddingIndex } from '../src/embeddings';
import { loadChunks } from '../src/knowledge';

async function main(): Promise<void> {
  const chunks = loadChunks();
  if (chunks.length === 0) {
    console.error('No chunks found in knowledge/. Nothing to index.');
    process.exit(1);
  }

  console.log(`Embedding ${chunks.length} chunk(s) with ${EMBEDDING_MODEL} ...`);

  // Heading plus body, the same text BM25 sees, so the two rank the same thing.
  const vectors = await embed(chunks.map((c) => `${c.title}\n\n${c.text}`));

  if (!vectors) {
    console.error(
      [
        'The embedding model is not available.',
        'It is an optional dependency; install it with:',
        '',
        '  npm install --include=optional',
        '',
        'Retrieval works without it, using BM25 alone.',
      ].join('\n'),
    );
    process.exit(1);
  }

  // Six decimals. The vectors are unit length, so this is far below anything
  // cosine similarity can distinguish, and it roughly halves a file that is
  // committed and re-diffed every time the knowledge base changes.
  const round = (vector: number[]): number[] => vector.map((v) => Number(v.toFixed(6)));

  const index: EmbeddingIndex = {
    model: EMBEDDING_MODEL,
    dimensions: vectors[0].length,
    vectors: Object.fromEntries(chunks.map((chunk, i) => [chunk.id, round(vectors[i])])),
  };

  writeFileSync(EMBEDDINGS_FILE, `${JSON.stringify(index)}\n`, 'utf8');

  console.log(
    `Wrote knowledge/embeddings.json: ${chunks.length} vectors of ${index.dimensions} dimensions.`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
