/**
 * Unit tests for the knowledge-base retriever.
 *
 * These need no browser, so they run in the fast CI job next to the linters
 * rather than in the end-to-end job.
 *
 * Two kinds of test live here. The first kind pins the ranking behaviour against
 * a synthetic corpus, so a change to the scoring is caught on purpose rather
 * than noticed later through worse agent output. The second kind queries the
 * real knowledge base, which turns a wrong or deleted section into a red build.
 */
import { expect, test } from '@playwright/test';

import { type Chunk, chunkMarkdown, loadChunks, search, tokenize } from '../../src/knowledge';

/** Build a corpus from plain strings, so a test reads as its own fixture. */
function corpus(docs: Record<string, string>): Chunk[] {
  return Object.entries(docs).flatMap(([name, body]) => chunkMarkdown(name, body));
}

test.describe('tokenize', () => {
  test('lowercases, splits on punctuation and drops stopwords', () => {
    expect(tokenize('The Cart Badge, and the CHECKOUT button!')).toEqual([
      'cart',
      'badge',
      'checkout',
      'button',
    ]);
  });

  test('splits an attribute selector into its parts', () => {
    expect(tokenize('[data-test="shopping-cart-badge"]')).toEqual([
      'data',
      'test',
      'shopping',
      'cart',
      'badge',
    ]);
  });

  test('drops single characters, which carry no signal', () => {
    expect(tokenize('a b ok 1 42')).toEqual(['ok', '42']);
  });
});

test.describe('chunkMarkdown', () => {
  const chunks = chunkMarkdown(
    'demo.md',
    [
      '# Document title',
      '',
      'Preamble line.',
      '',
      '## First section',
      '',
      'Body of the first.',
      '',
      '## Second section',
      '',
      'Body of the second.',
    ].join('\n'),
  );

  test('splits on level-two headings and keeps the preamble', () => {
    expect(chunks.map((c) => c.title)).toEqual(['Overview', 'First section', 'Second section']);
  });

  test('drops the document title from the body', () => {
    expect(chunks[0].text).toBe('Preamble line.');
  });

  test('builds a stable id from file name and heading', () => {
    expect(chunks[1].id).toBe('demo.md#first-section');
  });

  test('skips a heading with no body under it', () => {
    const empty = chunkMarkdown('e.md', ['## Empty', '', '## Filled', '', 'text'].join('\n'));
    expect(empty.map((c) => c.title)).toEqual(['Filled']);
  });
});

test.describe('search ranking', () => {
  const chunks = corpus({
    'a.md': '## Cart badge\n\nThe cart badge shows the item count.',
    'b.md': '## Checkout form\n\nThe checkout form takes a postal code.',
    'c.md': '## Sorting\n\nProducts sort by price.',
  });

  test('puts the section that is about the query first', () => {
    expect(search('cart badge count', chunks, 1)[0].chunk.title).toBe('Cart badge');
  });

  test('returns nothing when no chunk shares a term with the query', () => {
    expect(search('kubernetes ingress', chunks)).toEqual([]);
  });

  test('returns nothing for a query that is only stopwords', () => {
    expect(search('the and of', chunks)).toEqual([]);
  });

  test('honours the limit', () => {
    expect(search('cart checkout price', chunks, 2)).toHaveLength(2);
  });

  test('survives an empty knowledge base', () => {
    expect(search('anything', [])).toEqual([]);
  });

  test('weighs a rare term above a common one', () => {
    // "postal" appears in one chunk, "the" in all of them and is a stopword anyway.
    const hits = search('postal', chunks);
    expect(hits).toHaveLength(1);
    expect(hits[0].chunk.title).toBe('Checkout form');
  });

  test('does not let a long chunk win on length alone', () => {
    // Same single mention of "badge" in both, but one is padded with filler.
    const padded = corpus({
      'short.md': '## Short\n\nbadge',
      'long.md': `## Long\n\nbadge ${'filler '.repeat(200)}`,
    });
    expect(search('badge', padded, 1)[0].chunk.title).toBe('Short');
  });

  test('is deterministic across repeated calls', () => {
    const once = search('cart checkout price', chunks).map((h) => h.chunk.id);
    const twice = search('cart checkout price', chunks).map((h) => h.chunk.id);
    expect(twice).toEqual(once);
  });
});

test.describe('the real knowledge base', () => {
  const chunks = loadChunks();

  test('is loaded and chunked', () => {
    expect(chunks.length).toBeGreaterThan(10);
  });

  test('has no duplicate chunk ids', () => {
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Each row is a question the agent actually asks before writing a spec, and
  // the section that has to come back for the answer to be there. If a rename or
  // an edit breaks one of these, the agent silently loses the answer, so it
  // fails the build instead.
  //
  // The assertion is on the returned set, not on rank one, because that is the
  // real contract: the CLI hands the agent three chunks and the agent reads all
  // three. Demanding rank one would be measuring something nobody depends on,
  // and neighbouring sections of the same page legitimately compete for it.
  const RETRIEVAL_LIMIT = 3;

  const expectations: Array<[question: string, expectedChunkId: string]> = [
    ['how do I assert the cart is empty', 'saucedemo-inventory.md#cart-badge-behaviour'],
    ['which selector is the login button', 'saucedemo-login.md#login-form-and-its-selectors'],
    ['sort products by price low to high', 'saucedemo-inventory.md#sorting'],
    [
      'what are the checkout form field selectors',
      'saucedemo-cart-and-checkout.md#checkout-selectors',
    ],
    [
      'may a spec import from @playwright/test',
      'project-conventions.md#page-objects-and-fixtures-are-mandatory',
    ],
    ['what does the order confirmation page show', 'saucedemo-cart-and-checkout.md#confirmation'],
    ['is a fixed sleep allowed', 'project-conventions.md#waiting'],
  ];

  for (const [question, expectedChunkId] of expectations) {
    test(`answers "${question}"`, () => {
      const hits = search(question, chunks, RETRIEVAL_LIMIT).map((h) => h.chunk.id);
      expect(hits).toContain(expectedChunkId);
    });
  }
});
