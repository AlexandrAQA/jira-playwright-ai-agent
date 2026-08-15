import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Resolved from the script location, so the linter works from any working directory. */
const DIR = join(__dirname, '..', 'tests', 'generated');
const DIR_LABEL = relative(process.cwd(), DIR).split('\\').join('/') || DIR;

type Finding = { file: string; line: number | null; rule: string; why: string; text: string };

/** Rules applied to every single line. */
const lineRules = [
  {
    name: 'no-url-jumping',
    why: 'jumping to a deep URL skips the user flow the ticket describes',
    test: (l: string) => /page\.goto\(\s*['"`](?!\/['"`])/.test(l),
  },
  {
    name: 'no-fixed-sleep',
    why: 'fixed sleeps are the main source of flaky tests, use web-first assertions',
    test: (l: string) => /waitForTimeout\s*\(/.test(l),
  },
  {
    name: 'no-brittle-selector',
    why: 'CSS classes and XPath break on any markup change, use roles or data-test',
    test: (l: string) => /locator\(\s*['"`]\s*(\/\/|\.[a-zA-Z]|#[a-zA-Z])/.test(l),
  },
  {
    name: 'no-hardcoded-credentials',
    why: 'credentials must come from the environment, never from the source',
    // Only a bare string literal counts. A credential named inside a test title
    // or a test.step description is prose, not a hardcoded secret.
    test: (l: string) =>
      /['"`](standard_user|secret_sauce|problem_user|locked_out_user|performance_glitch_user|error_user|visual_user)['"`]/.test(
        l,
      ),
  },
];

/** Rules applied to the whole file. */
const fileRules = [
  {
    name: 'must-assert',
    why: 'a test without an assertion proves only that nothing threw',
    test: (src: string) => !/\bexpect\s*\(/.test(src),
  },
  {
    name: 'must-use-test-step',
    why: 'each ticket step should be a test.step so the report maps back to the ticket',
    test: (src: string) => !/test\.step\s*\(/.test(src),
  },
];

if (!existsSync(DIR)) {
  console.error(`Directory not found: ${DIR}`);
  console.error('Nothing to lint. Generate the tests first, then rerun the quality gate.');
  process.exitCode = 1;
} else {
  const specs = readdirSync(DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => entry.name)
    .sort();

  const findings: Finding[] = [];

  for (const file of specs) {
    const src = readFileSync(join(DIR, file), 'utf8');

    src.split(/\r?\n/).forEach((text, i) => {
      const trimmed = text.trim();
      // Comments are not code: line comments and block comment bodies alike.
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
      for (const rule of lineRules) {
        if (rule.test(text)) {
          findings.push({ file, line: i + 1, rule: rule.name, why: rule.why, text: trimmed });
        }
      }
    });

    for (const rule of fileRules) {
      if (rule.test(src)) {
        findings.push({ file, line: null, rule: rule.name, why: rule.why, text: '(whole file)' });
      }
    }
  }

  console.log(`Checked ${specs.length} generated spec(s) in ${DIR_LABEL}\n`);

  // An empty directory must not report a green gate: there is nothing to vouch for.
  if (specs.length === 0) {
    console.error(`No *.spec.ts files found in ${DIR_LABEL}, so nothing was verified.`);
    process.exitCode = 1;
  } else if (findings.length === 0) {
    console.log('All generated tests passed the quality gate.');
    process.exitCode = 0;
  } else {
    for (const f of findings) {
      const where = f.line === null ? f.file : `${f.file}:${f.line}`;
      console.log(`${where}  [${f.rule}]`);
      console.log(`  ${f.text}`);
      console.log(`  why: ${f.why}\n`);
    }

    console.log(`${findings.length} problem(s) found.`);
    process.exitCode = 1;
  }
}
