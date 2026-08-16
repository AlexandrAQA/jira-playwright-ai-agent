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

import './env';

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
    (err: unknown) => {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status ?? 'ERR';
        const url = err.config?.url ?? '';
        const body = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        console.error(`[JIRA] !! ${status} ${url} ${body}`);
      } else {
        console.error(`[JIRA] !! ${String(err)}`);
      }
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    },
  );

  _api = client;
  return client;
}

// --- ADF (Atlassian Document Format) <-> text -------------------------------
// In API v3 the description is not a string but an ADF tree, so we read and write it separately.

/** One node of an Atlassian Document Format tree. */
export interface AdfNode {
  type?: string;
  text?: string;
  version?: number;
  content?: AdfNode[];
}

/**
 * Recursively extract plain text from an ADF tree.
 *
 * Exported for the unit tests. Everything in this file that can be decided
 * without the network is a plain function, so it can be tested for real instead
 * of through a mock that only proves axios was called.
 */
export function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const children = node.content ? node.content.map(adfToText).join('') : '';
  // add a newline after block nodes so the text stays readable
  if (node.type && ['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type)) {
    return children + '\n';
  }
  return children;
}

/** Turn a multi-line string into an array of ADF paragraphs. */
export function textToParagraphs(text: string): AdfNode[] {
  return text.split('\n').map((line) => ({
    type: 'paragraph',
    content: line.length ? [{ type: 'text', text: line }] : [],
  }));
}

// --- Shapes of the Jira REST v3 responses we actually read ------------------
// Only the fields this project uses. Typing the boundary here is what keeps
// `any` from leaking into every caller.

interface IssueFields {
  summary?: string;
  status?: { name?: string };
  labels?: string[];
  description?: AdfNode | null;
}

interface IssueResponse {
  key: string;
  fields: IssueFields;
}

interface TransitionsResponse {
  transitions: Array<{ id: string; name?: string; to?: { name?: string } }>;
}

interface SearchResponse {
  issues?: Array<{ key: string; fields: IssueFields }>;
}

export type Transition = { id: string; name?: string; to?: { name?: string } };

// --- Pure mapping, everything that needs no network ------------------------

/** Shape one REST issue payload into the domain object the agent works with. */
export function toJiraIssue(data: IssueResponse): JiraIssue {
  return {
    key: data.key,
    summary: data.fields.summary ?? '',
    status: data.fields.status?.name ?? '',
    labels: data.fields.labels ?? [],
    descriptionText: adfToText(data.fields.description).trim(),
    descriptionAdf: data.fields.description ?? null,
  };
}

/**
 * Find the transition that leads to a status.
 *
 * Jira names the transition and the destination status separately, and boards
 * disagree about which one a human means. Matching either is what makes
 * `move AIQA-1 "Done"` work across differently configured boards.
 */
export function pickTransition(
  transitions: Transition[],
  statusName: string,
): Transition | undefined {
  const target = statusName.trim().toLowerCase();
  return transitions.find(
    (t) => t.name?.toLowerCase() === target || t.to?.name?.toLowerCase() === target,
  );
}

/**
 * Build the description that results from appending text to an existing one.
 *
 * The project's hardest rule lives here: a ticket description is only ever
 * appended to. Overwriting one would destroy a human's acceptance criteria, and
 * the agent runs unattended, so the rule has to hold in code and not only in
 * the playbook.
 */
export function appendedDescription(existing: AdfNode | null | undefined, text: string): AdfNode {
  const paragraphs = textToParagraphs(text);
  return existing && existing.type === 'doc'
    ? { ...existing, content: [...(existing.content ?? []), ...paragraphs] }
    : { type: 'doc', version: 1, content: paragraphs };
}

// --- Public functions -------------------------------------------------------

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  labels: string[];
  descriptionText: string;
  descriptionAdf: AdfNode | null;
}

/** Read the whole ticket (the fields we need). */
export async function getIssue(key: string): Promise<JiraIssue> {
  const { data } = await api().get<IssueResponse>(`/issue/${key}`, {
    params: { fields: 'summary,description,status,labels' },
  });
  return toJiraIssue(data);
}

/** Description text only. */
export async function getDescriptionText(key: string): Promise<string> {
  return (await getIssue(key)).descriptionText;
}

/** Status transitions available right now. */
export async function getTransitions(
  key: string,
): Promise<Array<{ id: string; name: string; to: string }>> {
  const { data } = await api().get<TransitionsResponse>(`/issue/${key}/transitions`);
  return data.transitions.map((t) => ({
    id: t.id,
    name: t.name ?? '',
    to: t.to?.name ?? '',
  }));
}

/** Move a ticket to a status by name ("In Progress", "Done", etc.). */
export async function moveIssue(key: string, statusName: string): Promise<void> {
  const { data } = await api().get<TransitionsResponse>(`/issue/${key}/transitions`);
  const t = pickTransition(data.transitions, statusName);
  if (!t) {
    const available = data.transitions.map((tr) => `${tr.name} -> ${tr.to?.name}`).join(', ');
    throw new Error(`Transition to "${statusName}" not found. Available: ${available || '(none)'}`);
  }
  await api().post(`/issue/${key}/transitions`, { transition: { id: t.id } });
  console.error(`[JIRA] status ${key} -> "${t.to?.name}" (transition "${t.name}")`);
}

/** APPEND text to the end of the description without overwriting what is there. */
export async function appendToDescription(key: string, text: string): Promise<void> {
  const issue = await getIssue(key);
  const doc = appendedDescription(issue.descriptionAdf, text);

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
export async function search(
  jql: string,
): Promise<Array<{ key: string; summary: string; status: string }>> {
  const { data } = await api().get<SearchResponse>('/search/jql', {
    params: { jql, fields: 'summary,status', maxResults: 50 },
  });
  return (data.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields.summary ?? '',
    status: i.fields.status?.name ?? '',
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
  } catch (err) {
    // Do not crash with a stack trace: print a clear error and exit with code 1.
    console.error(`\n[JIRA] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Run main() only when the file is invoked directly as a CLI (not imported).
if (require.main === module) {
  void main();
}
