import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Backpack';

test.describe('AIQA-3: Full checkout flow', () => {
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

    await test.step('Proceed to checkout and fill the customer form', async () => {
      await cartPage.checkout();
      await expect(page).toHaveURL(/checkout-step-one\.html/);
      await checkoutPage.fillCustomerInfo();
    });

    await test.step('Continue to the overview and finish the order', async () => {
      await expect(page).toHaveURL(/checkout-step-two\.html/);
      await checkoutPage.finish();
    });

    await test.step('Verify the order confirmation', async () => {
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
    });
  });
});
