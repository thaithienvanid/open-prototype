// The product prototype's starts and sizes, and the capture of its shots.
import { describe, expect, test } from "bun:test";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { inflateSync } from "node:zlib";
import { DevTools, ended, FLAGS, findChrome, launch, removeStaleProfiles } from "../src/capture.ts";
import { RULES, rulesOff } from "../src/checks/rules.ts";
import { Refusal } from "../src/errors.ts";
import { stopsPage } from "../src/finding.ts";
import { READ_LIMITS } from "../src/format.ts";
import { loadProject } from "../src/project.ts";
import { designOfScreens, FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project, SCRATCH, WINDOWS } from "./helpers.ts";
import { tempFolder } from "./temp.ts";

describe("starting", () => {
  test("new-design writes one starter file that passes the check, and never writes over it", async () => {
    const folder = project();
    const started = await cli(folder, "new-design", "design/app.html", "--title", "Sample App");
    expect(started.out.split("\n")[0]).toBe("design/app.html");
    expect((await cli(folder, "check", "design/app.html")).out).toBe("ok: 1 screen, 2 states, 4 test ids");
    const first = readFileSync(join(folder, "design/app.html"), "utf8");
    expect((await cli(folder, "new-design", "design/app.html")).code).toBe(2);
    expect(readFileSync(join(folder, "design/app.html"), "utf8")).toBe(first);
  });

  // The skill's layout rules ask for body text of at least 16 CSS px on a phone's frame, at a line height of at least
  // 1.4, so the tool's own starter and design document set no smaller text than a person is told to write.
  test("the starter and the shipped design document set body text at 1rem, with a line height of at least 1.4", async () => {
    const folder = project();
    await cli(folder, "new-design", "design/app.html");
    const body = /--typography-body: 400 ([0-9.]+)rem\/([0-9.]+) /.exec(readFileSync(join(folder, "design/app.html"), "utf8"));
    expect([Number(body?.[1]), Number(body?.[2]) >= 1.4]).toEqual([1, true]);
    await cli(folder, "new-design-md");
    const facts = json<{ design_md: { tokens: { name: string; light: string }[] } }>(await cli(folder, "project", "--json")).design_md.tokens;
    const shipped = /^400 ([0-9.]+)rem\/([0-9.]+) /.exec(facts.find((token) => token.name === "--typography-body")?.light ?? "");
    expect([Number(shipped?.[1]), Number(shipped?.[2]) >= 1.4]).toEqual([1, true]);
  });

  test("new-design writes a title with a dollar sign as typed, never as a replacement pattern", async () => {
    for (const [title, written] of [
      ["Tips $& tricks", "Tips $&amp; tricks"],
      ["A $$ B", "A $$ B"],
      ["Cost $` and $'", "Cost $` and $&#x27;"],
    ] as const) {
      const folder = project();
      expect((await cli(folder, "new-design", "design/t.html", "--title", title)).code).toBe(0);
      expect(readFileSync(join(folder, "design/t.html"), "utf8")).toContain(`<title>${written}</title>`);
      expect((await cli(folder, "check", "design/t.html")).code).toBe(0);
    }
  });

  test("tokens are placed by the build, never copied into a design, and a design's own list wins", async () => {
    const folder = project({
      "brand/a.css": ":root { --brand: #202020; }\n",
      "brand/b.css": ":root { --other: #303030; }\n",
      "prototype.config.json": '{ "tokens": ["brand/a.css"] }',
    });
    expect((await cli(folder, "new-design", "design/one.html")).code).toBe(0);
    expect(readFileSync(join(folder, "design/one.html"), "utf8")).not.toContain("--brand");
    await cli(folder, "build", "design/one.html");
    const page = readFileSync(join(folder, ".prototype/views/design/one.html"), "utf8");
    expect(page).toContain("<style data-proto-tokens>\n:root { --brand: #202020; }");
    const own = readFileSync(join(folder, "design/one.html"), "utf8").replace("<title>", '<meta name="tokens" content="brand/b.css">\n<title>');
    await Bun.write(join(folder, "design/one.html"), own);
    await cli(folder, "build", "design/one.html");
    const second = readFileSync(join(folder, ".prototype/views/design/one.html"), "utf8");
    expect([second.includes("--other: #303030"), second.includes("--brand: #202020")]).toEqual([true, false]);
    expect((await cli(project({ "prototype.config.json": '{ "tokens": ["none.css"] }', "design/a.html": own }), "check", "design/a.html")).code).toBe(1);
    expect(
      (
        await cli(
          project({
            "prototype.config.json": '{ "tokens": ["none.css"] }',
            "design/a.html": readFileSync(join(folder, "design/one.html"), "utf8").replace(/<meta name="tokens"[^>]*>\n/, ""),
          }),
          "check",
          "design/a.html",
        )
      ).code,
    ).toBe(2);
  });

  test("the settings file and the flags set the output folder", async () => {
    const folder = project({ "prototype.config.json": '{ "out_dir": "build/pages" }', ...flowDesign() });
    expect((await cli(folder, "build", FLOW_DESIGN)).out).toStartWith(`wrote build/pages/views/${FLOW_DESIGN}`);
    expect((await cli(folder, "--out-dir", "other", "build", FLOW_DESIGN)).out).toStartWith(`wrote other/views/${FLOW_DESIGN}`);
    expect((await cli(project({ "prototype.config.json": '{ "desing_dir": "x" }', "design/a.html": single() }), "check", "design/a.html")).code).toBe(2);
  });
});

