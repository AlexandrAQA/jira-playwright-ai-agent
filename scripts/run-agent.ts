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
import 'dotenv/config';

import {
  appendRun,
  parseAgentResult,
  type RunRecord,
  type Strategy,
  totalTokens,
} from '../src/metrics';

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

  const startedAt = Date.now();
  const child = spawn('claude', args, { shell: true });

  let stdout = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  // The agent's own progress output belongs on the terminal, not in the record.
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));

  child.on('exit', (code) => {
    const parsed = parseAgentResult(stdout);

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
      result: code === 0 ? 'passed' : 'failed',
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
        '',
        'Regenerate the README table with: npm run metrics',
      ].join('\n'),
    );

    process.exit(code ?? 0);
  });
}

run(parseArgs(process.argv.slice(2)));
