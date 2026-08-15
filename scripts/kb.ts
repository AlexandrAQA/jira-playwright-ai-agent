/**
 * scripts/kb.ts
 * ---------------------------------------------------------------------------
 * CLI over the knowledge base, so the agent can look something up with one
 * cheap shell call instead of opening a browser.
 *
 *   npx tsx scripts/kb.ts search "add a product to the cart"
 *   npx tsx scripts/kb.ts search "checkout totals" --limit 5
 *   npx tsx scripts/kb.ts search "which selector is the finish button" --bm25
 *   npx tsx scripts/kb.ts list
 *
 * Search uses local embeddings when they are available and falls back to BM25
 * when they are not. The footer says which one actually ran, because a silent
 * fallback is how you end up debugging retrieval quality that was never the
 * problem.
 * ---------------------------------------------------------------------------
 */
import { formatHits, loadChunks } from '../src/knowledge';
import { type Mode, retrieve } from '../src/retrieval';

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  const limitFlag = rest.indexOf('--limit');
  const limit = limitFlag === -1 ? 3 : Number(rest[limitFlag + 1]);
  const mode: Mode = rest.includes('--bm25')
    ? 'bm25'
    : rest.includes('--hybrid')
      ? 'hybrid'
      : 'semantic';

  const words = (limitFlag === -1 ? rest : rest.slice(0, limitFlag)).filter(
    (w) => !w.startsWith('--'),
  );

  switch (command) {
    case 'search': {
      const query = words.join(' ');
      if (!query.trim()) {
        console.error('Usage: npx tsx scripts/kb.ts search "<query>" [--limit N] [--bm25]');
        process.exit(1);
      }

      const { hits, mode: used } = await retrieve(query, {
        limit: Number.isFinite(limit) ? limit : 3,
        mode,
      });

      console.log(formatHits(hits));
      console.log(
        `\n_retrieval: ${used === 'bm25' ? 'BM25 (lexical)' : used === 'hybrid' ? 'hybrid' : 'local embeddings'}_`,
      );
      break;
    }

    case 'list': {
      const chunks = loadChunks();
      for (const chunk of chunks) {
        console.log(`${chunk.id}  (${chunk.tokens.length} terms)  ${chunk.title}`);
      }
      console.log(`\n${chunks.length} chunk(s) in the knowledge base.`);
      break;
    }

    default:
      console.log(
        [
          'Usage: npx tsx scripts/kb.ts <command>',
          '',
          '  search "<query>" [--limit N]   rank knowledge chunks against a query',
          '    --bm25                       force lexical ranking only',
          '    --hybrid                     fuse lexical and semantic (see kb:eval)',
          '  list                           every chunk currently indexed',
        ].join('\n'),
      );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
