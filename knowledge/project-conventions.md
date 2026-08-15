# Project conventions for generated tests

## Page objects and fixtures are mandatory

A spec imports `test` and `expect` from `../support/fixtures`, never from
`@playwright/test`. Available fixtures: `loginPage`, `inventoryPage`, `cartPage`,
`checkoutPage`, and `loggedIn`, which is already signed in as the standard user and
sitting on the inventory page.

If a ticket needs an element that no page object exposes, add it to the page object
first, then use it from the spec. A spec never touches a raw selector.

## What the quality gate rejects

`npm run lint:tests` fails the build on any of these, even when the test is green:

- a spec with no `expect` at all
- a spec with no `test.step`, so a failure cannot be traced to a ticket step
- `page.goto` to anything but `/`, that is, jumping past the flow under test
- a fixed sleep such as `page.waitForTimeout`
- a brittle selector: XPath, or a CSS class or id selector inside `locator(...)`
- a credential written as a string literal
- importing from `@playwright/test` instead of the fixtures
- an inline login, recognised by the username, password or login-button selectors

## Waiting

Use web-first assertions: `toHaveURL`, `toBeVisible`, `toHaveText`, `toHaveCount`.
They retry on their own. For a navigation that assertions cannot cover, use
`page.waitForURL(/pattern/, { timeout })`. Never a fixed sleep.

## Selector preference order

1. A `data-test` attribute, which SauceDemo provides almost everywhere.
2. A role with an accessible name, `getByRole('button', { name: /.../i })`.
3. Label, placeholder or text.

CSS classes and XPath are last resort and are rejected by the gate inside `locator(...)`.

## Credentials

Only from the environment: `process.env.SAUCE_USER` and `process.env.SAUCE_PASSWORD`,
without a literal fallback. A fallback such as `process.env.SAUCE_USER || 'standard_user'`
hides a missing secret and puts a credential in the source; the gate rejects it.

## Structure of a generated spec

Each meaningful ticket step is wrapped in `test.step('...', async () => { ... })`, so a
failure in the report points at the ticket step that broke rather than at a line number.
