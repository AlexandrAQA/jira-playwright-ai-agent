/**
 * src/metrics.ts
 * ---------------------------------------------------------------------------
 * What one agent run actually costs, recorded per run and aggregated per
 * strategy.
 *
 * The project claims that consulting the knowledge base first and keeping the
 * browser out of the fix loop makes runs cheaper. A claim like that is worth
 * nothing without numbers, and worth less than nothing if the numbers are
 * guessed. So every measured run appends one line to `metrics/runs.jsonl`, and
 * the table in the README is generated from that file rather than written by
 * hand.
 *
 * JSON Lines because runs are append-only and a half-written file still parses
 * up to the last complete line.
 * ---------------------------------------------------------------------------
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const RUNS_FILE = join(__dirname, '..', 'metrics', 'runs.jsonl');

/**
 * Which pipeline produced the run.
 *
 * `mcp-only` is the original loop: explore the app through Playwright MCP on
 * every ticket, and go back to the browser when a test fails.
 * `kb-first` is the current one: query the knowledge base, use MCP only for
 * what it could not answer, and fix failures from the CLI error text alone.
 */
export type Strategy = 'mcp-only' | 'kb-first';

export interface TokenUsage {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

export interface RunRecord {
  ticket: string;
  /** ISO 8601, UTC. */
  timestamp: string;
  model: string;
  strategy: Strategy;
  durationMs: number;
  numTurns: number;
  usage: TokenUsage;
  costUsd: number;
  result: 'passed' | 'failed' | 'unknown';
}

/**
 * Total tokens billed for a run.
 *
 * Cache reads are counted here because they are real tokens that really move,
 * even though they are billed at a discount. Cost is reported separately and is
 * the number to compare when money is the question; this one answers "how much
 * context did the run drag around", which is what recon strategy changes.
 */
export function totalTokens(usage: TokenUsage): number {
  return usage.input + usage.output + usage.cacheCreation + usage.cacheRead;
}

/** Read a number out of untyped JSON without letting `any` escape. */
function num(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Pull the usage figures out of what `claude -p --output-format json` prints.
 *
 * Deliberately forgiving: a missing field becomes zero rather than an
 * exception, because losing a measurement must never fail an otherwise good
 * agent run. A zero is visible in the table; a crash would cost the whole run.
 */
export function parseAgentResult(raw: string): {
  durationMs: number;
  numTurns: number;
  costUsd: number;
  usage: TokenUsage;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const root: Record<string, unknown> =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};

  const rawUsage = root.usage;
  const usageSource: Record<string, unknown> =
    typeof rawUsage === 'object' && rawUsage !== null ? (rawUsage as Record<string, unknown>) : {};

  return {
    durationMs: num(root, 'duration_ms'),
    numTurns: num(root, 'num_turns'),
    costUsd: num(root, 'total_cost_usd'),
    usage: {
      input: num(usageSource, 'input_tokens'),
      output: num(usageSource, 'output_tokens'),
      cacheCreation: num(usageSource, 'cache_creation_input_tokens'),
      cacheRead: num(usageSource, 'cache_read_input_tokens'),
    },
  };
}

/** Append one run. Creates `metrics/` on first use. */
export function appendRun(record: RunRecord, file: string = RUNS_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * Read every run recorded so far.
 *
 * A line that does not parse is skipped rather than fatal: the file is written
 * by a long-running process that can be interrupted mid-line.
 */
export function readRuns(file: string = RUNS_FILE): RunRecord[] {
  if (!existsSync(file)) return [];

  const runs: RunRecord[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      runs.push(JSON.parse(line) as RunRecord);
    } catch {
      continue;
    }
  }
  return runs;
}

export interface StrategySummary {
  strategy: Strategy;
  runs: number;
  avgTokens: number;
  avgCostUsd: number;
  avgTurns: number;
  avgDurationMs: number;
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** One row per strategy, in a fixed order so the table does not shuffle. */
export function summarise(runs: RunRecord[]): StrategySummary[] {
  const order: Strategy[] = ['mcp-only', 'kb-first'];

  return order
    .map((strategy) => {
      const subset = runs.filter((r) => r.strategy === strategy);
      return {
        strategy,
        runs: subset.length,
        avgTokens: mean(subset.map((r) => totalTokens(r.usage))),
        avgCostUsd: mean(subset.map((r) => r.costUsd)),
        avgTurns: mean(subset.map((r) => r.numTurns)),
        avgDurationMs: mean(subset.map((r) => r.durationMs)),
      };
    })
    .filter((row) => row.runs > 0);
}

/**
 * Render the summary as Markdown.
 *
 * Returns an explicit "nothing measured yet" line when there are no runs. The
 * one thing this function must never do is invent a plausible number: an
 * unmeasured claim in a README is worse than an absent one.
 */
export function toMarkdownTable(summary: StrategySummary[]): string {
  if (summary.length === 0) {
    return 'No runs recorded yet. Run `npm run agent -- AIQA-N` to measure one.';
  }

  const header = [
    '| Strategy | Runs | Avg tokens | Avg cost, USD | Avg turns | Avg duration |',
    '| -------- | ---- | ---------- | ------------- | --------- | ------------ |',
  ];

  const rows = summary.map(
    (s) =>
      `| \`${s.strategy}\` | ${s.runs} | ${Math.round(s.avgTokens).toLocaleString('en-US')} | ` +
      `${s.avgCostUsd.toFixed(4)} | ${s.avgTurns.toFixed(1)} | ${(s.avgDurationMs / 1000).toFixed(1)}s |`,
  );

  const withBoth = summary.length === 2 ? [comparison(summary[0], summary[1])] : [];

  return [...header, ...rows, '', ...withBoth].join('\n').trim();
}

/** The one sentence a reader actually wants: did the change help, and by how much. */
function comparison(before: StrategySummary, after: StrategySummary): string {
  if (before.avgTokens === 0) return '';
  const saved = 1 - after.avgTokens / before.avgTokens;
  const direction = saved >= 0 ? 'fewer' : 'more';
  return `\`kb-first\` uses ${Math.abs(saved * 100).toFixed(0)}% ${direction} tokens per ticket than \`mcp-only\`, measured over ${before.runs} and ${after.runs} runs.`;
}
