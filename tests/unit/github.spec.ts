/**
 * Unit tests for the pull-request plumbing.
 *
 * Remote parsing is the piece that fails quietly: get it wrong and you get a
 * well-formed URL pointing at a repository that does not exist, which reads as
 * a GitHub problem rather than a parsing bug.
 */
import { expect, test } from '@playwright/test';

import {
  agentPaths,
  branchFor,
  compareUrl,
  parseGitHubRemote,
  pullRequestBody,
} from '../../src/github';

test.describe('parseGitHubRemote', () => {
  const expected = { owner: 'AlexandrAQA', name: 'jira-playwright-ai-agent' };

  const remotes = [
    'git@github.com:AlexandrAQA/jira-playwright-ai-agent.git',
    'git@github.com:AlexandrAQA/jira-playwright-ai-agent',
    'https://github.com/AlexandrAQA/jira-playwright-ai-agent.git',
    'https://github.com/AlexandrAQA/jira-playwright-ai-agent',
    'ssh://git@github.com/AlexandrAQA/jira-playwright-ai-agent.git',
  ];

  for (const remote of remotes) {
    test(`reads ${remote}`, () => {
      expect(parseGitHubRemote(remote)).toEqual(expected);
    });
  }

  test('tolerates the trailing newline git leaves on its output', () => {
    expect(parseGitHubRemote(`  ${remotes[0]}\n`)).toEqual(expected);
  });

  test('returns nothing for a host that is not GitHub', () => {
    // Better to say "not GitHub" than to build a plausible but dead URL.
    expect(parseGitHubRemote('git@gitlab.com:owner/repo.git')).toBeNull();
  });

  test('returns nothing for something that is not a remote at all', () => {
    expect(parseGitHubRemote('not a url')).toBeNull();
  });
});

test.describe('branchFor', () => {
  test('is deterministic, so a rerun reuses the branch instead of piling up', () => {
    expect(branchFor('AIQA-7')).toBe('agent/aiqa-7');
    expect(branchFor('AIQA-7')).toBe(branchFor('aiqa-7'));
  });
});

test.describe('agentPaths', () => {
  test('stages the spec for this ticket and no other', () => {
    const paths = agentPaths('AIQA-10');
    expect(paths).toContain('tests/generated/aiqa-10.spec.ts');
    expect(paths.some((p) => p.includes('aiqa-7'))).toBe(false);
  });

  test('stages page objects, because the playbook tells the agent to edit them', () => {
    // The rule that authorises the edit and the rule that stages it have to
    // agree. Otherwise the pull request carries a spec calling a method that
    // does not exist on main, and CI fails on types rather than on the test.
    expect(agentPaths('AIQA-10')).toContain('tests/support/pages');
  });

  test('stages the knowledge base, which is how the next ticket gets cheaper', () => {
    expect(agentPaths('AIQA-10')).toContain('knowledge');
  });

  test('stays a short list rather than the whole tree', () => {
    // Unrelated work in the working copy must not ride along.
    const paths = agentPaths('AIQA-10');
    expect(paths).toHaveLength(3);
    expect(paths).not.toContain('.');
    expect(paths.some((p) => p.startsWith('src'))).toBe(false);
  });
});

test.describe('compareUrl', () => {
  test('points at the open-pull-request page for the branch', () => {
    expect(compareUrl({ owner: 'o', name: 'r' }, 'agent/aiqa-7')).toBe(
      'https://github.com/o/r/compare/agent/aiqa-7?expand=1',
    );
  });
});

test.describe('pullRequestBody', () => {
  test('links the ticket when the Jira base URL is known', () => {
    expect(pullRequestBody('AIQA-7', 'https://example.atlassian.net/')).toContain(
      '[AIQA-7](https://example.atlassian.net/browse/AIQA-7)',
    );
  });

  test('degrades to the plain key when it is not', () => {
    const body = pullRequestBody('AIQA-7', undefined);
    expect(body).toContain('AIQA-7');
    expect(body).not.toContain('browse');
  });

  test('leaves the human judgement boxes unchecked', () => {
    // A pre-checked box is a lie the agent tells about a review that never happened.
    const body = pullRequestBody('AIQA-7', undefined);
    expect(body).toContain('- [ ]');
    expect(body).not.toContain('- [x]');
  });
});
