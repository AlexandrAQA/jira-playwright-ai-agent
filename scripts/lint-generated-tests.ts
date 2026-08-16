/**
 * scripts/lint-generated-tests.ts
 * ---------------------------------------------------------------------------
 * The quality gate for everything an agent is allowed to write.
 *
 * It started as a check on generated specs alone, and that was the hole. The
 * playbook tells the agent to put a missing element in the page object first
 * and only then use it from the spec, so when a run took a shortcut, the
 * shortcut landed in the page object -- outside the gate's field of view. The
 * knowledge base has the same shape of problem and is worse: a wrong entry
 * there is read by every future ticket, so one workaround becomes the project
 * standard.
 *
 * So the gate covers all three surfaces the agent may touch, and the rule set
 * differs per surface because the failure modes differ.
 *
 * Costs nothing per run and cannot be talked round, which is the point: asking
 * a model to review its own work costs a full re-read of the context and
 * returns an answer with an interest in the outcome.
 * ---------------------------------------------------------------------------
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..');
const label = (dir: string): string => relative(process.cwd(), dir).split('\\').join('/') || dir;

type Rule = {
  name: string;
  why: string;
  test: (text: string) => boolean;
  /** Names what tripped a whole-file rule, so the message is actionable. */
  detail?: (src: string) => string;
};
type Finding = { file: string; line: number | null; rule: string; why: string; text: string };

interface Surface {
  /** What this group of files is, in words a failure message can use. */
  what: string;
  dir: string;
  accepts: (fileName: string) => boolean;
  /** Source files carry comments; Markdown does not. */
  code: boolean;
  lineRules: Rule[];
  fileRules: Rule[];
}

// --- Rules shared by more than one surface ----------------------------------

