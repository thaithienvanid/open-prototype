// One error path: a file system that says no is a refusal (exit 2) in one line; a fault of the tool is exit 3; a
// design problem alone is exit 1.
import { describe, expect, test } from "bun:test";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync } from "node:fs";
import { devNull } from "node:os";
import { dirname, join } from "node:path";
import { Refusal } from "../src/errors.ts";
import { finding, findingLine } from "../src/finding.ts";
import { systemError, writeNew, writeWhole } from "../src/fs.ts";
import { storiesOf } from "../src/stories.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, onWindows, project, SCRATCH, WINDOWS, without } from "./helpers.ts";

const CLI = join(import.meta.dir, "../src/cli.ts");

// Every project of the tests sits in the scratch folder, so a message that holds its path names the machine's full path.
function oneLine(err: string): void {
  const lines = err.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toStartWith("problem: ");
  expect(err).not.toContain("    at ");
  expect(err).not.toContain(SCRATCH);
}

describe("the file system says no", () => {
  test("an output folder with no write permission", async () => {
    const folder = project({ "design/ok.html": single() });
    await cli(folder, "build", "design/ok.html");
    const ran = await without("write", [join(folder, ".prototype/views/design")], () => cli(folder, "build", "design/ok.html"));
    expect(ran.code).toBe(2);
    oneLine(ran.err);
    // The refusal names the page the write was for, never the tool's own temporary file beside it.
    expect([ran.err.includes("problem: .prototype/views/design/ok.html: "), ran.err.includes(".tmp")]).toEqual([true, false]);
  });

  test("a new design whose folder is a file", async () => {
    const folder = project({ blocker: "x" });
    const ran = await cli(folder, "new-design", "blocker/x.html");
    expect(ran.code).toBe(2);
    oneLine(ran.err);
  });

  test("a new design in a read-only folder", async () => {
    const folder = project({ "locked/keep": "x" });
    const ran = await without("write", [join(folder, "locked")], () => cli(folder, "new-design", "locked/x.html"));
    expect(ran.code).toBe(2);
    oneLine(ran.err);
  });

  test("a tokens stylesheet that is not UTF-8", async () => {
    const folder = project({
      "prototype.config.json": '{ "tokens": ["brand.css"] }',
      "brand.css": { bytes: new Uint8Array([0xff, 0xfe, 0x00]) },
      "design/a.html": single(),
    });
    const ran = await cli(folder, "build", "design/a.html");
    expect(ran.code).toBe(2);
    oneLine(ran.err);
  });

  test("an image field whose file cannot be read", async () => {
    const folder = project({
      "design/case.html": single({
        screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><img data-proto-image="photo" alt=""></div></section>',
        fixtures: '{ "product": "x", "photo": "p.png" }',
      }),
      "design/p.png": "x",
    });
    const ran = await without("read", [join(folder, "design/p.png")], () => cli(folder, "build", "design/case.html"));
    expect(ran.code).toBe(2);
    oneLine(ran.err);
    // The step names reading, never writing, for a file the tool only reads.
    expect(ran.err).not.toContain("give yourself write access");
  });

  test("a round saved into a read-only rounds folder", async () => {
    const folder = project({
      ...flowDesign(),
      "c.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c" }] }),
      "design/rounds/keep": "x",
    });
    const ran = await without("write", [join(folder, "design/rounds")], () => cli(folder, "save-comments", "c.json", FLOW_DESIGN));
    expect(ran.code).toBe(2);
    oneLine(ran.err);
  });

  const comments = JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c" }] });
  test.each([
    ["a stories index that does not exist", {}, ["stories", "nope/index.json", "design/a.html"]],
    ["a comments file that does not exist", {}, ["save-comments", "nope.json", "design/a.html"]],
    ["a rounds folder that is a link", { "c.json": comments, "design/rounds": { link: "/tmp" } }, ["save-comments", "c.json", "design/a.html"]],
    ["a rounds folder that is a file", { "c.json": comments, "design/rounds": "x" }, ["save-comments", "c.json", "design/a.html"]],
  ])("%s is named from the project's top, never by the machine's full path", async (_name, files, argv) => {
    const ran = await cli(project({ "design/a.html": single(), ...files }), ...argv);
    expect(ran.code).toBe(2);
    oneLine(ran.err);
  });

  // Each refusal names its next step: for a comments file, where the file comes from, and the standard input it may be instead.
  test("a comments file that does not exist names where the file comes from, and the standard input", async () => {
    const ran = await cli(project({ "design/a.html": single() }), "save-comments", "nope.json", "design/a.html");
    expect([ran.code, ran.err.includes("comments.json"), ran.err.includes("`-`")]).toEqual([2, true, true]);
  });

  test("a design file and a round file that cannot be read name no full path in their findings", async () => {
    const folder = project({ "design/a.html": single(), "design/b.html": single(), "design/rounds/a/1/comments.json": "{}" });
    const [round, design] = await without("read", [join(folder, "design/rounds/a/1/comments.json"), join(folder, "design/b.html")], async () => [
      await cli(folder, "check", "design/a.html"),
      await cli(folder, "check", "design/b.html"),
    ]);
    expect([round.code, design.code]).toEqual([1, 1]);
    expect([round.out, design.out].join("\n")).toContain("permission denied");
    expect([round.out, round.err, design.out, design.err].join("\n")).not.toContain(SCRATCH);
  });

  test("a file that cannot be read gets the step for its cause: access for a permission, UTF-8 for an encoding", async () => {
    const folder = project({ "design/locked.html": single(), "design/latin.html": { bytes: new Uint8Array([0x3c, 0x70, 0x3e, 0xe9, 0x0a]) } });
    const locked = await without("read", [join(folder, "design/locked.html")], () => cli(folder, "check", "design/locked.html"));
    const latin = await cli(folder, "check", "design/latin.html");
    expect([locked.code, latin.code]).toEqual([1, 1]);
    expect([locked.out.includes("give yourself access"), locked.out.includes("UTF-8")]).toEqual([true, false]);
    expect([latin.out.includes("save it as UTF-8 text"), latin.out.includes("give yourself access")]).toEqual([true, false]);
  });

  // A pipe blocks a read until something writes to it, so each run is a process of its own with a deadline: a read that
  // waits fails the test at the deadline, and never hangs the run. Windows has no mkfifo.
  const MKFIFO = !WINDOWS && Bun.which("mkfifo") !== null;
  test.skipIf(!MKFIFO)(
    `a pipe among a design's files is no plain file: it is told, and never read${MKFIFO ? "" : " (skipped: no mkfifo)"}`,
    () => {
      const tokened = single({ head: '<meta name="tokens" content="brand/t.css">\n' });
      const used = single({
        screens: '<section data-proto-screen="s"><div data-proto-state="t" data-testid="s-t"><div data-proto-use="pipe"></div></div></section>',
      });
      const flowed = single({ screens: '<div data-proto-flow="pipe" data-proto-title="Pipe"></div>' });
      for (const [pipe, files, argv, code, rule] of [
        ["design/a.html", {}, ["check", "design/a.html"], 2, "request.path"],
        ["design/blocks/pipe.html", { "design/a.html": used }, ["check", "design/a.html"], 1, "compose.use"],
        ["design/flows/pipe.html", { "design/a.html": flowed }, ["check", "design/a.html"], 1, "flow.include"],
        ["DESIGN.md", { "design/a.html": single() }, ["project"], 1, "system.read"],
        ["DESIGN.md", { "design/a.html": single() }, ["check", "design/a.html"], 1, "system.read"],
        ["brand/t.css", { "design/a.html": tokened }, ["check", "design/a.html"], 1, "system.tokens-file"],
        [
          "brand/t.css",
          { "design/a.html": single(), "prototype.config.json": '{ "tokens": ["brand/t.css"] }' },
          ["check", "design/a.html"],
          2,
          "request.settings",
        ],
        ["prototype.config.json", { "design/a.html": single() }, ["check", "design/a.html"], 2, "request.settings"],
        // `project` tells the settings' tokens file as there and unread, with a design document and with none.
        ["brand/t.css", { "prototype.config.json": '{ "tokens": ["brand/t.css"] }' }, ["project"], 1, "system.tokens-file"],
        ["brand/t.css", { "DESIGN.md": "# Product\n", "prototype.config.json": '{ "tokens": ["brand/t.css"] }' }, ["project"], 1, "system.tokens-file"],
        ["index.json", { "design/a.html": single() }, ["stories", "index.json", "design/a.html"], 2, "request.file"],
      ] as const) {
        const folder = project(files);
        mkdirSync(dirname(join(folder, pipe)), { recursive: true });
        expect(Bun.spawnSync(["mkfifo", join(folder, pipe)]).exitCode).toBe(0);
        const ran = Bun.spawnSync(["bun", CLI, ...argv, "--json"], { cwd: folder, stdin: "ignore", timeout: 10_000 });
        const out = ran.stdout.toString();
        const rules = out.startsWith("{") ? (JSON.parse(out) as { findings: { rule: string; message: string }[] }).findings : [];
        const told = rules.find((item) => item.rule.startsWith(rule) && /plain file|no design file/.test(item.message));
        expect({ pipe, argv, code: ran.exitCode, told: told !== undefined }).toEqual({ pipe, argv, code, told: true });
      }
    },
    60_000,
  );

  test("a name too long for the file system", async () => {
    const ran = await cli(project(), "new-design", `design/${"x".repeat(300)}.html`);
    expect(ran.code).toBe(2);
    oneLine(ran.err);
  });
});