describe("flows and blocks in an HTML design", () => {
  test("a new design passes every command, stories with an empty index among them", async () => {
    const folder = project({ "index.json": JSON.stringify({ v: 5, entries: {} }) });
    await cli(folder, "new-design", "design/start.html");
    for (const argv of [
      ["check", "design/start.html"],
      ["build", "design/start.html"],
      ["screens", "design/start.html"],
      ["components", "design/start.html"],
      ["shots", "design/start.html"],
      ["stories", "index.json", "design/start.html"],
    ])
      expect([argv[0], (await cli(folder, ...argv)).code]).toEqual([argv[0], 0]);
    expect(json<{ components: unknown[] }>(await cli(folder, "components", "design/start.html")).components).toEqual([]);
  });

  test("data-proto-flow host mistakes are flow.include findings and stop the page", async () => {
    const badHost = single({
      screens: '<div data-proto-flow="a" class="extra"></div>\n<div data-proto-flow="b">text</div>\n<div data-proto-flow="c"/>',
    });
    const folder = project({
      "design/a.html": badHost,
      "design/flows/a.html": '<section data-proto-screen="s"><div data-proto-state="ok" data-testid="a-s">a</div></section>\n',
      "design/flows/b.html": '<section data-proto-screen="s"><div data-proto-state="ok" data-testid="b-s">b</div></section>\n',
      "design/flows/c.html": '<section data-proto-screen="s"><div data-proto-state="ok" data-testid="c-s">c</div></section>\n',
    });
    const found = json<{ findings: { rule: string }[] }>(await cli(folder, "check", "--json", "design/a.html")).findings.filter(
      (item) => item.rule === "flow.include",
    );
    expect(found.length).toBe(3);
    expect((await cli(folder, "build", "design/a.html")).code).toBe(1);
    expect(existsSync(join(folder, ".prototype/views/design/a.html"))).toBe(false);
  });
});

describe("a start tag written with />, read as a browser reads it", () => {
  // HTML ignores `/>` on a start tag outside SVG and MathML, so each reader of the disk stage reads it as the walk does.
  test('a self-closed <meta name="tokens" /> names the design\'s tokens files', async () => {
    const folder = project({
      "design/tokens.css": ":root { --space-9: 9px; }\n",
      "design/a.html": single({ head: '<meta name="tokens" content="design/tokens.css" />\n' }),
    });
    expect((await cli(folder, "build", "design/a.html")).code).toBe(0);
    expect(readFileSync(join(folder, ".prototype/views/design/a.html"), "utf8")).toContain("--space-9: 9px");
  });
});

