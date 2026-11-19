// Each check rule on a small design that passes and one that fails, by rule id, file, and line; the frozen format;
// hostile markup, which gets no page and one problem for each form; and the system and accessibility rules, each also
// turned off, with the image bytes that play without end.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { playsForever } from "../src/checks/images.ts";
import { lint } from "../src/checks/lint.ts";
import { cssSheet, followVars } from "../src/css/sheet.ts";
import { type FileContent, FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project } from "./helpers.ts";

type Finding = { rule: string; file: string | null; line: number | null };

async function findings(design: string): Promise<{ code: number; found: Finding[]; counts: unknown }> {
  const folder = project({ "design/case.html": design });
  const ran = await cli(folder, "check", "--json", "design/case.html");
  const data = json<{ findings: Finding[]; counts: unknown }>(ran);
  return { code: ran.code, found: data.findings.map(({ rule, file, line }) => ({ rule, file, line })), counts: data.counts };
}

// The first screen sits on line 16 of the case's file, and its state on line 17.
const screen = (inner: string) =>
  `<section data-proto-screen="start" data-proto-title="Start">\n<div data-proto-state="success" data-testid="start-ok">${inner}</div>\n</section>`;
const at = (rule: string, line: number | null, file: string | null = "design/case.html"): Finding => ({ rule, file, line });

