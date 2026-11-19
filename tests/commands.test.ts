// The commands as a person runs them: their outputs against the stored manifests and the shipped schemas, their exit
// codes, and the same answer twice.
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, outputErrors, project, REPOSITORY } from "./helpers.ts";

describe("the shipped example and starter, and the synthetic flow design", () => {
  const folder = project(flowDesign());
  test("each passes the check", async () => {
    expect((await cli(folder, "check", FLOW_DESIGN)).out).toBe("ok: 3 screens, 7 states, 16 test ids");
    expect((await cli(folder, "new-design", "design/starter.html")).code).toBe(0);
    expect((await cli(folder, "check", "design/starter.html")).code).toBe(0);
    expect((await cli(folder, "example")).code).toBe(0);
    expect((await cli(folder, "check", ".prototype/example/app.html")).code).toBe(0);
  });

  test.each(["screens", "components", "shots"])("%s equals its stored manifest for the starter, byte for byte, and its schema", async (command) => {
    const ran = await cli(folder, command, "design/starter.html");
    expect(ran.code).toBe(0);
    expect(`${ran.out}\n`).toBe(readFileSync(join(REPOSITORY, "tests/golden", `starter-${command}.json`), "utf8"));
    expect(outputErrors(command, json(ran))).toEqual([]);
  });

  test("every command gives the same output twice", async () => {
    for (const argv of [
      ["check", "--json", FLOW_DESIGN],
      ["screens", FLOW_DESIGN],
      ["components", FLOW_DESIGN],
      ["shots", FLOW_DESIGN],
      ["shots", "--changed-component", "item-card", FLOW_DESIGN],
    ]) {
      expect(await cli(folder, ...argv)).toEqual(await cli(folder, ...argv));
    }
    await cli(folder, "build", FLOW_DESIGN);
    const first = readFileSync(join(folder, ".prototype/views", FLOW_DESIGN), "utf8");
    await cli(folder, "build", FLOW_DESIGN);
    expect(readFileSync(join(folder, ".prototype/views", FLOW_DESIGN), "utf8")).toBe(first);
  });

  test("check --json gives each problem's rule, file, and line, as its schema says", async () => {
    const broken = project({
      "design/case.html": single({
        screens: '<section data-proto-screen="a"><div data-proto-state="success"><button type="button">x</button></div></section>',
      }),
    });
    const ran = await cli(broken, "check", "--json", "design/case.html");
    expect(ran.code).toBe(1);
    expect(outputErrors("check", json(ran))).toEqual([]);
    expect(json<{ findings: unknown[] }>(ran).findings).toEqual([
      { rule: "integrity.testid", level: "problem", file: "design/case.html", line: 16, message: expect.stringContaining("has no data-testid") },
    ]);
  });
});

