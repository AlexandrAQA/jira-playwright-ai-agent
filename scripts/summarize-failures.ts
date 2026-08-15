/**
 * Turn the Playwright JSON report into a short failure digest.
 *
 * The raw report is megabytes of JSON, and the HTML report is not readable by a
 * machine at all. Feeding either one to the agent is slow and expensive, so this
 * script extracts only what is needed to fix a test: which spec failed, on which
 * step, with which error, and which locator was involved.
 *
 * Output is Markdown, so the same text works in a terminal, in the agent prompt,
 * and in the GitHub Actions job summary.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORT = join(__dirname, '..', 'test-results', 'results.json');

/** Error text arrives with terminal colour codes; they are noise for a model. */
const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');

/** Playwright puts the locator in the error text; surface it separately when present. */
const findLocator = (s: string): string | null => {
  const m =
    s.match(/locator\((?:'|")([^'"]+)(?:'|")\)/) ??
    s.match(/(getBy[A-Za-z]+\([^)]*\))/) ??
    s.match(/waiting for (.+?)$/m);
  return m ? m[1].trim() : null;
};

/** Keep the first meaningful lines: the assertion and its expected/received pair. */
const firstLines = (s: string, n = 6) =>
  stripAnsi(s)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(0, n);

type Failure = {
  spec: string;
  title: string;
  project: string;
  status: string;
  retries: number;
  error: string[];
  locator: string | null;
};

const failures: Failure[] = [];
let total = 0;
let passed = 0;
let flaky = 0;

/** The JSON report nests suites inside suites; walk the whole tree. */
function walk(suite: any, file: string) {
  const specFile = suite.file ?? file;

  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      total += 1;
      const last = test.results?.[test.results.length - 1];
      const status = last?.status ?? 'unknown';

      if (test.status === 'flaky') flaky += 1;
      if (status === 'passed') {
        passed += 1;
        continue;
      }
      if (status === 'skipped') continue;

      const raw = stripAnsi(
        last?.error?.message ?? last?.errors?.map((e: any) => e.message).join('\n') ?? 'no error message in report',
      );

      failures.push({
        spec: specFile,
        title: spec.title,
        project: test.projectName ?? 'default',
        status,
        retries: Math.max((test.results?.length ?? 1) - 1, 0),
        error: firstLines(raw),
        locator: findLocator(raw),
      });
    }
  }

  for (const child of suite.suites ?? []) walk(child, specFile);
}

if (!existsSync(REPORT)) {
  console.log('No Playwright JSON report found. Run the tests first.');
  process.exitCode = 0;
} else {
  const report = JSON.parse(readFileSync(REPORT, 'utf8'));
  for (const suite of report.suites ?? []) walk(suite, suite.file ?? '');

  if (failures.length === 0) {
    console.log(`## Test run: all green\n`);
    console.log(`${passed} of ${total} passed${flaky ? `, ${flaky} flaky` : ''}.`);
  } else {
    console.log(`## Test run: ${failures.length} failed of ${total}\n`);

    for (const f of failures) {
      console.log(`### ${f.title}`);
      console.log(`- file: \`${f.spec}\``);
      console.log(`- project: ${f.project}, status: ${f.status}, retries: ${f.retries}`);
      if (f.locator) console.log(`- locator: \`${f.locator}\``);
      console.log('');
      console.log('```');
      for (const line of f.error) console.log(line);
      console.log('```');
      console.log('');
    }
  }
}
