import { test, expect } from '@playwright/test';

// Credentials come from .env (loaded via dotenv in playwright.config.ts). Never hardcode.
const USER = process.env.SAUCE_USER!;
const PASS = process.env.SAUCE_PASSWORD!;

test('AIQA-1: login with standard_user lands on the inventory page', async ({ page }) => {
  await test.step('Open the SauceDemo login page', async () => {
    await page.goto('/');
    await expect(page.locator('[data-test="username"]')).toBeVisible();
  });

  await test.step('Log in as standard_user', async () => {
    await page.locator('[data-test="username"]').fill(USER);
    await page.locator('[data-test="password"]').fill(PASS);
    await page.locator('[data-test="login-button"]').click();
  });

  await test.step('Verify redirect to the inventory page', async () => {
    await expect(page).toHaveURL(/inventory\.html/);
    await expect(page.locator('.inventory_list')).toBeVisible();
  });
});
