import { expect, test } from '../support/fixtures';

test('AIQA-1: login with standard_user lands on the inventory page', async ({
  page,
  loginPage,
  inventoryPage,
}) => {
  await test.step('Open the SauceDemo login page', async () => {
    await loginPage.open();
    await expect(loginPage.username).toBeVisible();
  });

  await test.step('Log in as the standard user', async () => {
    await loginPage.login(process.env.SAUCE_USER!, process.env.SAUCE_PASSWORD!);
  });

  await test.step('Verify redirect to the inventory page', async () => {
    await expect(page).toHaveURL(/inventory\.html/);
    await expect(inventoryPage.itemNames.first()).toBeVisible();
  });
});
