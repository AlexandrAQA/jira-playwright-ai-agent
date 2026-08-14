import { test, expect } from '@playwright/test';

// Credentials come from .env (loaded via dotenv in playwright.config.ts). Never hardcode.
const USER = process.env.SAUCE_USER!;
const PASS = process.env.SAUCE_PASSWORD!;

// Parse a SauceDemo summary label like "Item total: $29.99" into a number (29.99).
const money = (label: string) => Number(label.replace(/[^0-9.]/g, ''));

test.describe('AIQA-8: Full checkout flow reaches the order confirmation', () => {
  test('login -> cart -> checkout form -> overview -> confirmation', async ({ page }) => {
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

    await test.step('Click Checkout and fill First Name, Last Name and Zip/Postal Code', async () => {
      await page.locator('[data-test="checkout"]').click();
      await expect(page).toHaveURL(/checkout-step-one\.html/);
      await page.locator('[data-test="firstName"]').fill('John');
      await page.locator('[data-test="lastName"]').fill('Doe');
      await page.locator('[data-test="postalCode"]').fill('12345');
    });

    await test.step('Click Continue and verify the overview (items and total price)', async () => {
      await page.locator('[data-test="continue"]').click();
      await expect(page).toHaveURL(/checkout-step-two\.html/);

      // Items: exactly the one product we added, at its listed price.
      await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText('Sauce Labs Backpack');
      await expect(page.locator('[data-test="inventory-item-price"]')).toHaveText('$29.99');

      // Price summary: the item total reflects the single backpack.
      const subtotalLabel = page.locator('[data-test="subtotal-label"]');
      const taxLabel = page.locator('[data-test="tax-label"]');
      const totalLabel = page.locator('[data-test="total-label"]');
      await expect(subtotalLabel).toHaveText('Item total: $29.99');
      await expect(taxLabel).toBeVisible();
      await expect(totalLabel).toBeVisible();

      // Total price is consistent: total == item total + tax.
      const subtotal = money(await subtotalLabel.innerText());
      const tax = money(await taxLabel.innerText());
      const total = money(await totalLabel.innerText());
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('Click Finish and verify the confirmation message', async () => {
      await page.locator('[data-test="finish"]').click();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(page.locator('[data-test="complete-header"]')).toHaveText('Thank you for your order!');
    });
  });
});
