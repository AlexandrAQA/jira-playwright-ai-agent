/**
 * src/knowledge.ts
 * ---------------------------------------------------------------------------
 * Retrieval over the project knowledge base in `knowledge/`.
 *
 * Why this exists: without it the agent has to open a real browser through
 * Playwright MCP for every ticket just to rediscover selectors it already found
 * last week. Each MCP call drops an accessibility snapshot into the context and
 * that snapshot stays there, so recon is the most expensive part of a run.
 * Retrieval turns "explore the app" into "look it up, explore only the gaps".
 *
 * The knowledge base is plain Markdown on purpose: it shows up in pull request
 * diffs, a human can correct a wrong selector by editing a line, and the agent
 * can append to it with the same tools it already uses.
 *
 * Ranking is BM25. It is the honest baseline for keyword retrieval: term
 * frequency saturates (the tenth "cart" adds almost nothing), rare terms weigh
 * more than common ones, and long documents do not win by being long.
 * Embeddings are the next step, not a replacement for having a baseline.
 * ---------------------------------------------------------------------------
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const KNOWLEDGE_DIR = join(__dirname, '..', 'knowledge');

/** BM25 term-frequency saturation. Standard default. */
const K1 = 1.5;
/** BM25 length normalisation. Standard default. */
const B = 0.75;

/**
 * How many times the heading is counted in the index.
 *
 * A heading is a curated label a human wrote to say what the section is about,
 * so a term in it is worth more than the same term buried in prose. Without
 * this, "which selector is the login button" ranks a general section about
 * selector style above the section that actually lists the login selectors.
 */
const TITLE_WEIGHT = 3;

/**
 * How many times the document `# Title` is counted in every chunk of that file.
 *
 * A chunk inherits its document's subject: a table of selectors under
 * "SauceDemo: cart and checkout" is about checkout even when the word never
 * appears in the table. Without this, a query naming the page loses to a chunk
 * from another page that happens to share more of the generic words.
 */
const DOC_TITLE_WEIGHT = 2;

/**
 * Words too common to carry meaning here. Deliberately short: an aggressive
 * list would strip "up" out of "sign up" and "out" out of "locked out user".
 */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'at',
  'by',
  'as',
  'from',
  'into',
  'then',
  'than',
]);

export interface Chunk {
  /** Stable identifier, e.g. `saucedemo-login.md#error-messages`. */
  id: string;
  /** File the chunk came from. */
  source: string;
  /** The `##` heading the chunk sits under. */
  title: string;
  /** The chunk body, without the heading line. */
  text: string;
  /** Pre-tokenised body plus title, so scoring does not re-tokenise per query. */
  tokens: string[];
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

/**
 * Fold a trivial plural into its singular.
 *
 * Not a real stemmer, and deliberately so. The knowledge base is technical
 * English where the only ending that actually costs recall is the plural: a
 * query for "which selector" must reach a section titled "Checkout selectors".
 * Anything more aggressive would start mangling identifiers.
 */
function singularize(term: string): string {
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && term.endsWith('sses')) return term.slice(0, -2);
  if (term.endsWith('ss')) return term;
  if (term.length > 3 && term.endsWith('s')) return term.slice(0, -1);
  return term;
}

/** Lowercase, split on anything that is not a letter or digit, drop noise. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(singularize);
}

/** `Error messages` -> `error-messages`, used to build chunk ids. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Split one Markdown document into chunks, one per `##` heading.
 *
 * Headings are the natural unit here: the knowledge base is written so that a
 * section answers one question ("how do I reach the cart", "what does the
 * confirmation page say"), which is exactly the granularity a retrieval hit
 * should have. Anything before the first `##` becomes an "Overview" chunk.
 */
export function chunkMarkdown(source: string, markdown: string): Chunk[] {
  const sections: Array<{ title: string; text: string }> = [];
  let docTitle = '';
  let title = 'Overview';
  let body: string[] = [];

  const flush = (): void => {
    const text = body.join('\n').trim();
    body = [];
    if (text) sections.push({ title, text });
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      title = heading[1].trim();
      continue;
    }
    // The document `# Title` is the subject of every chunk below it, not content.
    const docHeading = /^#\s+(.*)$/.exec(line);
    if (docHeading) {
      docTitle = docHeading[1].trim();
      continue;
    }
    body.push(line);
  }
  flush();

  const repeat = (text: string, times: number): string[] =>
    Array.from({ length: times }, () => tokenize(text)).flat();

  return sections.map(({ title: sectionTitle, text }) => ({
    id: `${basename(source)}#${slug(sectionTitle)}`,
    source: basename(source),
    title: sectionTitle,
    text,
    tokens: [
      ...repeat(docTitle, DOC_TITLE_WEIGHT),
      ...repeat(sectionTitle, TITLE_WEIGHT),
      ...tokenize(text),
    ],
  }));
}

/** Read and chunk every Markdown file in the knowledge directory. */
export function loadChunks(dir: string = KNOWLEDGE_DIR): Chunk[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    // A missing knowledge directory is not an error: the agent falls back to
    // exploring the app, which is what it did before any of this existed.
    return [];
  }

  return files.sort().flatMap((file) => chunkMarkdown(file, readFileSync(join(dir, file), 'utf8')));
}

/**
 * Rank chunks against a query with BM25.
 *
 * Returns only chunks that share at least one term with the query, best first.
 * Ties break on chunk id so the output is deterministic, which matters because
 * this feeds an agent prompt and a flapping order would make runs unreproducible.
 */
export function search(query: string, chunks: Chunk[], limit = 3): ScoredChunk[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || chunks.length === 0) return [];

  const total = chunks.length;
  const avgLength = chunks.reduce((sum, c) => sum + c.tokens.length, 0) / total;

  // Document frequency: in how many chunks does each term appear at all.
  const docFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(chunk.tokens)) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
  }

  const scored: ScoredChunk[] = chunks.map((chunk) => {
    const termFrequency = new Map<string, number>();
    for (const term of chunk.tokens) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTokens) {
      const frequency = termFrequency.get(term) ?? 0;
      if (frequency === 0) continue;

      const containing = docFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - containing + 0.5) / (containing + 0.5));
      const norm = 1 - B + B * (chunk.tokens.length / avgLength);
      score += idf * ((frequency * (K1 + 1)) / (frequency + K1 * norm));
    }

    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, limit);
}

/** Render hits as Markdown, which is what gets pasted into the agent context. */
export function formatHits(hits: ScoredChunk[]): string {
  if (hits.length === 0) {
    return 'No match in the knowledge base. Explore the app with Playwright MCP instead.';
  }
  return hits
    .map(
      ({ chunk, score }) =>
        `### ${chunk.title}\n_${chunk.id}, score ${score.toFixed(2)}_\n\n${chunk.text}`,
    )
    .join('\n\n---\n\n');
}
