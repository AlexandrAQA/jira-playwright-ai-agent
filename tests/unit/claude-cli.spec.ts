/**
 * Unit tests for locating the Claude Code CLI.
 *
 * Two failed runs came out of this one piece of resolution, so the override and
 * the shape of what comes back are pinned rather than assumed.
 */
import { expect, test } from '@playwright/test';

import { resolveClaudeCli } from '../../src/claude-cli';

/** Swap CLAUDE_CLI for the duration of one test, then put it back. */
function withEnv(value: string | undefined, fn: () => void): void {
  const before = process.env.CLAUDE_CLI;
  if (value === undefined) delete process.env.CLAUDE_CLI;
  else process.env.CLAUDE_CLI = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CLI;
    else process.env.CLAUDE_CLI = before;
  }
}

test.describe('resolveClaudeCli', () => {
  test('honours an explicit override on any platform', () => {
    withEnv('/somewhere/claude', () => {
      expect(resolveClaudeCli()).toBe('/somewhere/claude');
    });
  });

  test('resolves to something spawnable on this machine', () => {
    // On Windows this must be the real executable: the npm .cmd shim cannot be
    // spawned without a shell, and a shell breaks the argument escaping.
    withEnv(undefined, () => {
      expect(resolveClaudeCli()).toMatch(
        process.platform === 'win32' ? /claude\.exe$/i : /claude$/,
      );
    });
  });
});
