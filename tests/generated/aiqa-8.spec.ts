import { test, expect } from '../support/fixtures';

test('Full checkout flow: login, cart, checkout form, overview, confirmation', async ({
  loggedIn: inventoryPage,
  cartPage,
  checkoutPage,
  page,
}) => {
  await test.step('Add Sauce Labs Backpack to cart', async () => {
    await inventoryPage.addToCart('Sauce Labs Backpack');
  });

  await test.step('Open cart', async () => {
    await inventoryPage.openCart();
    await page.waitForURL(/cart\.html/);
  });

  await test.step('Verify item is in cart', async () => {
    const itemName = page.locator('[data-test="inventory-item-name"]');
    await expect(itemName).toContainText('Sauce Labs Backpack');
  });

  await test.step('Click Checkout', async () => {
    await cartPage.checkout();
    await page.waitForURL(/checkout-step-one\.html/);
  });

  await test.step('Fill customer information and continue', async () => {
    await checkoutPage.fillCustomerInfo();
    await page.waitForURL(/checkout-step-two\.html/);
  });

  await test.step('Verify overview page items and prices', async () => {
    const itemName = page.locator('[data-test="inventory-item-name"]');
    await expect(itemName).toContainText('Sauce Labs Backpack');

    const itemPrice = page.locator('[data-test="inventory-item-price"]');
    await expect(itemPrice).toHaveText('$29.99');

    const summary = await checkoutPage.totals();
    expect(summary.subtotal).toBe(29.99);
    expect(summary.total).toBe(summary.subtotal + summary.tax);
  });

  await test.step('Click Finish', async () => {
    await checkoutPage.finish();
    await page.waitForURL(/checkout-complete\.html/);
  });

  await test.step('Verify order confirmation message', async () => {
    const confirmationHeader = page.locator('[data-test="complete-header"]');
    await expect(confirmationHeader).toContainText('Thank you for your order!');
  });

  await test.step('Verify cart is empty', async () => {
    await expect(inventoryPage.cartBadge).toHaveCount(0);
  });
});
