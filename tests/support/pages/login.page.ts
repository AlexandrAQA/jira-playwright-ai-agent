import type { Locator, Page } from '@playwright/test';

/** The SauceDemo login screen. */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.username = page.locator('[data-test="username"]');
    this.password = page.locator('[data-test="password"]');
    this.loginButton = page.locator('[data-test="login-button"]');
    this.errorMessage = page.locator('[data-test="error"]');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  /** Fill the form and submit. Does not assert the outcome: a test may expect a failure. */
  async login(user: string, password: string): Promise<void> {
    await this.username.fill(user);
    await this.password.fill(password);
    await this.loginButton.click();
  }

  /**
   * Log in with the credentials from the environment.
   * Credentials never live in the source, only in .env or CI secrets.
   */
  async loginAsStandardUser(): Promise<void> {
    await this.open();
    await this.login(process.env.SAUCE_USER!, process.env.SAUCE_PASSWORD!);
  }

  async isLoginButtonVisible(): Promise<boolean> {
    return this.loginButton.isVisible();
  }
}
