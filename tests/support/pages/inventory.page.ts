import type { Locator, Page } from '@playwright/test';

/** "Sauce Labs Backpack" -> "sauce-labs-backpack", the slug SauceDemo uses in data-test ids. */
const slug = (productName: string): string =>
  productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The product list shown right after login. */
export class InventoryPage {
  readonly itemNames: Locator;
  readonly itemPrices: Locator;
  readonly cartBadge: Locator;
  readonly cartLink: Locator;
  readonly sortDropdown: Locator;
  readonly menuButton: Locator;
  readonly logoutLink: Locator;

  constructor(private readonly page: Page) {
    this.itemNames = page.locator('[data-test="inventory-item-name"]');
    this.itemPrices = page.locator('[data-test="inventory-item-price"]');
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
    this.cartLink = page.locator('[data-test="shopping-cart-link"]');
    this.sortDropdown = page.locator('[data-test="product-sort-container"]');
    this.menuButton = page.getByRole('button', { name: 'Open Menu' });
    this.logoutLink = page.locator('[data-test="logout-sidebar-link"]');
  }

  async addToCart(productName: string): Promise<void> {
    await this.page.locator(`[data-test="add-to-cart-${slug(productName)}"]`).click();
  }

  async removeFromCart(productName: string): Promise<void> {
    await this.page.locator(`[data-test="remove-${slug(productName)}"]`).click();
  }

  async openProduct(productName: string): Promise<void> {
    await this.itemNames.filter({ hasText: productName }).click();
  }

  async openCart(): Promise<void> {
    await this.cartLink.click();
  }

  /** Sort by the option value, e.g. 'lohi', 'hilo', 'az', 'za'. */
  async sortBy(optionValue: string): Promise<void> {
    await this.sortDropdown.selectOption(optionValue);
  }

  /** Prices as numbers, in the order currently displayed. */
  async prices(): Promise<number[]> {
    const labels = await this.itemPrices.allInnerTexts();
    return labels.map((l) => Number(l.replace(/[^0-9.]/g, '')));
  }

  async logout(): Promise<void> {
    await this.menuButton.click();
    await this.page.evaluate(() => {
      document.getElementById('logout_sidebar_link')?.click();
    });
  }
}
