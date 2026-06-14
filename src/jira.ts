/**
 * src/jira.ts
 * ---------------------------------------------------------------------------
 * A thin layer ("door") between the agent and the Jira Cloud REST API v3.
 *
 * Capabilities:
 *   - getIssue(key)               read a ticket (summary, status, labels, description)
 *   - getDescriptionText(key)     extract the description as plain text
 *   - getTransitions(key)         which status transitions are available right now
 *   - moveIssue(key, statusName)  move a ticket to a status (In Progress / Done / ...)
 *   - appendToDescription(key, t) APPEND text to the description (without overwriting)
 *   - search(jql) / searchByLabel(label)  find tickets
 *
 * It also works as a CLI so the agent can drive it from the terminal, e.g.:
 *   npx tsx src/jira.ts get AIQA-1
 *   npx tsx src/jira.ts move AIQA-1 "In Progress"
 *   npx tsx src/jira.ts append AIQA-1 "Automated test generated and passing."
 *
 * All REAL data (JSON to parse) is written to stdout.
 * All call logs with the [JIRA] prefix go to stderr, so they never pollute parsing.
 * ---------------------------------------------------------------------------
 */

import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// --- Config from .env -------------------------------------------------------

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;

/** Make sure .env holds real values, not the template placeholders. */
function assertConfig(): void {
  const missing: string[] = [];
  if (!JIRA_BASE_URL) missing.push('JIRA_BASE_URL');
  if (!JIRA_EMAIL) missing.push('JIRA_EMAIL');
  if (!JIRA_API_TOKEN) missing.push('JIRA_API_TOKEN');
  if (missing.length) {
    throw new Error(`Missing in .env: ${missing.join(', ')}`);
  }
  const placeholders =
    JIRA_BASE_URL!.includes('your-domain') ||
    JIRA_API_TOKEN === 'your_api_token_here' ||
    JIRA_EMAIL === 'you@example.com';
  if (placeholders) {
    throw new Error(
      'The .env still contains placeholder values. Fill JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN with real data.',
    );
  }
}

// --- HTTP client for Jira ---------------------------------------------------

let _api: AxiosInstance | null = null;

/** Lazily build the axios client with Basic auth and logging. */
function api(): AxiosInstance {
  if (_api) return _api;
  assertConfig();

  const client = axios.create({
    baseURL: `${JIRA_BASE_URL!.replace(/\/$/, '')}/rest/api/3`,
    auth: { username: JIRA_EMAIL!, password: JIRA_API_TOKEN! }, // Basic auth: email + API token
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 30000,
  });

  // Log EVERY call (to stderr, so stdout stays clean JSON).
  client.interceptors.request.use((cfg) => {
    console.error(`[JIRA] -> ${cfg.method?.toUpperCase()} ${cfg.url}`);
    return cfg;
  });
  client.interceptors.response.use(
    (res) => {
      console.error(`[JIRA] <- ${res.status} ${res.config.url}`);
      return res;
    },
    (err) => {
      const status = err.response?.status ?? 'ERR';
      const url = err.config?.url ?? '';
      const body = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`[JIRA] !! ${status} ${url} ${body}`);
      return Promise.reject(err);
    },
  );

  _api = client;
  return client;
}

// --- ADF (Atlassian Document Format) <-> text -------------------------------
// In API v3 the description is not a string but an ADF tree, so we read and write it separately.

/** Recursively extract plain text from an ADF tree. */
function adfToText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const children = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  // add a newline after block nodes so the text stays readable
  if (['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type)) {
    return children + '\n';
  }
  return children;
}

/** Turn a multi-line string into an array of ADF paragraphs. */
function textToParagraphs(text: string): any[] {
  return text.split('\n').map((line) => ({
    type: 'paragraph',
    content: line.length ? [{ type: 'text', text: line }] : [],
  }));
}

// --- Public functions -------------------------------------------------------

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  labels: string[];
  descriptionText: string;
  descriptionAdf: any;
}

/** Read the whole ticket (the fields we need). */
export async function getIssue(key: string): Promise<JiraIssue> {
  const { data } = await api().get(`/issue/${key}`, {
    params: { fields: 'summary,description,status,labels' },
  });
  return {
    key: data.key,
    summary: data.fields.summary ?? '',
    status: data.fields.status?.name ?? '',
    labels: data.fields.labels ?? [],
    descriptionText: adfToText(data.fields.description).trim(),
    descriptionAdf: data.fields.description ?? null,
  };
}

/** Description text only. */
export async function getDescriptionText(key: string): Promise<string> {
  return (await getIssue(key)).descriptionText;
}

/** Status transitions available right now. */
export async function getTransitions(key: string): Promise<Array<{ id: string; name: string; to: string }>> {
  const { data } = await api().get(`/issue/${key}/transitions`);
  return data.transitions.map((t: any) => ({ id: t.id, name: t.name, to: t.to?.name }));
}

