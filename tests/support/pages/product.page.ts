import type { Locator, Page } from '@playwright/test';

/** A single product page at /inventory-item.html?id=N. */
export class ProductPage {
  readonly name: Locator;
  readonly description: Locator;
  readonly price: Locator;
  readonly addToCartButton: Locator;
  readonly removeButton: Locator;
  readonly backToProductsButton: Locator;

  constructor(private readonly page: Page) {
    this.name = page.locator('[data-test="inventory-item-name"]');
    this.description = page.locator('[data-test="inventory-item-desc"]');
    this.price = page.locator('[data-test="inventory-item-price"]');
    this.addToCartButton = page.getByRole('button', { name: /add to cart/i });
    this.removeButton = page.locator('[data-test="remove"]');
    this.backToProductsButton = page.locator('[data-test="back-to-products"]');
  }

  /** The add or remove button, whichever the current cart state shows. */
  get cartToggleButton(): Locator {
    return this.page.locator('[data-test="add-to-cart"], [data-test="remove"]');
  }
}
