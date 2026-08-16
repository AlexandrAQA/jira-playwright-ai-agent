/**
 * Unit tests for the run-cost bookkeeping.
 *
 * The point of these is that the README number is only worth as much as the
 * arithmetic behind it. A silently wrong average would be a claim made to an
 * interviewer, so the aggregation and the parsing of the agent's own output are
 * pinned here.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  appendRun,
  coverageOf,
  parseAgentResult,
  readRuns,
  type RunRecord,
  summarise,
  toMarkdownTable,
  totalTokens,
} from '../../src/metrics';

const usage = (input: number, output: number, cacheCreation = 0, cacheRead = 0) => ({
  input,
  output,
  cacheCreation,
  cacheRead,
});

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  ticket: 'AIQA-1',
  timestamp: '2026-08-15T12:00:00.000Z',
  model: 'haiku',
  strategy: 'kb-first',
  durationMs: 1000,
  numTurns: 4,
  usage: usage(100, 50),
  costUsd: 0.01,
  result: 'passed',
  ...over,
});

test.describe('totalTokens', () => {
  test('counts every bucket, cache included', () => {
    expect(totalTokens(usage(100, 50, 20, 30))).toBe(200);
  });
});

test.describe('parseAgentResult', () => {
  test('reads the shape claude -p --output-format json prints', () => {
    const parsed = parseAgentResult(
      JSON.stringify({
        type: 'result',
        duration_ms: 42000,
        num_turns: 9,
        total_cost_usd: 0.1234,
        usage: {
          input_tokens: 1000,
          output_tokens: 2000,
          cache_creation_input_tokens: 300,
          cache_read_input_tokens: 400,
        },
      }),
    );

    expect(parsed.durationMs).toBe(42000);
    expect(parsed.numTurns).toBe(9);
    expect(parsed.costUsd).toBeCloseTo(0.1234);
    expect(totalTokens(parsed.usage)).toBe(3700);
  });

  test('surfaces the agent verdict and its text', () => {
    // A zero exit code once recorded a run that did nothing as "passed". These
    // two fields are what make that distinguishable.
    const parsed = parseAgentResult(
      JSON.stringify({ is_error: true, result: 'I could not find the ticket.' }),
    );
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toBe('I could not find the ticket.');
  });

  test('turns malformed output into zeros rather than throwing', () => {
    // Losing a measurement must never fail an otherwise good agent run.
    const parsed = parseAgentResult('not json at all');
    expect(parsed.numTurns).toBe(0);
    expect(totalTokens(parsed.usage)).toBe(0);
  });

  test('tolerates a result with no usage block', () => {
    const parsed = parseAgentResult(JSON.stringify({ duration_ms: 10 }));
    expect(parsed.durationMs).toBe(10);
    expect(totalTokens(parsed.usage)).toBe(0);
  });
});

test.describe('readRuns', () => {
  test('round-trips through the JSONL file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'metrics-')), 'runs.jsonl');
    appendRun(record({ ticket: 'AIQA-1' }), file);
    appendRun(record({ ticket: 'AIQA-2' }), file);

    expect(readRuns(file).map((r) => r.ticket)).toEqual(['AIQA-1', 'AIQA-2']);
  });

  test('skips a truncated last line instead of failing', () => {
    // A watcher killed mid-write leaves exactly this.
    const file = join(mkdtempSync(join(tmpdir(), 'metrics-')), 'runs.jsonl');
    appendRun(record({ ticket: 'AIQA-1' }), file);
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"ticket":"AIQA-2"`, 'utf8');

    expect(readRuns(file).map((r) => r.ticket)).toEqual(['AIQA-1']);
  });

  test('returns nothing when no run was ever recorded', () => {
    expect(readRuns(join(tmpdir(), 'definitely-not-here', 'runs.jsonl'))).toEqual([]);
  });
});

test.describe('summarise', () => {
  const runs = [
    record({ strategy: 'mcp-only', usage: usage(1000, 0), costUsd: 0.1, numTurns: 10 }),
    record({ strategy: 'mcp-only', usage: usage(2000, 0), costUsd: 0.3, numTurns: 20 }),
    record({ strategy: 'kb-first', usage: usage(500, 0), costUsd: 0.05, numTurns: 5 }),
  ];

  test('averages within a strategy', () => {
    const [mcpOnly] = summarise(runs);
    expect(mcpOnly.runs).toBe(2);
    expect(mcpOnly.avgTokens).toBe(1500);
    expect(mcpOnly.avgCostUsd).toBeCloseTo(0.2);
    expect(mcpOnly.avgTurns).toBe(15);
  });

  test('keeps a fixed row order regardless of insertion order', () => {
    expect(summarise([...runs].reverse()).map((s) => s.strategy)).toEqual(['mcp-only', 'kb-first']);
  });

  test('omits a strategy with no runs', () => {
    expect(summarise(runs.filter((r) => r.strategy === 'kb-first')).map((s) => s.strategy)).toEqual(
      ['kb-first'],
    );
  });

  test('treats a run recorded before the coverage field as warm', () => {
    // Otherwise the four runs behind the published figure would vanish from it.
    expect(coverageOf(record({}))).toBe('warm');
    expect(summarise(runs)[0].runs).toBe(2);
  });

  test('keeps a first-contact run out of the steady-state average', () => {
    // A cold run averaged in with warm ones is not a slower result, it is a
    // different measurement wearing the same label, and it reverses the headline.
    const withCold = [
      ...runs,
      record({ strategy: 'kb-first', coverage: 'cold', usage: usage(999_999, 0) }),
    ];
    const [, kbFirst] = summarise(withCold);
    expect(kbFirst.runs).toBe(1);
    expect(kbFirst.avgTokens).toBe(500);
  });

  test('can report the cold band on its own', () => {
    const cold = [record({ strategy: 'kb-first', coverage: 'cold', usage: usage(700, 0) })];
    expect(summarise([...runs, ...cold], 'cold')).toEqual([
      expect.objectContaining({ strategy: 'kb-first', runs: 1, avgTokens: 700 }),
    ]);
  });
});

test.describe('toMarkdownTable', () => {
  test('says so plainly when nothing has been measured', () => {
    // The one behaviour that matters most: never invent a plausible number.
    const table = toMarkdownTable(summarise([]));
    expect(table).toContain('No runs recorded yet');
    expect(table).not.toContain('|');
  });

  test('states the saving when both strategies have runs', () => {
    const table = toMarkdownTable(
      summarise([
        record({ strategy: 'mcp-only', usage: usage(1000, 0) }),
        record({ strategy: 'kb-first', usage: usage(250, 0) }),
      ]),
    );
    expect(table).toContain('75% fewer tokens');
  });

  test('reports an increase honestly rather than as a saving', () => {
    const table = toMarkdownTable(
      summarise([
        record({ strategy: 'mcp-only', usage: usage(100, 0) }),
        record({ strategy: 'kb-first', usage: usage(200, 0) }),
      ]),
    );
    expect(table).toContain('100% more tokens');
  });
});
