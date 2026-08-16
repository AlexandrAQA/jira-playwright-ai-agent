/**
 * src/env.ts
 * ---------------------------------------------------------------------------
 * Load `.env` once, quietly.
 *
 * Imported for its side effect, the same shape as `dotenv/config`, so the call
 * sites read exactly as they did before. It exists for the `quiet` option:
 * dotenv prints a rotating promotional tip on every load, which lands in the
 * middle of a script's own output. In a recorded demo it reads as an advert the
 * project is serving, and in a log it is one more line that means nothing.
 * A tool's output should contain what the tool said, and nothing else.
 * ---------------------------------------------------------------------------
 */
import { config } from 'dotenv';

config({ quiet: true });
