import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

/**
 * Playwright configuration.
 * - tests live in tests/generated (the agent drops generated .spec.ts files here)
 * - chromium only (other browsers are not needed for this demo)
 * - two reporters: html (human-friendly report) and json (machine-readable, used by the agent)
 * - baseURL = SauceDemo, so tests can use page.goto('/') instead of the full URL
 */
export default defineConfig({
  testDir: './tests/generated',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: 'https://www.saucedemo.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
