import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Backpack';
const PRODUCT_PRICE = '$29.99';

test.describe('AIQA-7: Full checkout flow reaches the order confirmation', () => {
  test('login -> add product -> cart -> checkout form -> overview -> confirmation', async ({
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

    await test.step('Click Checkout and fill First Name, Last Name and Zip/Postal Code', async () => {
      await cartPage.checkout();
      await expect(page).toHaveURL(/checkout-step-one\.html/);
      await checkoutPage.fillCustomerInfo('John', 'Doe', '12345');
    });

    await test.step('Verify the overview: exactly the product added, at its listed price', async () => {
      await expect(page).toHaveURL(/checkout-step-two\.html/);
      await expect(checkoutPage.itemNames).toHaveText(PRODUCT);
      await expect(checkoutPage.itemPrices).toHaveText(PRODUCT_PRICE);

      await expect(checkoutPage.subtotalLabel).toHaveText(`Item total: ${PRODUCT_PRICE}`);
      await expect(checkoutPage.taxLabel).toBeVisible();
      await expect(checkoutPage.totalLabel).toBeVisible();

      const { subtotal, tax, total } = await checkoutPage.totals();
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('Click Finish and verify the confirmation message', async () => {
      await checkoutPage.finish();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
    });
  });
});
