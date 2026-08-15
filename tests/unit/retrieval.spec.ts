/**
 * Unit tests for the vector arithmetic and the fallback behaviour.
 *
 * None of these load the model. That is the point: CI installs without the
 * optional dependency, so the code paths that matter there are the ones tested
 * here, with vectors injected by hand.
 */
import { expect, test } from '@playwright/test';

import { cosine, type EmbeddingIndex, fuseRankings, rankByVector } from '../../src/embeddings';
import { chunkMarkdown } from '../../src/knowledge';
import { retrieve } from '../../src/retrieval';

test.describe('cosine', () => {
  test('is 1 for identical direction and 0 for perpendicular', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test('ignores magnitude, which is the whole point of using it', () => {
    expect(cosine([1, 1], [10, 10])).toBeCloseTo(1);
  });

  test('is negative for opposite direction', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test('returns 0 rather than NaN for a zero vector', () => {
    // A zero vector reaching here means an upstream bug; NaN would then spread
    // silently through the ranking instead of sorting to the bottom.
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  test('returns 0 for mismatched dimensions', () => {
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
  });
});

test.describe('fuseRankings', () => {
  test('puts an item both lists agree on above one only one list has', () => {
    const fused = fuseRankings([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(fused[0].id).toBe('b');
  });

  test('respects per-source weights', () => {
    // Same input, but the second list counts triple, so its leader wins.
    const equal = fuseRankings([['a'], ['z']]);
    const weighted = fuseRankings([['a'], ['z']], { weights: [1, 3] });
    expect(equal[0].id).toBe('a');
    expect(weighted[0].id).toBe('z');
  });

  test('is deterministic on ties', () => {
    expect(fuseRankings([['b', 'a']], { k: 0 }).map((h) => h.id)).toEqual(['b', 'a']);
    expect(fuseRankings([['a'], ['b']]).map((h) => h.id)).toEqual(['a', 'b']);
  });

  test('survives empty input', () => {
    expect(fuseRankings([])).toEqual([]);
  });
});

test.describe('rankByVector', () => {
  const index: EmbeddingIndex = {
    model: 'test',
    dimensions: 2,
    vectors: { near: [1, 0], diagonal: [0.7071, 0.7071], opposite: [-1, 0] },
  };

  test('orders by similarity and drops what points away', () => {
    const ranked = rankByVector([1, 0], index, 10);
    expect(ranked.map((h) => h.id)).toEqual(['near', 'diagonal']);
  });

  test('honours the limit', () => {
    expect(rankByVector([1, 0], index, 1)).toHaveLength(1);
  });
});

test.describe('retrieve fallback', () => {
  const chunks = chunkMarkdown(
    'demo.md',
    '## Cart badge\n\nThe badge shows the item count.\n\n## Sorting\n\nProducts sort by price.',
  );

  test('falls back to BM25 when there is no embedding index, and says so', async () => {
    // This is the CI path: the optional dependency is not installed at all.
    const result = await retrieve('cart badge', { chunks, index: null });
    expect(result.mode).toBe('bm25');
    expect(result.hits[0].chunk.title).toBe('Cart badge');
  });

  test('stays lexical when asked to, even if an index exists', async () => {
    const result = await retrieve('cart badge', {
      chunks,
      index: { model: 'test', dimensions: 2, vectors: {} },
      mode: 'bm25',
    });
    expect(result.mode).toBe('bm25');
  });

  test('returns nothing for a query no chunk matches', async () => {
    const result = await retrieve('kubernetes ingress', { chunks, index: null });
    expect(result.hits).toEqual([]);
  });
});
