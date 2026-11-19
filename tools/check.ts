// `bun run check`: everything that must pass before a change lands, in one run. Biome's lint and format, the tests with
// the browser tests on, the type checks of both programs, the viewer's drift check, and the compiled
// binary's help, the example written and built, a design document started, and the reference, from a folder outside
// the repository. It fails when no Chrome is found, because the browser tests are part of the check.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findChrome } from "../src/capture.ts";

const root = resolve(import.meta.dir, "..");

function step(name: string, command: string[], env: Record<string, string> = {}, cwd = root): void {
  process.stdout.write(`check: ${name}\n`);
  const ran = Bun.spawnSync(command, { cwd, stdout: "inherit", stderr: "inherit", env: { ...process.env, ...env } });
  if (ran.exitCode !== 0) failed(name, `exit ${ran.exitCode}`);
}

function failed(name: string, why: string): never {
  process.stderr.write(`check failed at: ${name} (${why}): fix it, then run \`bun run check\` again\n`);
  process.exit(1);
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
// Both files are tracked, so each step always runs: a file gone fails its step, never skips it in silence.
step("the types of the viewer", [tsc, "--noEmit", "-p", "viewer"]);
step("the built viewer matches its source", ["bun", "tools/build-viewer.ts", "--check"]);
step("the tests, with the browser tests", ["bun", "test"], { PROTOTYPE_BROWSER_TESTS: "1" });
// On Windows the compiler names a binary with `.exe`, so the step that runs it names the same file. The binary, about
// 60 MB, goes with its folder when the check ends, passed or failed, so the system's temporary folder keeps none.
const built = mkdtempSync(join(tmpdir(), "open-prototype-check-"));
process.on("exit", () => rmSync(built, { recursive: true, force: true }));
const binary = join(built, process.platform === "win32" ? "open-prototype.exe" : "open-prototype");
step("the compiled binary", ["bun", "build", "--compile", "src/cli.ts", "--outfile", binary]);
step("the compiled binary's help", [binary, "--help"]);
// The commands that read the files the binary carries, run from a folder outside the repository, so a shipped file that
// `src/assets.ts` does not embed fails here, as it would for a person, and is never read from the clone.
const trial = join(built, "trial");
mkdirSync(trial);
step("the compiled binary writes the example", [binary, "example"], {}, trial);
step("the compiled binary builds the example", [binary, "build", ".prototype/example/app.html"], {}, trial);
step("the compiled binary starts a design document", [binary, "new-design-md"], {}, trial);
const reference = "the compiled binary's reference matches docs/reference.md";
process.stdout.write(`check: ${reference}\n`);
const printed = Bun.spawnSync([binary, "guide", "--reference"], { cwd: trial, stdout: "pipe", stderr: "inherit" });
if (printed.exitCode !== 0) failed(reference, `exit ${printed.exitCode}`);
const lines = (text: string) => text.replace(/\r\n/g, "\n");
if (lines(printed.stdout.toString()) !== lines(readFileSync(join(root, "docs/reference.md"), "utf8")))
  failed(reference, "it differs: write it again with `bun src/cli.ts guide --reference > docs/reference.md`, or embed the file the binary lacks");
process.stdout.write("check: every step passed\n");
