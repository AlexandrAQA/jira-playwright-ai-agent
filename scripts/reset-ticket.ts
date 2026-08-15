/**
 * scripts/reset-ticket.ts
 * ---------------------------------------------------------------------------
 * Put a ticket back to the starting line so a run can be measured again.
 *
 *   npm run reset -- AIQA-7
 *   npm run reset -- AIQA-7 --dry-run
 *
 * Measuring the same ticket twice, once per strategy, is the only way to compare
 * pipelines rather than compare tickets. That needs the ticket back in "To Do"
 * and the generated spec gone, otherwise the agent finds the answer already
 * written and the second run measures nothing.
 *
 * The spec is deleted from the working tree only; it is in git, so
 * `git checkout tests/generated/aiqa-N.spec.ts` brings it back.
 * ---------------------------------------------------------------------------
 */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { getIssue, moveIssue } from '../src/jira';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const ticket = argv.find((a) => /^[A-Z]+-\d+$/.test(a));

  if (!ticket) {
    console.error('Usage: npm run reset -- AIQA-N [--dry-run]');
    process.exit(1);
  }

  const specPath = join(__dirname, '..', 'tests', 'generated', `${ticket.toLowerCase()}.spec.ts`);
  const specExists = existsSync(specPath);
  const issue = await getIssue(ticket);

  if (dryRun) {
    console.log(`DRY RUN for ${ticket}, nothing was changed:`);
    console.log(`  status  ${issue.status} -> To Do`);
    console.log(
      `  spec    ${specExists ? `would delete tests/generated/${ticket.toLowerCase()}.spec.ts` : 'not present, nothing to delete'}`,
    );
    return;
  }

  if (issue.status === 'To Do') {
    console.log(`${ticket} is already in To Do.`);
  } else {
    await moveIssue(ticket, 'To Do');
    console.log(`${ticket}: ${issue.status} -> To Do`);
  }

  if (specExists) {
    rmSync(specPath);
    console.log(
      `deleted tests/generated/${ticket.toLowerCase()}.spec.ts (restore with git checkout)`,
    );
  } else {
    console.log('no generated spec to delete');
  }

  console.log(`\nReady. Measure with: npm run agent -- ${ticket} --strategy kb-first`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
