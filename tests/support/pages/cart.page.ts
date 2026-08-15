import type { Locator, Page } from '@playwright/test';

/** The shopping cart at /cart.html. */
export class CartPage {
  readonly itemNames: Locator;
  readonly itemPrices: Locator;
  readonly checkoutButton: Locator;
  readonly continueShoppingButton: Locator;

  constructor(private readonly page: Page) {
    this.itemNames = page.locator('[data-test="inventory-item-name"]');
    this.itemPrices = page.locator('[data-test="inventory-item-price"]');
    this.checkoutButton = page.locator('[data-test="checkout"]');
    this.continueShoppingButton = page.locator('[data-test="continue-shopping"]');
  }

  async removeFromCart(productName: string): Promise<void> {
    const slug = productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    await this.page.locator(`[data-test="remove-${slug}"]`).click();
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }
}
