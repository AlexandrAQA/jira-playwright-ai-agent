import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Backpack';

test.describe('AIQA-7: Full checkout flow', () => {
  test('completes checkout and shows the order confirmation', async ({
    page,
    loggedIn,
    cartPage,
    checkoutPage,
  }) => {
    await test.step('Add a product to the cart and open the cart', async () => {
      await loggedIn.addToCart(PRODUCT);
      await expect(loggedIn.cartBadge).toHaveText('1');

      await loggedIn.openCart();
      await expect(page).toHaveURL(/cart\.html/);
      await expect(cartPage.itemNames).toHaveText(PRODUCT);
    });

    await test.step('Click Checkout and fill First Name, Last Name, and Zip/Postal Code', async () => {
      await cartPage.checkout();
      await expect(page).toHaveURL(/checkout-step-one\.html/);
      await checkoutPage.fillCustomerInfo();
    });

    await test.step('Verify the overview page: the item and a consistent total', async () => {
      await expect(page).toHaveURL(/checkout-step-two\.html/);
      await expect(checkoutPage.itemNames).toHaveText(PRODUCT);

      const { subtotal, tax, total } = await checkoutPage.totals();
      expect(subtotal).toBeGreaterThan(0);
      expect(tax).toBeGreaterThan(0);

      // The single line item drives the item total, and the grand total adds the tax.
      const itemPrice = Number((await checkoutPage.itemPrices.innerText()).replace(/[^0-9.]/g, ''));
      expect(subtotal).toBeCloseTo(itemPrice, 2);
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('Click Finish and verify the confirmation message', async () => {
      await checkoutPage.finish();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
    });
  });
});