describe("each rule finds its own problem, and passes the sound form", () => {
  test.each([
    [
      "integrity.testid",
      screen('<button type="button">Go</button>'),
      screen('<button type="button" data-testid="start-go">Go</button>'),
      [at("integrity.testid", 17)],
    ],
    [
      "integrity.name",
      screen('<button type="button" data-testid="start-go"></button>'),
      screen('<button type="button" data-testid="start-go" aria-label="Go"></button>'),
      [at("integrity.name", 17)],
    ],
    ["integrity.label", screen('<input data-testid="start-q">'), screen('<label>Query <input data-testid="start-q"></label>'), [at("integrity.label", 17)]],
    ["integrity.alt", screen('<img src="data:image/png;base64,AA==">'), screen('<img alt="" src="data:image/png;base64,AA==">'), [at("integrity.alt", 17)]],
    ["integrity.id-repeat", screen('<p id="a">x</p><p id="a">y</p>'), screen('<p id="a">x</p><p id="b">y</p>'), [at("integrity.id-repeat", 17)]],
    [
      "integrity.labelledby",
      screen('<p aria-labelledby="nope">x</p>'),
      screen('<p id="t">T</p><p aria-labelledby="t">x</p>'),
      [at("integrity.labelledby", 17)],
    ],
    ["integrity.testid-repeat", screen('<p data-testid="start-ok">x</p>'), screen('<p data-testid="start-other">x</p>'), [at("integrity.testid-repeat", 17)]],
    [
      "integrity.link-screen",
      screen('<button type="button" data-proto-go="nowhere" data-testid="start-go">Go</button>'),
      screen('<button type="button" data-proto-go="start" data-testid="start-go">Go</button>'),
      [at("integrity.link-screen", 17)],
    ],
    [
      "integrity.link-state",
      screen('<button type="button" data-proto-go="start/nope" data-testid="start-go">Go</button>'),
      screen('<button type="button" data-proto-go="start/success" data-testid="start-go">Go</button>'),
      [at("integrity.link-state", 17)],
    ],
    [
      "integrity.initial",
      screen("x").replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-initial="nope"'),
      screen("x").replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-initial="success"'),
      [at("integrity.initial", 16)],
    ],
    [
      "integrity.parent",
      screen("x").replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-parent="nope"'),
      screen("x").replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-parent="start"'),
      [at("integrity.parent", 16)],
    ],
    [
      "integrity.unreached",
      `${screen("x")}\n<section data-proto-screen="b"><div data-proto-state="success">y</div></section>`,
      `${screen('<button type="button" data-proto-go="b" data-testid="start-b">B</button>')}\n<section data-proto-screen="b"><div data-proto-state="success">y</div></section>`,
      [at("integrity.unreached", 19)],
    ],
    ["integrity.screen-repeat", `${screen("x")}\n${screen("y").replace("start-ok", "start-two")}`, screen("x"), [at("integrity.screen-repeat", 19)]],
    [
      "integrity.no-state",
      `${screen("x")}\n<section data-proto-screen="b"><p>y</p></section>`,
      screen("x"),
      [at("integrity.no-state", 19), at("integrity.unreached", 19)],
    ],
    ["paint.raw-color", screen('<p style="color: #ff0000">x</p>'), screen('<p style="color: var(--color-ink)">x</p>'), [at("paint.raw-color", 17)]],
    [
      "paint.svg-color",
      screen('<svg aria-hidden="true"><path d="M0 0" fill="red"/></svg>'),
      screen('<svg aria-hidden="true"><path d="M0 0" fill="currentColor"/></svg>'),
      [at("paint.svg-color", 17)],
    ],
    [
      "paint.depth",
      screen('<p style="box-shadow: 0 2px 4px var(--color-ink)">x</p>'),
      screen('<p style="box-shadow: 0 0 0 2px var(--color-ink)">x</p>'),
      [at("paint.depth", 17)],
    ],
    [
      "paint.network",
      screen('<p style="background: url(https://example.com/a.png)">x</p>'),
      screen('<p style="background: var(--color-ink)">x</p>'),
      [at("paint.network", 17)],
    ],
    ["copy.placeholder", screen("<p>Lorem ipsum</p>"), screen("<p>Ticket TODO-12</p>"), [at("copy.placeholder", 17)]],
    ["copy.emoji", screen("<p>Done ✅</p>"), screen("<p>© 2026</p>"), [at("copy.emoji", 17)]],
    [
      "device.unknown",
      screen('<div data-proto-device="tablet">a</div>'),
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px; overflow-y: auto">a</div>'),
      [at("device.unknown", 17)],
    ],
    [
      "device.size",
      screen('<div data-proto-device="ios" style="width: 400px; height: 844px; overflow-y: auto">a</div>'),
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px; overflow: hidden auto">a</div>'),
      [at("device.size", 17)],
    ],
    [
      "device.scroll",
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px">a</div>'),
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px; overflow-y: scroll">a</div>'),
      [at("device.scroll", 17)],
    ],
    ["structure.name", screen('<p data-proto-component="Card">x</p>'), screen('<p data-proto-component="card">x</p>'), [at("structure.name", 17)]],
  ])("%s", async (_rule, failing, passing, expected) => {
    const bad = await findings(single({ screens: failing }));
    expect(bad.code).toBe(1);
    expect(bad.found).toEqual(expected);
    const good = await findings(single({ screens: passing }));
    expect(good.found).toEqual([]);
    expect(good.code).toBe(0);
  });

  // The paint rules read the declarations the one CSS reader reads: the text a person reads is no CSS, a declaration
  // outside every rule draws nothing, and a style attribute in single quotes is quoted to its own end.
  test("the paint rules read CSS only where a browser reads it, and quote a declaration as written", () => {
    expect(lint("<style>p { margin: 0 }</style><p>Set the color: red</p>")).toEqual([]);
    expect(lint("<style>color: red;</style>")).toEqual([]);
    expect(lint("<p style='color: red'>x</p>").map((issue) => issue.message)).toEqual([
      'the raw color in "color: red" is outside the tokens block; read a role with var(), such as var(--color-accent)',
    ]);
  });

  // CSS stands where the tokenizer reads a style element or a style attribute, never in text that looks like one, and a
  // load the CSS spans over two lines is one load.
  test("the paint rules read no CSS in a page's words or comments, and find a load written over two lines", () => {
    const rules = (text: string) => lint(text).map((issue) => `${issue.rule}:${issue.line}`);
    expect(rules('<p>In CSS, avoid style="color: #ff0000" inline.</p>')).toEqual([]);
    expect(rules('<!-- @import "https://example.com/a.css" -->')).toEqual([]);
    expect(rules("<p>Use url(https://example.com/a.png)</p>")).toEqual([]);
    expect(rules("<style>/* url(https://example.com/a.png) */ p { margin: 0 }</style>")).toEqual([]);
    expect(rules("<style>body { background: url(\n  https://evil.example/a.png); }</style>")).toEqual(["paint.network:1"]);
    expect(rules('<p>x</p>\n<p style="background: url(https://example.com/a.png)">x</p>')).toEqual(["paint.network:2"]);
  });

  test("a quote after a backslash stays in its string, so the rule after it is read", () => {
    const sheet = cssSheet('<style>p { content: "a\\"b; color: red"; margin: 0 }</style>');
    expect(sheet.rules.map((rule) => rule.declarations.map((item) => item.property))).toEqual([["content", "margin"]]);
  });

  test("a device's style is read by the one CSS reader, so a comment in it hides no size", async () => {
    const style = "width: 390px; /* height: 1px; */ height: 844px; overflow-y: auto";
    const result = await findings(single({ screens: screen(`<div data-proto-device="ios" style="${style}">a</div>`) }));
    expect(result.found.filter((item) => item.rule.startsWith("device."))).toEqual([]);
  });

  test("a state name close to a familiar one is a note, and the design still passes", async () => {
    const result = await findings(single({ screens: screen("x").replace('data-proto-state="success"', 'data-proto-state="errors"') }));
    expect([result.code, result.found.map((item) => item.rule)]).toEqual([0, ["structure.state-near-core"]]);
  });

  test("a document with no body is one read finding, at its first line", async () => {
    const result = await findings('<!doctype html>\n<html lang="en"><head><title>x</title></head></html>\n');
    expect(result.found).toEqual([at("read.document", 1), at("integrity.no-screen", 1)]);
  });

  test("more than 200 problems print 200 and say how many more", async () => {
    const many = screen(Array.from({ length: 230 }, (_, i) => `<button type="button" data-testid="start-b${i}"></button>`).join("\n"));
    const result = await findings(single({ screens: many }));
    expect(result.found.length).toBe(201);
    expect(result.found.at(-1)?.rule).toBe("integrity.more");
  });
});

