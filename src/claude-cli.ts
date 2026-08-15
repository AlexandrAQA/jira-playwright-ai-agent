/**
 * src/claude-cli.ts
 * ---------------------------------------------------------------------------
 * Find something spawnable for the Claude Code CLI.
 *
 * On Windows this is less obvious than it looks, and getting it wrong cost two
 * failed runs:
 *
 *   - Spawning with `shell: true` works, but in that mode Node concatenates the
 *     arguments instead of escaping them (DEP0190). A prompt containing spaces
 *     is then split into separate arguments and the agent receives nonsense.
 *   - Spawning the npm shim `claude.cmd` without a shell throws EINVAL. Node 20
 *     refuses to execute .cmd and .bat files directly; that restriction is the
 *     fix for the argument-injection issue described above, so it is not going
 *     away.
 *
 * What remains is the real executable the shim itself calls, which is a native
 * binary and spawns without a shell and without escaping problems.
 *
 * Set `CLAUDE_CLI` in `.env` to override any of this.
 * ---------------------------------------------------------------------------
 */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Every place the Windows executable is plausibly installed, best guess first. */
function windowsCandidates(): string[] {
  const candidates: string[] = [];
  const npmRelative = join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');

  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', npmRelative));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'claude', 'claude.exe'));
  }

  // Whatever is already on PATH: either the executable itself, or the npm
  // shim directory with the real binary underneath it.
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push(join(dir, 'claude.exe'));
    candidates.push(join(dir, npmRelative));
  }

  return candidates;
}

/**
 * Path or command to spawn, without a shell.
 *
 * Throws with an actionable message rather than letting the caller hit a raw
 * ENOENT or EINVAL, because both of those read as "something is broken" when
 * the real answer is "tell me where the CLI is".
 */
export function resolveClaudeCli(): string {
  if (process.env.CLAUDE_CLI) return process.env.CLAUDE_CLI;

  // On POSIX the plain name is on PATH and spawns directly.
  if (process.platform !== 'win32') return 'claude';

  const found = windowsCandidates().find((path) => existsSync(path));
  if (found) return found;

  throw new Error(
    'Could not find claude.exe. Set CLAUDE_CLI in .env to its full path, for example\n' +
      '  CLAUDE_CLI=C:\\Users\\you\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
  );
}
