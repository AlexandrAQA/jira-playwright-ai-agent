import { test, expect } from '@playwright/test';

test.describe('AIQA-5: Remove a product from the cart', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/');

    // Log in as standard_user
    await page.locator('[data-test="username"]').fill(process.env.SAUCE_USER || 'standard_user');
    await page.locator('[data-test="password"]').fill(process.env.SAUCE_PASSWORD || 'secret_sauce');
    await page.locator('[data-test="login-button"]').click();

    // Wait for inventory page to load
    await page.waitForURL('/inventory.html');
  });

  test('Removing a product updates the cart badge count', async ({ page }) => {
    await test.step('On the inventory page, click Add to cart for one product', async () => {
      // Add Sauce Labs Bike Light to cart
      await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();
    });

    await test.step('Verify the cart icon badge shows 1', async () => {
      // Wait for cart badge to show 1 (or update from previous count)
      const cartBadge = page.locator('[data-test="shopping-cart-badge"]');
      await expect(cartBadge).toBeVisible();
      await expect(cartBadge).toHaveText('1');
    });

    await test.step('Click Remove button to remove the product from cart', async () => {
      // Remove the Sauce Labs Bike Light from cart
      await page.locator('[data-test="remove-sauce-labs-bike-light"]').click();
    });

    await test.step('Verify the cart icon badge shows 0 or is hidden', async () => {
      // After removal, badge should either show 0 or be hidden
      const cartBadge = page.locator('[data-test="shopping-cart-badge"]');

      // Check if badge is hidden (not visible)
      const isBadgeVisible = await cartBadge.isVisible().catch(() => false);

      if (isBadgeVisible) {
        // If visible, it should show 0
        await expect(cartBadge).toHaveText('0');
      } else {
        // Badge should not be visible
        await expect(cartBadge).not.toBeVisible();
      }
    });
  });
});
