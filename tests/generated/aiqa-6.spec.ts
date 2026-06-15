import { test, expect } from '@playwright/test';

test.describe('AIQA-6: View product details page', () => {
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

  test('Clicking on a product displays its details page', async ({ page }) => {
    await test.step('On the inventory page, click on any product name', async () => {
      // Click on Sauce Labs Backpack product name link
      await page.locator('[data-test="item-4-title-link"]').click();
    });

    await test.step('Verify the product details page is displayed', async () => {
      // Wait for the inventory-item page to load
      await page.waitForURL(/inventory-item\.html/);
      await expect(page).toHaveURL(/inventory-item\.html\?id=\d+/);
    });

    await test.step('Verify product name is visible', async () => {
      const productName = page.locator('[data-test="inventory-item-name"]');
      await expect(productName).toBeVisible();
      await expect(productName).toContainText('Sauce Labs Backpack');
    });

    await test.step('Verify product description is visible', async () => {
      const productDesc = page.locator('[data-test="inventory-item-desc"]');
      await expect(productDesc).toBeVisible();
      await expect(productDesc).toContainText('carry.allTheThings()');
    });

    await test.step('Verify product price is visible', async () => {
      const productPrice = page.locator('[data-test="inventory-item-price"]');
      await expect(productPrice).toBeVisible();
      await expect(productPrice).toContainText('$29.99');
    });

    await test.step('Verify Add to cart button (or Remove if in cart) is visible', async () => {
      // The button could be either "Add to cart" or "Remove" depending on cart state
      const addButton = page.getByRole('button', { name: /Add to cart/ });
      const removeButton = page.locator('[data-test="remove"]');

      const isAddButtonVisible = await addButton.isVisible().catch(() => false);
      const isRemoveButtonVisible = await removeButton.isVisible().catch(() => false);

      // At least one of them should be visible
      expect(isAddButtonVisible || isRemoveButtonVisible).toBe(true);
    });

    await test.step('Verify there is a Back button to return to inventory', async () => {
      const backButton = page.locator('[data-test="back-to-products"]');
      await expect(backButton).toBeVisible();
    });
  });
});