describe("a refusal keeps its own reason", () => {
  test("a settings file the system will not read says what the system said, never that it is no UTF-8", async () => {
    const folder = project({ "prototype.config.json": "{}", "design/a.html": single() });
    const ran = await without("read", [join(folder, "prototype.config.json")], () => cli(folder, "check", "design/a.html"));
    expect([ran.code, ran.err.includes("permission denied"), ran.err.includes("UTF-8"), ran.err.endsWith("[request.settings]")]).toEqual([
      2,
      true,
      false,
      true,
    ]);
    oneLine(ran.err);
  });

  test("on Windows a refused access, which the system tells as EPERM, has the words of a permission denied", () => {
    const refused = Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
    expect([systemError(refused, "win32")?.what, systemError(refused, "linux")?.what]).toEqual(["permission denied", "the system refused the change"]);
  });

  test("a stories index of another shape is refused with the reader's own words, as one refusal", async () => {
    let said: unknown = null;
    try {
      storiesOf([]);
    } catch (error) {
      said = error;
    }
    expect([said instanceof Refusal, (said as Refusal).rule]).toEqual([true, "request.file"]);
    const ran = await cli(project({ "design/a.html": single(), "index.json": "[]" }), "stories", "index.json", "design/a.html");
    expect([ran.code, ran.err]).toEqual([2, `problem: ${findingLine(finding("request.file", (said as Refusal).message))}`]);
  });

  test.each([
    ["the settings' tokens file", { "prototype.config.json": '{ "tokens": ["brand.css"] }', "brand.css": { link: "real.css" }, "real.css": ":root {}" }],
    ["the settings file", { "real.json": '{ "tokens": ["x.css"] }', "prototype.config.json": { link: "real.json" } }],
  ])("project refuses %s when it is a link, as every command does, never reads it as absent", async (_name, files) => {
    const ran = await cli(project(files), "project");
    expect([ran.code, ran.err.includes("is a link")]).toEqual([2, true]);
  });
});

