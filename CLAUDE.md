# Playbook: AI QA Agent (Jira -> Playwright -> Jira)

You are an automated QA workflow targeting SauceDemo (`https://www.saucedemo.com`).
When told **"pick up aiqa N"** (or "take aiqa N"), execute the ENTIRE workflow below
for the Jira ticket `AIQA-N`.

## Project tools

- Jira: helper CLI `src/jira.ts`. Run it with `npx tsx src/jira.ts <command> ...`.
- Browser: Playwright MCP (`browser_*` tools). Use it to inspect the real DOM.
- Tests: place them in `tests/generated/`. Run with `npx playwright test`.
- Credentials and secrets: only from `.env` (via `process.env`). Never hardcode.

## Workflow "pick up aiqa N"

1. **Read the ticket:** `npx tsx src/jira.ts get AIQA-N`. Understand what to test,
   extract the steps and the expected result.
2. **Move to in progress:** `npx tsx src/jira.ts move AIQA-N "In Progress"`.
3. **Recon via Playwright MCP:** open the relevant SauceDemo pages, inspect the DOM,
   find the REAL selectors. Do not invent selectors from memory.
4. **Generate the test:** `tests/generated/aiqa-N.spec.ts`. Wrap each meaningful ticket
   step in `test.step('...', async () => { ... })`.
5. **Run and make it green:** `npx playwright test tests/generated/aiqa-N.spec.ts`.
   On failure, read the error, fix the selector/assertion, rerun until it passes.
6. **Pass the quality gates:** `npm run lint:tests && npm run lint && npm run format:check`.
   Green is not enough: a test that skips these would be rejected by CI anyway.
   Use `npm run lint:fix` and `npm run format` to fix what is auto-fixable.
7. **Append the result to Jira:** `npx tsx src/jira.ts append AIQA-N "Automated test:
<what was automated>. File: tests/generated/aiqa-N.spec.ts. Run: PASSED."`.
8. **Close it:** `npx tsx src/jira.ts move AIQA-N "Done"`.

## Test authoring rules

**Page objects and fixtures are mandatory. A spec never talks to raw selectors.**

- Import `test` and `expect` from `../support/fixtures`, never from `@playwright/test`.
- Available fixtures: `loginPage`, `inventoryPage`, `cartPage`, `checkoutPage`, and
  `loggedIn` (already signed in as the standard user, sitting on the inventory page).
- Depend on `loggedIn` whenever the login itself is not what the ticket tests. Never
  copy the login steps into a spec.
- Page objects live in `tests/support/pages/`. If a ticket needs an element that no page
  object exposes yet, **add it to the page object first**, then use it from the spec.
- Everything above is enforced by `npm run lint:tests`, which runs in CI before the tests.

- Role-based selectors: `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`.
  SauceDemo exposes stable `data-test` attributes, so `getByTestId(...)` is also fine.
  Avoid brittle CSS/XPath tied to markup.
- Credentials only from the environment: `process.env.SAUCE_USER`, `process.env.SAUCE_PASSWORD`.
- `baseURL` is already configured: use `page.goto('/')`, not the full URL.
- Web-first assertions via `expect`: `toHaveURL`, `toBeVisible`, `toHaveText`, etc.
- External redirects (different domain / new tab): wait via
  `page.waitForURL(/.../, { timeout })` with a sensible timeout, never a fixed sleep.

## Jira rules

- The ticket description must only be **APPENDED** to. NEVER overwrite existing content.
- Move statuses only through `src/jira.ts` (it performs correct Jira transitions).
- If the required transition is not available, list the available ones and ask the human.

## Human in the loop (important)

- In an INTERACTIVE session, before irreversible Jira actions (moving status, writing to
  the description) on the FIRST ticket, ask the human for confirmation.
- EXCEPTION, autonomous mode: if the task explicitly says to run autonomously (a
  label-triggered / headless run), do NOT ask. Proceed through the full workflow on your own.
- Never commit `.env` and never print the Jira token to logs/responses.
