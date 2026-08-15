import { ProductPage } from '../support/pages/product.page';
import { expect, test } from '../support/fixtures';

const PRODUCT = 'Sauce Labs Backpack';

test.describe('AIQA-6: View product details page', () => {
  test('Clicking on a product displays its details page', async ({ page, loggedIn }) => {
    const productPage = new ProductPage(page);

    await test.step('On the inventory page, click on a product name', async () => {
      await loggedIn.openProduct(PRODUCT);
    });

    await test.step('Verify the product details page is displayed', async () => {
      await expect(page).toHaveURL(/inventory-item\.html\?id=\d+/);
    });

    await test.step('Verify name, description and price are visible', async () => {
      await expect(productPage.name).toHaveText(PRODUCT);
      await expect(productPage.description).toContainText('carry.allTheThings()');
      await expect(productPage.price).toHaveText('$29.99');
    });

    await test.step('Verify the cart button and the Back button are present', async () => {
      await expect(productPage.cartToggleButton).toBeVisible();
      await expect(productPage.backToProductsButton).toBeVisible();
    });
  });
});