const noFixedSleep: Rule = {
  name: 'no-fixed-sleep',
  why: 'fixed sleeps are the main source of flaky tests, use web-first assertions',
  test: (l) => /waitForTimeout\s*\(/.test(l),
};

const noBrittleSelector: Rule = {
  name: 'no-brittle-selector',
  why: 'CSS classes and XPath break on any markup change, use roles or data-test',
  test: (l) => /locator\(\s*['"`]\s*(\/\/|\.[a-zA-Z]|#[a-zA-Z])/.test(l),
};

const noHardcodedCredentials: Rule = {
  name: 'no-hardcoded-credentials',
  why: 'credentials must come from the environment, never from the source',
  // Only a bare string literal counts. A credential named inside a test title
  // or a test.step description is prose, not a hardcoded secret.
  test: (l) =>
    /['"`](standard_user|secret_sauce|problem_user|locked_out_user|performance_glitch_user|error_user|visual_user)['"`]/.test(
      l,
    ),
};

// --- Surface 1: the generated specs -----------------------------------------

const specs: Surface = {
  what: 'generated spec',
  dir: join(root, 'tests', 'generated'),
  accepts: (f) => f.endsWith('.spec.ts'),
  code: true,
  lineRules: [
    {
      name: 'no-url-jumping',
      why: 'jumping to a deep URL skips the user flow the ticket describes',
      test: (l) => /page\.goto\(\s*['"`](?!\/['"`])/.test(l),
    },
    noFixedSleep,
    noBrittleSelector,
    noHardcodedCredentials,
  ],
  fileRules: [
    {
      name: 'must-assert',
      why: 'a test without an assertion proves only that nothing threw',
      test: (src) => !/\bexpect\s*\(/.test(src),
    },
    {
      name: 'must-use-test-step',
      why: 'each ticket step should be a test.step so the report maps back to the ticket',
      test: (src) => !/test\.step\s*\(/.test(src),
    },
    {
      name: 'must-use-fixtures',
      why: 'import test and expect from ../support/fixtures, not from @playwright/test, so page objects and the login fixture are used',
      test: (src) => /from\s+['"]@playwright\/test['"]/.test(src),
    },
    {
      name: 'no-inline-login',
      why: 'the login flow belongs in the loggedIn fixture, not copied into a spec',
      test: (src) => /\[data-test="(username|password|login-button)"\]/.test(src),
    },
  ],
};

// --- Surface 2: the page objects --------------------------------------------

/**
 * There is no unused-locator rule here, and the omission is deliberate.
 *
 * The shortcut this gate was built to catch declared a `logoutLink` locator,
 * never used it, and clicked through the DOM instead -- so "assigned and never
 * used" looks like the perfect tell. Implemented, it flagged four honest
 * locators (`LoginPage.errorMessage` among them) that exist because a page
 * object publishes its elements before a spec happens to need them. Forcing
 * their removal would make the next failed-login ticket worse, and a gate that
 * people learn to override is worse than no gate at all.
 *
 * The camouflage case is caught anyway: what makes it a defect is the DOM
 * bypass beside it, and `no-dom-bypass` fires on that directly.
 */
const pageObjects: Surface = {
  what: 'page object',
  dir: join(root, 'tests', 'support', 'pages'),
  accepts: (f) => f.endsWith('.ts'),
  code: true,
  lineRules: [
    {
      name: 'no-dom-bypass',
      why: 'reaching into document clicks the DOM directly and skips every actionability check, so the test passes whether or not a real user could have done it',
      test: (l) => /\bdocument\s*\.\s*\w/.test(l),
    },
    {
      name: 'no-forced-interaction',
      why: 'force: true skips the same checks: it succeeds on an element the user could not have reached',
      test: (l) => /force\s*:\s*true/.test(l),
    },
    noFixedSleep,
    noBrittleSelector,
    noHardcodedCredentials,
  ],
  fileRules: [],
};

// --- Surface 3: the knowledge base ------------------------------------------

const knowledge: Surface = {
  what: 'knowledge-base file',
  dir: join(root, 'knowledge'),
  accepts: (f) => f.endsWith('.md'),
  code: false,
  lineRules: [
    {
      name: 'no-framework-bypass',
      why: 'every future ticket reads this file, so prescribing a framework bypass promotes one workaround to the project standard',
      test: (l) =>
        /page\.evaluate\s*\(|document\s*\.\s*(getElementById|querySelector)|force\s*:\s*true/.test(
          l,
        ),
    },
    noFixedSleep,
  ],
  // Credentials are deliberately not checked here: the knowledge base names
  // `standard_user` in prose, explaining that it must come from the
  // environment. Prose about a rule is not a breach of it.
  fileRules: [],
};

// --- Run ---------------------------------------------------------------------

const findings: Finding[] = [];
let checked = 0;
let failed = false;

for (const surface of [specs, pageObjects, knowledge]) {
  if (!existsSync(surface.dir)) {
    console.error(`Directory not found: ${label(surface.dir)}`);
    failed = true;
    continue;
  }

  const files = readdirSync(surface.dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && surface.accepts(entry.name))
    .map((entry) => entry.name)
    .sort();

  // An empty directory must not report a green gate: there is nothing to
  // vouch for, and silence would read as approval.
  if (files.length === 0) {
    console.error(
      `No ${surface.what} files found in ${label(surface.dir)}, so nothing was verified.`,
    );
    failed = true;
    continue;
  }

  console.log(`Checked ${files.length} ${surface.what}(s) in ${label(surface.dir)}`);
  checked += files.length;

  for (const file of files) {
    const src = readFileSync(join(surface.dir, file), 'utf8');

    src.split(/\r?\n/).forEach((text, i) => {
      const trimmed = text.trim();
      if (
        surface.code &&
        (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))
      ) {
        return;
      }
      for (const rule of surface.lineRules) {
        if (rule.test(text)) {
          findings.push({ file, line: i + 1, rule: rule.name, why: rule.why, text: trimmed });
        }
      }
    });

    for (const rule of surface.fileRules) {
      if (rule.test(src)) {
        findings.push({
          file,
          line: null,
          rule: rule.name,
          why: rule.why,
          text: rule.detail?.(src) ?? '(whole file)',
        });
      }
    }
  }
}

console.log('');

if (findings.length > 0) {
  for (const f of findings) {
    const where = f.line === null ? f.file : `${f.file}:${f.line}`;
    console.log(`${where}  [${f.rule}]`);
    console.log(`  ${f.text}`);
    console.log(`  why: ${f.why}\n`);
  }
  console.log(`${findings.length} problem(s) found.`);
  process.exitCode = 1;
} else if (failed) {
  process.exitCode = 1;
} else {
  console.log(`All ${checked} file(s) passed the quality gate.`);
  process.exitCode = 0;
}
