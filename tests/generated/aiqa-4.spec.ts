import { expect, test } from '../support/fixtures';

test('AIQA-4: Verify products can be sorted by price low to high', async ({ loggedIn }) => {
  await test.step('Open the sort dropdown and select "Price (low to high)"', async () => {
    await loggedIn.sortBy('lohi');
  });

  await test.step('Read product prices and verify they are in non-decreasing order', async () => {
    const prices = await loggedIn.prices();

    expect(prices.length).toBeGreaterThan(1);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});
