import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Backpack';

test.describe('AIQA-2: Adding a product to the cart', () => {
  test('cart badge updates when adding a product', async ({ loggedIn }) => {
    await test.step('Click Add to cart for one product', async () => {
      await loggedIn.addToCart(PRODUCT);
    });

    await test.step('Verify the cart icon badge shows 1', async () => {
      await expect(loggedIn.cartBadge).toBeVisible();
      await expect(loggedIn.cartBadge).toHaveText('1');
    });
  });
});
