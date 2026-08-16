# Playbook: AI QA Agent (Jira -> Playwright -> Jira)

You are an automated QA workflow targeting SauceDemo (`https://www.saucedemo.com`).
When told **"pick up aiqa N"** (or "take aiqa N"), execute the ENTIRE workflow below
for the Jira ticket `AIQA-N`.

## Project tools

- Jira: helper CLI `src/jira.ts`. Run it with `npx tsx src/jira.ts <command> ...`.
- Knowledge base: `npx tsx scripts/kb.ts search "<question>"`. Selectors and page
  behaviour already learned on earlier tickets. **Always the first place to look.**
  Ask it in plain words; it ranks on meaning, not on matching words. Add `--bm25` when you
  are looking for an exact token such as a `data-test` value or a method name.
- Browser: Playwright MCP (`browser_*` tools). Use it to inspect the real DOM.
- Tests: place them in `tests/generated/`. Run with `npx playwright test`.
- Credentials and secrets: only from `.env` (via `process.env`). Never hardcode.

## Three sources, in strict order of cost

Reach for the cheapest source that can answer the question, and only then move on.

1. **Knowledge base** (`scripts/kb.ts`). A shell call returning a few hundred tokens of
   Markdown. It already knows every selector on SauceDemo that a previous ticket needed.
2. **Playwright CLI** (`npx playwright test`). Runs the test and returns an error
   message. This is the loop for fixing a failing assertion.
3. **Playwright MCP** (`browser_*`). Opens a real browser. **The expensive one:** every
   call adds an accessibility snapshot to the context and that snapshot stays there for
   the rest of the run, so ten MCP calls cost ten snapshots, not one.

Never use a more expensive source for something a cheaper one answers. Concretely: never
reopen the browser to debug a failing assertion. The failure is in the CLI error text.

## Two phases, and the boundary between them matters

**Phase A, recon.** Playwright MCP only. Purpose: obtain REAL selectors for elements the
knowledge base does not already cover. Enter this phase only after `scripts/kb.ts search`
came back short. Close the browser (`browser_close`) as soon as the selectors are in hand.

**Phase B, write and fix.** CLI only. Write the spec, run it, read the error, fix,
rerun. No `browser_*` calls happen in this phase at all. Phase A does not reopen.

If a Phase B failure genuinely looks like a wrong selector rather than a wrong assertion,
say so explicitly, then make one short, targeted return to Phase A for that single
element, and record what you find in the knowledge base afterwards.

## Workflow "pick up aiqa N"

1. **Read the ticket:** `npx tsx src/jira.ts get AIQA-N`. Understand what to test,
   extract the steps and the expected result.
2. **Move to in progress:** `npx tsx src/jira.ts move AIQA-N "In Progress"`.
3. **Consult the knowledge base:** `npx tsx scripts/kb.ts search "<what the ticket needs>"`,
   once per distinct question (the page, the elements, the conventions). Write down which
   selectors it gave you and what it did not answer.
4. **Phase A, recon, only for the gaps:** open the relevant SauceDemo pages via Playwright
   MCP and inspect the DOM. Do not invent selectors from memory, and do not re-verify what
   the knowledge base already told you. Skip this step entirely when there were no gaps.
5. **Phase B, generate the test:** `tests/generated/aiqa-N.spec.ts`. Wrap each meaningful
   ticket step in `test.step('...', async () => { ... })`.
6. **Run and make it green:** `npx playwright test tests/generated/aiqa-N.spec.ts`.
   On failure, read the error, fix the selector/assertion, rerun until it passes.
7. **Prove the test can fail:** `npm run mutation -- AIQA-N`. This disables, one at a
   time, each page-object action the spec uses and requires the spec to fail without it.
   A spec that stays green when its action never happens is not testing that action, and
   green alone cannot tell you which of the two you wrote.
8. **Pass the quality gates:** `npm run lint:tests && npm run lint && npm run format:check`.
   Green is not enough: a test that skips these would be rejected by CI anyway.
   Use `npm run lint:fix` and `npm run format` to fix what is auto-fixable.
9. **Feed the knowledge base:** if step 4 discovered anything new (a selector, a quirk, a
   page that behaves unexpectedly), append it to the right file in `knowledge/` under a
   `##` heading that names the question it answers. Then run `npm run kb:index` to rebuild
   the embedding index and `npx playwright test --project=unit` to confirm retrieval still
   works. This is what makes the next ticket cheaper than this one.
   If `kb:index` reports the model is missing, say so and carry on: retrieval falls back to
   BM25, and a stale index is worse than an honest note in the pull request.
10. **Propose the work, do not merge it:** `npm run pr -- AIQA-N`. This puts the spec and any
    knowledge-base change on the branch `agent/aiqa-N` and raises a pull request.
    **Never commit to `main` and never merge your own pull request.** A human reviews it.
11. **Report to Jira what is actually true:** `npx tsx src/jira.ts append AIQA-N "Automated
test proposed: <what was automated>. File: tests/generated/aiqa-N.spec.ts (on branch
agent/aiqa-N, NOT yet in main). Local run: PASSED. Awaiting human review of PR #<n>."`.
    The spec lives on a branch that a human may reject. Writing "Run: PASSED" without
    saying where the file is claims a test that main does not have, and a board that
    reports a test nobody can run is worse than a board with an open ticket.
12. **Hand it over, do not close it:** `npx tsx src/jira.ts move AIQA-N "In Review"`.
    **Never move a ticket to `Done`.** Done means merged, and merging is not yours: the
    same human who approves the pull request closes the ticket. Your work ends at
    `In Review` with a pull request waiting.

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

- **Never reach past Playwright to the DOM.** No `document.getElementById(...).click()`
  inside `page.evaluate`, no `{ force: true }`. Those skip the visibility, enabled and
  stability checks, so the test passes whether or not a real user could have done it.
  If a click seems unreliable, Playwright's auto-waiting already handles animation:
  the honest locator is almost always correct and the bypass is almost always a
  green test that proves nothing. `npm run lint:tests` rejects both.
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
- **`Done` is not a status you may set.** The furthest you go is `In Review`. On this
  board that is transition id 31; `Done` is 41 and belongs to the human who merges.
- Never write a status into Jira that the repository does not support. A ticket reading
  `Done` while the spec sits on an unmerged branch is a false record, and it is the same
  defect as a green test that asserts nothing: both report success nobody verified.

## Human in the loop (important)

- In an INTERACTIVE session, before irreversible Jira actions (moving status, writing to
  the description) on the FIRST ticket, ask the human for confirmation.
- EXCEPTION, autonomous mode: if the task explicitly says to run autonomously (a
  label-triggered / headless run), do NOT ask. Proceed through the full workflow on your own.
- Never commit `.env` and never print the Jira token to logs/responses.
- Never push to `main`, never merge a pull request, and never approve your own. The branch
  and the pull request are the whole of your write access to the repository.
- Closing the ticket is the merge signal, so it belongs to the same human. You stop at
  `In Review` with a pull request open, and say plainly that a human decides next.