/** Move a ticket to a status by name ("In Progress", "Done", etc.). */
export async function moveIssue(key: string, statusName: string): Promise<void> {
  const { data } = await api().get(`/issue/${key}/transitions`);
  const target = statusName.trim().toLowerCase();
  const t = data.transitions.find(
    (tr: any) => tr.name?.toLowerCase() === target || tr.to?.name?.toLowerCase() === target,
  );
  if (!t) {
    const available = data.transitions.map((tr: any) => `${tr.name} -> ${tr.to?.name}`).join(', ');
    throw new Error(`Transition to "${statusName}" not found. Available: ${available || '(none)'}`);
  }
  await api().post(`/issue/${key}/transitions`, { transition: { id: t.id } });
  console.error(`[JIRA] status ${key} -> "${t.to?.name}" (transition "${t.name}")`);
}

/** APPEND text to the end of the description without overwriting what is there. */
export async function appendToDescription(key: string, text: string): Promise<void> {
  const issue = await getIssue(key);
  const newParagraphs = textToParagraphs(text);
  const existing = issue.descriptionAdf;

  const doc =
    existing && existing.type === 'doc'
      ? { ...existing, content: [...(existing.content ?? []), ...newParagraphs] }
      : { type: 'doc', version: 1, content: newParagraphs };

  await api().put(`/issue/${key}`, { fields: { description: doc } });
  console.error(`[JIRA] appended to description of ${key} (${text.length} chars)`);
}

/**
 * Overwrite the whole description. Used only for SEEDING tickets during setup,
 * not by the agent workflow (the agent must append, never overwrite).
 */
export async function setDescription(key: string, text: string): Promise<void> {
  const doc = { type: 'doc', version: 1, content: textToParagraphs(text) };
  await api().put(`/issue/${key}`, { fields: { description: doc } });
  console.error(`[JIRA] set description of ${key} (${text.length} chars)`);
}

/** Add a label to a ticket without touching the existing labels. */
export async function addLabel(key: string, label: string): Promise<void> {
  await api().put(`/issue/${key}`, { update: { labels: [{ add: label }] } });
  console.error(`[JIRA] added label "${label}" to ${key}`);
}

/** Remove a label from a ticket. */
export async function removeLabel(key: string, label: string): Promise<void> {
  await api().put(`/issue/${key}`, { update: { labels: [{ remove: label }] } });
  console.error(`[JIRA] removed label "${label}" from ${key}`);
}

/**
 * Search tickets by JQL.
 * Uses the new enhanced search endpoint /rest/api/3/search/jql
 * (the old /rest/api/3/search was removed by Atlassian and returns 410).
 */
export async function search(jql: string): Promise<Array<{ key: string; summary: string; status: string }>> {
  const { data } = await api().get('/search/jql', {
    params: { jql, fields: 'summary,status', maxResults: 50 },
  });
  return (data.issues ?? []).map((i: any) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
  }));
}

/** Find tickets with a given label in the project from .env. */
export async function searchByLabel(label: string) {
  const jql = `project = ${JIRA_PROJECT_KEY} AND labels = "${label}" ORDER BY created DESC`;
  return search(jql);
}

// --- CLI --------------------------------------------------------------------

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'get': {
        const issue = await getIssue(args[0]);
        console.log(`\n${issue.key} [${issue.status}] ${issue.summary}`);
        console.log(`labels: ${issue.labels.join(', ') || '(none)'}`);
        console.log(`\n--- Description ---\n${issue.descriptionText || '(empty)'}\n`);
        break;
      }
      case 'desc':
        console.log(await getDescriptionText(args[0]));
        break;
      case 'transitions': {
        const ts = await getTransitions(args[0]);
        console.log(JSON.stringify(ts, null, 2));
        break;
      }
      case 'move':
        await moveIssue(args[0], args.slice(1).join(' '));
        console.log(`OK: ${args[0]} -> ${args.slice(1).join(' ')}`);
        break;
      case 'append':
        await appendToDescription(args[0], args.slice(1).join(' '));
        console.log(`OK: appended to ${args[0]}`);
        break;
      case 'search':
        console.log(JSON.stringify(await search(args.join(' ')), null, 2));
        break;
      case 'label':
        console.log(JSON.stringify(await searchByLabel(args[0]), null, 2));
        break;
      case 'label-add':
        await addLabel(args[0], args[1]);
        console.log(`OK: added label ${args[1]} to ${args[0]}`);
        break;
      case 'label-remove':
        await removeLabel(args[0], args[1]);
        console.log(`OK: removed label ${args[1]} from ${args[0]}`);
        break;
      default:
        console.log(
          [
            'Usage: npx tsx src/jira.ts <command> [args]',
            '',
            '  get <KEY>                read a ticket',
            '  desc <KEY>               description only',
            '  transitions <KEY>        available status transitions',
            '  move <KEY> "<Status>"    move to a status (In Progress / Done)',
            '  append <KEY> "<text>"    append to the description',
            '  search "<JQL>"           search by JQL',
            '  label <label>            tickets with a label in the project from .env',
            '  label-add <KEY> <label>     add a label to a ticket',
            '  label-remove <KEY> <label>  remove a label from a ticket',
          ].join('\n'),
        );
    }
  } catch (err: any) {
    // Do not crash with a stack trace: print a clear error and exit with code 1.
    console.error(`\n[JIRA] ERROR: ${err.message}`);
    process.exit(1);
  }
}

// Run main() only when the file is invoked directly as a CLI (not imported).
if (require.main === module) {
  main();
}
