import { test, expect } from '@playwright/test';

test.describe('AIQA-2: Adding a product to the cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('cart badge updates when adding a product', async ({ page }) => {
    // Step 1: Log in as standard_user
    await test.step('Log in as standard_user', async () => {
      await page.locator('[data-test="username"]').fill(process.env.SAUCE_USER || 'standard_user');
      await page.locator('[data-test="password"]').fill(process.env.SAUCE_PASSWORD || 'secret_sauce');
      await page.locator('[data-test="login-button"]').click();
      await page.waitForURL('**/inventory.html');
    });

    // Step 2: Click Add to cart for one product
    await test.step('Add product to cart', async () => {
      await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    });

    // Step 3: Verify the cart icon badge shows 1
    await test.step('Verify cart badge shows 1', async () => {
      const badge = page.locator('[data-test="shopping-cart-badge"]');
      await expect(badge).toHaveText('1');
      await expect(badge).toBeVisible();
    });
  });
});