describe("rules a project turns off", () => {
  const design = (folder: string) => cli(folder, "check", "--json", "a.html");
  test("leave their findings out; every other rule stays on", async () => {
    const emoji = single({ screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><p>Great job 🎉</p></div></section>' });
    expect(json<{ findings: { rule: string }[] }>(await design(project({ "a.html": emoji }))).findings.map((item) => item.rule)).toEqual(["copy.emoji"]);
    const off = await design(project({ "a.html": emoji, "prototype.config.json": '{ "rules": { "copy.emoji": "off" } }' }));
    expect([off.code, json<{ findings: unknown[] }>(off).findings]).toEqual([0, []]);
  });
  test.each([
    ['{ "rules": { "copy.nothing": "off" } }'],
    ['{ "rules": { "copy.emoji": "on" } }'],
    ['{ "rules": { "unsafe.markup": "off" } }'],
    ['{ "rules": { "read.file": "off" } }'],
    ['{ "rules": [] }'],
  ])("%s is refused", async (settings) => {
    const ran = await cli(project({ "prototype.config.json": settings, "a.html": single() }), "check", "a.html");
    expect([ran.code, ran.err]).toEqual([2, expect.stringContaining("rules")]);
  });
  // Whether a rule stops the page is its row's, not its family's: a rule moved out of `read` into its topic, such as
  // `compose.use`, still stays on, and `compose.unused-arg` beside it, a note, turns off.
  test.each([["compose.use"], ["compose.arg"], ["structure.slot"], ["structure.tool-name"], ["system.tokens-file"], ["flow.include"], ["read.depth"]])(
    "%s stops the page, so a setting that turns it off is refused",
    async (rule) => {
      const ran = await cli(project({ "prototype.config.json": JSON.stringify({ rules: { [rule]: "off" } }), "a.html": single() }), "check", "a.html");
      expect([ran.code, ran.err]).toEqual([2, expect.stringContaining(`turns off ${rule}, a rule that keeps the page safe or readable: it stays on`)]);
    },
  );
  test.each([["compose.unused-arg"], ["structure.name"], ["accessibility.label"], ["integrity.load"]])(
    "%s stops no page, so a project turns it off",
    async (rule) => {
      const ran = await cli(project({ "prototype.config.json": JSON.stringify({ rules: { [rule]: "off" } }), "a.html": single() }), "check", "a.html");
      expect([ran.code, ran.err]).toEqual([0, ""]);
    },
  );
  test("every rule that stops the page is a problem, and a project turns off each rule but those, the outcomes, and stories.missing", () => {
    const base = loadProject(project());
    const refused = RULES.filter((rule) => {
      try {
        rulesOff({ ...base, rules: { [rule.id]: "off" } });
        return false;
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        return true;
      }
    }).map((rule) => rule.id);
    expect(refused).toEqual(RULES.filter((rule) => stopsPage(rule.id) || rule.outcome || rule.id === "stories.missing").map((rule) => rule.id));
    expect(RULES.filter((rule) => rule.stops && rule.level !== "problem")).toEqual([]);
    expect(RULES.filter((rule) => rule.stops).length).toBeGreaterThan(10);
  });
  // An id renamed before the first release is no rule: it gets the words every unknown id gets, which name the reference.
  test.each([["read.use"], ["integrity.label"], ["device.width"], ["paint.network"], ["accessibility.heading-top"], ["rounds.key"]])(
    "the old id %s is refused as no rule",
    async (rule) => {
      const ran = await cli(project({ "prototype.config.json": JSON.stringify({ rules: { [rule]: "off" } }), "a.html": single() }), "check", "a.html");
      expect([ran.code, ran.err]).toEqual([
        2,
        expect.stringContaining(`names ${JSON.stringify(rule)}, which is no rule: the format reference lists each rule's id`),
      ]);
    },
  );
  // A rule whose findings no setting reaches would be accepted as off and still print, so it is refused with why.
  test.each([
    ["integrity.more", "counts the findings the limit cut"],
    ["stories.missing", "run no `stories`"],
    ["request.usage", "a refused request"],
    ["tool.failed", "a fault of the tool"],
  ])("%s, which no setting reaches, is refused, and the words say why", async (rule, why) => {
    const ran = await cli(project({ "prototype.config.json": JSON.stringify({ rules: { [rule]: "off" } }), "a.html": single() }), "check", "--json", "a.html");
    const found = json<{ findings: { rule: string; message: string }[] }>(ran).findings;
    expect([ran.code, found.map((item) => item.rule), found[0]?.message]).toEqual([2, ["request.settings"], expect.stringContaining(why)]);
  });
  test("project and stories leave out a rule that is off", async () => {
    const files = {
      "DESIGN.md": "---\nversion: alpha\nname: X\ncolors:\n  light:\n    bg: nope\n---\n# X\n",
      "a.html": single({ screens: '<section data-proto-screen="start"><div data-proto-state="Done" data-testid="s">a</div></section>' }),
      "index.json": JSON.stringify({ v: 5, entries: {} }),
    };
    const rules = (ran: Awaited<ReturnType<typeof cli>>) => json<{ findings: { rule: string }[] }>(ran).findings.map((item) => item.rule);
    const on = project(files);
    expect(rules(await cli(on, "project", "--json"))).toContain("system.value");
    expect(rules(await cli(on, "stories", "--json", "index.json", "a.html"))).toEqual(["structure.name"]);
    const off = project({
      ...files,
      "prototype.config.json": JSON.stringify({ rules: { "system.value": "off", "system.theme": "off", "structure.name": "off" } }),
    });
    const facts = await cli(off, "project", "--json");
    expect([facts.code, rules(facts)]).toEqual([0, []]);
    expect(rules(await cli(off, "stories", "--json", "index.json", "a.html"))).toEqual([]);
  });
});

describe("a design of 201 screens", () => {
  test("checks, builds, and lists its shots, with a page under 600 KB", async () => {
    const flows = Array.from({ length: 11 }, (_, i) => `f${i}`);
    const nav = `<nav aria-label="Main">${flows.map((flow) => `<button type="button" data-proto-go="${flow}:s0" data-testid="nav-${flow}">${flow}</button>`).join("")}</nav>\n`;
    const files: Record<string, string> = {
      [FLOW_DESIGN]: single({
        head: '<meta name="platforms" content="web">\n<meta name="themes" content="light dark">\n',
        chrome: `${nav}<h1 data-proto-slot="title"></h1>\n`,
        screens: flows.map((id) => `<div data-proto-flow="${id}" data-proto-title="${id}"></div>`).join("\n"),
        fixtures: '{ "product": "Big", "back": "Back" }',
      }),
    };
    let screens = 0;
    for (const flow of flows) {
      const count = flow === "f0" ? 21 : 18;
      const sections = Array.from({ length: count }, (_, i) => {
        screens++;
        const next = (state: string) =>
          i + 1 < count ? `<button type="button" data-proto-go="s${i + 1}" data-testid="${flow}-s${i}-${state}-next">Next</button>` : "";
        return `<section data-proto-screen="s${i}" data-proto-title="Screen ${i}">\n${["success", "empty", "error"].map((state) => `  <div data-proto-state="${state}" data-testid="${flow}-s${i}-${state}"><p>Text</p>${next(state)}</div>`).join("\n")}\n</section>`;
      });
      files[`design/flows/${flow}.html`] = `${sections.join("\n")}\n`;
    }
    const folder = project(files);
    expect(screens).toBe(201);
    expect((await cli(folder, "check", FLOW_DESIGN)).out).toBe("ok: 201 screens, 603 states, 1184 test ids");
    expect((await cli(folder, "build", FLOW_DESIGN)).code).toBe(0);
    expect(statSync(join(folder, ".prototype/views", FLOW_DESIGN)).size).toBeLessThan(600_000);
    // Two web frames and two themes for each state, plus two checks per screen.
    expect(json<{ shots: unknown[] }>(await cli(folder, "shots", FLOW_DESIGN)).shots.length).toBe(201 * 3 * 4 + 201 * 2);
  });
});

describe("a design of 2,000 screens", () => {
  /** Whether a command ends with exit 0 within a ceiling, in a process of its own that is stopped at the ceiling. */
  async function within(folder: string, command: string, ceiling: number): Promise<void> {
    const started = performance.now();
    const child = Bun.spawn(["bun", join(import.meta.dir, "../src/cli.ts"), command, FLOW_DESIGN], { cwd: folder, stdout: "ignore", stderr: "ignore" });
    const stop = setTimeout(() => child.kill("SIGKILL"), ceiling);
    const exited = await child.exited;
    clearTimeout(stop);
    expect({ command, code: exited, within: performance.now() - started < ceiling }).toEqual({ command, code: 0, within: true });
  }
  // A ceiling, not a pin: about half a second each on the machine that set it.
  test("checks and builds within 10 seconds each", async () => {
    const folder = project(designOfScreens(20, 100));
    expect((await cli(folder, "check", FLOW_DESIGN)).out).toBe("ok: 2000 screens, 4000 states, 7980 test ids");
    await within(folder, "check", 10_000);
    await within(folder, "build", 10_000);
  }, 60_000);
});

/** A PNG of 8-bit RGB or RGBA, as Chrome writes one: its size, and the colour of a pixel. */
function readPng(file: Buffer): { width: number; height: number; pixel: (x: number, y: number) => [number, number, number] } {
  const width = file.readUInt32BE(16),
    height = file.readUInt32BE(20);
  const channels = file[25] === 6 ? 4 : 3;
  const parts: Buffer[] = [];
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    if (file.toString("latin1", at + 4, at + 8) === "IDAT") parts.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const rows = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const kind = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const value = raw[y * (stride + 1) + 1 + i] ?? 0;
      const left = i >= channels ? (rows[y * stride + i - channels] ?? 0) : 0;
      const up = y ? (rows[(y - 1) * stride + i] ?? 0) : 0;
      const corner = y && i >= channels ? (rows[(y - 1) * stride + i - channels] ?? 0) : 0;
      const guess = left + up - corner;
      const near = [Math.abs(guess - left), Math.abs(guess - up), Math.abs(guess - corner)];
      const paeth = near[0]! <= near[1]! && near[0]! <= near[2]! ? left : near[1]! <= near[2]! ? up : corner;
      rows[y * stride + i] = (value + [0, left, up, (left + up) >> 1, paeth][kind]!) & 255;
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => [rows[y * stride + x * channels] ?? 0, rows[y * stride + x * channels + 1] ?? 0, rows[y * stride + x * channels + 2] ?? 0],
  };
}

describe("the DevTools client", () => {
  test("a message from Chrome that is no JSON fails each waiting call and every later one, and never throws outside a call", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const client = new DevTools(input, output);
    const waiting = client.call("Page.navigate").catch((error: Error) => error.message);
    output.write("{ not json\0");
    output.write(`${JSON.stringify({ id: 1, result: {} })}\0`);
    const later = client.call("Page.reload").catch((error: Error) => error.message);
    expect([await waiting, await later]).toEqual([expect.stringContaining("no JSON"), expect.stringContaining("no JSON")]);
  });
});

