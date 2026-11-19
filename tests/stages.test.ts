// The stages, composed through the one public entry: a design read, loaded, checked, listed, and built with no command
// line. And the rules those stages hold: what stops a page, the findings a silent pass used to hide, the limit on
// parts, and a file named by every finding.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as entry from "../src/index.ts";
import { CASES, FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project, schema, schemaErrors } from "./helpers.ts";

type Finding = { rule: string; level: string; file: string | null; line: number | null };

const findings = async (folder: string, ...file: string[]) => json<{ findings: Finding[] }>(await cli(folder, "check", "--json", ...file)).findings;

// What the command line does, a composer can do through the entry alone: write an example, read a story index, and
// serve a page it can stop.
test("the entry writes an example, reads a story index, and serves a page with a server it can close", async () => {
  const folder = project({ "storybook-static/index.json": JSON.stringify({ v: 5, entries: {} }) });
  const config = entry.loadProject(folder, {});
  const { written } = entry.writeExample(config);
  const index = entry.readStoryIndex(folder, "storybook-static/index.json");
  const served = await entry.listen({ page: () => "<p>x</p>", lan: false, port: 0, token: "", hosts: ["127.0.0.1"] });
  if ("server" in served) served.server.close();
  expect([written.includes(".prototype/example/app.html"), entry.storiesOf(index).size, "server" in served]).toEqual([true, 0, true]);
});

describe("the public entry", () => {
  test("runs a design through every stage, with no command line", () => {
    const folder = project({ "design/case.html": single() });
    const config = entry.loadProject(folder, {});
    const files = entry.readFiles(config, "design/case.html");
    const design = entry.load(files);
    const found = entry.check(design, config);
    expect(found).toEqual([]);
    const facts = design.facts;
    if (!facts) throw new Error("no facts");
    expect(entry.screensOf(facts).map((screen) => screen.id)).toEqual(["start"]);
    expect(entry.componentContract(facts).components).toEqual([]);
    expect(entry.shotList(facts, config.devices.frames, { components: [], screens: [], frames: ["1024"], themes: ["light"] }).shots.length).toBe(3);
    const text = entry.page({ design, findings: found, rounds: entry.readRounds(design.rounds, design.name).rounds, project: config }, entry.viewerAssets());
    expect(text).toContain('<section data-proto-screen="start"');
    expect(schemaErrors(entry.pageConfig({ design, findings: found, rounds: [], project: config }), schema("page-config"))).toEqual([]);
  });

  test("a finding whose rule the registry lacks is a fault of check, never dropped in silence", () => {
    const folder = project({ "design/case.html": single() });
    const config = entry.loadProject(folder, {});
    const design = entry.load(entry.readFiles(config, "design/case.html"));
    design.tokenFindings.push({ rule: "nope.nope" as entry.RuleId, file: null, line: null, message: "x" });
    expect(() => entry.check(design, config)).toThrow("which the registry lacks");
  });

  test("check reads the device table of the settings it is given, each time: one design under two settings gets each one's findings", () => {
    const folder = project({
      "design/case.html": single({
        screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><div data-proto-device="1024"></div></div></section>',
      }),
    });
    const config = entry.loadProject(folder, {});
    const design = entry.load(entry.readFiles(config, "design/case.html"));
    const unknown = (settings: entry.Project) => entry.check(design, settings).filter((item) => item.rule === "device.unknown").length;
    const none = { ...config, devices: { ...config.devices, frames: new Map() } };
    expect([unknown(config), unknown(none), unknown(config)]).toEqual([0, 1, 0]);
  });

  test("tells a refused request from a fault by its type, makes the default shot list, and writes the page", () => {
    const folder = project({ "design/case.html": single() });
    const config = entry.loadProject(folder, {});
    let refused: unknown = null;
    try {
      entry.readFiles(config, "design/nope.html");
    } catch (error) {
      refused = error;
    }
    expect([refused instanceof entry.Refusal, (refused as InstanceType<typeof entry.Refusal>).rule, refused instanceof entry.Unreadable]).toEqual([
      true,
      "request.path",
      false,
    ]);
    const design = entry.load(entry.readFiles(config, "design/case.html"));
    const facts = design.facts;
    if (!facts) throw new Error("no facts");
    const frames = entry.shotFrames(design.platforms, config.devices);
    expect(frames.length).toBeGreaterThan(0);
    const shots = entry.shotList(facts, config.devices.frames, { components: [], screens: [], frames, themes: design.themes }).shots;
    expect(shots.length).toBe(frames.length + 2);
    const text = entry.page({ design, findings: [], rounds: [], project: config }, entry.viewerAssets());
    expect(readFileSync(entry.writePage(config, design, text), "utf8")).toBe(text);
    expect([entry.READ_LIMITS.uses, entry.ROUND_LIMITS.comment_characters]).toEqual([5000, 2000]);
  });
});

