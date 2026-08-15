/**
 * scripts/open-pr.ts
 * ---------------------------------------------------------------------------
 * Put the agent's work on a branch and raise a pull request for a human.
 *
 *   npm run pr -- AIQA-7
 *   npm run pr -- AIQA-7 --dry-run
 *
 * The agent never commits to `main`. It produces a branch and a pull request,
 * and a person merges it. That is what makes "how do you stop the agent
 * breaking your repository" answerable with a link rather than a promise.
 *
 * Only the files this ticket should touch are staged, so unrelated work in the
 * tree cannot ride along into an agent pull request.
 *
 * With `GITHUB_TOKEN` in `.env` the pull request is opened through the API.
 * Without it the branch is still pushed and the compare URL is printed, which
 * needs no credential at all.
 * ---------------------------------------------------------------------------
 */
import { spawnSync } from 'node:child_process';
import 'dotenv/config';

import axios from 'axios';

import {
  branchFor,
  compareUrl,
  parseGitHubRemote,
  pullRequestBody,
  type Repo,
} from '../src/github';

/** Run git and fail loudly: a half-applied branch is worse than an error. */
function git(...args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function openPullRequest(
  repo: Repo,
  branch: string,
  title: string,
  body: string,
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const { data } = await axios.post<{ html_url: string }>(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls`,
    { title, body, head: branch, base: 'main' },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  return data.html_url;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const ticket = argv.find((a) => /^[A-Z]+-\d+$/.test(a));

  if (!ticket) {
    console.error('Usage: npm run pr -- AIQA-N [--dry-run]');
    process.exit(1);
  }

  const repo = parseGitHubRemote(git('remote', 'get-url', 'origin'));
  if (!repo) {
    console.error('origin is not a GitHub remote, so there is no pull request to open.');
    process.exit(1);
  }

  const branch = branchFor(ticket);
  const spec = `tests/generated/${ticket.toLowerCase()}.spec.ts`;
  // Only what this ticket may legitimately have produced.
  const paths = [spec, 'knowledge'];
  const changed = git('status', '--porcelain', '--', ...paths);

  if (!changed) {
    console.log(`Nothing to propose: ${spec} and knowledge/ are unchanged.`);
    return;
  }

  const title = `${ticket}: automated test`;
  const body = pullRequestBody(ticket, process.env.JIRA_BASE_URL);

  if (dryRun) {
    console.log('DRY RUN, nothing was committed or pushed.\n');
    console.log(`branch:  ${branch}`);
    console.log(`repo:    ${repo.owner}/${repo.name}`);
    console.log(`staging:\n${changed}`);
    console.log(`\ntitle:   ${title}\n\n${body}`);
    return;
  }

  git('switch', '-C', branch);
  git('add', '--', ...paths);
  git('commit', '-m', `${ticket}: add the generated end-to-end test`);
  git('push', '--set-upstream', 'origin', branch, '--force-with-lease');

  const url = await openPullRequest(repo, branch, title, body);

  console.log(
    url
      ? `\nPull request opened: ${url}`
      : [
          `\nBranch pushed: ${branch}`,
          'No GITHUB_TOKEN in .env, so open the pull request here:',
          compareUrl(repo, branch),
        ].join('\n'),
  );
  console.log('\nA human merges it. The agent cannot.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
