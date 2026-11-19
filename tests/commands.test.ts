// The commands as a person runs them: their outputs against the stored manifests and the shipped schemas, their exit
// codes, and the same answer twice.
import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shippedDevices } from "../src/assets.ts";
import { FLOW_ID, KEBAB, SCREEN_ID } from "../src/format.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { answerWithin, cli, json, outputErrors, project, REPOSITORY } from "./helpers.ts";

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
      ["system.tokens-file bad.css", "system.tokens-file big.css"],
      [],
    ]);
  });
  test("project follows a token that names another ten times at each of seven steps within 4 seconds, and gives its first long step as a finding", async () => {
    const chain = Array.from({ length: 7 }, (_, index) => `  --t${index + 1}: ${Array(10).fill(`var(--t${index})`).join(" ")};`).join("\n");
    const folder = project({
      "DESIGN.md": '---\ncolors:\n  accent: "#111111"\n---\n',
      "prototype.config.json": '{ "tokens": ["t.css"] }',
      "t.css": `:root {\n  --t0: red;\n${chain}\n  --color-accent: var(--t7);\n}\n`,
    });
    // In a process of its own, stopped at the ceiling, as `answerWithin` says why.
    const script = `import { run } from "./src/cli.ts";
const out = [];
const code = await run(["project"], { out: (line) => out.push(line), err: () => {} }, ${JSON.stringify(folder)});
console.log(JSON.stringify({ code, out: out.join("\\n") }));`;
    const { answer, within } = await answerWithin<{ code: number; out: string }>(script, 4_000);
    const data = JSON.parse(answer?.out ?? "{}") as Partial<{
      findings: { rule: string; file: string; line: number }[];
      design_md: { tokens: { name: string; light: string }[] };
    }>;
    expect([
      within,
      (answer?.out.length ?? 0) < 100_000,
      data.findings?.map((item) => `${item.rule} ${item.file}:${item.line}`),
      data.design_md?.tokens.find((token) => token.name === "--color-accent")?.light,
    ]).toEqual([true, true, ["read.var-limit t.css:7"], ""]);
  });
  test("a check with system and accessibility findings keeps its schema, each rule's id to the pattern", async () => {
    const design = single({
      screens: '<section data-proto-screen="a"><div data-proto-state="b" data-testid="s"><h3>x</h3><p style="color: var(--color-nope)">y</p></div></section>',
    }).replace(' lang="en"', "");
    const ran = await cli(project({ "DESIGN.md": '---\ncolors:\n  a: "#fff"\n---\n', "design/a.html": design }), "check", "--json", "design/a.html");
    const data = json<{ findings: { rule: string }[] }>(ran);
    expect(data.findings.map((item) => item.rule).sort()).toEqual([
      "accessibility.headings",
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

test("--changed-component on a design with no component says it marks none", async () => {
  const ran = await cli(project({ "design/a.html": single() }), "shots", "--changed-component", "nope", "design/a.html");
  expect([ran.code, ran.err]).toEqual([
    2,
    expect.stringContaining('no screen shows the component "nope": the design marks no component with data-proto-component, so leave --changed-component out'),
  ]);
});

describe("a shot's file name", () => {
  const go = (to: string, id: string) => `<button type="button" data-proto-go="${to}" data-testid="${id}">Go</button>`;
  const section = (id: string, state: string, inner: string) =>
    `<section data-proto-screen="${id}"><div data-proto-state="${state}" data-testid="${id}-${state}">${inner}</div></section>`;
  const files = async (folder: string) =>
    json<{ shots: { file: string }[] }>(await cli(folder, "shots", "--frames", "320", "--json", "design/case.html")).shots.map((shot) => shot.file);

  test("joins its parts with a character no id of the device table holds, nor a screen id, a state, a flow, a component, or a variant", () => {
    const ids = [...shippedDevices().frames.keys()];
    expect(ids.filter((id) => /[.+]/.test(id))).toEqual([]);
    for (const pattern of [SCREEN_ID, KEBAB, FLOW_ID]) expect([pattern.test("a.b"), pattern.test("a+b")]).toEqual([false, false]);
  });

  test("a screen `a-b` in the state `c` and a screen `a` in the state `b-c` each get their own shots", async () => {
    const folder = project({
      "design/case.html": single({ screens: `${section("a-b", "c", go("a/b-c", "ab-go"))}\n${section("a", "b-c", go("a-b/c", "a-go"))}` }),
    });
    const names = await files(folder);
    expect(names.length).toBe(6);
    expect(new Set(names).size).toBe(6);
    expect(names).toContain("a-b.c.320.light.png");
    expect(names).toContain("a.b-c.320.light.png");
    expect(names).toContain("a.b-c.320.light.text-200.png");
  });

  test("a main screen `items-list` and a flow's screen `items:list` each get their own shots", async () => {
    const folder = project({
      "design/case.html": single({
        screens: `${section("items-list", "success", go("items:list", "main-go"))}\n<div data-proto-flow="items" data-proto-title="Items"></div>`,
      }),
      "design/flows/items.html": `${section("list", "success", go("items-list", "flow-go"))}\n`,
    });
    const names = await files(folder);
    expect(names.length).toBe(6);
    expect(names).toContain("items-list.success.320.light.png");
    expect(names).toContain("items+list.success.320.light.png");
  });

  test("two screens whose ids differ only by case are a problem, in a flow as at the top, since a disk that ignores case keeps one picture", async () => {
    const folder = project({
      "design/case.html": single({
        screens: `${section("Home", "success", go("home", "top-go"))}\n${section("home", "success", go("items:Row", "top-back"))}\n<div data-proto-flow="items" data-proto-title="Items"></div>`,
      }),
      "design/flows/items.html": `${section("Row", "success", go("row", "flow-go"))}\n${section("row", "success", go("Home", "flow-back"))}\n`,
    });
    const ran = await cli(folder, "check", "--json", "design/case.html");
    const found = json<{ findings: { rule: string; file: string }[] }>(ran).findings.filter((item) => item.rule === "integrity.screen-repeat");
    expect([ran.code, found.map((item) => item.file)]).toEqual([1, ["design/case.html", "design/flows/items.html"]]);
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
  test("an output folder that already exists gets no ignore file, so the files it holds stay seen", async () => {
    const given = project({ "design/ok.html": single() });
    await cli(given, "build", "design/ok.html", "--out-dir", "design");
    expect([existsSync(join(given, "design/.gitignore")), existsSync(join(given, "design/views/design/ok.html"))]).toEqual([false, true]);
    const set = project({ "design/ok.html": single(), "docs/notes.md": "Notes.\n", "prototype.config.json": '{ "out_dir": "docs" }' });
    await cli(set, "build", "design/ok.html");
    expect([existsSync(join(set, "docs/.gitignore")), existsSync(join(set, "docs/views/design/ok.html"))]).toEqual([false, true]);
    // A folder the tool made keeps its ignore file, and one a person took away is not written again.
    const made = project({ "design/ok.html": single() });
    await cli(made, "build", "design/ok.html");
    rmSync(join(made, ".prototype/.gitignore"));
    await cli(made, "build", "design/ok.html");
    expect(existsSync(join(made, ".prototype/.gitignore"))).toBe(false);
    // A folder that exists and holds nothing yet has nothing to hide, so it gets the ignore file as a new one does:
    // a person who made `.prototype` by hand must not find its pages in a commit.
    const empty = project({ "design/ok.html": single() });
    mkdirSync(join(empty, ".prototype"));
    await cli(empty, "build", "design/ok.html");
    expect(readFileSync(join(empty, ".prototype/.gitignore"), "utf8")).toBe("*\n");
  });
  test("only the example's pages take .example/; every other design's page is its own path, so no two share a page", async () => {
    // A design outside the output folder, one inside it, one in the example's folder, and one of the person's with a part
    // named `.example`, which the path rule allows only below the output folder: each page, and no two the same.
    const designs = ["design/a.html", ".prototype/a.html", ".prototype/example/a.html", ".prototype/.example/a.html"];
    const pages = [
      ".prototype/views/design/a.html",
      ".prototype/views/.prototype/a.html",
      ".prototype/views/.example/a.html",
      ".prototype/views/.prototype/.example/a.html",
    ];
    const folder = project(Object.fromEntries(designs.map((design) => [design, single()])));
    for (const design of designs) expect((await cli(folder, "build", design)).code).toBe(0);
    expect(pages.map((page) => existsSync(join(folder, page)))).toEqual([true, true, true, true]);
    expect(new Set(pages).size).toBe(pages.length);
    // Built into a folder of the person's, a design in it takes its own path, a `.example` part in it too.
    const theirs = project({ "design/a.html": single(), "design/.example/a.html": single() });
    for (const design of ["design/a.html", "design/.example/a.html"]) expect((await cli(theirs, "build", design, "--out-dir", "design")).code).toBe(0);
    expect([existsSync(join(theirs, "design/views/design/a.html")), existsSync(join(theirs, "design/views/design/.example/a.html"))]).toEqual([true, true]);
    expect(existsSync(join(theirs, "design/views/.a.html"))).toBe(false);
    // A design whose findings stop its page loses its old page at the same place.
    const unsafe = single({ screens: '<section data-proto-screen="a"><div data-proto-state="success" data-testid="s"><script>x()</script></div></section>' });
    writeFileSync(join(theirs, "design/a.html"), unsafe);
    expect((await cli(theirs, "build", "design/a.html", "--out-dir", "design")).code).toBe(1);
    expect(existsSync(join(theirs, "design/views/design/a.html"))).toBe(false);
    // An output folder that starts with `.example` would give a design in it the example's page, so it is refused.
    for (const out of [".example", ".example/out"]) {
      const ran = await cli(theirs, "build", "design/a.html", "--out-dir", out);
      expect([ran.code, ran.err]).toEqual([2, expect.stringMatching(/^problem: the output folder \.example.* starts with \.example, .*\[request\.path\]$/)]);
    }
  });
  test("example writes over no file of a folder of the person's, and over its own copy in a folder the tool made", async () => {
    const theirs = project({ "design/ok.html": single(), "design/example/app.html": "mine\n" });
    const ran = await cli(theirs, "example", "--out-dir", "design");
    expect([ran.code, ran.err]).toEqual([2, expect.stringMatching(/^problem: design\/example\/app\.html exists, .*\[request\.exists\]$/)]);
    expect([readFileSync(join(theirs, "design/example/app.html"), "utf8"), existsSync(join(theirs, "design/example/flows"))]).toEqual(["mine\n", false]);
    // A folder of the person's with no example in it takes one, once.
    const empty = project({ "design/ok.html": single() });
    expect((await cli(empty, "example", "--out-dir", "design")).code).toBe(0);
    expect((await cli(empty, "example", "--out-dir", "design")).code).toBe(2);
    // The tool's own folder is written again each time, an edit of the example's files with it.
    const made = project({ "design/ok.html": single() });
    expect((await cli(made, "example")).code).toBe(0);
    writeFileSync(join(made, ".prototype/example/app.html"), "edited\n");
    expect((await cli(made, "example")).code).toBe(0);
    expect(readFileSync(join(made, ".prototype/example/app.html"), "utf8")).toStartWith("<!doctype html>");
  });
});
