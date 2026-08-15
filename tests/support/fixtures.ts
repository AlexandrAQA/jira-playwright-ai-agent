/**
 * Test fixtures: page objects, ready to use, plus a logged-in starting point.
 *
 * Every generated spec imports `test` and `expect` from here instead of from
 * '@playwright/test'. That keeps the login flow in exactly one place: when
 * SauceDemo changes its login markup, one file changes, not every spec.
 */
import { test as base } from '@playwright/test';
import { CartPage } from './pages/cart.page';
import { CheckoutPage } from './pages/checkout.page';
import { InventoryPage } from './pages/inventory.page';
import { LoginPage } from './pages/login.page';

type Fixtures = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  /**
   * Logged in as the standard user and sitting on the inventory page.
   * Depend on this when the login itself is not what the ticket is testing.
   */
  loggedIn: InventoryPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },

  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },

  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },

  loggedIn: async ({ page, loginPage, inventoryPage }, use) => {
    await loginPage.loginAsStandardUser();
    await page.waitForURL(/inventory\.html/);
    await use(inventoryPage);
  },
});

export { expect } from '@playwright/test';
export { CartPage, CheckoutPage, InventoryPage, LoginPage };
