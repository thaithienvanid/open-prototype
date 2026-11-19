// The two errors a stage throws on purpose, so the command line and any composer tell a refused request from a fault.
import type { RequestRule } from "./finding.ts";

/**
 * The one table of exit codes: done, a problem of the design, a refused request, a fault of the tool, and the two a
 * signal ends with, Ctrl-C and a stop request. Only after a signal does a command end with one of the last two.
 */
export const EXIT = { done: 0, problems: 1, refused: 2, failed: 3, interrupted: 130, stopped: 143 } as const;

/** A file that exists and cannot be read as text, with the reason and the next step, as one clause. */
export class Unreadable extends Error {}

/**
 * A request the tool refuses: a path outside the project, a bad setting, a file that exists. It exits with code 2, and
 * carries the id of its `request.*` rule, which each refusal names, so a script acts on the refusal by its id, never
 * by its words.
 */
export class Refusal extends Error {
  constructor(
    message: string,
    readonly rule: RequestRule,
  ) {
    super(message);
  }
}