/** PowerShell's command for a script, which goes as UTF-16 Base64, so the command line reads no quote of it a second time. */
const powershell = (script: string) => [
  "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-EncodedCommand",
  Buffer.from(script, "utf16le").toString("base64"),
];
const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
/**
 * The numbers of the processes whose command line holds the text in PROTOTYPE_HELD, but for PowerShell's own. The
 * system's own query picks them, so PowerShell reads no other process, and the text, a name of letters, digits, and
 * `-`, holds no character that WQL's LIKE reads as a pattern.
 */
const HOLDERS =
  "@(Get-CimInstance Win32_Process -Filter \"CommandLine LIKE '%$($env:PROTOTYPE_HELD)%'\" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine.Contains($env:PROTOTYPE_HELD) } | ForEach-Object { [uint32]$_.ProcessId })";
/** The processes whose command line holds this text, by their numbers: `pgrep -f`, or on Windows the system's list of processes. */
function processesWith(text: string): string[] {
  if (WINDOWS)
    return linesOf(Bun.spawnSync(powershell(HOLDERS), { env: { ...process.env, PROTOTYPE_HELD: text }, stdin: "ignore", stderr: "ignore" }).stdout.toString());
  return Bun.spawnSync(["pgrep", "-f", text], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim().split("\n").filter(Boolean);
}
/**
 * How many processes have this text in their command line, and each of their sockets, a line each as `lsof -i` gives
 * it. PowerShell takes a second or two on Windows, so it runs beside the capture, never stopping this process.
 */
async function socketsOf(text: string): Promise<{ processes: number; lines: string[] }> {
  if (WINDOWS) {
    // An IPv6 address is written in brackets, as lsof writes it, so `[::1]` reads as this machine.
    const command = powershell(
      `$ids = ${HOLDERS}
if ($ids.Count -gt 0) {
  "processes $($ids.Count)"
  $at = { param($a) if ($a.Contains(':')) { "[$a]" } else { $a } }
  foreach ($c in @(Get-NetTCPConnection -OwningProcess $ids -ErrorAction SilentlyContinue)) { "TCP $(& $at $c.LocalAddress):$($c.LocalPort)->$(& $at $c.RemoteAddress):$($c.RemotePort) ($($c.State))" }
  foreach ($u in @(Get-NetUDPEndpoint -OwningProcess $ids -ErrorAction SilentlyContinue)) { "UDP $(& $at $u.LocalAddress):$($u.LocalPort)" }
}`,
    );
    const looked = Bun.spawn(command, { env: { ...process.env, PROTOTYPE_HELD: text }, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const lines = linesOf(await new Response(looked.stdout).text());
    await looked.exited;
    return { processes: Number(/^processes (\d+)$/.exec(lines[0] ?? "")?.[1] ?? 0), lines: lines.slice(1) };
  }
  const pids = processesWith(text);
  if (!pids.length) return { processes: 0, lines: [] };
  const sockets = Bun.spawnSync(["lsof", "-nP", "-a", "-p", pids.join(","), "-i"], { stdout: "pipe", stderr: "ignore" }).stdout.toString();
  return { processes: pids.length, lines: sockets.split("\n") };
}
/** The tools that find a browser's processes and their sockets: pgrep and lsof, or on Windows PowerShell. */
const WATCHERS = WINDOWS ? Boolean(Bun.which("powershell.exe")) : Boolean(Bun.which("lsof") && Bun.which("pgrep"));
/**
 * The environment of a command whose temporary folder is this one: TMPDIR, and on Windows TEMP and TMP, which the
 * system reads there. On Windows a name is one name in any case, so each of them is set once.
 */
function withTemporary(folder: string): Record<string, string | undefined> {
  if (!WINDOWS) return { ...process.env, TMPDIR: folder };
  const names = ["TMPDIR", "TEMP", "TMP"];
  const rest = Object.entries(process.env).filter(([key]) => !names.includes(key.toUpperCase()));
  return { ...Object.fromEntries(rest), ...Object.fromEntries(names.map((name) => [name, folder])) };
}

// The capture starts a real Chrome: it runs only when asked, one at a time, as PROTOTYPE_BROWSER_TESTS=1.
describe("capture", () => {
  test("with no browser it is a refused request: exit 2, the next step on stderr, and nothing written", async () => {
    const folder = project();
    await cli(folder, "new-design", "design/app.html");
    const saved = process.env.CHROME_BIN;
    process.env.CHROME_BIN = "/no/such/chrome";
    const ran = await cli(folder, "shots", "--capture", "design/app.html");
    if (saved === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = saved;
    expect(ran.code).toBe(2);
    expect(ran.out).toBe("");
    expect(ran.err).toContain("CHROME_BIN");
    // A CHROME_BIN the person set is named as theirs, so the next step is to correct it, never to set it.
    expect(ran.err).not.toContain("set CHROME_BIN");
    expect(existsSync(join(folder, ".prototype/shots"))).toBe(false);
  });

  test("a browser that will not start is named by what it is, never by its full path, with the step that points the tool at one", async () => {
    const folder = project({ "not-a-browser": "x" });
    await cli(folder, "new-design", "design/app.html");
    const saved = process.env.CHROME_BIN;
    process.env.CHROME_BIN = join(folder, "not-a-browser");
    const ran = await cli(folder, "shots", "--capture", "design/app.html");
    if (saved === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = saved;
    const said = ran.out + ran.err;
    expect([ran.code, said.includes("CHROME_BIN"), said.includes("not-a-browser"), said.includes(SCRATCH)]).toEqual([3, true, false, false]);
  });

  test("a failed capture is told as every other fault is: on stderr, as the tool's fault, and with --json one envelope on stdout", async () => {
    const folder = project({ "not-a-browser": "x" });
    await cli(folder, "new-design", "design/app.html");
    const saved = process.env.CHROME_BIN;
    process.env.CHROME_BIN = join(folder, "not-a-browser");
    const ran = await cli(folder, "shots", "--capture", "design/app.html");
    const asJson = await cli(folder, "shots", "--capture", "design/app.html", "--json");
    if (saved === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = saved;
    expect([ran.code, ran.out]).toEqual([3, ""]);
    expect(ran.err).toStartWith("problem: the tool failed: cannot start the browser that CHROME_BIN names");
    expect(ran.err).toContain("This is a fault of the tool, not of the design");
    expect(ran.err).toEndWith("[tool.failed]");
    const data = JSON.parse(asJson.out);
    expect([asJson.code, asJson.err, data.ok, data.findings.map((item: { rule: string }) => item.rule), Array.isArray(data.shots)]).toEqual([
      3,
      ran.err,
      false,
      ["tool.failed"],
      true,
    ]);
  });

  // As root, Chrome starts only with its sandbox off, and a design's images would be decoded with no wall around them.
  test("as root, the capture is a refused request before any Chrome starts, and Chrome never starts with its sandbox off", async () => {
    const folder = project();
    await cli(folder, "new-design", "design/app.html");
    const saved = Object.getOwnPropertyDescriptor(process, "getuid");
    Object.defineProperty(process, "getuid", { value: () => 0, configurable: true, writable: true });
    const ran = await cli(folder, "shots", "--capture", "design/app.html");
    // Windows has no getuid, so the stand-in goes, and no later capture of the run runs as root.
    if (saved) Object.defineProperty(process, "getuid", saved);
    else delete (process as { getuid?: unknown }).getuid;
    expect([ran.code, ran.err.includes("[request.browser]"), ran.err.includes("root"), existsSync(join(folder, ".prototype/shots"))]).toEqual([
      2,
      true,
      true,
      false,
    ]);
    expect(FLAGS).not.toContain("--no-sandbox");
  });

  test("Chrome starts with a pipe and no port, and with its own network use turned off", () => {
    expect(FLAGS).toContain("--remote-debugging-pipe");
    expect(FLAGS.some((flag) => flag.startsWith("--remote-debugging-port") || flag.startsWith("--remote-debugging-address"))).toBe(false);
    for (const flag of ["--host-resolver-rules=MAP * ~NOTFOUND", "--disable-field-trial-config", "--no-pings", "--metrics-recording-only"])
      expect(FLAGS).toContain(flag);
  });

  // The guard beside `started` in src/capture.ts: with it taken out, Bun 1.3 closed a stopped browser's pipe a second
  // time when it collected the process, and files opened after it were gone. Bun 1.4.0 fixed it, and the test stays. A
  // stand-in program takes Chrome's place, and ends at once with the two extra pipes: a shell script, and on Windows the
  // system's whoami.exe, which ends on Chrome's first flag. Windows runs no script by its first line, and Bun, as Node,
  // refuses to start a batch file with no shell (EINVAL, after CVE-2024-27980), and the capture starts Chrome with none.
  test("a stopped browser's pipe never closes a file opened after it", async () => {
    let program = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "whoami.exe");
    if (!WINDOWS) {
      program = join(tempFolder(join(tmpdir(), "prototype-pipe-")), "stand-in");
      writeFileSync(program, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    let lost = 0;
    for (let round = 0; round < 5; round++) {
      await ended(launch(program, tempFolder(join(tmpdir(), "prototype-pipe-profile-"))));
      const opened = Array.from({ length: 12 }, () => openSync(devNull, "r"));
      for (let pass = 0; pass < 3; pass++) {
        Bun.gc(true);
        await Bun.sleep(10);
      }
      lost += opened.filter((fd) => {
        try {
          fstatSync(fd);
          closeSync(fd);
          return false;
        } catch {
          return true;
        }
      }).length;
    }
    expect(lost).toBe(0);
  });

  // The wait for a stopped browser has a ceiling of 3 seconds. A ceiling timer left pending held every capture's process
  // open for those 3 seconds after its work was done. A stand-in program takes Chrome's place, as in the test above.
  test("the wait for a stopped browser holds the process open no longer than the browser takes to end", () => {
    const folder = tempFolder(join(tmpdir(), "prototype-ended-"));
    let program = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "whoami.exe");
    if (!WINDOWS) {
      program = join(folder, "stand-in");
      writeFileSync(program, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    const script = join(folder, "wait.ts");
    const capture = JSON.stringify(join(import.meta.dir, "../src/capture.ts"));
    writeFileSync(
      script,
      `import { ended, launch } from ${capture};
await ended(launch(${JSON.stringify(program)}, ${JSON.stringify(join(folder, "profile"))}));
const done = performance.now();
process.on("exit", () => process.stdout.write(String(Math.round(performance.now() - done))));
`,
    );
    const ran = Bun.spawnSync([process.execPath, script], { stdout: "pipe", stderr: "pipe" });
    // The process ends as soon as its work is done: well under the 3 seconds a pending ceiling held it.
    expect([ran.exitCode, Number(ran.stdout.toString()) < 1500]).toEqual([0, true]);
  });

  // Windows has no signal a program can handle: a stop there ends the process at once, and no code of it runs. So on
  // Windows the test holds what is left to hold: Chrome ends with the tool, and the next capture's sweep removes the
  // profile the stop leaves.
  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome() || !WATCHERS)(
    WINDOWS
      ? "a stop mid-capture on Windows, which no handler sees, leaves no Chrome, and the next capture removes the profile it leaves"
      : "a signal mid-capture leaves no Chrome and no profile",
    async () => {
      // On Windows each look for Chrome takes PowerShell a second or more, so the capture there is of 40 screens, long
      // enough that the stop lands while it runs.
      const folder = project(WINDOWS ? designOfScreens(4, 10) : {});
      const target = WINDOWS ? FLOW_DESIGN : "design/app.html";
      if (!WINDOWS) await cli(folder, "new-design", target);
      // The capture gets a temporary folder of its own, so the test finds its own profile and its own Chrome, never those
      // of another copy of the tests that captures beside it. A profile planted in the shared folder stands for that copy.
      const own = tempFolder(join(tmpdir(), "prototype-signal-"));
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/cli.ts"), "shots", "--capture", target], {
        cwd: folder,
        env: withTemporary(own),
        stdout: "ignore",
        stderr: "ignore",
      });
      tempFolder(join(tmpdir(), "prototype-shots-"));
      let profile = "";
      for (let i = 0; i < 100 && !profile; i++) {
        profile = readdirSync(own).find((name) => name.startsWith("prototype-shots-")) ?? "";
        if (!profile) await Bun.sleep(20);
      }
      expect(profile).not.toBe("");
      // On Windows the profile's own name finds its Chrome, as Chrome may write the folder above it by its long name.
      const chromeOf = () => processesWith(WINDOWS ? profile : join(own, profile)).join("\n");
      const profiles = () => readdirSync(own).filter((name) => name.startsWith("prototype-shots-"));
      // Each wait is bounded by the clock, as one look takes milliseconds with pgrep and a second with PowerShell.
      const within = async (seconds: number, done: () => boolean) => {
        for (const end = Date.now() + seconds * 1000; Date.now() < end && !done(); ) await Bun.sleep(20);
      };
      // The signal lands mid-capture: once this capture's Chrome runs with its profile, and the capture has not ended.
      let seen = "";
      await within(30, () => {
        seen = chromeOf();
        return seen !== "" || child.exitCode !== null;
      });
      expect([seen !== "", child.exitCode]).toEqual([true, null]);
      if (WINDOWS) {
        child.kill();
        expect(await child.exited).not.toBe(0);
      } else {
        child.kill("SIGTERM");
        expect(await child.exited).toBe(143);
        // The guard removes the profile as the process ends, and Chrome's helper processes end once the main one is gone.
        await within(3, () => !profiles().length);
        expect(profiles()).toEqual([]);
      }
      await within(WINDOWS ? 15 : 3, () => chromeOf() === "");
      expect(chromeOf()).toBe("");
      if (WINDOWS) {
        // The sweep at the next capture's start takes a profile older than a minute: here the clock stands a minute on,
        // and the sweep tries again while the system still holds a file of the ended Chrome.
        await within(15, () => {
          removeStaleProfiles(own, Date.now() + 61_000);
          return !profiles().length;
        });
        expect(profiles()).toEqual([]);
      }
    },
    WINDOWS ? 120_000 : 60_000,
  );

  // The sockets of Chrome's processes are read with lsof, and on Windows with PowerShell's Get-NetTCPConnection and
  // Get-NetUDPEndpoint, written as lsof writes them.
  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome() || !WATCHERS)(
    "the capture's browser opens no socket off this machine",
    async () => {
      const folder = project();
      await cli(folder, "new-design", "design/app.html");
      const away: string[] = [];
      let looking = true;
      let samples = 0;
      const watch = (async () => {
        while (looking) {
          // Each look runs to its end before the next, and leaves no pipe of its own open for a later program to collide with.
          const sockets = await socketsOf("prototype-shots-");
          if (sockets.processes) {
            samples++;
            away.push(...sockets.lines.filter((line) => /\b(TCP|UDP)\b/.test(line) && !/127\.0\.0\.1|\[::1\]|localhost/.test(line)));
          }
          await Bun.sleep(30);
        }
      })();
      const ran = await cli(folder, "shots", "--capture", "design/app.html");
      looking = false;
      await watch;
      expect([ran.code, samples > 0, away]).toEqual([0, true, []]);
    },
    120_000,
  );

  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome())(
    "one PNG for each shot, at the frame's width, and at least the frame's height",
    async () => {
      const folder = project();
      await cli(folder, "new-design", "design/app.html");
      const ran = await cli(folder, "shots", "--capture", "design/app.html");
      expect(ran.code).toBe(0);
      for (const shot of json<{ shots: { file: string; frame: string }[] }>(ran).shots) {
        const png = readFileSync(join(folder, ".prototype/shots", shot.file));
        const [width = 0, height = 0] = { "320": [320, 568], ios: [390, 844], "1024": [1024, 768] }[shot.frame] ?? [];
        expect([png.readUInt32BE(16), png.readUInt32BE(20) >= height]).toEqual([width, true]);
      }
    },
    120_000,
  );

  // The output folder and its ignore file are made only for pictures that go into it: --out to a round's folder, which
  // is committed, makes no .prototype/ at all.
  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome())(
    "a capture into a folder outside the output folder makes no output folder; one into it makes the folder with its ignore file",
    async () => {
      const away = project();
      await cli(away, "new-design", "design/app.html");
      const ran = await cli(away, "shots", "--capture", "--frames", "320", "--out", "design/rounds/a/2", "design/app.html");
      expect([ran.code, existsSync(join(away, ".prototype")), readdirSync(join(away, "design/rounds/a/2")).length > 0]).toEqual([0, false, true]);
      const inside = project();
      await cli(inside, "new-design", "design/app.html");
      const plain = await cli(inside, "shots", "--capture", "--frames", "320", "design/app.html");
      expect([plain.code, existsSync(join(inside, ".prototype/.gitignore")), readdirSync(join(inside, ".prototype/shots")).length > 0]).toEqual([
        0,
        true,
        true,
      ]);
    },
    120_000,
  );

  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome())(
    "a view taller than its frame is pictured whole, its foot drawn, and a view that fits at the frame's size",
    async () => {
      const screens =
        '<section data-proto-screen="start"><div data-proto-state="long" data-testid="s-long"><p style="height: 1500px">Top</p>' +
        '<p style="height: 60px; margin: 0; background: #ff0000" data-testid="s-foot">Foot</p></div>' +
        '<div data-proto-state="short" data-testid="s-short"><p>Short</p></div></section>';
      const folder = project({ "design/a.html": single({ screens }) });
      const ran = await cli(folder, "shots", "--capture", "--frames", "320", "design/a.html");
      expect(ran.code).toBe(0);
      const picture = (file: string) => readPng(readFileSync(join(folder, ".prototype/shots", file)));
      const long = picture("start.long.320.light.png");
      // The red foot, below the frame's 568 px, is in the picture: a row near the foot holds red pixels.
      const red = Array.from({ length: 120 }, (_, row) => long.height - 1 - row).some((y) =>
        Array.from({ length: long.width }, (_, x) => long.pixel(x, y)).some(([r, g, b]) => r > 200 && g < 60 && b < 60),
      );
      expect([long.height > 1500, red, picture("start.short.320.light.png").height]).toEqual([true, true, 568]);
    },
    120_000,
  );

  // One style line made the window, and Chrome's memory, as tall as the design: a million pixels took 2 GB.
  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome())(
    "a view taller than the picture's limit is pictured to the limit, with a note that names it",
    async () => {
      const screens =
        '<section data-proto-screen="start"><div data-proto-state="long" data-testid="s-long"><p style="height: 200000px">Top</p></div></section>';
      const folder = project({ "design/a.html": single({ screens }) });
      const ran = await cli(folder, "shots", "--capture", "--frames", "320", "--json", "design/a.html");
      const data = json<{ findings: { rule: string; file: string }[] }>(ran);
      const png = readFileSync(join(folder, ".prototype/shots", "start.long.320.light.png"));
      expect([ran.code, data.findings.map((item) => `${item.rule} ${item.file}`), png.readUInt32BE(20) <= READ_LIMITS.picture_height + 600]).toEqual([
        0,
        ["start.long.320.light.png", "start.long.320.light.text-200.png", "start.long.320.light.rtl.png"].map((file) => `device.picture-height ${file}`),
        true,
      ]);
    },
    120_000,
  );
});

