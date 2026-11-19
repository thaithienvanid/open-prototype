// The Claude Code plugin: one name and one version with the package, a marketplace whose plugin is this repository,
// and a command that runs the tool from the plugin's own copy, or says how to get Bun when there is none. The other
// harnesses read the same skill, `skills/prototyping/`, with no copy of it in the repository: Antigravity through
// `.antigravity-plugin/plugin.json`, Muse Code through `.claude-plugin/`, and Codex from a project's `.agents/skills/`.
// Each harness's own check runs when its binary is on the PATH, and the test's name says so when it is not.
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { onWindows, REPOSITORY, WINDOWS } from "./helpers.ts";
import { tempFolder } from "./temp.ts";

const json = (path: string) => JSON.parse(readFileSync(join(REPOSITORY, path), "utf8"));

/**
 * The `sh` that runs `bin/open-prototype`, a POSIX shell script for Claude Code's Bash tool: `/bin/sh`, and on Windows
 * Git Bash's, through which Claude Code on Windows runs its Bash tool. Git names its own folder by `git --exec-path`,
 * such as `C:/Program Files/Git/mingw64/libexec/git-core`, and Git for Windows installs to `C:\Program Files\Git`.
 */
function shell(): { sh: string; tools: string[] } | null {
  if (!WINDOWS) return { sh: "/bin/sh", tools: ["/usr/bin", "/bin"] };
  let tops = [join(process.env.ProgramFiles ?? "C:\\Program Files", "Git")];
  try {
    const core = Bun.spawnSync(["git", "--exec-path"], { stdin: "ignore", stderr: "ignore" }).stdout.toString().trim();
    if (core) tops = [resolve(core, "../../.."), ...tops];
  } catch {
    // no git on the PATH: the usual folder is tried alone
  }
  // The `sh` of Git's `bin` sets up Git Bash as its `bash` does for Claude Code; its own programs, such as `dirname`, are in `usr\\bin`.
  const top = tops.find((folder) => existsSync(join(folder, "bin", "sh.exe")) && existsSync(join(folder, "usr", "bin", "dirname.exe")));
  return top ? { sh: join(top, "bin", "sh.exe"), tools: [join(top, "usr", "bin")] } : null;
}
/** The shell, and the folders of the programs the script needs and no Bun: `/usr/bin` and `/bin`, or Git Bash's own. */
const SH = shell();
const SHELL = SH ? "" : onWindows("no Git Bash, which Claude Code on Windows runs its Bash tool through, is found by git --exec-path or in Program Files");
/** The script as `sh` takes it: Git Bash reads a Windows path with forward slashes, and `dirname` splits it at them. */
const SCRIPT = join(REPOSITORY, "bin/open-prototype").replaceAll("\\", "/");
/** Run the script with this PATH, in the system's own form. On Windows the rest of the environment stays, as Git Bash needs it. */
function script(path: string[]): { exitCode: number; stderr: string } {
  const rest = WINDOWS ? Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH")) : {};
  const ran = Bun.spawnSync([SH?.sh ?? "/bin/sh", SCRIPT, "--version"], { env: { ...rest, PATH: path.join(WINDOWS ? ";" : ":") } });
  return { exitCode: ran.exitCode, stderr: ran.stderr.toString() };
}