describe("a fault of the tool", () => {
  test("exits 3 and says the tool failed, never that the design has a problem", async () => {
    const folder = project({ "design/ok.html": single() });
    const { run } = await import("../src/cli.ts");
    const err: string[] = [];
    const code = await run(
      ["check", "design/ok.html"],
      {
        out: () => {
          throw new Error("broken output");
        },
        err: (line) => err.push(line),
      },
      folder,
    );
    expect(code).toBe(3);
    expect(err.join("\n")).toContain("the tool failed");
  });

  test("a fault keeps the system's reason and code, and names no full path", async () => {
    const folder = project({ "design/ok.html": single() });
    const { run } = await import("../src/cli.ts");
    const err: string[] = [];
    const path = join(folder, "design/loop");
    const fault = Object.assign(new Error(`ELOOP: too many symbolic links encountered, open '${path}'`), { code: "ELOOP", path });
    const code = await run(
      ["check", "design/ok.html"],
      {
        out: () => {
          throw fault;
        },
        err: (line) => err.push(line),
      },
      folder,
    );
    const said = err.join("\n");
    expect([code, said.includes("ELOOP: too many symbolic links encountered"), said.includes("'design/loop'"), said.includes(SCRATCH)]).toEqual([
      3,
      true,
      true,
      false,
    ]);
  });
});

