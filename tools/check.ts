// `bun run check`: everything that must pass before a change lands, in one run. Biome's lint and format, the tests with
// the browser tests on, the type checks of both programs, the viewer's drift check when the viewer's build exists, and the compiled
// binary's help. It fails when no Chrome is found, because the browser tests are part of the check.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findChrome } from "../src/capture.ts";

const root = resolve(import.meta.dir, "..");

function step(name: string, command: string[], env: Record<string, string> = {}): void {
  process.stdout.write(`check: ${name}\n`);
  const ran = Bun.spawnSync(command, { cwd: root, stdout: "inherit", stderr: "inherit", env: { ...process.env, ...env } });
  if (ran.exitCode !== 0) {
    process.stderr.write(`check failed at: ${name} (exit ${ran.exitCode}): fix it, then run \`bun run check\` again\n`);
    process.exit(1);
  }
}

/**
 * The project's own copy of a development tool, from `node_modules/.bin`. Never `bunx`, which on a clone with no install
 * fetches whatever the registry holds under that name: `biome` there is another author's package.
 */
function installed(name: string): string {
  const found = [name, `${name}.exe`].map((file) => join(root, "node_modules/.bin", file)).find((path) => existsSync(path));
  if (!found) {
    process.stderr.write(`check failed: ${name} is not installed in node_modules: run \`bun install\`, then \`bun run check\` again\n`);
    process.exit(1);
  }
  return found;
}

const biome = installed("biome");
const tsc = installed("tsc");
if (!findChrome()) {
  process.stderr.write("check failed: no Chrome or Chromium found, and the browser tests need one: install Chrome or set CHROME_BIN\n");
  process.exit(1);
}
step("the lint and the format, by Biome", [biome, "ci"]);
step("the types of the tool", [tsc, "--noEmit"]);
if (existsSync(join(root, "viewer/tsconfig.json"))) step("the types of the viewer", [tsc, "--noEmit", "-p", "viewer"]);
if (existsSync(join(root, "tools/build-viewer.ts"))) step("the built viewer matches its source", ["bun", "tools/build-viewer.ts", "--check"]);
step("the tests, with the browser tests", ["bun", "test"], { PROTOTYPE_BROWSER_TESTS: "1" });
// On Windows the compiler names a binary with `.exe`, so the step that runs it names the same file. The binary, about
// 60 MB, goes with its folder when the check ends, passed or failed, so the system's temporary folder keeps none.
const built = mkdtempSync(join(tmpdir(), "open-prototype-check-"));
process.on("exit", () => rmSync(built, { recursive: true, force: true }));
const binary = join(built, process.platform === "win32" ? "open-prototype.exe" : "open-prototype");
step("the compiled binary", ["bun", "build", "--compile", "src/cli.ts", "--outfile", binary]);
step("the compiled binary's help", [binary, "--help"]);
process.stdout.write("check: every step passed\n");
