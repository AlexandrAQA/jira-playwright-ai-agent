# AI QA Agent: Jira -> Playwright -> Jira

[![tests](https://github.com/AlexandrAQA/jira-playwright-ai-agent/actions/workflows/tests.yml/badge.svg)](https://github.com/AlexandrAQA/jira-playwright-ai-agent/actions/workflows/tests.yml)

**A Jira ticket goes in. A passing Playwright test comes out, and the ticket closes itself.**

![Full run: a Jira ticket becomes a green Playwright test and the ticket is closed](docs/demo.gif)

The agent reads a ticket, explores the real web app in a browser to find real selectors,
generates an end-to-end test in Playwright and TypeScript, runs it until it is green,
writes the result back to the ticket and moves it across the board. A human stays in the
loop for irreversible actions.

Target app under test: [SauceDemo](https://www.saucedemo.com).

## Why this is more than "an LLM writes tests"

- **Real selectors, not guesses.** The agent opens the actual page through Playwright MCP
  and reads the DOM, instead of inventing selectors from the wording of the ticket.
- **A human owns the irreversible steps.** Moving a ticket or writing to its description
  asks for confirmation in interactive runs; autonomous runs are opt-in per ticket.
- **Every generated test lands in CI.** Each push and pull request runs the whole suite on
  GitHub Actions, so a test the agent wrote yesterday keeps being verified today.

## Architecture

| Role | Component | Responsibility |
|------|-----------|----------------|
| Brain + loop | Claude Code | Decides, writes test code, runs the workflow |
| Instructions | `CLAUDE.md` | The playbook: workflow steps and rules |
| Hands + eyes | Playwright MCP | Drives a real browser, inspects the DOM, finds selectors |
| Door to Jira | `src/jira.ts` | Thin REST v3 client: read / move / append |
| Secrets | `.env` | Jira credentials and SauceDemo test logins |

MCP (Model Context Protocol) is an open standard for connecting tools and data to a
model. Playwright MCP is what makes the agent reliable: instead of guessing selectors
from the ticket text, it opens the real page and picks real selectors.

## Workflow ("pick up aiqa N")

1. Read the ticket from Jira (`src/jira.ts get`).
2. Move it to **In Progress**.
3. Explore SauceDemo via Playwright MCP and find real selectors.
4. Generate `tests/generated/aiqa-N.spec.ts` (each ticket step is a `test.step`).
5. Run with Playwright and fix until green.
6. Append the result to the ticket description.
7. Move it to **Done**.

## Tech stack

- Playwright + TypeScript (Chromium, html + json reporters)
- Playwright MCP (browser control)
- axios + dotenv (Jira REST API v3 client)
- Claude Code as the agent runtime

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in your Jira values
```

The Playwright MCP server is already declared in `.mcp.json` (it points to
`playwright-mcp.config.json` for the browser launch flags), so Claude Code picks it up
automatically when you open this folder.

Required `.env` values: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`.
Create the API token at `id.atlassian.com -> Security -> Create API token`.

## Usage

```bash
# Jira helper (CLI)
npx tsx src/jira.ts get AIQA-1
npx tsx src/jira.ts move AIQA-1 "In Progress"
npx tsx src/jira.ts append AIQA-1 "Automated and passing."

# Run tests
npm test          # all tests
npm run report    # open the HTML report
```

Then, inside Claude Code in this folder, just say `pick up aiqa 1`.

## Label-triggered autonomous mode

Instead of running each ticket by hand, a polling watcher picks up tickets automatically.
Add the label `playwright_agent` to a Jira ticket and the agent runs the whole flow on its own.

```bash
# add the trigger label to a ticket
npx tsx src/jira.ts label-add AIQA-2 playwright_agent

# safe dry run (detects labeled tickets, prints the command, runs nothing)
WATCH_DRY_RUN=1 WATCH_ONESHOT=1 npx tsx scripts/watch-jira.ts

# start the watcher (polls Jira, runs the agent on each new labeled ticket)
npx tsx scripts/watch-jira.ts
```

`scripts/watch-jira.ts` polls Jira with
`project = AIQA AND labels = playwright_agent AND status = "To Do"` and, for each new ticket,
runs the agent headless:

```bash
claude -p "pick up AIQA-N ..." --model haiku --permission-mode bypassPermissions \
  --mcp-config .mcp.json --strict-mcp-config
```

Configurable via env: `WATCH_MODEL` (`haiku` | `sonnet` | `opus`), `WATCH_INTERVAL_MS`, `WATCH_LABEL`.
This is the polling variant of the trigger; a Jira webhook would be the event-driven alternative.

## Project structure

```text
.mcp.json                Playwright MCP server definition
playwright-mcp.config.json  browser launch flags for the MCP server
.env / .env.example      secrets (env) and template
playwright.config.ts     Playwright config (chromium, reporters, baseURL)
CLAUDE.md                agent playbook (read automatically by Claude Code)
src/jira.ts              Jira REST v3 helper + CLI
scripts/seed-tickets.ts  one-off: seed ticket descriptions
scripts/watch-jira.ts    polling trigger (label-based autonomous runs)
tests/generated/         generated Playwright specs
```

## Notes

This is the lightweight variant: Claude Code as the agent, a hand-written Jira REST
client, manual trigger. It evolves naturally toward a production setup (custom agent
loop on the Anthropic SDK, Jira via MCP, label-based trigger, CI, human-in-the-loop).
