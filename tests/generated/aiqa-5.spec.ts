import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Bike Light';

test.describe('AIQA-5: Remove a product from the cart', () => {
  test('Removing a product updates the cart badge count', async ({ loggedIn }) => {
    await test.step('On the inventory page, click Add to cart for one product', async () => {
      await loggedIn.addToCart(PRODUCT);
    });

    await test.step('Verify the cart icon badge shows 1', async () => {
      await expect(loggedIn.cartBadge).toHaveText('1');
    });

    await test.step('Click Remove to take the product out of the cart', async () => {
      await loggedIn.removeFromCart(PRODUCT);
    });

    await test.step('Verify the badge is gone once the cart is empty', async () => {
      await expect(loggedIn.cartBadge).toHaveCount(0);
    });
  });
});
