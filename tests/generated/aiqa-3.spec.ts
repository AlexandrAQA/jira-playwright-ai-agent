import { test, expect } from '@playwright/test';

// Credentials come from .env (loaded via dotenv in playwright.config.ts). Never hardcode.
const USER = process.env.SAUCE_USER!;
const PASS = process.env.SAUCE_PASSWORD!;

test.describe('AIQA-3: Full checkout flow', () => {
  test('completes checkout and shows the order confirmation', async ({ page }) => {
    await test.step('Log in as standard_user', async () => {
      await page.goto('/');
      await page.locator('[data-test="username"]').fill(USER);
      await page.locator('[data-test="password"]').fill(PASS);
      await page.locator('[data-test="login-button"]').click();
      await expect(page).toHaveURL(/inventory\.html/);
    });

    await test.step('Add a product to the cart and open the cart', async () => {
      await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
      await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
      await page.locator('[data-test="shopping-cart-link"]').click();
      await expect(page).toHaveURL(/cart\.html/);
      await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText('Sauce Labs Backpack');
    });

    await test.step('Proceed to checkout and fill the customer form', async () => {
      await page.locator('[data-test="checkout"]').click();
      await expect(page).toHaveURL(/checkout-step-one\.html/);
      await page.locator('[data-test="firstName"]').fill('John');
      await page.locator('[data-test="lastName"]').fill('Doe');
      await page.locator('[data-test="postalCode"]').fill('12345');
    });

    await test.step('Continue to the overview and finish the order', async () => {
      await page.locator('[data-test="continue"]').click();
      await expect(page).toHaveURL(/checkout-step-two\.html/);
      await page.locator('[data-test="finish"]').click();
    });

    await test.step('Verify the order confirmation', async () => {
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(page.locator('[data-test="complete-header"]')).toHaveText('Thank you for your order!');
    });
  });
});