describe("the page's settings block", () => {
  const config = (html: string) =>
    JSON.parse(/<script type="application\/json" id="page-config">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "{}") as Record<string, unknown>;
  test.each([
    [
      "a single design",
      { "design/case.html": single({ head: '<meta name="work-item" content="#123">\n' }) },
      ["build", "design/case.html"],
      "design/case.html",
    ],
    ["a design with flows", flowDesign(), ["build", FLOW_DESIGN], FLOW_DESIGN],
  ])("%s carries page-config as its schema says", async (_what, files, command, name) => {
    const folder = project(files);
    await cli(folder, ...command);
    const block = config(readFileSync(join(folder, ".prototype/views", name), "utf8"));
    expect(schemaErrors(block, schema("page-config"))).toEqual([]);
  });

  test("a work item is any text with no space", async () => {
    const folder = project({ "design/case.html": single({ head: '<meta name="work-item" content="#123">\n' }) });
    await cli(folder, "build", "design/case.html");
    expect(config(readFileSync(join(folder, ".prototype/views/design/case.html"), "utf8")).work_item).toBe("#123");
  });
});

describe("what stops a page", () => {
  test("a structure problem is shown in the page, and the page is written", async () => {
    const folder = project({
      "design/case.html": single({ screens: '<section data-proto-screen="start"><div data-proto-state="Not Kebab" data-testid="s">x</div></section>' }),
    });
    const ran = await cli(folder, "build", "design/case.html");
    expect(ran.code).toBe(1);
    expect(existsSync(join(folder, ".prototype/views/design/case.html"))).toBe(true);
  });

  test("an unsafe form stops it, and removes the page an earlier build wrote", async () => {
    const folder = project({ "design/case.html": single() });
    await cli(folder, "build", "design/case.html");
    await Bun.write(
      join(folder, "design/case.html"),
      single({ screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><script>x()</script></div></section>' }),
    );
    expect((await cli(folder, "build", "design/case.html")).code).toBe(1);
    expect(existsSync(join(folder, ".prototype/views/design/case.html"))).toBe(false);
  });

  test("an unsafe form past the findings' limit still stops it", async () => {
    const many = Array.from({ length: 230 }, (_, i) => `<button type="button" data-testid="start-b${i}"></button>`).join("\n");
    const folder = project({
      "design/case.html": single({
        screens: `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">${many}\n<script>x()</script></div></section>`,
      }),
    });
    expect((await cli(folder, "build", "design/case.html")).code).toBe(1);
    expect(existsSync(join(folder, ".prototype/views/design/case.html"))).toBe(false);
  });
});

describe("silent passes made findings", () => {
  test("a key the fixtures lack", async () => {
    const screen = (key: string) =>
      `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><p data-proto-text="${key}"></p></div></section>`;
    expect(
      (await findings(project({ "design/case.html": single({ screens: screen("welcom") }) }), "design/case.html")).map((item) => [item.rule, item.line]),
    ).toEqual([["integrity.fixture-key", 16]]);
    expect(await findings(project({ "design/case.html": single({ screens: screen("welcome") }) }), "design/case.html")).toEqual([]);
  });

  test("a field its list's items lack", async () => {
    const files = flowDesign();
    files["design/blocks/item-card.html"] = (files["design/blocks/item-card.html"] ?? "").replace('data-proto-field="meta"', 'data-proto-field="meat"');
    const found = (await findings(project(files), FLOW_DESIGN)).filter((item) => item.rule === "integrity.fixture-key");
    expect(found.map((item) => item.file)).toContain("design/blocks/item-card.html");
  });

  test("one test id on two states of a screen", async () => {
    const screens =
      '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><button type="button" data-testid="go">Go</button></div><div data-proto-state="empty" data-testid="e"><button type="button" data-testid="go">Go</button></div></section>';
    expect((await findings(project({ "design/case.html": single({ screens }) }), "design/case.html")).map((item) => item.rule)).toEqual([
      "integrity.testid-repeat",
    ]);
  });
});

describe("the limit of blocks", () => {
  const flowOf = (id: string, uses: number) =>
    `<section data-proto-screen="${id}" data-proto-title="A screen"><div data-proto-state="success" data-testid="${id}-ok">\n${Array.from({ length: uses }, () => '<p data-proto-use="leaf"></p>').join("\n")}\n</div></section>\n`;
  const withFlows = (flows: number[]) => {
    const files = flowDesign();
    const extraNav = flows.map((_, index) => `<button type="button" data-proto-go="big-${index}:s" data-testid="nav-big-${index}">Big</button>`).join("");
    const extraFlows = flows.map((_, index) => `<div data-proto-flow="big-${index}" data-proto-title="Big"></div>`).join("\n");
    files[FLOW_DESIGN] = (files[FLOW_DESIGN] ?? "").replace("</nav>", `${extraNav}</nav>`).replace("</main>", `${extraFlows}\n</main>`);
    files["design/blocks/leaf.html"] = "<p>x</p>\n";
    flows.forEach((uses, index) => {
      files[`design/flows/big-${index}.html`] = flowOf("s", uses);
    });
    return files;
  };

  test("counts the blocks of each flow, so a large design of flows within it reads whole", async () => {
    const found = await findings(project(withFlows([4000, 4000, 4000])), FLOW_DESIGN);
    expect(found.filter((item) => item.level === "problem")).toEqual([]);
  });

  test("a flow past it stops the read, and that is the one finding", async () => {
    const folder = project(withFlows([100, 5001]));
    expect((await findings(folder, FLOW_DESIGN)).map((item) => [item.rule, item.file])).toEqual([["read.use-limit", "design/flows/big-1.html"]]);
    expect((await cli(folder, "build", FLOW_DESIGN)).code).toBe(1);
    expect(existsSync(join(folder, ".prototype/views", FLOW_DESIGN))).toBe(false);
  });

  test("a single-file design past it stops the read with the one finding, and no other", async () => {
    const folder = project({ "design/case.html": single({ screens: flowOf("start", 5001) }), "design/blocks/leaf.html": "<p>x</p>\n" });
    expect((await findings(folder, "design/case.html")).map((item) => item.rule)).toEqual(["read.use-limit"]);
  });

  test("the text the blocks add is counted for the whole design", async () => {
    const files = withFlows([2000, 2000]);
    files["design/blocks/leaf.html"] = `<p>${"x".repeat(600)}</p>\n`;
    expect((await findings(project(files), FLOW_DESIGN)).map((item) => item.rule)).toEqual(["read.use-limit"]);
  });
});

describe("a finding's file", () => {
  // A block, a round, and a flow design's files, each with a fault, beside the recorded cases.
  const block = '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><div data-proto-use="row"></div></div></section>';
  const extra: Record<string, Record<string, string>> = {
    "a design's block and round": {
      "design/deep/case.html": single({ screens: block }),
      "design/deep/blocks/row.html": '<button type="button" data-proto-go="nowhere" data-testid="row-go">Go</button>\n',
      "design/deep/rounds/case/1/comments.json":
        '{ "round": 1, "items": [{ "id": "r1-1", "screen": "start", "state": "success", "comment": "c" }], "extra": 1 }',
      "design/deep/rounds/case/2/changes.json": '{ "changes": [{ "summary": "x", "answers": ["r9-9"] }] }',
    },
    "a flow design's block and round": (() => {
      const files = flowDesign();
      files["design/blocks/item-card.html"] = (files["design/blocks/item-card.html"] ?? "").replace('data-proto-field="meta"', 'data-proto-field="meat"');
      files["design/rounds/app/1/changes.json"] = '{ "changes": [{ "answers": [] }] }';
      return files;
    })(),
  };
  test("is named from the project's top, so it opens from there", async () => {
    const unopened: string[] = [];
    const runs: [string, Record<string, unknown>, string[][]][] = [
      ...CASES.map((item): [string, Record<string, unknown>, string[][]] => [
        item.name,
        item.files,
        item.commands.filter((command) => command[0] === "check" && command.includes("--json")),
      ]),
      ...Object.entries(extra).map(([name, files]): [string, Record<string, unknown>, string[][]] => [
        name,
        files,
        [["check", "--json", name.startsWith("a design") ? "design/deep/case.html" : FLOW_DESIGN]],
      ]),
    ];
    let named = 0;
    for (const [name, files, commands] of runs) {
      if (!commands.length) continue;
      const folder = project(files as Record<string, string>);
      for (const command of commands) {
        for (const found of json<{ findings: Finding[] }>(await cli(folder, ...command)).findings) {
          if (found.rule.startsWith("request.")) continue;
          named++;
          if (found.file === null || !existsSync(join(folder, found.file))) unopened.push(`${name}: ${found.rule} names ${found.file}`);
        }
      }
    }
    expect(unopened).toEqual([]);
    expect(named).toBeGreaterThan(100);
  });
});

describe("the guide", () => {
  test("lists every name of the vocabulary, each with its meaning", async () => {
    const { VOCABULARY, PREFIX } = await import("../src/format.ts");
    const ran = await cli(project(), "guide");
    expect(ran.code).toBe(0);
    for (const name of Object.values(VOCABULARY).flat()) expect(ran.out).toContain(`${PREFIX}${name}`);
    const data = json<{ vocabulary: { name: string; meaning: string }[] }>(await cli(project(), "guide", "--json"));
    expect(data.vocabulary.every((entry) => entry.meaning.length > 0)).toBe(true);
  });
  test("lists every frame of the device table with its platform and size, and the frames a full pass takes for each platform", async () => {
    const devices = entry.shippedDevices();
    const text = (await cli(project(), "guide")).out;
    for (const [id, frame] of devices.frames)
      expect(text).toMatch(new RegExp(`\\n {4}${id} +${frame.name}, ${frame.platform}, ${frame.width} by ${frame.height}`));
    for (const platform of ["web", "ios", "android", "desktop"] as const) expect(text).toContain(`${platform}: ${(devices.shots[platform] ?? []).join(", ")}`);
  });
  test("the device table's shots name only platforms, so no reader filters out the table's own keys", () => {
    expect(Object.keys(entry.shippedDevices().shots)).toEqual(["web", "ios", "android", "desktop"]);
  });
  test("says what a frame's root carries, and how a design leaves room for a phone's system bars", async () => {
    const text = (await cli(project(), "guide")).out.replace(/\n\s*/g, " ");
    for (const said of [
      "--safe-area-inset-top",
      "--safe-area-inset-bottom",
      "data-proto-platform and data-proto-theme on the frame's <html>",
      "padding-top: var(--safe-area-inset-top)",
    ])
      expect(text).toContain(said);
  });
  test("says that a part's arguments fill attribute values, that the tool fills text only, and how a web product's phone and desktop are framed", async () => {
    const text = (await cli(project(), "guide")).out.replace(/\n\s*/g, " ");
    for (const said of [
      "each {{name}} in its text and in its attribute values takes the argument",
      "It fills text only: a control's value, checked, and selected stay in the markup",
      "A web product's phone and desktop are its web frames, 320 and 1024.",
    ])
      expect(text).toContain(said);
    expect((await cli(project(), "serve", "--help")).out).toContain("a link that changes only after # does not reload: reload the page");
  });
  test("says what shots prints and takes, how many pictures a full pass takes as the list counts them, how to take fewer, and which to read first", async () => {
    const text = (await cli(project(), "guide")).out.replace(/\n\s*/g, " ");
    for (const said of [
      "prints the list of views",
      "--capture",
      "one line on stderr",
      "--changed-screen",
      "--changed-component",
      "--frames",
      "text at 200% at the narrowest frame",
      "A view taller than its frame is pictured whole",
      "Read first each screen's first state on each platform, then every state once",
    ])
      expect(text).toContain(said);
    // The guide's count is the count the list gives for the design it describes.
    const counted = /one screen with three states, on the web, in light and dark, takes 3 x 2 x 2 \+ 2 = (\d+) pictures/.exec(text);
    const states = ["ready", "empty", "error"].map((state) => `<div data-proto-state="${state}" data-testid="s-${state}">x</div>`).join("");
    const folder = project({
      "design/a.html": single({ head: '<meta name="themes" content="light dark">\n', screens: `<section data-proto-screen="start">${states}</section>` }),
    });
    const listed = json<{ shots: unknown[] }>(await cli(folder, "shots", "design/a.html")).shots.length;
    expect([counted?.[1], listed]).toEqual([String(3 * 2 * 2 + 2), 3 * 2 * 2 + 2]);
    // Each flag the part names is a flag of shots, or of every command.
    const { COMMANDS, GLOBAL } = await import("../src/cli/arguments.ts");
    const part = text.slice(text.indexOf(" Shots "), text.indexOf(" Review "));
    const flags = [...new Set(part.match(/--[a-z][a-z-]*/g) ?? [])];
    expect(flags.filter((flag) => !(flag.slice(2) in (COMMANDS.shots?.flags ?? {})) && !(flag.slice(2) in GLOBAL))).toEqual([]);
    expect(flags.length).toBe(5);
  });
  test("prints each round file's fields from its schema, which are required, their allowed values, and an example the schema holds", async () => {
    const text = (await cli(project(), "guide")).out;
    const part = text.slice(text.indexOf("\nRound files\n"), text.indexOf("\nSettings\n"));
    type Node = { required?: string[]; properties?: Record<string, Node & { enum?: string[] }>; items?: Node; examples?: unknown[] };
    for (const [file, name, list] of [
      ["comments.json", "round-comments", "items"],
      ["changes.json", "round-changes", "changes"],
    ] as const) {
      const shape = schema(name) as unknown as Node;
      const own = part.slice(part.indexOf(`  ${file}`));
      for (const node of [shape, shape.properties?.[list]?.items ?? {}]) {
        for (const [key, field] of Object.entries(node.properties ?? {})) {
          expect(own).toMatch(new RegExp(`\\n {4}${key} +${(node.required ?? []).includes(key) ? "required" : "optional"} `));
          if (field.enum)
            expect(own).toContain(field.enum.length > 2 ? `${field.enum.slice(0, -1).join(", ")}, or ${field.enum.at(-1)}` : field.enum.join(" or "));
        }
      }
      const example = /For example:\n\s*(\{.*\})\n/.exec(own)?.[1] ?? "";
      expect([file, JSON.parse(example), schemaErrors(JSON.parse(example), schema(name))]).toEqual([file, shape.examples?.[0], []]);
    }
  });
  test("says which entry a screen with a source shows, what a go inside an item opens, and that inline fields need their own space", async () => {
    const text = (await cli(project(), "guide")).out.replace(/\n\s*/g, " ");
    for (const said of ["shows the list's first entry", "in the state the go names", "adds no space between"]) expect(text).toContain(said);
  });
});

test("a stranger's design: a to-do app with an emoji, an icon with a title, a dialog, a state named online, one platform, one theme, one rule off", async () => {
  const design = `<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8">
<meta name="platforms" content="ios">
<meta name="themes" content="dark">
<title>Todos</title>
<style data-proto-tokens>:root { --ink: #eeeeee; }</style>
<style>body { color: var(--ink); }</style>
</head>
<body>
<section data-proto-screen="todos" data-proto-title="Todos">
  <div data-proto-state="online" data-testid="todos-online">
    <p class="todo">Add a todo 🎉</p>
    <button type="button" data-proto-go="todos/sync" data-testid="todos-sync"><svg role="img" viewBox="0 0 1 1"><title>Sync</title><path d="M0 0"/></svg></button>
  </div>
  <div data-proto-state="sync" data-testid="todos-sync-open"><dialog open><p>Syncing</p></dialog></div>
</section>
</body>
</html>
`;
  const folder = project({ "design/todos.html": design, "prototype.config.json": '{ "rules": { "copy.emoji": "off" } }' });
  const ran = await cli(folder, "build", "design/todos.html");
  expect([ran.code, /^wrote \.prototype\/views\/design\/todos\.html/m.test(ran.out)]).toEqual([0, true]);
  expect(
    json<{ shots: { frame: string; theme: string }[] }>(await cli(folder, "shots", "design/todos.html")).shots.every(
      (shot) => shot.frame === "ios" && shot.theme !== "light",
    ),
  ).toBe(true);
});

test("docs/reference.md is the reference the code prints, word for word", async () => {
  const ran = await cli(project(), "guide", "--reference");
  expect(`${ran.out}\n`).toBe(await Bun.file(join(import.meta.dir, "../docs/reference.md")).text());
});

test("the reference lists every element and attribute the allow-list takes, as a refused attribute's message says", async () => {
  const { ALLOW_LIST } = await import("../src/design/allow.ts");
  const reference = await Bun.file(join(import.meta.dir, "../docs/reference.md")).text();
  const part = reference.slice(reference.indexOf("## The allow-list"), reference.indexOf("## Rules"));
  const missing = [...ALLOW_LIST.bodyElements, ...ALLOW_LIST.svgElements].filter((name) => !part.includes(`\`<${name}>\``));
  missing.push(...[...ALLOW_LIST.everyElement, ...ALLOW_LIST.htmlAttributes, ...ALLOW_LIST.svgAttributes].filter((name) => !part.includes(`\`${name}\``)));
  expect([part.length > 0, missing]).toEqual([true, []]);
  const ran = await cli(
    project({
      "design/a.html": single({ screens: '<section data-proto-screen="s"><div data-proto-state="t" data-testid="t" formaction="x">x</div></section>' }),
    }),
    "check",
    "design/a.html",
  );
  expect(ran.out).toContain("the reference's allow-list names the allowed ones, and `open-prototype guide --reference` prints it");
});

test("every rule a pass can give is in the registry, and the reference lists each", async () => {
  const { RULES } = await import("../src/checks/rules.ts");
  const reference = await Bun.file(join(import.meta.dir, "../docs/reference.md")).text();
  for (const rule of RULES) expect(reference).toContain(`| \`${rule.id}\` |`);
});