describe("one envelope for every command's JSON", () => {
  const broken = single({ screens: '<section data-proto-screen="a"><div data-proto-state="success"><button type="button">x</button></div></section>' });
  const unsafe = single({ screens: '<section data-proto-screen="a"><div data-proto-state="success" data-testid="s"><script>x()</script></div></section>' });
  const stateless = single({ screens: '<section data-proto-screen="a" data-testid="s"><p>x</p></section>' });
  const folder = project({
    ...flowDesign(),
    "design/ok.html": single(),
    "design/bad.html": broken,
    "design/unsafe.html": unsafe,
    "design/stateless.html": stateless,
    "c.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "start", state: "success", comment: "c" }] }),
    "none.json": JSON.stringify({ v: 5, entries: {} }),
    "all.json": JSON.stringify({ v: 5, entries: { "a--default": { type: "story", title: "Item card", name: "Default" } } }),
  });
  // Each command that ends, as it works, as a design stops it, and as it is refused: [the command's shape, argv, exit code].
  const runs: [string, string[], number][] = [
    ["check", ["check", "design/ok.html"], 0],
    ["check", ["check", "design/bad.html"], 1],
    ["check", ["check", FLOW_DESIGN], 0],
    ["check", ["check", "design/nope.html"], 2],
    ["build", ["build", "design/ok.html"], 0],
    ["build", ["build", "design/unsafe.html"], 1],
    ["build", ["build", "../x.html"], 2],
    ["screens", ["screens", "design/ok.html"], 0],
    ["screens", ["screens", "design/unsafe.html"], 1],
    ["screens", ["screens", "design/a b.html"], 2],
    ["components", ["components", FLOW_DESIGN], 0],
    ["components", ["components", "design/unsafe.html"], 1],
    ["shots", ["shots", "design/ok.html"], 0],
    ["shots", ["shots", "design/stateless.html"], 1],
    ["shots", ["shots", "--frames", "nope", "design/ok.html"], 2],
    ["stories", ["stories", "none.json", FLOW_DESIGN], 1],
    ["stories", ["stories", "missing.json", FLOW_DESIGN], 2],
    ["new-design", ["new-design", "design/fresh.html"], 0],
    ["new-design", ["new-design", "design/ok.html"], 2],
    ["save-comments", ["save-comments", "c.json", "design/ok.html"], 0],
    ["save-comments", ["save-comments", "nope.json", "design/ok.html"], 2],
    ["example", ["example"], 0],
    ["guide", ["guide"], 0],
    ["guide", ["guide", "--reference"], 0],
    ["guide", ["guide", "--op"], 2],
    ["project", ["project"], 0],
    ["new-design-md", ["new-design-md", "--name", "Cases"], 0],
    ["new-design-md", ["new-design-md"], 2],
    ["project", ["project"], 0],
  ];
  test.each(runs)("%s: %p exits %p, one object its shape holds", async (command, argv, code) => {
    const ran = await cli(folder, ...argv, "--json");
    expect(ran.code).toBe(code);
    const data = json<{ ok: boolean; findings: { rule: string; level: string }[] }>(ran);
    expect(outputErrors(command, data)).toEqual([]);
    // ok says the exit code, and a command that does not end with 0 names why in its findings.
    expect(data.ok).toBe(code === 0);
    if (code !== 0) expect(data.findings.some((item) => item.level === "problem")).toBe(true);
    if (code === 2) expect(data.findings.map((item) => item.rule.split(".")[0])).toEqual(["request"]);
  });
  test("a capture with no Chrome is a refused request, with its request finding", async () => {
    const saved = process.env.CHROME_BIN;
    process.env.CHROME_BIN = "";
    try {
      const ran = await cli(folder, "shots", "--capture", "--json", "design/ok.html");
      const data = json<{ ok: boolean; findings: { rule: string }[] }>(ran);
      expect([ran.code, data.ok, data.findings.map((item) => item.rule), outputErrors("shots", data)]).toEqual([2, false, ["request.browser"], []]);
    } finally {
      if (saved === undefined) delete process.env.CHROME_BIN;
      else process.env.CHROME_BIN = saved;
    }
  });
});

