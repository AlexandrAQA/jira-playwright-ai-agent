/**
 * scripts/mutation-check.ts
 * ---------------------------------------------------------------------------
 * Make every test prove it can fail.
 *
 *   npm run mutation                # every generated spec
 *   npm run mutation -- AIQA-10     # one ticket, the agent's own check
 *
 * A green test and a test that works are different claims, and only one of them
 * is observable. This harness breaks one page-object action at a time and
 * requires each spec that uses it to fail. A spec that stays green while the
 * action it exercises never happens is not testing that action, whatever its
 * name says.
 *
 * Honest about its reach: this catches "the spec does not depend on this
 * action". It does not catch a shortcut *inside* an action -- clicking through
 * the DOM instead of through a locator still performs the action, so the spec
 * fails when the whole method is disabled. That defect belongs to the quality
 * gate (`no-dom-bypass`), and the two tools are not substitutes.
 *
 * Not in CI: it needs browsers and runs the suite once per action, which is
 * minutes rather than seconds. It is step 7 of the workflow instead, run on the
 * one spec a ticket produced.
 * ---------------------------------------------------------------------------
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const PAGES_DIR = join(root, 'tests', 'support', 'pages');
const SPECS_DIR = join(root, 'tests', 'generated');
const FIXTURES = join(root, 'tests', 'support', 'fixtures.ts');

/** Calls that change what the browser is showing. Reads are not mutated. */
const INTERACTION =
  /\.(click|fill|selectOption|check|uncheck|press|setInputFiles|dblclick|goto)\s*\(/;

interface Action {
  className: string;
  method: string;
}

/**
 * Action methods of one page object, found by what their body actually does.
 *
 * Two passes, because a method can act without touching the browser itself:
 * `loginAsStandardUser` only calls `open` and `login`. Missing those would
 * leave every spec that depends on the `loggedIn` fixture unchecked against the
 * login step, which is the one action they all rely on.
 */
function actionsIn(src: string): Action[] {
  const className = /export class (\w+)/.exec(src)?.[1];
  if (!className) return [];

  const marks = [...src.matchAll(/^ {2}async (\w+)\s*\(/gm)].map((m) => ({
    method: m[1],
    start: m.index,
  }));

  const bodyOf = (i: number): string =>
    src.slice(marks[i].start, marks[i + 1]?.start ?? src.length);

  const isAction = marks.map((_, i) => INTERACTION.test(bodyOf(i)));

  // Delegation can be layered, so keep going until nothing new turns up.
  for (let changed = true; changed;) {
    changed = false;
    marks.forEach((_, i) => {
      if (isAction[i]) return;
      const body = bodyOf(i);
      if (marks.some((m, j) => isAction[j] && new RegExp(`this\\.${m.method}\\s*\\(`).test(body))) {
        isAction[i] = true;
        changed = true;
      }
    });
  }

  return marks.filter((_, i) => isAction[i]).map((mark) => ({ className, method: mark.method }));
}

/**
 * Which specs depend on an action.
 *
 * Directly, when the spec names it. Or through the `loggedIn` fixture, which
 * calls the login action on the spec's behalf -- a spec that uses `loggedIn`
 * depends on that action just as surely as if it had typed it.
 */
function specsDependingOn(
  action: Action,
  specs: Array<{ file: string; src: string }>,
  fixtures: string,
): string[] {
  const called = new RegExp(`\\.${action.method}\\s*\\(`);
  const viaFixture = called.test(fixtures);

  return specs
    .filter(({ src }) => called.test(src) || (viaFixture && /\bloggedIn\b/.test(src)))
    .map(({ file }) => file);
}

function runSpec(file: string, target: string): boolean {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      join('tests', 'generated', file),
      '--project=chromium',
      '--retries=0',
      '--workers=1',
      '--reporter=dot',
    ],
    {
      cwd: root,
      env: { ...process.env, MUTATE_METHOD: target },
      encoding: 'utf8',
      // The real binary through node, never the .cmd shim: see src/claude-cli.ts
      // for the same lesson learned the hard way.
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // Non-zero means the spec failed, which is what a working test must do here.
  return result.status !== 0;
}

// --- Run ---------------------------------------------------------------------

const ticket = process.argv.slice(2).find((a) => /^[A-Za-z]+-\d+$/.test(a));

if (!existsSync(PAGES_DIR) || !existsSync(SPECS_DIR)) {
  console.error('Expected tests/support/pages and tests/generated to exist.');
  process.exit(1);
}

const specs = readdirSync(SPECS_DIR)
  .filter((f) => f.endsWith('.spec.ts'))
  .filter((f) => !ticket || f === `${ticket.toLowerCase()}.spec.ts`)
  .sort()
  .map((file) => ({ file, src: readFileSync(join(SPECS_DIR, file), 'utf8') }));

if (specs.length === 0) {
  console.error(ticket ? `No spec found for ${ticket}.` : 'No generated specs to check.');
  process.exit(1);
}

const fixtures = existsSync(FIXTURES) ? readFileSync(FIXTURES, 'utf8') : '';
const actions = readdirSync(PAGES_DIR)
  .filter((f) => f.endsWith('.ts'))
  .flatMap((f) => actionsIn(readFileSync(join(PAGES_DIR, f), 'utf8')));

console.log(
  `Mutation check: ${actions.length} action(s) against ${specs.length} spec(s)` +
    (ticket ? ` for ${ticket}` : '') +
    '\n',
);

const survivors: string[] = [];
let checks = 0;

for (const action of actions) {
  const target = `${action.className}.${action.method}`;
  for (const file of specsDependingOn(action, specs, fixtures)) {
    checks += 1;
    const failed = runSpec(file, target);
    console.log(`  ${failed ? 'ok  ' : 'LIVE'}  ${file}  without  ${target}`);
    if (!failed) survivors.push(`${file} still passes without ${target}`);
  }
}

console.log('');

if (checks === 0) {
  // Silence would read as approval. It is not.
  console.error('Nothing was verified: no spec depends on any page-object action.');
  process.exit(1);
}

if (survivors.length > 0) {
  console.error(`${survivors.length} of ${checks} check(s) found a test that cannot fail:\n`);
  for (const s of survivors) console.error(`  ${s}`);
  console.error('\nA test that passes without the action it exercises is not testing it.');
  process.exit(1);
}

console.log(`All ${checks} check(s) passed: every spec fails when its action is taken away.`);