describe("the Claude Code plugin", () => {
  test("its name and version are the package's, and its marketplace offers this repository as that plugin", () => {
    const pkg = json("package.json");
    const plugin = json(".claude-plugin/plugin.json");
    const market = json(".claude-plugin/marketplace.json");
    expect([plugin.name, plugin.version, plugin.license]).toEqual([pkg.name, pkg.version, pkg.license]);
    expect(market.plugins.map((entry: { name: string; source: string }) => [entry.name, entry.source])).toEqual([[pkg.name, "./"]]);
  });

  // Claude Code takes a plugin's icon from `.claude-plugin/icon.png` by that name, or from an `icon` field of
  // plugin.json, and asks for a square PNG or JPEG of 512 to 2048 px on each side, under 2 MB.
  test("its icon is the file Claude Code reads by name: a square PNG of 512 to 2048 px a side, under 2 MB", () => {
    const icon = readFileSync(join(REPOSITORY, ".claude-plugin/icon.png"));
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const [width, height] = [icon.readUInt32BE(16), icon.readUInt32BE(20)];
    expect([
      [...icon.subarray(0, 8)],
      icon.subarray(12, 16).toString("latin1"),
      width === height,
      width >= 512 && width <= 2048,
      icon.length < 2 * 1024 * 1024,
    ]).toEqual([signature, "IHDR", true, true, true]);
    expect(json(".claude-plugin/plugin.json").icon).toBeUndefined();
  });

  test.skipIf(!SH)(`bin/open-prototype is executable and runs the tool from the plugin's own copy, from any folder${SHELL}`, () => {
    // Windows keeps no execute bit on the disk, so there the bit is read where git keeps it for every checkout.
    if (WINDOWS) expect(Bun.spawnSync(["git", "ls-files", "--stage", "bin/open-prototype"], { cwd: REPOSITORY }).stdout.toString()).toStartWith("100755 ");
    else expect(statSync(SCRIPT).mode & 0o111).not.toBe(0);
    // Claude Code's Bash tool runs the command by its name, and on Windows Git Bash's `sh` reads the script's first line.
    const ran = Bun.spawnSync(WINDOWS ? [SH?.sh ?? "", SCRIPT, "--version"] : [SCRIPT, "--version"], { cwd: parse(REPOSITORY).root });
    expect([ran.exitCode, ran.stdout.toString().trim()]).toEqual([0, json("package.json").version]);
  });

  // A person may link the script into a folder on their PATH, such as ~/.local/bin; Windows makes a link only with a
  // privilege, so the test runs on macOS and Linux.
  test.skipIf(!SH || WINDOWS)(
    `bin/open-prototype run through a link, a relative link, or a link to a link finds the plugin's own copy${SHELL}${onWindows("a link needs a privilege there")}`,
    () => {
      const folder = tempFolder(join(tmpdir(), "prototype-linked-bin-"));
      mkdirSync(join(folder, "bin"));
      mkdirSync(join(folder, "other"));
      symlinkSync(SCRIPT, join(folder, "bin", "absolute"));
      symlinkSync("../other/chain", join(folder, "bin", "relative"));
      symlinkSync(SCRIPT, join(folder, "other", "chain"));
      for (const name of ["absolute", "relative"]) {
        const ran = Bun.spawnSync([join(folder, "bin", name), "--version"], { cwd: parse(REPOSITORY).root });
        expect({ name, ran: [ran.exitCode, ran.stdout.toString().trim(), ran.stderr.toString()] }).toEqual({
          name,
          ran: [0, json("package.json").version, ""],
        });
      }
    },
  );

  // A stand-in Bun prints its version for any arguments, so a Bun the script lets through runs and exits 0.
  test.skipIf(!SH).each([
    ["1.4.3", "exits 2 and says to update it, because it is older than 1.4.4", 2],
    ["1.4.4", "runs, because 1.4.4 is the oldest Bun it takes", 0],
  ])(`with Bun %s it %s${SHELL}`, (version, _words, code) => {
    const folder = tempFolder(join(tmpdir(), "prototype-old-bun-"));
    writeFileSync(join(folder, "bun"), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
    const ran = script([folder, ...(SH?.tools ?? [])]);
    expect([ran.exitCode, ran.stderr.includes("bun upgrade")]).toEqual([code, code === 2]);
  });

  test.skipIf(!SH)(`with no Bun on the PATH it exits 2 and says how to install it${SHELL}`, () => {
    const ran = script(SH?.tools ?? []);
    // Each system's own installer is named: Bun's script for macOS and Linux, Homebrew, and Bun's PowerShell one for Windows.
    expect([ran.exitCode, ...["https://bun.sh/install", "brew install", "install.ps1"].map((step) => ran.stderr.includes(step))]).toEqual([
      2,
      true,
      true,
      true,
    ]);
  });
});

describe("the package", () => {
  test("a project that installs it imports the public entry by the package's name, and the OpenCode plugin by ./server", async () => {
    // An installed package is a folder of node_modules under its name; a link to the repository stands in for one, so
    // the import is resolved through package.json's exports as Bun resolves it for an installed copy.
    const folder = tempFolder(join(tmpdir(), "prototype-package-"));
    mkdirSync(join(folder, "node_modules"));
    symlinkSync(REPOSITORY, join(folder, "node_modules", json("package.json").name), "junction");
    writeFileSync(
      join(folder, "use.ts"),
      'import * as entry from "open-prototype";\nimport plugin from "open-prototype/server";\nconsole.log(JSON.stringify({ entry: Object.keys(entry).sort(), plugin: typeof plugin.setup }));\n',
    );
    const ran = Bun.spawnSync(["bun", "use.ts"], { cwd: folder, stdin: "ignore" });
    expect(ran.stderr.toString()).toBe("");
    const own = Object.keys(await import("../src/index.ts")).sort();
    expect(JSON.parse(ran.stdout.toString())).toEqual({ entry: own, plugin: "function" });
  });
});

/** A harness's binary, when it is on the PATH; a test that runs it is skipped without it, and its name says why. */
const harness = (binary: string) => ({ found: Bun.which(binary) !== null, why: Bun.which(binary) ? "" : ` (skipped: no ${binary} on the PATH)` });
/** Run a harness's command in a folder, and read the JSON it prints. */
function report(command: string[], cwd = REPOSITORY): { code: number; out: Record<string, unknown>; text: string } {
  const ran = Bun.spawnSync(command, { cwd, stdin: "ignore" });
  const text = ran.stdout.toString();
  return { code: ran.exitCode, out: text.trim().startsWith("{") ? JSON.parse(text) : {}, text };
}
type Diagnostic = { severity: string; message: string };
const SKILL = "skills/prototyping";
const AGY = harness("agy");
const MUSE = harness("muse");
const CODEX = harness("codex");

describe("the other harnesses", () => {
  test("the Antigravity plugin has the package's name, version, and licence, and its logo is inside the plugin", () => {
    const pkg = json("package.json");
    const plugin = json(".antigravity-plugin/plugin.json");
    expect([plugin.name, plugin.version, plugin.license]).toEqual([pkg.name, pkg.version, pkg.license]);
    expect(statSync(join(REPOSITORY, plugin.logo)).isFile()).toBe(true);
  });

  test.skipIf(!AGY.found)(`agy plugin validate reads the plugin from .antigravity-plugin, with one skill and no error${AGY.why}`, () => {
    const ran = report(["agy", "plugin", "validate", ".", "--json"]);
    const findings = (ran.out.findings ?? []) as Diagnostic[];
    expect([ran.code, ran.out.manifest, (ran.out.components as { skills: number }).skills]).toEqual([0, ".antigravity-plugin/plugin.json", 1]);
    expect(findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  test.skipIf(!MUSE.found)(`muse plugins validate reads .claude-plugin as a full plugin with the one skill, and no error${MUSE.why}`, () => {
    const ran = report(["muse", "plugins", "validate", ".", "--json"]);
    const plugin = ran.out.plugin as { capabilities: { skills: { id: string; path: string }[] }; compatibility: { summary: string } };
    expect([ran.code, ran.out.valid, plugin.compatibility.summary]).toEqual([0, true, "full"]);
    expect(plugin.capabilities.skills.map((skill) => [skill.id, skill.path])).toEqual([["prototyping", `${SKILL}/SKILL.md`]]);
    expect((ran.out.diagnostics as Diagnostic[]).filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  test.skipIf(!MUSE.found)(`muse skills validate finds the skill compatible, with no diagnostic${MUSE.why}`, () => {
    const ran = report(["muse", "skills", "validate", SKILL, "--json"]);
    const compatibility = ran.out.compatibility as { result: string };
    expect([ran.code, ran.out.valid, ran.out.id, compatibility.result, ran.out.diagnostics]).toEqual([0, true, "prototyping", "compatible", []]);
  });

  test.skipIf(!CODEX.found)(
    `codex lists the skill to the model when a project holds it in .agents/skills${CODEX.why}`,
    () => {
      const folder = tempFolder(join(tmpdir(), "prototype-codex-"));
      cpSync(join(REPOSITORY, SKILL), join(folder, ".agents/skills/prototyping"), { recursive: true });
      const ran = report(["codex", "debug", "prompt-input"], folder);
      const description = readFileSync(join(REPOSITORY, SKILL, "SKILL.md"), "utf8").match(/^description: (.{40})/m)?.[1] ?? "";
      expect([ran.code, ran.text.includes(`- prototyping: ${description}`)]).toEqual([0, true]);
    },
    30_000,
  );
});
