import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

/**
 * Playwright configuration.
 * - two projects: `unit` (no browser, tests/unit) and `chromium` (tests/generated)
 * - the agent drops generated .spec.ts files into tests/generated
 * - chromium only (other browsers are not needed for this demo)
 * - two reporters: html (human-friendly report) and json (machine-readable, used by the agent)
 * - baseURL = SauceDemo, so tests can use page.goto('/') instead of the full URL
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // One broken precondition (an expired credential, the app down) otherwise
  // fails every spec three times over and buries the cause in a ten-minute run.
  // Stop early: three failures are already enough to know the run is red.
  maxFailures: process.env.CI ? 3 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    // JUnit XML is the de facto format every CI and test dashboard understands.
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'https://www.saucedemo.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video is kept only for failures: enough to see what happened, no disk cost on green runs.
    video: 'retain-on-failure',
    // Suppress Chrome password-manager popups during headed/demo runs, e.g. the
    // "Change your password / found in a data breach" bubble that Chrome shows for
    // the public secret_sauce password. Unknown feature names are ignored by Chromium.
    launchOptions: {
      args: [
        '--disable-features=PasswordLeakDetection,PasswordLeakToggleMove,AutofillServerCommunication,CredentialManagerAPI',
        '--disable-save-password-bubble',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-sync',
        '--disable-default-apps',
        '--disable-plugins',
        '--disable-preconnect',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-popup-blocking',
        '--disable-credentials-api',
      ],
    },
  },
  projects: [
    // Pure logic, no browser. Kept as a Playwright project so there is one test
    // runner in the repo instead of two, and so these run in the fast CI job.
    {
      name: 'unit',
      testDir: './tests/unit',
    },
    {
      name: 'chromium',
      testDir: './tests/generated',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
