import { test, expect } from '@playwright/test';

// Credentials come from .env (loaded via dotenv in playwright.config.ts). Never hardcode.
const USER = process.env.SAUCE_USER!;
const PASS = process.env.SAUCE_PASSWORD!;

// Parse a SauceDemo summary label like "Item total: $29.99" into a number (29.99).
const money = (label: string) => Number(label.replace(/[^0-9.]/g, ''));

const PRODUCT = 'Sauce Labs Backpack';
const PRODUCT_PRICE = '$29.99';

test.describe('AIQA-9: Full checkout flow (login -> cart -> form -> overview -> confirmation)', () => {
  test('completes an order, shows the confirmation, and empties the cart', async ({ page }) => {
    await test.step('AC1: standard_user logs in and lands on the inventory page', async () => {
      await page.goto('/');
      await page.locator('[data-test="username"]').fill(USER);
      await page.locator('[data-test="password"]').fill(PASS);
      await page.locator('[data-test="login-button"]').click();
      await expect(page).toHaveURL(/inventory\.html/);
    });

    await test.step('AC2: adding a product updates the badge; cart lists exactly that item', async () => {
      await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
      await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');

      await page.locator('[data-test="shopping-cart-link"]').click();
      await expect(page).toHaveURL(/cart\.html/);

      const cartItems = page.locator('[data-test="inventory-item-name"]');
      await expect(cartItems).toHaveCount(1);
      await expect(cartItems).toHaveText(PRODUCT);
    });

    await test.step('AC3: checkout step-one accepts First/Last name and Zip, Continue advances', async () => {
      await page.locator('[data-test="checkout"]').click();
      await expect(page).toHaveURL(/checkout-step-one\.html/);

      await page.locator('[data-test="firstName"]').fill('John');
      await page.locator('[data-test="lastName"]').fill('Doe');
      await page.locator('[data-test="postalCode"]').fill('12345');

      await page.locator('[data-test="continue"]').click();
      await expect(page).toHaveURL(/checkout-step-two\.html/);
    });

    await test.step('AC4: overview shows the item and Total = item subtotal + tax (computed)', async () => {
      const overviewItems = page.locator('[data-test="inventory-item-name"]');
      await expect(overviewItems).toHaveCount(1);
      await expect(overviewItems).toHaveText(PRODUCT);
      await expect(page.locator('[data-test="inventory-item-price"]')).toHaveText(PRODUCT_PRICE);

      const subtotalLabel = page.locator('[data-test="subtotal-label"]');
      const taxLabel = page.locator('[data-test="tax-label"]');
      const totalLabel = page.locator('[data-test="total-label"]');

      // Subtotal reflects the single backpack; tax and total are present...
      await expect(subtotalLabel).toHaveText(`Item total: ${PRODUCT_PRICE}`);
      await expect(taxLabel).toBeVisible();
      await expect(totalLabel).toBeVisible();

      // ...and the total is actually consistent: total == item total + tax.
      const subtotal = money(await subtotalLabel.innerText());
      const tax = money(await taxLabel.innerText());
      const total = money(await totalLabel.innerText());
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('AC5: Finish leads to checkout-complete with the thank-you header', async () => {
      await page.locator('[data-test="finish"]').click();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(page.locator('[data-test="complete-header"]')).toHaveText('Thank you for your order!');
    });

    await test.step('AC6: cart is emptied after completion; Back Home returns to inventory', async () => {
      // Badge is cleared once the order is placed.
      await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveCount(0);

      await page.locator('[data-test="back-to-products"]').click();
      await expect(page).toHaveURL(/inventory\.html/);

      // And the cart stays empty back on the inventory page.
      await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveCount(0);
    });
  });
});
