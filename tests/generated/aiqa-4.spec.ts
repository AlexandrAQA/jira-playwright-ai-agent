import { test, expect } from '@playwright/test';

test('AIQA-4: Verify products can be sorted by price low to high', async ({ page }) => {
  await test.step('Log in as standard_user', async () => {
    await page.goto('/');
    await page.locator('input[placeholder="Username"]').fill(process.env.SAUCE_USER || 'standard_user');
    await page.locator('input[placeholder="Password"]').fill(process.env.SAUCE_PASSWORD || 'secret_sauce');
    await page.locator('text=Login').click();
    await page.waitForURL('/inventory.html');
  });

  await test.step('Open sort dropdown and select "Price (low to high)"', async () => {
    await page.locator('select').selectOption('Price (low to high)');
  });

  await test.step('Read product prices and verify they are in non-decreasing order', async () => {
    const priceElements = await page.locator('.inventory_item_price').all();
    const prices: number[] = [];

    for (const element of priceElements) {
      const text = await element.textContent();
      const priceStr = text?.replace('$', '') || '0';
      prices.push(parseFloat(priceStr));
    }

    // Verify prices are in non-decreasing order (cheapest first)
    for (let i = 0; i < prices.length - 1; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i + 1]);
    }

    // Log the prices for verification
    console.log('Sorted prices:', prices);
  });
});
