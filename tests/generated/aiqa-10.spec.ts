import { test, expect } from '../support/fixtures';

test.describe('AIQA-10: Logging out through the menu', () => {
  test('should return user to login page after logout', async ({ loggedIn, page }) => {
    await test.step('user is logged in on inventory page', async () => {
      await expect(page).toHaveURL(/inventory\.html/);
    });

    await test.step('log out via menu', async () => {
      await loggedIn.logout();
      await page.waitForURL('/');
    });

    await test.step('verify returned to login page', async () => {
      await expect(page).toHaveURL('/');
    });

    await test.step('verify login button is visible', async () => {
      const loginButton = page.getByRole('button', { name: /login/i });
      await expect(loginButton).toBeVisible();
    });
  });
});