describe("the capture's stale profiles", () => {
  test("only its own plain folders, older than a minute, that no running Chrome holds, are removed", () => {
    const base = tempFolder(join(tmpdir(), "prototype-stale-"));
    const made = (name: string) => {
      const path = join(base, name);
      mkdirSync(path);
      writeFileSync(join(path, "page.html"), "x");
      return path;
    };
    const old = Date.now() / 1000 - 3600;
    const stale = made("prototype-shots-aaaaaa");
    const dead = made("prototype-shots-bbbbbb");
    symlinkSync("host-999999999", join(dead, "SingletonLock"));
    const held = made("prototype-shots-cccccc");
    symlinkSync(`host-${process.pid}`, join(held, "SingletonLock"));
    const fresh = made("prototype-shots-dddddd");
    const other = made("someone-else-eeeeee");
    for (const path of [stale, dead, held, other]) utimesSync(path, old, old);
    symlinkSync(other, join(base, "prototype-shots-ffffff"));
    expect(removeStaleProfiles(base).sort()).toEqual([stale, dead].sort());
    expect([held, fresh, other, join(base, "prototype-shots-ffffff")].every((path) => existsSync(path))).toBe(true);
  });

  // Windows gives Chrome's lock no link, so the sweep reads the id the capture wrote into its profile, on every system.
  test("a profile whose capture still runs, by the id it wrote there, is kept with no lock; one whose capture ended goes", () => {
    const base = tempFolder(join(tmpdir(), "prototype-stale-"));
    const made = (name: string, owner: string) => {
      const path = join(base, name);
      mkdirSync(path);
      writeFileSync(join(path, "capture.pid"), owner);
      return path;
    };
    const live = made("prototype-shots-aaaaaa", String(process.pid));
    const ended = made("prototype-shots-bbbbbb", "999999999");
    const unreadable = made("prototype-shots-cccccc", "not an id");
    const old = Date.now() / 1000 - 3600;
    for (const path of [live, ended, unreadable]) utimesSync(path, old, old);
    expect(removeStaleProfiles(base).sort()).toEqual([ended, unreadable].sort());
    expect(existsSync(live)).toBe(true);
  });

  test.skipIf(process.env.PROTOTYPE_BROWSER_TESTS !== "1" || !findChrome())(
    "a capture writes its own process id into the profile it makes",
    async () => {
      const own = tempFolder(join(tmpdir(), "prototype-owner-"));
      const folder = project();
      await cli(folder, "new-design", "design/app.html");
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/cli.ts"), "shots", "--capture", "design/app.html"], {
        cwd: folder,
        env: withTemporary(own),
        stdout: "ignore",
        stderr: "ignore",
      });
      let written = "";
      for (let i = 0; i < 500 && !written && child.exitCode === null; i++) {
        const profile = readdirSync(own).find((name) => name.startsWith("prototype-shots-"));
        try {
          written = profile ? readFileSync(join(own, profile, "capture.pid"), "utf8") : "";
        } catch {
          // the profile is made, and its file not yet written
        }
        if (!written) await Bun.sleep(10);
      }
      child.kill();
      await child.exited;
      expect(written).toBe(String(child.pid));
    },
    60_000,
  );
});
