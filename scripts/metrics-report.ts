/**
 * scripts/metrics-report.ts
 * ---------------------------------------------------------------------------
 * Print the cost table from `metrics/runs.jsonl`.
 *
 *   npm run metrics
 *
 * The output is Markdown, so it drops straight into the README between the
 * `<!-- metrics:start -->` and `<!-- metrics:end -->` markers. Passing --write
 * does that substitution in place, which is the point: the number in the README
 * is never typed by a human and therefore never drifts from the data.
 * ---------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readRuns, summarise, toMarkdownTable } from '../src/metrics';

const README = join(__dirname, '..', 'README.md');
const START = '<!-- metrics:start -->';
const END = '<!-- metrics:end -->';

function main(): void {
  const table = toMarkdownTable(summarise(readRuns()));

  if (!process.argv.includes('--write')) {
    console.log(table);
    return;
  }

  const readme = readFileSync(README, 'utf8');
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    console.error(`Could not find the ${START} / ${END} markers in README.md.`);
    process.exit(1);
  }

  const updated = `${readme.slice(0, start + START.length)}\n\n${table}\n\n${readme.slice(end)}`;
  writeFileSync(README, updated, 'utf8');
  console.log('README.md updated from metrics/runs.jsonl.');
}

main();
