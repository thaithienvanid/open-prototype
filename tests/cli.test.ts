// The command line as an agent uses it: flags anywhere, one JSON object from every command that ends, every refusal
// on stderr, the version, the examples written as designs a person reads, and one page for each design.
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative, sep } from "node:path";
import manifest from "../package.json" with { type: "json" };
import { openerCommand, run } from "../src/cli.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, onWindows, project, REPOSITORY, WINDOWS } from "./helpers.ts";
import { tempFolder } from "./temp.ts";

/** The shipped example folder, which `example` writes. */
const SHIPPED_EXAMPLE = join(REPOSITORY, "assets/examples");

/** Each file below `folder`, by its path there with `/` between its parts, in sorted order. */
function filesOf(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

describe("the words of the command line", () => {
  test("a flag stands anywhere, before the command or after its arguments", async () => {
    const folder = project({ "design/a.html": single() });
    expect((await cli(folder, "build", "design/a.html", "--out-dir", "pages")).code).toBe(0);
    expect(existsSync(join(folder, "pages/views/design/a.html"))).toBe(true);
    expect((await cli(folder, "--out-dir", "other", "build", "design/a.html")).code).toBe(0);
    expect(existsSync(join(folder, "other/views/design/a.html"))).toBe(true);
    expect((await cli(folder, "--json", "check", "design/a.html")).out).toStartWith("{");
    // A command's own flag with a value may stand before the command too: its value is no command.
    expect((await cli(folder, "--title", "Cards", "new-design", "design/c2.html")).code).toBe(0);
    expect((await cli(folder, "--frames", "320", "shots", "design/a.html")).code).toBe(0);
    expect((await cli(folder, "--changed-screen", "start", "--frames", "320", "shots", "design/a.html")).code).toBe(0);
  });

  // A stand-in opener, first on the PATH, takes the place of the browser. Windows opens a page with `rundll32`, a
  // program, and a stand-in there would be a script, which runs only through a shell, so the test runs on macOS and Linux.
  test.skipIf(WINDOWS)(
    `build asks you to open the page, and with --open says only that it opened it${onWindows("rundll32 opens the page, which no stand-in script on the PATH replaces")}`,
    async () => {
      const folder = project({ "design/a.html": single() });
      const bin = tempFolder(join(tmpdir(), "prototype-opener-"));
      // The stand-in writes the address it was given, so the test proves it ran in place of the browser.
      for (const name of ["open", "xdg-open"]) writeFileSync(join(bin, name), `#!/bin/sh\necho "$1" > "${join(bin, "opened")}"\n`, { mode: 0o755 });
      const plain = (await cli(folder, "build", "design/a.html")).out.split("\n");
      const path = process.env.PATH;
      process.env.PATH = `${bin}${delimiter}${path ?? ""}`;
      try {
        const opened = (await cli(folder, "build", "design/a.html", "--open")).out.split("\n");
        expect([plain[0], plain.length]).toEqual(["wrote .prototype/views/design/a.html: open it in a browser", 2]);
        expect([opened[0], opened[2], opened.length]).toEqual(["wrote .prototype/views/design/a.html", "opened it in your browser", 3]);
        expect(readFileSync(join(bin, "opened"), "utf8").trim()).toBe(opened[1] ?? "no address");
      } finally {
        process.env.PATH = path;
      }
    },
  );

  // A folder such as `R&D` or `a^b` above the project: `cmd /c start` read `&` as the end of a command and `^` as an escape,
  // so a crafted folder name could run a command. Each system's opener takes the address as one argument, with no shell.
  test("the opener of each system runs with no shell, and takes the page's address whole, as one argument", () => {
    const url = "file:///C:/Users/me/R&D/a%5Eb/x^y&echo%20hi/.prototype/views/a.html";
    expect(["darwin", "linux", "win32"].map((platform) => openerCommand(platform, url))).toEqual([
      ["open", url],
      ["xdg-open", url],
      ["rundll32", "url.dll,FileProtocolHandler", url],
    ]);
    const shells = /^(cmd|cmd\.exe|powershell|pwsh|sh|bash|start|\/c|\/k)$/i;
    expect(["darwin", "linux", "win32"].flatMap((platform) => openerCommand(platform, url).filter((part) => shells.test(part)))).toEqual([]);
  });

  test("no flag is a switch in one command and takes a value in another, so the command is found the same way for each", async () => {
    const { COMMANDS, GLOBAL } = await import("../src/cli/arguments.ts");
    const switches = new Set<string>();
    const valued = new Set<string>();
    for (const table of [GLOBAL, ...Object.values(COMMANDS).map((spec) => spec.flags)])
      for (const [name, flag] of Object.entries(table)) ((flag as { kind: string }).kind === "switch" ? switches : valued).add(name);
    expect([...switches].filter((name) => valued.has(name))).toEqual([]);
  });

  test("--version prints the one version", async () => {
    expect((await cli(project(), "--version")).out).toBe(manifest.version);
    expect((await cli(project(), "check", "--version")).out).toBe(manifest.version);
    // It is a flag of every command, anywhere on the line, as --help is: beside a command and its file it prints the version alone.
    expect(await cli(project({ "design/a.html": single() }), "check", "design/a.html", "--version")).toEqual({ code: 0, out: manifest.version, err: "" });
  });

  test("a Bun older than package.json's engines stops every command with exit 2 and the step to update it", async () => {
    const floor = manifest.engines.bun.replace(/^>=\s*/, "");
    const [major = 0, minor = 0, patch = 0] = floor.split(".").map(Number);
    const older = patch > 0 ? `${major}.${minor}.${patch - 1}` : minor > 0 ? `${major}.${minor - 1}.99` : `${major - 1}.99.99`;
    const said = (version: string) => {
      const err: string[] = [];
      const out: string[] = [];
      return run(
        ["check", "design/a.html", "--json"],
        { out: (line) => out.push(line), err: (line) => err.push(line) },
        project({ "design/a.html": single() }),
        version,
      ).then((code) => ({ code, out, err }));
    };
    expect(await said(older)).toEqual({
      code: 2,
      out: [],
      err: [`open-prototype: it needs Bun ${floor} or newer, and this one is ${older}. Ask the person first, then update it with: bun upgrade`],
    });
    for (const version of [floor, `${major}.${minor}.${patch + 1}`, `${major}.${minor + 10}.0`, `${major + 1}.0.0`, `${floor}-canary.1`])
      expect({ version, code: (await said(version)).code }).toEqual({ version, code: 0 });
  });

  test("--frames repeats, as every flag that names more than one thing does, and its values join the commas'", async () => {
    const folder = project({ "design/a.html": single() });
    const frames = async (...argv: string[]) =>
      [...new Set(json<{ shots: { frame: string }[] }>(await cli(folder, "shots", "design/a.html", "--json", ...argv)).shots.map((shot) => shot.frame))].sort();
    expect(await frames("--frames", "320", "--frames", "1024")).toEqual(["1024", "320"]);
    expect(await frames("--frames", "320,1024")).toEqual(["1024", "320"]);
  });

  test("--out without --capture is refused, since no picture is taken to go there", async () => {
    const ran = await cli(project({ "design/a.html": single() }), "shots", "design/a.html", "--out", "pictures");
    expect([ran.code, ran.out, ran.err.endsWith("[request.usage]"), ran.err.includes("--capture")]).toEqual([2, "", true, true]);
    expect((await cli(project({ "design/a.html": single() }), "shots", "design/a.html")).code).toBe(0);
  });

  test("a design that does not load is told by its findings, each with its rule, and a last line that is no finding", async () => {
    const folder = project({ "design/b.html": `${single()}<script>x</script>` });
    for (const command of ["shots", "screens", "components"]) {
      const lines = (await cli(folder, command, "design/b.html")).out.split("\n");
      expect({ command, unnamed: lines.filter((line) => line.startsWith("problem:") && !/ \[[a-z]+\.[a-z-]+\]$/.test(line)) }).toEqual({
        command,
        unnamed: [],
      });
      expect(lines.at(-1)).toBe("fix design/b.html first: its screens are read only from a design that loads");
    }
  });

  test("new-design's next step checks the design before it is built", async () => {
    const ran = await cli(project(), "new-design", "design/c.html");
    expect(ran.out.split("\n")[1]).toBe(
      "next: sketch the design in it, then `open-prototype check design/c.html` for its problems and `open-prototype build design/c.html` to see it",
    );
  });

  test("guide reads no settings, so a mistake in them never keeps a person from the guide that says how to fix it", async () => {
    for (const settings of ['{ "rules": { "nope.rule": "off" } }', "nope", '{ "out_dir": "../out" }']) {
      const folder = project({ "prototype.config.json": settings });
      for (const argv of [["guide"], ["guide", "--reference"], ["guide", "--json"]]) {
        const ran = await cli(folder, ...argv);
        expect({ settings, argv, code: ran.code, err: ran.err }).toEqual({ settings, argv, code: 0, err: "" });
      }
    }
    expect((await cli(project({ "prototype.config.json": "nope" }), "project")).code).toBe(2);
  });

  test("a mistake is a usage line and one reason on stderr, with exit 2, and a flag is never shortened", async () => {
    for (const argv of [
      ["check", "--op"],
      ["nothing"],
      ["new-design"],
      ["save-comments", "a.json", "b.html", "c"],
      ["save-comments", "a.json", "--round", "two"],
      ["serve", "--json"],
    ]) {
      const ran = await cli(project(), ...argv);
      expect([ran.code, ran.out]).toEqual([2, ""]);
      expect(ran.err).toMatch(/^usage: open-prototype/);
    }
  });
});

describe("--json", () => {
  test("every command that ends prints one JSON object on stdout", async () => {
    const folder = project({
      ...flowDesign(),
      "design/a.html": single(),
      "c.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c" }] }),
      "index.json": JSON.stringify({ v: 5, entries: {} }),
    });
    for (const argv of [
      ["check", FLOW_DESIGN],
      ["build", FLOW_DESIGN],
      ["screens", FLOW_DESIGN],
      ["components", FLOW_DESIGN],
      ["shots", FLOW_DESIGN],
      ["stories", "index.json", FLOW_DESIGN],
      ["new-design", "design/b.html"],
      ["save-comments", "c.json", FLOW_DESIGN],
      ["example"],
      ["guide"],
      ["guide", "--reference"],
      ["check", "design/a.html"],
    ]) {
      const ran = await cli(folder, ...argv, "--json");
      expect(typeof JSON.parse(ran.out)).toBe("object");
      expect(ran.out.trim().split("\n")[0]).toBe("{");
    }
  });

  test("a refusal is one object on stdout with ok false and one request finding, and one line on stderr", async () => {
    for (const argv of [["check", "design/nope.html"], ["build"], ["check", "--op"]]) {
      const ran = await cli(project(), ...argv, "--json");
      const data = JSON.parse(ran.out) as { ok: boolean; findings: { rule: string }[] };
      expect([ran.code, data.ok, data.findings.length, data.findings[0]?.rule.startsWith("request.")]).toEqual([2, false, 1, true]);
      expect(ran.err.split("\n").length).toBe(1);
    }
  });

  test("without --json a refusal is stderr alone", async () => {
    const ran = await cli(project(), "check", "design/nope.html");
    expect([ran.code, ran.out, ran.err.startsWith("problem: ")]).toEqual([2, "", true]);
  });
});