describe("the design document's commands, and the new rules' findings", () => {
  test("project equals its stored output on the existing test project, byte for byte, and its schema", async () => {
    const folder = project();
    cpSync(join(REPOSITORY, "tests/projects/existing"), folder, { recursive: true });
    const ran = await cli(folder, "project");
    expect(ran.code).toBe(0);
    expect(`${ran.out}\n`).toBe(readFileSync(join(REPOSITORY, "tests/golden/existing-project.json"), "utf8"));
    expect(outputErrors("project", json(ran))).toEqual([]);
  });
  test("project prints each token as the page draws it after the token files, and no value where a file sets it in a way the tool does not follow", async () => {
    const drawn = async (css: string) => {
      const folder = project();
      cpSync(join(REPOSITORY, "tests/projects/existing"), folder, { recursive: true });
      writeFileSync(join(folder, "tokens/brand.css"), css);
      const tokens = json<{ design_md: { tokens: { path: string; light: string; dark: string }[] } }>(await cli(folder, "project", "--json")).design_md.tokens;
      return ["colors.primary", "components.button-primary.backgroundColor"].map((path) => {
        const token = tokens.find((item) => item.path === path);
        return `${token?.light} ${token?.dark}`;
      });
    };
    expect(await drawn(':root { --color-primary: #1d4ed8; }\n:root[data-proto-theme="dark"] { --color-primary: #93c5fd; }\n')).toEqual([
      "#1d4ed8 #93c5fd",
      "#1d4ed8 #93c5fd",
    ]);
    expect(await drawn(":root { --color-primary: light-dark(#111111, #eeeeee); }\n")).toEqual(["#111111 #eeeeee", "#111111 #eeeeee"]);
    expect(await drawn("@media (prefers-color-scheme: dark) { :root { --color-primary: #93c5fd; } }\n")).toEqual([" ", " "]);
  });
  test("project exits 1 with the document's problem in its findings", async () => {
    const ran = await cli(project({ "DESIGN.md": "---\ncolors: [\n---\n" }), "project", "--json");
    const data = json<{ ok: boolean; findings: { rule: string; file: string; line: number }[] }>(ran);
    expect([ran.code, data.ok, data.findings.map((item) => `${item.rule} ${item.file}:${item.line}`), outputErrors("project", data)]).toEqual([
      1,
      false,
      ["system.read DESIGN.md:1"],
      [],
    ]);
  });
  test("project gives a tokens file it cannot read, or one past its limit, as a finding, never as a file with no values", async () => {
    const ran = await cli(
      project({
        "DESIGN.md": '---\ncolors:\n  accent: "#111111"\n---\n',
        "prototype.config.json": '{ "tokens": ["bad.css", "big.css"] }',
        "bad.css": { bytes: new Uint8Array([0x3a, 0xff, 0xfe, 0x0a]) },
        "big.css": `:root { --color-accent: #222222; }\n${"/* filler */\n".repeat(90_000)}`,
      }),
      "project",
    );
    const data = json<{ ok: boolean; findings: { rule: string; file: string }[] }>(ran);
    expect([ran.code, data.ok, data.findings.map((item) => `${item.rule} ${item.file}`), outputErrors("project", data)]).toEqual([
      1,
      false,
      ["read.tokens bad.css", "read.tokens big.css"],
      [],
    ]);
  });
  test("project follows a token that names another ten times at each of seven steps within a second, and gives its first long step as a finding", async () => {
    const chain = Array.from({ length: 7 }, (_, index) => `  --t${index + 1}: ${Array(10).fill(`var(--t${index})`).join(" ")};`).join("\n");
    const folder = project({
      "DESIGN.md": '---\ncolors:\n  accent: "#111111"\n---\n',
      "prototype.config.json": '{ "tokens": ["t.css"] }',
      "t.css": `:root {\n  --t0: red;\n${chain}\n  --color-accent: var(--t7);\n}\n`,
    });
    const started = performance.now();
    const ran = await cli(folder, "project");
    const data = json<{ findings: { rule: string; file: string; line: number }[]; design_md: { tokens: { name: string; light: string }[] } }>(ran);
    expect([
      performance.now() - started < 1000,
      ran.out.length < 100_000,
      data.findings.map((item) => `${item.rule} ${item.file}:${item.line}`),
      data.design_md.tokens.find((token) => token.name === "--color-accent")?.light,
    ]).toEqual([true, true, ["read.var-limit t.css:7"], ""]);
  });
  test("a check with system and accessibility findings keeps its schema, each rule's id to the pattern", async () => {
    const design = single({
      screens: '<section data-proto-screen="a"><div data-proto-state="b" data-testid="s"><h3>x</h3><p style="color: var(--color-nope)">y</p></div></section>',
    }).replace(' lang="en"', "");
    const ran = await cli(project({ "DESIGN.md": '---\ncolors:\n  a: "#fff"\n---\n', "design/a.html": design }), "check", "--json", "design/a.html");
    const data = json<{ findings: { rule: string }[] }>(ran);
    expect(data.findings.map((item) => item.rule).sort()).toEqual([
      "accessibility.heading-skip",
      "accessibility.lang",
      "system.extra-token",
      "system.unknown-token",
    ]);
    expect(outputErrors("check", data)).toEqual([]);
  });
});

