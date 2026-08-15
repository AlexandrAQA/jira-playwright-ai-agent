# SauceDemo: login page

## Login form and its selectors

The login screen is the site root, `https://www.saucedemo.com/`. `baseURL` is configured,
so a test reaches it with `page.goto('/')`.

| Element        | Selector                     |
| -------------- | ---------------------------- |
| Username field | `[data-test="username"]`     |
| Password field | `[data-test="password"]`     |
| Login button   | `[data-test="login-button"]` |
| Error banner   | `[data-test="error"]`        |

Page object: `tests/support/pages/login.page.ts` (`LoginPage`).
Methods: `open()`, `login(user, password)`, `loginAsStandardUser()`.

## Credentials

Credentials never appear in the source. They come from the environment:
`process.env.SAUCE_USER` and `process.env.SAUCE_PASSWORD`, filled locally from `.env`
and in CI from the repository secrets `SAUCE_USER` and `SAUCE_PASSWORD`.

The login page itself lists the accepted usernames on screen, among them
`standard_user`, `locked_out_user`, `problem_user` and `performance_glitch_user`.
They all share one password, which the page also displays. Do not copy either the
usernames or the password into a spec: a test that needs a non-standard account
should read it from an environment variable too.

## Successful login

A successful login lands on `/inventory.html`. Assert it with
`await expect(page).toHaveURL(/inventory\.html/)` or wait for it with
`page.waitForURL(/inventory\.html/)`.

Do not navigate to `/inventory.html` directly to "save time". Jumping to a URL skips
the behaviour under test, and the quality gate rejects a spec that does it.

## Failed login

A rejected login stays on the root URL and shows the banner `[data-test="error"]`.
A locked-out account produces a message about the user being locked out. Assert on the
banner being visible and on its text, not on the absence of navigation alone.

## The loggedIn fixture

Most tickets are not about logging in. For those, depend on the `loggedIn` fixture from
`tests/support/fixtures.ts`: it signs in as the standard user, waits for the inventory
page and hands back an `InventoryPage`. Copying login steps into a spec is rejected by
the quality gate rule `no-inline-login`.