test("project finds no story index behind a linked folder, and reads no tokens file past its limit", async () => {
  const folder = project({
    "real/index.json": JSON.stringify({ v: 5, entries: {} }),
    "storybook-static": { link: "real" },
    "DESIGN.md": '---\ncolors:\n  ink: "#111111"\n---\n\n## Overview\n',
    "prototype.config.json": '{ "tokens": ["big.css"] }',
    "big.css": `:root { --color-ink: #222222; }\n${"/* filler */\n".repeat(90_000)}`,
  });
  const facts = JSON.parse((await cli(folder, "project")).out) as {
    story_index: string | null;
    design_md: { tokens: { name: string; light: string }[] };
    findings: { rule: string }[];
  };
  expect([facts.story_index, facts.design_md.tokens.find((token) => token.name === "--color-ink")?.light, facts.findings.map((item) => item.rule)]).toEqual([
    null,
    "#111111",
    ["system.tokens-file"],
  ]);
});

// A write that fails, as on a full disk, closes its file: here a value the system cannot write stands for the disk. The
// open files are counted in /dev/fd. Windows has no /dev/fd, and gives a new file the lowest free number, so there a
// file left open would hold that number, and the next file opened would take a higher one than before the writes.
const FILE_NUMBERS = WINDOWS || existsSync("/dev/fd");
test.skipIf(!FILE_NUMBERS)(
  `a write that fails leaves no file open and no temporary file${FILE_NUMBERS ? "" : " (skipped: no /dev/fd to count open files in)"}`,
  () => {
    const folder = project();
    const next = () => {
      const number = openSync(devNull, "r");
      closeSync(number);
      return number;
    };
    const open = WINDOWS ? next : () => readdirSync("/dev/fd").length;
    const before = open();
    for (let round = 0; round < 20; round++) {
      expect(() => writeWhole(join(folder, "a.txt"), {} as unknown as Uint8Array)).toThrow();
      expect(() => writeNew(join(folder, "b.txt"), {} as unknown as string)).toThrow();
    }
    expect([open() - before, readdirSync(folder)]).toEqual([0, []]);
  },
);

// exFAT, FAT32, and some network shares have no hard links, so the link that never writes over a file fails there with
// EPERM, ENOTSUP, or EXDEV. Here the link is one that fails so: the file is made by an exclusive create instead, which
// never writes over a file either, and any other fault of the link is still told.
test("a new file on a disk with no hard links is written whole, by an exclusive create that never writes over a file", () => {
  const folder = project();
  const failing = (code: string) => () => {
    throw Object.assign(new Error(`link failed: ${code}`), { code });
  };
  for (const code of ["EPERM", "ENOTSUP", "EXDEV"]) {
    const target = join(folder, `${code}.txt`);
    writeNew(target, "whole\n", failing(code));
    expect([code, readFileSync(target, "utf8")]).toEqual([code, "whole\n"]);
    let refused = "";
    try {
      writeNew(target, "over\n", failing(code));
    } catch (error) {
      refused = String((error as NodeJS.ErrnoException).code);
    }
    expect([code, refused, readFileSync(target, "utf8")]).toEqual([code, "EEXIST", "whole\n"]);
  }
  expect(() => writeNew(join(folder, "other.txt"), "x", failing("EACCES"))).toThrow("link failed: EACCES");
  expect(readdirSync(folder).sort()).toEqual(["ENOTSUP.txt", "EPERM.txt", "EXDEV.txt"]);
});

// A file's name comes from the disk, and git carries any byte in one: a name with escape codes would clear the screen,
// recolour the lines, or set the window's title, so no line prints a control character, and no such file is read.
test.skipIf(WINDOWS)(
  `a flow file whose name holds escape codes is a read finding, and no line prints a control character${onWindows("Windows refuses a file name that holds a control character, so no such file can be made")}`,
  async () => {
    const files = flowDesign();
    const flow = files["design/flows/items.html"] ?? "";
    const name = "design/flows/z\u001b[2J\u001b]0;TITLE\u0007.html";
    const folder = project({ ...files, [name]: flow });
    const ran = await cli(folder, "check", FLOW_DESIGN);
    expect([ran.code, /[\x00-\x08\x0b-\x1f\x7f]/.test(ran.out + ran.err), ran.out.includes("[read.file]")]).toEqual([1, false, true]);
  },
);