describe("the frozen format", () => {
  test("a design that uses every form the format allows passes with no note", async () => {
    const every = single({
      head: '<meta name="work-item" content="CARD-1">\n<meta name="platforms" content="web ios">\n<meta name="themes" content="light dark">\n<meta name="viewport" content="width=device-width">\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">\n',
      fixtures: '{ "product": "Cases", "items": [{ "name": "One", "detail": "Two" }], "photo": "data:image/png;base64,AA==" }',
      chrome:
        '<nav class="tabs" aria-label="Main"><button type="button" data-proto-go="start" data-proto-component="tab" data-proto-variant="current" data-testid="app-tab-start"><span>Start</span></button></nav>\n<h1 data-proto-slot="title"></h1><button type="button" data-proto-back data-testid="app-back"><span data-proto-slot="back-label">Back</span></button>\n',
      screens: `<section data-proto-screen="start" data-proto-title="Start" data-proto-initial="success">
<div data-proto-state="success" data-testid="start-ok"><ul data-proto-list="items" data-proto-limit="3"><template data-proto-item><li data-proto-component="row" data-testid="row"><button type="button" data-proto-go="detail" data-testid="row-open"><span data-proto-field="name"></span></button></li></template></ul><img data-proto-image="photo" alt=""><button type="button" data-proto-toggle="more" aria-controls="more" aria-expanded="false" data-testid="start-more">More</button><div id="more" data-proto-panel="more" hidden><p data-proto-text="product"></p></div></div>
<div data-proto-state="empty" data-testid="start-empty"><button type="button" data-proto-go="detail/success" data-testid="start-link">Detail</button></div>
</section>
<section data-proto-screen="detail" data-proto-title="Detail" data-proto-parent="start" data-proto-source="items">
<div data-proto-state="success" data-testid="detail-ok"><p data-proto-field="detail"></p><div data-proto-device="ios" style="width: 390px; height: 844px; overflow-y: auto">x</div></div>
</section>`,
    });
    const result = await findings(every);
    expect(result.found).toEqual([]);
    expect(result.counts).toEqual({ screens: 2, states: 3, test_ids: 9 });
  });
});

