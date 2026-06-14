/**
 * scripts/watch-jira.ts
 * ---------------------------------------------------------------------------
 * Polling trigger (the "alarm clock").
 *
 * Every WATCH_INTERVAL_MS it asks Jira for tickets that carry the trigger label
 * and are still in "To Do", then runs the autonomous agent (headless Claude Code)
 * on each one. After the agent finishes, it has moved the ticket to Done, so it
 * will not be picked up again.
 *
 * Run:
 *   npx tsx scripts/watch-jira.ts
 *
 * Env (all optional):
 *   WATCH_LABEL        label to watch          (default: playwright_agent)
 *   WATCH_INTERVAL_MS  poll interval in ms     (default: 30000)
 *   WATCH_DRY_RUN      "1" = only log the command, do NOT run the agent (safe test)
 *
 * The trigger is intentionally separate from the agent and from MCP: this file
 * only WAKES the agent up. The agent itself follows CLAUDE.md.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import { search } from '../src/jira';

const LABEL = process.env.WATCH_LABEL || 'playwright_agent';
const INTERVAL = Number(process.env.WATCH_INTERVAL_MS || 30000);
const DRY_RUN = process.env.WATCH_DRY_RUN === '1';
const ONESHOT = process.env.WATCH_ONESHOT === '1'; // run one cycle then exit (for testing)
const MODEL = process.env.WATCH_MODEL || 'haiku'; // model for the autonomous agent (haiku | sonnet | opus)
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'AIQA';

// Tickets we already handed to the agent in this run (avoids double-trigger while
// the agent is still working, before it moves the ticket out of "To Do").
const processed = new Set<string>();

function log(msg: string): void {
  console.log(`[WATCH ${new Date().toISOString()}] ${msg}`);
}

/** Run the autonomous agent on one ticket via headless Claude Code. */
function runAgent(key: string): Promise<void> {
  return new Promise((resolve) => {
    const args = [
      '-p',
      `pick up ${key}. Run autonomously without asking for confirmation; this is a triggered headless run.`,
      '--model',
      MODEL, // cost/quality choice: sonnet (default) | opus | haiku
      '--permission-mode',
      'bypassPermissions', // unattended: do not prompt for tool permissions
      '--mcp-config',
      '.mcp.json', // load the Playwright MCP for this run
      '--strict-mcp-config', // ignore other MCP configs, no manual approval needed
    ];

    if (DRY_RUN) {
      log(`DRY_RUN: would run -> claude ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
      resolve();
      return;
    }

    log(`running agent on ${key} ...`);
    const child = spawn('claude', args, { stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      log(`agent on ${key} finished (exit ${code})`);
      resolve();
    });
  });
}

/** One polling cycle: find labeled To Do tickets and run the agent on new ones. */
async function tick(): Promise<void> {
  const jql = `project = ${PROJECT_KEY} AND labels = "${LABEL}" AND status = "To Do" ORDER BY created ASC`;
  let issues: Array<{ key: string; summary: string; status: string }>;
  try {
    issues = await search(jql);
  } catch (e: any) {
    log(`Jira search failed: ${e.message}`);
    return;
  }

  const fresh = issues.filter((i) => !processed.has(i.key));
  for (const issue of fresh) {
    log(`found ${issue.key}: ${issue.summary}`);
    processed.add(issue.key);
    await runAgent(issue.key); // one ticket at a time
  }
}

async function start(): Promise<void> {
  log(
    `watching project ${PROJECT_KEY}, label "${LABEL}", every ${INTERVAL} ms` +
      `${DRY_RUN ? ' (DRY_RUN)' : ''}${ONESHOT ? ' (ONESHOT)' : ''}`,
  );
  await tick();
  if (ONESHOT) {
    log('one-shot done');
    return;
  }
  // schedule the next cycle only after the current one finished (no overlap)
  const repeat = async (): Promise<void> => {
    await tick();
    setTimeout(repeat, INTERVAL);
  };
  setTimeout(repeat, INTERVAL);
}

start();
