// Every temporary folder a test run makes, removed when the run ends, so a run leaves nothing behind in the system's
// temporary folder: a browser's profile alone is about 11 MB, and a full check makes hundreds.
import { mkdtempSync, rmSync } from "node:fs";

const made: string[] = [];

/** A new folder whose name starts with this prefix, a path such as `/tmp/prototype-viewer-tests-`, removed when the run ends. */
export function tempFolder(prefix: string): string {
  const folder = mkdtempSync(prefix);
  made.push(folder);
  return folder;
}

/** Remove one folder now, as a browser's profile once the browser has quit. */
export function removeFolder(folder: string): void {
  rmSync(folder, { recursive: true, force: true });
}

/** Remove every folder this run made. The preload of `bunfig.toml` calls it once, after the last test file. */
export function removeAll(): void {
  for (const folder of made.splice(0)) removeFolder(folder);
}
