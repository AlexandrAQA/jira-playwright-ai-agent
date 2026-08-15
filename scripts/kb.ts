/**
 * scripts/kb.ts
 * ---------------------------------------------------------------------------
 * CLI over the knowledge base, so the agent can look something up with one
 * cheap shell call instead of opening a browser.
 *
 *   npx tsx scripts/kb.ts search "add a product to the cart"
 *   npx tsx scripts/kb.ts search "checkout totals" --limit 5
 *   npx tsx scripts/kb.ts list
 * ---------------------------------------------------------------------------
 */
import { formatHits, loadChunks, search } from '../src/knowledge';

function main(): void {
  const [command, ...rest] = process.argv.slice(2);

  const limitFlag = rest.indexOf('--limit');
  const limit = limitFlag === -1 ? 3 : Number(rest[limitFlag + 1]);
  const words = limitFlag === -1 ? rest : rest.slice(0, limitFlag);

  const chunks = loadChunks();

  switch (command) {
    case 'search': {
      const query = words.join(' ');
      if (!query.trim()) {
        console.error('Usage: npx tsx scripts/kb.ts search "<query>" [--limit N]');
        process.exit(1);
      }
      console.log(formatHits(search(query, chunks, Number.isFinite(limit) ? limit : 3)));
      break;
    }

    case 'list': {
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
          '  search "<query>" [--limit N]   rank knowledge chunks against a query (BM25)',
          '  list                           every chunk currently indexed',
        ].join('\n'),
      );
  }
}

main();
