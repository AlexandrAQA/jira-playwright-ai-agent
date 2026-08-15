/**
 * scripts/run-agent.ts
 * ---------------------------------------------------------------------------
 * Run the agent on one ticket and record what it cost.
 *
 *   npm run agent -- AIQA-7
 *   npm run agent -- AIQA-7 --strategy mcp-only --model haiku
 *   npm run agent -- AIQA-7 --dry-run
 *
 * This is the measured entry point. `scripts/watch-jira.ts` stays the unmeasured
 * one for the label-triggered demo, because a watcher should not depend on the
 * measurement working.
 *
 * IMPORTANT: a real run bills the Anthropic API key from `.env`. `--dry-run`
 * prints the exact command and records nothing, which is the safe way to check
 * the wiring.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

import {
  appendRun,
  parseAgentResult,
  type RunRecord,
  type Strategy,
  totalTokens,
} from '../src/metrics';

/**
 * Never spawn this through a shell.
 *
 * With `shell: true` Node concatenates the arguments instead of escaping them,
 * so a prompt containing spaces is split into separate arguments and the agent
 * receives nonsense. That is exactly what DEP0190 warns about, and it cost one
 * measured run that reported success while doing nothing at all. On Windows the
 * npm shim is `claude.cmd`, which spawns fine without a shell.
 */
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude';

interface Options {
  ticket: string;
  strategy: Strategy;
  model: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };

  const ticket = argv.find((a) => /^[A-Z]+-\d+$/.test(a));
  if (!ticket) {
    console.error(
      'Usage: npm run agent -- AIQA-N [--strategy kb-first|mcp-only] [--model haiku] [--dry-run]',
    );
    process.exit(1);
  }

  const strategy = flag('strategy') === 'mcp-only' ? 'mcp-only' : 'kb-first';

  return {
    ticket,
    strategy,
    model: flag('model') ?? process.env.WATCH_MODEL ?? 'haiku',
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * The prompt differs by strategy, because that is the thing being measured.
 *
 * `mcp-only` reproduces the original loop on purpose, so the comparison is
 * between two real pipelines rather than between a pipeline and a memory of one.
 */
function promptFor({ ticket, strategy }: Options): string {
  const common = `pick up ${ticket}. Run autonomously without asking for confirmation; this is a triggered headless run.`;
  if (strategy === 'mcp-only') {
    return `${common} For this run only, do NOT use the knowledge base or scripts/kb.ts: discover every selector by exploring the app through Playwright MCP, as the original workflow did.`;
  }
  return common;
}

function run(options: Options): void {
  const args = [
    '-p',
    promptFor(options),
    '--model',
    options.model,
    '--permission-mode',
    'bypassPermissions',
    '--mcp-config',
    '.mcp.json',
    '--strict-mcp-config',
    // Machine-readable result, which is where the usage figures come from.
    '--output-format',
    'json',
  ];

  if (options.dryRun) {
    console.log(`DRY RUN, nothing was executed and nothing was recorded:\n`);
    console.log(`claude ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
    return;
  }

  const specPath = join(
    __dirname,
    '..',
    'tests',
    'generated',
    `${options.ticket.toLowerCase()}.spec.ts`,
  );

  const startedAt = Date.now();
  // stdin is closed rather than left as an open pipe: the CLI otherwise waits
  // for input it will never get and reports "no stdin data received in 3s".
  const child = spawn(CLAUDE_BIN, args, { stdio: ['ignore', 'pipe', 'inherit'] });

  let stdout = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  child.on('error', (err) => {
    console.error(`Could not start ${CLAUDE_BIN}: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    const parsed = parseAgentResult(stdout);

    // Keep the raw payload for the next time a run looks wrong.
    mkdirSync(join(__dirname, '..', 'metrics'), { recursive: true });
    writeFileSync(join(__dirname, '..', 'metrics', 'last-run.json'), stdout, 'utf8');

    // A zero exit code proves the process ended, not that the work happened.
    // The workflow's actual product is the spec file, so that is what decides.
    const producedSpec = existsSync(specPath);
    const succeeded = code === 0 && !parsed.isError && producedSpec;

    const record: RunRecord = {
      ticket: options.ticket,
      timestamp: new Date().toISOString(),
      model: options.model,
      strategy: options.strategy,
      // Fall back to wall clock if the agent did not report its own duration.
      durationMs: parsed.durationMs || Date.now() - startedAt,
      numTurns: parsed.numTurns,
      usage: parsed.usage,
      costUsd: parsed.costUsd,
      result: succeeded ? 'passed' : 'failed',
    };

    appendRun(record);

    console.log(
      [
        '',
        `Recorded ${record.ticket} (${record.strategy}, ${record.model}): ${record.result}`,
        `  tokens ${totalTokens(record.usage).toLocaleString('en-US')}` +
          `  cost $${record.costUsd.toFixed(4)}` +
          `  turns ${record.numTurns}` +
          `  ${(record.durationMs / 1000).toFixed(1)}s`,
      ].join('\n'),
    );

    if (!succeeded) {
      console.log(
        [
          '',
          'This run did NOT produce a test. What the agent reported:',
          '',
          parsed.text.trim() || '(no text in the result; see metrics/last-run.json)',
          '',
          `Expected file: tests/generated/${options.ticket.toLowerCase()}.spec.ts`,
        ].join('\n'),
      );
    } else {
      console.log('\nRegenerate the README table with: npm run metrics -- --write');
    }

    process.exit(succeeded ? 0 : 1);
  });
}

run(parseArgs(process.argv.slice(2)));