describe("the example", () => {
  // The example's page takes its path below the example's folder after `.example/`, so the output folder never stands
  // twice in it, and no other design's page can have that path.
  test("example writes every file of the shipped example, byte for byte, and builds it at views/.example/app.html", async () => {
    const folder = project();
    const ran = await cli(folder, "example", "--json");
    const data = json<{ written: string[]; page: string }>(ran);
    const shipped = filesOf(SHIPPED_EXAMPLE);
    expect(shipped.length).toBeGreaterThan(2);
    expect([ran.code, [...data.written].sort(), data.page]).toEqual([
      0,
      shipped.map((file) => `.prototype/example/${file}`),
      ".prototype/views/.example/app.html",
    ]);
    for (const file of shipped)
      expect([file, readFileSync(join(folder, ".prototype/example", file)).equals(readFileSync(join(SHIPPED_EXAMPLE, file)))]).toEqual([file, true]);
    expect(existsSync(join(folder, ".prototype/views/.example/app.html"))).toBe(true);
    expect(existsSync(join(folder, ".prototype/views/.prototype"))).toBe(false);
  });

  test("the shipped example checks clean, and lists the screens its flows hold and a shot of each of their states", async () => {
    const folder = project();
    expect((await cli(folder, "example")).code).toBe(0);
    const file = ".prototype/example/app.html";
    const main = readFileSync(join(SHIPPED_EXAMPLE, "app.html"), "utf8");
    const flowIds = [...main.matchAll(/data-proto-flow="([^"]+)"/g)].map((found) => found[1] ?? "");
    const flows = flowIds.map((id) => [id, readFileSync(join(SHIPPED_EXAMPLE, "flows", `${id}.html`), "utf8")] as const);
    const screens = flows.flatMap(([id, text]) => [...text.matchAll(/<section [^>]*data-proto-screen="([^"]+)"/g)].map((found) => `${id}:${found[1]}`));
    const states = flows.reduce((sum, [, text]) => sum + [...text.matchAll(/ data-proto-state="/g)].length, 0);
    const checked = await cli(folder, "check", "--json", file);
    const counts = json<{ findings: unknown[]; counts: { screens: number; states: number } }>(checked);
    expect([checked.code, counts.findings, counts.counts.screens, counts.counts.states]).toEqual([0, [], screens.length, states]);
    const listed = json<{ screens: { id: string; states: string[] }[] }>(await cli(folder, "screens", file)).screens;
    expect(listed.map((screen) => screen.id)).toEqual(screens);
    const views = new Set(listed.flatMap((screen) => screen.states.map((state) => `${screen.id}/${state}`)));
    expect(views.size).toBe(states);
    const shots = await cli(folder, "shots", file);
    const shot = new Set(json<{ shots: { screen: string; state: string }[] }>(shots).shots.map((one) => `${one.screen}/${one.state}`));
    expect([shots.code, [...shot].sort()]).toEqual([0, [...views].sort()]);
    expect((await cli(folder, "build", file)).code).toBe(0);
  });

  test("a problem in a round beside the example is told at its file with exit 1, never as a fault of the tool", async () => {
    const folder = project({ ".prototype/example/rounds/app/2/changes.json": '{ "changes": [{ "answers": ["r1-9"], "summary": "x" }] }' });
    const ran = await cli(folder, "example", "--json");
    const data = JSON.parse(ran.out) as { findings: { rule: string; file: string }[] };
    expect([ran.code, data.findings.map((item) => `${item.rule} ${item.file}`)]).toEqual([1, ["rounds.answer .prototype/example/rounds/app/2/changes.json"]]);
  });

  test("the example's page is its own: a design at example/app.html keeps its page", async () => {
    const folder = project({ ...flowDesign(), "example/app.html": single({ fixtures: '{ "product": "Mine", "welcome": "Welcome back" }' }) });
    expect([(await cli(folder, "build", FLOW_DESIGN)).code, (await cli(folder, "build", "example/app.html")).code]).toEqual([0, 0]);
    const pages = [`.prototype/views/${FLOW_DESIGN}`, ".prototype/views/example/app.html"].map((page) => join(folder, page));
    const before = pages.map((page) => readFileSync(page, "utf8"));
    expect((await cli(folder, "example")).code).toBe(0);
    expect(pages.map((page) => readFileSync(page, "utf8") === before[pages.indexOf(page)])).toEqual([true, true]);
  });
});

describe("the example in a project of its own", () => {
  // The example is the tool's own design, so the project's design document, tokens files, and rules never reach it.
  test("example builds beside the project's DESIGN.md, tokens files, and rules", async () => {
    const folder = project({
      "prototype.config.json": JSON.stringify({ tokens: ["brand.css"], rules: { "copy.emoji": "off" } }),
      "brand.css": ":root { --color-brand: #123456; }\n",
    });
    expect((await cli(folder, "new-design-md", "--name", "Sample App")).code).toBe(0);
    const ran = await cli(folder, "example");
    expect([ran.code, ran.err]).toEqual([0, ""]);
    // The check the next step names reads the example as its build did, so it passes beside the same settings.
    const next = Array.from(ran.out.matchAll(/`open-prototype ([^`]*\bcheck\b[^`]*)`/g), (found) => (found[1] ?? "").split(" "));
    expect(next).toHaveLength(1);
    for (const argv of next) expect({ argv, code: (await cli(folder, ...argv)).code }).toEqual({ argv, code: 0 });
  });
});

test("two designs never share a page: each page's path is its design's", async () => {
  const folder = project({ "design/a-b.html": single(), "design/a/b.html": single(), "design/a_b.html": single() });
  for (const file of ["design/a-b.html", "design/a/b.html", "design/a_b.html"]) {
    expect((await cli(folder, "build", file)).code).toBe(0);
    expect(existsSync(join(folder, ".prototype/views", file))).toBe(true);
  }
});

describe("each line names its rule", () => {
  test("every finding check prints, and every refusal, ends with its rule's id, which the registry and the reference hold", async () => {
    const { RULES } = await import("../src/checks/rules.ts");
    const ids = new Set<string>(RULES.map((rule) => rule.id));
    const folder = project({
      "design/a.html": single({
        screens: '<section data-proto-screen="start"><div data-proto-state="success"><button type="button">x 🎉</button></div></section>',
      }),
    });
    const ran = await cli(folder, "check", "design/a.html");
    const lines = ran.out.split("\n").slice(0, -1);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of [...lines, (await cli(folder, "check", "design/nope.html")).err, (await cli(folder, "check", "--op")).err.split("\n").at(-1) ?? ""]) {
      const id = /\[([a-z]+\.[a-z0-9-]+)\]$/.exec(line)?.[1] ?? "";
      expect([line, ids.has(id)]).toEqual([line, true]);
    }
  });

  test("every request id the code gives is a rule of the registry", async () => {
    const { RULES } = await import("../src/checks/rules.ts");
    const ids = new Set<string>(RULES.map((rule) => rule.id));
    const glob = new Bun.Glob("**/*.ts");
    const named = new Set<string>();
    for await (const file of glob.scan(join(import.meta.dir, "../src"))) {
      for (const found of (await Bun.file(join(import.meta.dir, "../src", file)).text()).matchAll(/"((?:request|tool|stories)\.[a-z-]+)(?<!\.ts)"/g))
        named.add(found[1] ?? "");
    }
    expect([...named].filter((id) => !ids.has(id))).toEqual([]);
    expect(named.size).toBeGreaterThan(5);
  });
});

test("the last line of check names the files the problems are in, never only the design's", async () => {
  const folder = project({
    "design/a.html": single(),
    "design/rounds/a/1/comments.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "start", state: "success", comment: "c" }] }),
    "design/rounds/a/2/changes.json": JSON.stringify({ changes: [{ answers: ["r1-1"] }] }),
  });
  const ran = await cli(folder, "check", "design/a.html");
  expect([ran.code, ran.out.split("\n").at(-1)]).toEqual([1, "1 problem; fix it in design/rounds/a/2/changes.json"]);
});

describe("the example's next step", () => {
  test("example names commands that run as written", async () => {
    const folder = project();
    const ran = await cli(folder, "example");
    const next = ran.out.split("\n").find((line) => line.startsWith("next: ")) ?? "";
    const commands = [...next.matchAll(/`open-prototype ([^`<]+)`/g)].map((found) => found[1] ?? "").filter((command) => !command.startsWith("new-"));
    expect(commands.length).toBe(2);
    for (const command of commands) {
      // serve runs until stopped, so its request is tried as check reads it: the file it names is accepted.
      const argv = command.split(" ").map((word) => (word === "serve" ? "check" : word));
      expect([command, (await cli(folder, ...argv)).code]).toEqual([command, 0]);
    }
  });
});

// On a clone with no install, `bunx biome` fetched and ran the registry's `biome`, another author's package.
test("bun run check on a copy with no install stops before any step, and starts no tool it would fetch", () => {
  const folder = project();
  for (const part of ["src", "tools", "schemas", "assets"]) cpSync(join(REPOSITORY, part), join(folder, part), { recursive: true });
  const ran = Bun.spawnSync(["bun", "tools/check.ts"], { cwd: folder, env: { ...process.env, BUN_CONFIG_REGISTRY: "http://127.0.0.1:9/" } });
  expect([ran.exitCode, ran.stdout.toString().includes("check: "), ran.stderr.toString().includes("bun install")]).toEqual([1, false, true]);
});

// Stand-ins for Biome and tsc pass at once and write how they were called; they are shell scripts, so not on Windows.
test.skipIf(WINDOWS)(
  `bun run check on a copy that lacks the viewer's files runs those steps, and fails, never skips them${onWindows("the stand-in tools are shell scripts")}`,
  () => {
    const folder = project({ "chrome-stand-in": "x" });
    for (const part of ["src", "tools", "schemas", "assets"]) cpSync(join(REPOSITORY, part), join(folder, part), { recursive: true });
    rmSync(join(folder, "tools/build-viewer.ts"));
    mkdirSync(join(folder, "node_modules/.bin"), { recursive: true });
    for (const name of ["biome", "tsc"])
      writeFileSync(join(folder, "node_modules/.bin", name), `#!/bin/sh\necho "${name} $*" >> "${join(folder, "calls")}"\n`, { mode: 0o755 });
    const ran = Bun.spawnSync(["bun", "tools/check.ts"], { cwd: folder, env: { ...process.env, CHROME_BIN: join(folder, "chrome-stand-in") } });
    const said = ran.stdout.toString();
    expect([
      ran.exitCode,
      said.includes("check: the types of the viewer"),
      ran.stderr.toString().includes("check failed at: the built viewer matches its source"),
    ]).toEqual([1, true, true]);
    expect(readFileSync(join(folder, "calls"), "utf8")).toContain("tsc --noEmit -p viewer");
  },
);
