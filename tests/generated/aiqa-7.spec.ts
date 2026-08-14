import { test, expect } from '@playwright/test';

// Credentials come from .env (loaded via dotenv in playwright.config.ts). Never hardcode.
const USER = process.env.SAUCE_USER!;
const PASS = process.env.SAUCE_PASSWORD!;

// Parse a "Label: $12.34" string into a number.
const money = (text: string | null): number =>
  Number((text ?? '').replace(/[^0-9.]/g, ''));

test.describe('AIQA-7: Full checkout flow', () => {
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

    await test.step('Click Checkout and fill First Name, Last Name, and Zip/Postal Code', async () => {
      await page.locator('[data-test="checkout"]').click();
      await expect(page).toHaveURL(/checkout-step-one\.html/);
      await page.locator('[data-test="firstName"]').fill('John');
      await page.locator('[data-test="lastName"]').fill('Doe');
      await page.locator('[data-test="postalCode"]').fill('12345');
    });

    await test.step('Click Continue and verify the overview page (items and total price)', async () => {
      await page.locator('[data-test="continue"]').click();
      await expect(page).toHaveURL(/checkout-step-two\.html/);

      // The same product is carried into the overview.
      await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText('Sauce Labs Backpack');

      // Price total block is shown and internally consistent: Total = Item total + Tax.
      const subtotal = money(await page.locator('[data-test="subtotal-label"]').textContent());
      const tax = money(await page.locator('[data-test="tax-label"]').textContent());
      const total = money(await page.locator('[data-test="total-label"]').textContent());

      expect(subtotal).toBeGreaterThan(0);
      expect(tax).toBeGreaterThan(0);
      // The single line item drives the item total.
      const itemPrice = money(await page.locator('[data-test="inventory-item-price"]').textContent());
      expect(subtotal).toBeCloseTo(itemPrice, 2);
      // Grand total must equal item total plus tax (cent-accurate).
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('Click Finish and verify the confirmation message', async () => {
      await page.locator('[data-test="finish"]').click();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(page.locator('[data-test="complete-header"]')).toHaveText('Thank you for your order!');
    });
  });
});
