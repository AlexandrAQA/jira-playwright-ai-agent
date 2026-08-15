import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Backpack';
const PRODUCT_PRICE = '$29.99';

test.describe('AIQA-9: Full checkout flow (login -> cart -> form -> overview -> confirmation)', () => {
  test('completes an order, shows the confirmation, and empties the cart', async ({
    page,
    loggedIn,
    cartPage,
    checkoutPage,
  }) => {
    await test.step('AC1: standard_user logs in and lands on the inventory page', async () => {
      await expect(page).toHaveURL(/inventory\.html/);
    });

    await test.step('AC2: adding a product updates the badge; cart lists exactly that item', async () => {
      await loggedIn.addToCart(PRODUCT);
      await expect(loggedIn.cartBadge).toHaveText('1');

      await loggedIn.openCart();
      await expect(page).toHaveURL(/cart\.html/);

      await expect(cartPage.itemNames).toHaveCount(1);
      await expect(cartPage.itemNames).toHaveText(PRODUCT);
    });

    await test.step('AC3: checkout step-one accepts First/Last name and Zip, Continue advances', async () => {
      await cartPage.checkout();
      await expect(page).toHaveURL(/checkout-step-one\.html/);

      await checkoutPage.fillCustomerInfo();
      await expect(page).toHaveURL(/checkout-step-two\.html/);
    });

    await test.step('AC4: overview shows the item and Total = item subtotal + tax (computed)', async () => {
      await expect(checkoutPage.itemNames).toHaveCount(1);
      await expect(checkoutPage.itemNames).toHaveText(PRODUCT);
      await expect(checkoutPage.itemPrices).toHaveText(PRODUCT_PRICE);

      await expect(checkoutPage.subtotalLabel).toHaveText(`Item total: ${PRODUCT_PRICE}`);
      await expect(checkoutPage.taxLabel).toBeVisible();
      await expect(checkoutPage.totalLabel).toBeVisible();

      // The total is actually consistent: total == item total + tax.
      const { subtotal, tax, total } = await checkoutPage.totals();
      expect(total).toBeCloseTo(subtotal + tax, 2);
    });

    await test.step('AC5: Finish leads to checkout-complete with the thank-you header', async () => {
      await checkoutPage.finish();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
    });

    await test.step('AC6: cart is emptied after completion; Back Home returns to inventory', async () => {
      await expect(loggedIn.cartBadge).toHaveCount(0);

      await checkoutPage.backToProducts();
      await expect(page).toHaveURL(/inventory\.html/);
      await expect(loggedIn.cartBadge).toHaveCount(0);
    });
  });
});