describe("hostile markup", () => {
  test.each([
    ["<script>x()</script>"],
    ['<iframe src="x"></iframe>'],
    ['<object data="x"></object>'],
    ['<embed src="x">'],
    ["<form></form>"],
    ['<base href="x">'],
    ['<meta name="x" content="y">'],
    ['<link rel="stylesheet" href="x.css">'],
    ["<title>x</title>"],
    ["<plaintext>x"],
    ["<xmp>x</xmp>"],
    ["<noembed>x</noembed>"],
    ["<noframes>x</noframes>"],
    ["<noscript>x</noscript>"],
    ['<svg aria-hidden="true"><style>p{}</style></svg>'],
    ['<p onclick="x()">x</p>'],
    ['<p/onmouseover="x()">x</p>'],
    ['<a href="javascript:x()" data-testid="start-js">x</a>'],
    ['<textarea data-testid="start-t" aria-label="T">'],
    ["</template><template></template>"],
    ['<p title="<template">x</p>'],
    ["<!-- open"],
    ["<!--> x"],
    ["<!DOCTYPE html>"],
    ['<?xml version="1.0"?>'],
  ])("%s gets no page, and the problem says so", async (markup) => {
    const folder = project({ "design/case.html": single({ screens: screen(markup) }) });
    const ran = await cli(folder, "build", "design/case.html");
    expect(ran.code).toBe(1);
    expect(existsSync(join(folder, ".prototype/views/design/case.html"))).toBe(false);
    expect(ran.out).toMatch(/^problem: design\/case\.html:\d+: /m);
    expect(json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings.map((item) => item.rule)).toContain(
      "unsafe.markup",
    );
  });

  // 200,000 spaces after a fallback's comma, with no `)`: a pattern that reads those spaces two ways takes seconds here.
  test("a var() that never closes is read in time in step with its length", () => {
    const started = performance.now();
    const value = `var(--a,${" ".repeat(200_000)}`;
    expect(followVars(value, () => undefined, { fallbacks: true, keep: true })).toBe(value);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  test("a hostile flow writes no page and removes the old one", async () => {
    const files = flowDesign();
    const folder = project(files);
    expect((await cli(folder, "build", FLOW_DESIGN)).code).toBe(0);
    const page = join(folder, ".prototype/views", FLOW_DESIGN);
    expect(existsSync(page)).toBe(true);
    await Bun.write(join(folder, "design/flows/settings.html"), `${files["design/flows/settings.html"] ?? ""}<script>x()</script>\n`);
    const ran = await cli(folder, "build", FLOW_DESIGN);
    expect(ran.code).toBe(1);
    expect(ran.out).toMatch(/^problem: design\/flows\/settings\.html:\d+: a <script>/m);
    expect(existsSync(page)).toBe(false);
  });
});

describe("the messages a stranger meets, each with the step that works", () => {
  const message = async (folder: string, rule: string, ...file: string[]) => {
    const found = JSON.parse((await cli(folder, "check", "--json", ...file)).out).findings as { rule: string; message: string }[];
    return found.filter((item) => item.rule === rule).map((item) => item.message);
  };
  const screen = (inner: string, attrs = "") =>
    `<section data-proto-screen="start" data-proto-title="Start"${attrs}><div data-proto-state="success" data-testid="s">${inner}</div></section>`;
  test("a detail screen that names no list is told which list to name", async () => {
    const screens = `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><ul data-proto-list="items"><template data-proto-item><li><button type="button" data-proto-go="note" data-testid="open" data-proto-field="title"></button></li></template></ul></div></section>\n<section data-proto-screen="note"><div data-proto-state="ready" data-testid="n"><p data-proto-text="title"></p></div></section>`;
    const folder = project({ "design/a.html": single({ screens, fixtures: '{ "product": "x", "items": [{ "title": "One" }] }' }) });
    expect((await message(folder, "integrity.fixture-key", "design/a.html")).join()).toContain('data-proto-source="items"');
  });
  describe("text names a key of the fixtures from the top, and field a key of the current item", () => {
    const list =
      '<ul data-proto-list="loans"><template data-proto-item><li><button type="button" data-proto-go="loan" data-testid="open" data-proto-field="title"></button><span data-proto-text="due"></span></li></template></ul>';
    const loan = (inner: string) =>
      `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">${list}</div></section>\n<section data-proto-screen="loan" data-proto-source="loans"><div data-proto-state="ready" data-testid="l">${inner}</div></section>`;
    const fixtures = '{ "product": "x", "due": "Due back on", "ask": "Renew it?", "loans": [{ "title": "Solaris" }] }';
    const said = async (inner: string) =>
      message(project({ "design/a.html": single({ screens: loan(inner), fixtures }) }), "integrity.fixture-key", "design/a.html");
    test("a screen's own words and an item's own words come from the fixtures, on a screen that shows an entry", async () => {
      expect(await said('<p data-proto-text="ask"></p><h2 data-proto-field="title"></h2>')).toEqual([]);
    });
    test("a text that names a key only an entry holds is told to use data-proto-field", async () => {
      expect((await said('<h2 data-proto-text="title"></h2>')).join()).toContain('use data-proto-field="title"');
    });
    test("a field that names no key of the entries is told to add it, or to use data-proto-text", async () => {
      expect((await said('<p data-proto-field="ask"></p>')).join()).toMatch(
        /names no key of any entry of `loans`: add it to the entries, or use data-proto-text/,
      );
    });
    test("a field outside every item and every screen that shows an entry says so", async () => {
      const found = await message(
        project({ "design/a.html": single({ screens: screen('<p data-proto-field="welcome"></p>') }) }),
        "integrity.fixture-key",
        "design/a.html",
      );
      expect(found.join()).toContain("outside every list's item and every screen with data-proto-source");
    });
  });
  describe("among what shows at once, one back-label slot and one title slot", () => {
    const back = (testid: string) => `<button type="button" data-proto-back data-testid="${testid}"><span data-proto-slot="back-label">Back</span></button>`;
    const detail = (ready: string, overdue: string, own = "") =>
      `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><button type="button" data-proto-go="detail" data-testid="go">Go</button></div></section>\n<section data-proto-screen="detail" data-proto-parent="start">${own}<div data-proto-state="ready" data-testid="r">${ready}</div><div data-proto-state="overdue" data-testid="o">${overdue}</div></section>`;
    const said = async (screens: string, chrome = "") => message(project({ "design/a.html": single({ screens, chrome }) }), "read.slot", "design/a.html");
    test("a back control in each of two states of one screen shows once, and passes", async () => {
      expect(await said(detail(back("r-back"), back("o-back")))).toEqual([]);
    });
    test("a back control in a state beside one that shows with every screen names the two places and where one may go", async () => {
      expect(await said(detail(back("r-back"), ""), back("app-back"))).toEqual([
        "two back-label slots show at once: one outside every screen, and one in the state `ready` of screen `detail`. Keep one, or move each into its own state, so the screen and any one of its states show one",
      ]);
    });
    test("a back control in a screen's own content and one in its state show at once", async () => {
      expect((await said(detail("", back("o-back"), back("d-back")))).join()).toContain(
        "one on screen `detail` outside its states, and one in the state `overdue` of screen `detail`",
      );
    });
  });
  test.each(["constructor", "prototype", "__proto__"])("a fixtures key named %s is told to be renamed", async (key) => {
    const folder = project({ "design/a.html": single({ screens: screen(`<p data-proto-text="${key}"></p>`), fixtures: `{ "product": "x", "${key}": "y" }` }) });
    expect((await message(folder, "integrity.fixture-key", "design/a.html")).join()).toContain("rename the key");
  });
  test("online beside offline on one screen is no near name", async () => {
    const screens =
      '<section data-proto-screen="start"><div data-proto-state="online" data-testid="on">On</div><div data-proto-state="offline" data-testid="off">Off</div></section>';
    expect(await message(project({ "design/a.html": single({ screens }) }), "structure.state-near-core", "design/a.html")).toEqual([]);
    const alone = '<section data-proto-screen="start"><div data-proto-state="ofline" data-testid="on">On</div></section>';
    expect((await message(project({ "design/a.html": single({ screens: alone }) }), "structure.state-near-core", "design/a.html")).length).toBe(1);
  });
  test("a fixtures block that is no JSON is the one finding, never one for each text", async () => {
    const folder = project({ "design/a.html": single({ fixtures: "{ nope" }) });
    const found = JSON.parse((await cli(folder, "check", "--json", "design/a.html")).out).findings as { rule: string }[];
    expect(found.map((item) => item.rule)).toEqual(["read.fixtures"]);
  });
  test("a link the allow-list refuses names the forms a link may take", async () => {
    const folder = project({ "design/a.html": single({ screens: screen('<a href="/x" data-testid="a">x</a>') }) });
    const said = (await message(folder, "unsafe.markup", "design/a.html")).join();
    expect([said.includes("#<id>"), said.includes("#<screen>/<state> inside")]).toEqual([true, false]);
  });
  test("stories with a design named first says which comes first", async () => {
    const ran = await cli(project({ "design/a-b.html": single() }), "stories", "design/a-b.html", "index.json");
    expect([ran.code, ran.err.includes("index.json first")]).toEqual([2, true]);
  });
});

describe("the small faults", () => {
  const rulesOf = async (folder: string, ...file: string[]) =>
    JSON.parse((await cli(folder, "check", "--json", ...file)).out).findings as { rule: string; message: string }[];
  const screen = (inner: string) =>
    `<section data-proto-screen="start" data-proto-title="Start"><div data-proto-state="success" data-testid="s">${inner}</div></section>`;
  test("a work item that is no work item says so", async () => {
    const found = await rulesOf(project({ "design/a.html": single({ head: '<meta name="work-item" content="CARD 12">\n' }) }), "design/a.html");
    expect(found.map((item) => item.rule)).toEqual(["structure.work-item"]);
  });
  test("a list's limit takes a whole number", async () => {
    const list = '<ul data-proto-list="items" data-proto-limit="many"><template data-proto-item><li data-proto-field="name"></li></template></ul>';
    const found = await rulesOf(
      project({ "design/a.html": single({ screens: screen(list), fixtures: '{ "product": "x", "items": [{ "name": "a" }] }' }) }),
      "design/a.html",
    );
    expect(found.map((item) => item.rule)).toEqual(["structure.list"]);
  });
  test("a list inside another list's item is refused with its own finding, and no key inside it is looked for", async () => {
    const inner = '<ul data-proto-list="members"><template data-proto-item><li data-proto-field="who"></li></template></ul>';
    const list = `<ul data-proto-list="groups"><template data-proto-item><li><span data-proto-field="name"></span>${inner}</li></template></ul>`;
    const fixtures = '{ "product": "x", "groups": [{ "name": "a", "members": [{ "who": "b" }] }] }';
    const found = await rulesOf(project({ "design/a.html": single({ screens: screen(list), fixtures }) }), "design/a.html");
    expect(found.map((item) => item.rule)).toEqual(["structure.list-nested"]);
  });
  test("a document with no written <body> is told to write one, and nothing of a head", async () => {
    const found = await rulesOf(
      project({
        "design/a.html": `<!doctype html>\n<html lang="en" data-proto-format="1">\n<title>A</title>\n<main><h1>A</h1>${screen("<p>x</p>")}</main>\n</html>\n`,
      }),
      "design/a.html",
    );
    expect([found.map((item) => item.rule), found.some((item) => item.message.includes("<head>"))]).toEqual([["read.document"], false]);
  });
  test("an unknown name ends its sentence and names the guide", async () => {
    const found = await rulesOf(project({ "design/a.html": single({ screens: screen('<p data-proto-zzzzzzzz="x">x</p>') }) }), "design/a.html");
    expect(found.map((item) => item.message)).toEqual([expect.stringMatching(/format\. `open-prototype guide` lists every name\.$/)]);
  });
  test("--frames that names no frame is refused", async () => {
    const ran = await cli(project({ "design/a.html": single() }), "shots", "--frames", ",", "design/a.html");
    expect([ran.code, ran.err.includes("names no frame")]).toEqual([2, true]);
  });
  test("a use written <div/> is unclosed, as a browser reads it", async () => {
    const found = await rulesOf(
      project({ "design/a.html": single({ screens: screen('<div data-proto-use="row"/>') }), "design/blocks/row.html": "<p>Row</p>\n" }),
      "design/a.html",
    );
    expect(found.map((item) => item.rule)).toContain("read.use");
  });
});

describe("the system and accessibility rules: each fires, passes a sound design, and turns off", () => {
  type Files = Record<string, FileContent>;
  const DOC =
    '---\ncolors:\n  primary: "#1d4ed8"\n  light:\n    surface: "#fafafb"\n  dark:\n    surface: "#111317"\nspacing:\n  "3": 1rem\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n---\n\n## Overview\n';
  const THEMES = '<meta name="themes" content="light dark">\n';
  const css = (rules: string) => `<style>\np { color: var(--color-primary); padding: var(--spacing-3); }\n${rules}\n</style>`;
  const tokens = (rules: string) => `<style data-proto-tokens>\n${rules}\n</style>\n${css("")}`;
  const sound = (options: Parameters<typeof single>[0] = {}) => single({ head: THEMES, styles: css(""), ...options });
  const doc = (change: (text: string) => string = (text) => text): Files => ({ "DESIGN.md": change(DOC) });
  const at2 = (files: Files, path: string, needle: string): number =>
    String(files[path])
      .split("\n")
      .findIndex((line) => line.includes(needle)) + 1;
  const gif = (frames: number, loop: number | null) =>
    new Uint8Array([
      ...Array.from("GIF89a", (char) => char.charCodeAt(0)),
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      ...(loop === null ? [] : [0x21, 0xff, 0x0b, ...Array.from("NETSCAPE2.0", (char) => char.charCodeAt(0)), 0x03, 0x01, loop & 0xff, loop >> 8, 0x00]),
      ...Array.from({ length: frames }, () => [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x4c, 0x01, 0x00]).flat(),
      0x3b,
    ]);
  const uri = (bytes: Uint8Array) => `data:image/gif;base64,${Buffer.from(bytes).toString("base64")}`;
  const image = (value: string, extra: Files = {}): Files => ({
    "design/case.html": single({ screens: screen('<img data-proto-image="hero" alt="">'), fixtures: `{ "product": "Cases", "hero": "${value}" }` }),
    ...extra,
  });
  const reduce = (rule: string) => `@media (prefers-reduced-motion: reduce) { ${rule} }`;
  const motion = (rules: string) => ({ "design/case.html": single({ styles: `<style>\n${rules}\n</style>` }) });

  // Each row: the rule, a failing project, a passing one, and the file and the text on the line the finding names.
  const rows: [string, Files, Files, string, string][] = [
    ["system.read", { ...doc(() => "---\ncolors: [\n---\n"), "design/case.html": sound() }, { ...doc(), "design/case.html": sound() }, "DESIGN.md", "---"],
    [
      "system.name",
      { ...doc((text) => text.replace('  primary: "#1d4ed8"', '  primary: "#1d4ed8"\n  "bad name": "#fff"')), "design/case.html": sound() },
      { ...doc(), "design/case.html": sound() },
      "DESIGN.md",
      "bad name",
    ],
    [
      "system.value",
      { ...doc((text) => text.replace('"3": 1rem', '"3": 1rem\n  md: 16 px')), "design/case.html": sound() },
      { ...doc((text) => text.replace('"3": 1rem', '"3": 1rem\n  md: 16px')), "design/case.html": sound() },
      "DESIGN.md",
      "md: 16 px",
    ],
    [
      "system.reference",
      { ...doc((text) => text.replace("{colors.primary}", "{colors.brand}")), "design/case.html": sound({ styles: css("") }) },
      { ...doc(), "design/case.html": sound() },
      "DESIGN.md",
      "backgroundColor",
    ],
    [
      "system.empty",
      { "DESIGN.md": "# Cases\n\nWords, and no tokens.\n", "design/case.html": single() },
      { ...doc(), "design/case.html": sound() },
      "DESIGN.md",
      "# Cases",
    ],
    [
      "system.version",
      { ...doc((text) => text.replace("---\ncolors:", "---\nversion: beta\ncolors:")), "design/case.html": sound() },
      { ...doc((text) => text.replace("---\ncolors:", "---\nversion: alpha\ncolors:")), "design/case.html": sound() },
      "DESIGN.md",
      "version",
    ],
    [
      "system.theme",
      { ...doc((text) => text.replace('  dark:\n    surface: "#111317"\n', "")), "design/case.html": sound() },
      { ...doc((text) => text.replace('  dark:\n    surface: "#111317"\n', "")), "design/case.html": sound({ head: "" }) },
      "DESIGN.md",
      "colors:",
    ],
    [
      "system.override",
      { ...doc(), "design/case.html": sound({ styles: tokens(":root { --color-primary: #000; }") }) },
      {
        ...doc(),
        "design/case.html": sound({
          styles: tokens(
            ':root { --color-primary: #1D4ED8; --color-surface: light-dark(#fafafb, #111317); }\n:root[data-proto-theme="dark"] { --color-primary: #93c5fd; }',
          ),
        }),
      },
      "design/case.html",
      ":root { --color-primary: #000",
    ],
    [
      "system.unknown-token",
      { ...doc(), "design/case.html": sound({ styles: css("a { color: var(--color-primry); }") }) },
      { ...doc(), "design/case.html": sound({ styles: css(".card { --color-edge: var(--color-surface); border-color: var(--color-edge); }") }) },
      "design/case.html",
      "--color-primry",
    ],
    [
      "system.extra-token",
      {
        ...doc(),
        "design/case.html": sound({ head: `${THEMES}<meta name="tokens" content="tokens.css">\n` }),
        "tokens.css": ":root {\n  --color-primary: #1d4ed8;\n  --color-promo: #f00;\n}\n",
      },
      {
        ...doc(),
        "design/case.html": sound({ head: `${THEMES}<meta name="tokens" content="tokens.css">\n` }),
        "tokens.css": ":root {\n  --color-primary: #1d4ed8;\n  --ring: 2px;\n}\n",
      },
      "tokens.css",
      "--color-promo",
    ],
    [
      "system.component",
      { ...doc(), "design/case.html": sound({ screens: screen('<p data-proto-component="banner">x</p>') }) },
      {
        ...doc(),
        "design/case.html": sound({
          screens: screen('<button type="button" data-proto-component="button" data-proto-variant="primary" data-testid="start-go">Go</button>'),
        }),
      },
      "design/case.html",
      "banner",
    ],
    ["accessibility.lang", { "design/case.html": single().replace(' lang="en"', "") }, { "design/case.html": single() }, "design/case.html", "<html"],
    [
      "accessibility.heading-top",
      { "design/case.html": single().replace("<h1>A case</h1>", "") },
      { "design/case.html": single({ screens: screen('<div role="dialog" aria-label="Edit"><h1>Edit</h1></div>') }) },
      "design/case.html",
      "data-proto-state",
    ],
    [
      "accessibility.heading-skip",
      { "design/case.html": single({ screens: screen("<h3>Later</h3>") }) },
      { "design/case.html": single({ screens: screen("<h2>Later</h2><dialog open><h2>Edit</h2><h3>Name</h3></dialog>") }) },
      "design/case.html",
      "<h3>",
    ],
    [
      "accessibility.main",
      { "design/case.html": single().replace('<main id="main" tabindex="-1">', "<div>").replace("</main>", "</div>") },
      { "design/case.html": single({ screens: screen("<main hidden><p>x</p></main>") }) },
      "design/case.html",
      "data-proto-state",
    ],
    [
      "accessibility.motion-reduce",
      motion(".sheet { transition: transform var(--duration-move) ease-out; }"),
      motion(
        `:root { --duration-move: 200ms; }\n.sheet { transition: transform var(--duration-move) ease-out; }\n.row { transition: background-color 150ms; }\n${reduce(":root { --duration-move: 0ms; }")}`,
      ),
      "design/case.html",
      ".sheet",
    ],
    [
      "accessibility.motion-endless",
      motion(".pulse { animation: pulse 2s ease-in-out infinite; }\n@keyframes pulse { from { opacity: 1; } to { opacity: 0.6; } }"),
      motion(
        `.pulse { animation: pulse 2s ease-in-out infinite; }\n@keyframes pulse { from { opacity: 1; } to { opacity: 0.6; } }\n${reduce(".pulse { animation: none; }")}`,
      ),
      "design/case.html",
      ".pulse {",
    ],
    [
      "accessibility.flash",
      motion(`.blink { animation: blink 200ms infinite; }\n@keyframes blink { 50% { opacity: 0; } }\n${reduce(".blink { animation: none; }")}`),
      motion(
        `.blink { animation: blink 333ms infinite alternate; }\n.spin { animation: spin 100ms linear infinite; }\n@keyframes blink { from { opacity: 1; } to { opacity: 0; } }\n@keyframes spin { to { transform: rotate(1turn); } }\n${reduce("* { animation: none; }")}`,
      ),
      "design/case.html",
      ".blink {",
    ],
    ["accessibility.image-motion", image(uri(gif(2, 0))), image(uri(gif(1, 0)), {}), "design/case.html", "data:image/gif"],
  ];

  async function checked(files: Files): Promise<Finding[]> {
    return json<{ findings: Finding[] }>(await cli(project(files), "check", "--json", "design/case.html")).findings.map(({ rule, file, line }) => ({
      rule,
      file,
      line,
    }));
  }

  test.each(rows)("%s", async (rule, failing, passing, file, needle) => {
    const bad = await checked(failing);
    expect(bad.filter((item) => item.rule === rule)).toEqual([at(rule, at2(failing, file, needle), file)]);
    expect(await checked(passing)).toEqual([]);
    const off = await checked({ ...failing, "prototype.config.json": JSON.stringify({ rules: { [rule]: "off" } }) });
    expect(off.filter((item) => item.rule === rule)).toEqual([]);
  });

  test("an image file the fixtures name that plays for ever is found at the design's file, and a fixed count passes", async () => {
    expect(await checked(image("hero.gif", { "design/hero.gif": { bytes: gif(3, 0) } }))).toEqual([at("accessibility.image-motion", null)]);
    expect(await checked(image("hero.gif", { "design/hero.gif": { bytes: gif(3, 2) } }))).toEqual([]);
  });
});

describe("an image that plays without end, told by its bytes", () => {
  const text = (value: string) => Array.from(value, (char) => char.charCodeAt(0));
  const big = (value: number) => [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const little = (value: number, bytes = 4) => Array.from({ length: bytes }, (_, index) => (value >> (8 * index)) & 0xff);
  const gif = (frames: number, loop: number | null) => [
    ...text("GIF89a"),
    1,
    0,
    1,
    0,
    0,
    0,
    0,
    ...(loop === null ? [] : [0x21, 0xff, 0x0b, ...text("NETSCAPE2.0"), 3, 1, loop & 0xff, loop >> 8, 0]),
    ...Array.from({ length: frames }, () => [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 1, 0]).flat(),
    0x3b,
  ];
  const png = (frames: number | null, plays: number) => [
    0x89,
    ...text("PNG\r\n\x1a\n"),
    ...big(13),
    ...text("IHDR"),
    ...Array(13).fill(0),
    0,
    0,
    0,
    0,
    ...(frames === null ? [] : [...big(8), ...text("acTL"), ...big(frames), ...big(plays), 0, 0, 0, 0]),
    ...big(0),
    ...text("IEND"),
    0,
    0,
    0,
    0,
  ];
  const webp = (frames: number, loop: number) => {
    const chunk = (type: string, data: number[]) => [...text(type), ...little(data.length), ...data, ...(data.length % 2 ? [0] : [])];
    const body = [
      ...text("WEBP"),
      ...chunk("VP8X", Array(10).fill(0)),
      ...chunk("ANIM", [0, 0, 0, 0, ...little(loop, 2)]),
      ...Array.from({ length: frames }, () => chunk("ANMF", Array(16).fill(0))).flat(),
    ];
    return [...text("RIFF"), ...little(body.length), ...body];
  };
  const avif = (brands: string[]) => [...big(16 + 4 * brands.length), ...text("ftyp"), ...text(brands[0] ?? "avif"), 0, 0, 0, 0, ...brands.flatMap(text)];
  test.each([
    ["a GIF of two frames that loops for ever", gif(2, 0), true],
    ["a GIF of one frame with a loop of 0", gif(1, 0), false],
    ["a GIF of two frames that plays three times", gif(2, 3), false],
    ["a GIF with no loop count, which plays once", gif(2, null), false],
    ["an APNG that plays for ever", png(4, 0), true],
    ["an APNG that plays twice", png(4, 2), false],
    ["a plain PNG", png(null, 0), false],
    ["an animated WebP that loops for ever", webp(3, 0), true],
    ["an animated WebP that loops once", webp(3, 1), false],
    ["an AVIF image sequence", avif(["avis", "msf1"]), true],
    ["an AVIF still image", avif(["avif", "mif1"]), false],
    ["an SVG that repeats indefinitely", text('<svg xmlns="http://www.w3.org/2000/svg"><animate repeatCount="indefinite"/></svg>'), true],
    ["an SVG whose style spins for ever", text('<svg xmlns="http://www.w3.org/2000/svg"><style>g { animation: spin 1s infinite; }</style></svg>'), true],
    ["an SVG that repeats three times", text('<svg xmlns="http://www.w3.org/2000/svg"><animate repeatCount="3"/></svg>'), false],
  ])("%s", (_what, bytes, forever) => {
    expect(playsForever(new Uint8Array(bytes))).toBe(forever);
  });
});