describe("a component in a list's item template", () => {
  const folder = project({
    "design/case.html": single({
      screens:
        '<section data-proto-screen="start"><div data-proto-state="success"><button type="button" data-proto-go="list" data-testid="start-go">Go</button></div></section>\n<section data-proto-screen="list"><div data-proto-state="success" data-testid="list-ok"><ul data-proto-list="items"><template data-proto-item><li data-proto-component="row-card" data-testid="row"><span data-proto-field="name"></span></li></template></ul></div></section>',
      fixtures: '{ "product": "Cases", "items": [{ "name": "One" }] }',
    }),
  });
  test("sits on the screens whose lists repeat it, in components and in shots", async () => {
    expect(json<{ components: unknown[] }>(await cli(folder, "components", "design/case.html")).components).toEqual([
      { name: "row-card", variants: ["default"], screens: ["list"], testids: ["row"] },
    ]);
    const shots = json<{ shots: { screen: string; purpose: string }[] }>(
      await cli(folder, "shots", "--changed-component", "row-card", "design/case.html"),
    ).shots;
    expect(new Set(shots.map((shot) => shot.screen))).toEqual(new Set(["list"]));
  });
});

describe("the one table of exit codes", () => {
  const sound = single();
  const broken = single({ screens: '<section data-proto-screen="a"><div data-proto-state="success"><button type="button">x</button></div></section>' });
  const folder = project({ "design/ok.html": sound, "design/bad.html": broken, "design/my file.html": sound, "c.json": "{}" });
  // 0: the command did its work and the design has no problem; 1: the design has a problem; 2: the request was refused.
  test.each([
    [["check", "design/ok.html"], 0],
    [["check", "design/bad.html"], 1],
    [["check", "design/nope.html"], 2],
    [["check"], 2],
    [["build", "design/ok.html"], 0],
    [["build", "design/bad.html"], 1],
    [["build", "../x.html"], 2],
    [["screens", "design/ok.html"], 0],
    [["screens", "design/my file.html"], 2],
    [["components", "design/bad.html"], 0],
    [["components", "/etc/passwd"], 2],
    [["shots", "design/ok.html"], 0],
    [["shots", "--frames", "nope", "design/ok.html"], 2],
    [["shots", "--capture", "--out", "/tmp", "design/ok.html"], 2],
    [["stories", "missing.json", "design/ok.html"], 2],
    [["new-design", "design/ok.html"], 2],
    [["new-design", "design/new.html"], 0],
    [["example"], 0],
    [["save-comments", "c.json", "design/ok.html"], 2],
    [["serve", "--port", "70000", "design/ok.html"], 2],
    [["check", "--op"], 2],
    [["nothing"], 2],
    [["--help"], 0],
  ])("%p exits %p", async (argv, code) => {
    expect((await cli(folder, ...argv)).code).toBe(code);
  });
});

describe("paths", () => {
  const folder = project({ "design/ok.html": single(), "outside.html": single() });
  symlinkSync(join(folder, ".."), join(folder, "linked"));
  const bad = ["../outside.html", "/etc/hosts", "linked/outside.html", "design/a b.html", "design/a\u0000.html", "design\\ok.html"];
  test.each(["check", "build", "screens", "components", "shots", "serve", "new-design", "save-comments"])(
    "%s refuses each in one line, with exit code 2",
    async (command) => {
      for (const path of bad) {
        const argv = command === "save-comments" ? [command, "c.json", path] : [command, path];
        const ran = await cli(folder, ...argv);
        expect(ran.code).toBe(2);
        expect(ran.err.split("\n").length).toBe(1);
        expect(ran.err).toStartWith("problem: ");
      }
    },
  );
  test("an output folder that is a link or a file is refused in one line, and nothing is written through it", async () => {
    const linked = project({ "design/ok.html": single() });
    symlinkSync("/tmp", join(linked, ".prototype"));
    const ran = await cli(linked, "build", "design/ok.html");
    expect(ran.code).toBe(2);
    expect(ran.err.split("\n")).toHaveLength(1);
    const file = project({ "design/ok.html": single(), ".prototype": "x" });
    expect((await cli(file, "build", "design/ok.html")).code).toBe(2);
    expect((await cli(file, "--out-dir", "../out", "build", "design/ok.html")).code).toBe(2);
  });
  test("the output folder ignores itself", async () => {
    const out = project({ "design/ok.html": single() });
    await cli(out, "build", "design/ok.html");
    expect(readFileSync(join(out, ".prototype/.gitignore"), "utf8")).toBe("*\n");
    expect(existsSync(join(out, ".prototype/views/design/ok.html"))).toBe(true);
  });
});
