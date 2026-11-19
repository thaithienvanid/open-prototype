// The recorded cases: the starter, a synthetic multi-flow design with blocks, and small designs that pass or fail each
// check rule, each with the commands run on it. `cases.test.ts` runs them and compares each result with the one
// recorded in `recorded.json`. None of these cases read `assets/examples/`, so editing the shipped example never breaks
// unit or recorded tests.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type FileContent = string | { link: string } | { bytes: Uint8Array };
export type Case = { name: string; files: Record<string, FileContent>; commands: string[][] };

const ASSETS = resolve(import.meta.dir, "../assets");

/** The synthetic multi-flow design's entry file path, for tests that exercise flows and blocks. */
export const FLOW_DESIGN = "design/app.html";

const STYLES = `<style data-proto-tokens>
:root { --color-ink: #1c1e21; --color-accent: #1d4ed8; --ring: 0 0 0 2px #1d4ed8; }
</style>
<style>
p { color: var(--color-ink); }
</style>`;

const START = `<section data-proto-screen="start" data-proto-title="Start">
  <div data-proto-state="success" data-testid="start-success"><p data-proto-text="welcome"></p></div>
</section>`;

type Single = { screens?: string; styles?: string; head?: string; fixtures?: string; format?: string; before?: string; chrome?: string };

/**
 * A design file, with its screens and blocks replaced as a case needs. Its first screen starts on line 16, and
 * that screen's first state on line 17. It draws one level-1 heading, unless the case's chrome draws its own.
 */
export function single(options: Single = {}): string {
  const format = options.format ?? ' data-proto-format="1"';
  return `<!doctype html>
<html lang="en"${format}>
<head>
<meta charset="utf-8">
${options.head ?? ""}<title>A case</title>
${options.styles ?? STYLES}
</head>
<body>
${options.before ?? ""}<div class="app">${/<h1[\s>]/.test(options.chrome ?? "") ? "" : "<h1>A case</h1>"}
${options.chrome ?? ""}<main id="main" tabindex="-1">
${options.screens ?? START}
</main>
</div>
<script type="application/json" data-proto-fixtures>
${options.fixtures ?? '{ "product": "Cases", "welcome": "Welcome back" }'}
</script>
</body>
</html>
`;
}

/**
 * A small generic synthetic design with two flows (`items`, `settings`) and one block (`blocks/item-card.html`), owned
 * by the tests so no check or viewer test depends on the shipped example.
 */
export function flowDesign(): Record<string, string> {
  return {
    [FLOW_DESIGN]: single({
      head: '<meta name="platforms" content="web ios android">\n<meta name="themes" content="light dark">\n',
      styles: `<style data-proto-tokens>
:root { --color-surface: #f7f8fa; --color-ink: #181c23; --color-accent: #2558d4; --ring: 0 0 0 2px #2558d4; }
:root[data-proto-theme="dark"] { --color-surface: #101216; --color-ink: #e6e9ef; --color-accent: #7ea6ff; --ring: 0 0 0 2px #7ea6ff; }
</style>
<style>
body { background: var(--color-surface); color: var(--color-ink); }
p { color: var(--color-ink); }
[hidden] { display: none !important; }
</style>`,
      chrome:
        '<nav aria-label="Main"><button type="button" data-proto-go="items:list" data-proto-component="tab" data-testid="nav-items">Items</button><button type="button" data-proto-go="settings:prefs" data-proto-component="tab" data-testid="nav-settings">Settings</button></nav>\n<button type="button" data-proto-back data-testid="app-back" hidden><span data-proto-slot="back-label">Back</span></button>\n<h1 data-proto-slot="title"></h1>\n',
      screens: '<div data-proto-flow="items" data-proto-title="Items"></div>\n<div data-proto-flow="settings" data-proto-title="Settings"></div>',
      fixtures: JSON.stringify(
        {
          product: "Items",
          items: {
            loading_status: "Loading items…",
            offline_notice: "Offline: showing cached items.",
            error_notice: "Could not load items.",
            empty_title: "No items yet",
            rows: [
              { name: "First item", status: "Active", meta: "Updated today" },
              { name: "Second item", status: "Draft", meta: "Updated yesterday" },
            ],
          },
          settings: { alerts_summary: "2 saved alerts" },
        },
        null,
        2,
      ),
    }),
    "design/flows/items.html": `<section data-proto-screen="list" data-proto-title="Items" data-proto-initial="populated">
  <div data-proto-state="populated" data-testid="items-populated">
    <div data-proto-list="items.rows"><template data-proto-item><div data-proto-use="item-card" data-proto-arg-action="Open item" data-proto-arg-go="items:detail"></div></template></div>
    <button type="button" data-proto-component="button" data-proto-variant="primary" data-proto-go="items:list/loading" data-testid="items-refresh">Refresh</button>
  </div>
  <div data-proto-state="loading" data-testid="items-loading" aria-busy="true">
    <p role="status" data-proto-text="items.loading_status"></p>
    <button type="button" data-proto-component="button" data-proto-variant="secondary" data-proto-go="items:list/populated" data-testid="items-loading-done">Show items</button>
  </div>
  <div data-proto-state="offline" data-testid="items-offline">
    <p data-proto-text="items.offline_notice"></p>
    <div data-proto-list="items.rows"><template data-proto-item><div data-proto-use="item-card" data-proto-arg-action="Open item" data-proto-arg-go="items:detail"></div></template></div>
  </div>
  <div data-proto-state="error" data-testid="items-error">
    <p role="alert" data-proto-text="items.error_notice"></p>
    <button type="button" data-proto-component="button" data-proto-variant="primary" data-proto-go="items:list/loading" data-testid="items-retry">Try again</button>
  </div>
  <div data-proto-state="empty" data-testid="items-empty">
    <h2 data-proto-text="items.empty_title"></h2>
    <button type="button" data-proto-component="button" data-proto-variant="primary" data-proto-go="settings:prefs" data-testid="items-open-settings">Alert settings</button>
  </div>
</section>
<section data-proto-screen="detail" data-proto-title="Item detail" data-proto-parent="list" data-proto-initial="ready" data-proto-source="items.rows">
  <div data-proto-state="ready" data-testid="detail-ready">
    <h2 data-proto-field="name"></h2>
    <p data-proto-field="meta"></p>
  </div>
</section>
`,
    "design/flows/settings.html": `<section data-proto-screen="prefs" data-proto-title="Alert settings" data-proto-initial="ready">
  <div data-proto-state="ready" data-testid="prefs-ready">
    <p data-proto-text="settings.alerts_summary"></p>
    <button type="button" data-proto-component="button" data-proto-variant="primary" data-proto-go="items:list/populated" data-testid="settings-back-items">Save and return</button>
  </div>
</section>
`,
    "design/blocks/item-card.html": `<article data-proto-component="item-card">
  <h2 data-proto-field="name"></h2>
  <p data-proto-field="status"></p>
  <p class="item-meta" data-proto-field="meta"></p>
  <button type="button" data-proto-component="button" data-proto-variant="secondary" data-proto-go="{{go}}" data-testid="open-item">{{action}}</button>
</article>
`,
  };
}

/**
 * A design of `flows` flows of `screens` screens each, two states a screen, each state linked to the next screen: the
 * size a ceiling test holds the tool and the viewer to.
 */
export function designOfScreens(flows: number, screens: number): Record<string, string> {
  const ids = Array.from({ length: flows }, (_, flow) => `f${flow}`);
  const nav = `<nav aria-label="Main">${ids.map((flow) => `<button type="button" data-proto-go="${flow}:s0" data-testid="nav-${flow}">${flow}</button>`).join("")}</nav>\n`;
  const files: Record<string, string> = {
    [FLOW_DESIGN]: single({
      chrome: `${nav}<h1 data-proto-slot="title"></h1>\n`,
      screens: ids.map((id) => `<div data-proto-flow="${id}" data-proto-title="${id}"></div>`).join("\n"),
      fixtures: '{ "product": "Large" }',
    }),
  };
  for (const flow of ids) {
    const sections = Array.from(
      { length: screens },
      (_, screen) =>
        `<section data-proto-screen="s${screen}" data-proto-title="Screen ${screen}">\n${["success", "empty"].map((state) => `  <div data-proto-state="${state}" data-testid="${flow}-s${screen}-${state}"><p>Text</p>${screen < screens - 1 ? `<button type="button" data-proto-go="${flow}:s${screen + 1}" data-testid="${flow}-s${screen}-${state}-next">Next</button>` : ""}</div>`).join("\n")}\n</section>`,
    );
    files[`design/flows/${flow}.html`] = `${sections.join("\n")}\n`;
  }
  return files;
}

const FILE_COMMANDS = (file: string) => [
  ["check", "--json", file],
  ["screens", file],
  ["components", file],
  ["shots", file],
  ["build", file],
];

function fileCase(name: string, design: string, extra: Record<string, FileContent> = {}): Case {
  return { name, files: { "design/case.html": design, ...extra }, commands: FILE_COMMANDS("design/case.html") };
}

function flowCase(name: string, change: (files: Record<string, FileContent>) => void): Case {
  const files: Record<string, FileContent> = flowDesign();
  change(files);
  return { name, files, commands: FILE_COMMANDS(FLOW_DESIGN) };
}

function edit(files: Record<string, FileContent>, path: string, from: string | RegExp, to: string): void {
  const text = files[path];
  if (typeof text !== "string") throw new Error(`no text at ${path}`);
  const next = text.replace(from, to);
  if (next === text) throw new Error(`no change in ${path} for ${String(from)}`);
  files[path] = next;
}

const two = (body: string) =>
  `${START}\n<section data-proto-screen="next" data-proto-title="Next">\n  <div data-proto-state="success" data-testid="next-success">${body}</div>\n</section>`;
const link = `<button type="button" data-proto-go="next" data-testid="start-next">Next</button>`;
const withLink = (inner: string) => START.replace('<p data-proto-text="welcome"></p>', `<p data-proto-text="welcome"></p>${inner}`);
const use = (name: string, args = "") => `<div data-proto-use="${name}"${args}></div>`;

export const CASES: Case[] = [
  {
    name: "starter",
    files: { "design/a.html": readFileSync(join(ASSETS, "starter.html"), "utf8").replaceAll("{{title}}", "A direction") },
    commands: [...FILE_COMMANDS("design/a.html"), ["shots", "--changed-screen", "start", "design/a.html"]],
  },
  {
    name: "flow-design",
    files: flowDesign(),
    commands: [
      ...FILE_COMMANDS(FLOW_DESIGN),
      ["shots", "--changed-component", "item-card", FLOW_DESIGN],
      ["shots", "--changed-component", "button", "--changed-screen", "settings:prefs", FLOW_DESIGN],
      ["shots", "--frames", "320,nope", FLOW_DESIGN],
      ["stories", "index.json", FLOW_DESIGN],
    ],
  },
  fileCase("pass-minimal", single()),
  fileCase("script", single({ screens: withLink("<script>alert(1)</script>") })),
  fileCase("embeds", single({ screens: withLink('<iframe src="x"></iframe><object data="x"></object><embed src="x">') })),
  fileCase("form", single({ screens: withLink('<form><input data-testid="start-q" aria-label="Q"></form>') })),
  fileCase("head-tags", single({ screens: withLink('<base href="x"><meta name="x" content="y"><link rel="stylesheet" href="x.css"><title>x</title>') })),
  fileCase(
    "head-holds-more",
    single({ head: '<meta http-equiv="refresh" content="0; url=https://example.com">\n<link rel="stylesheet" href="x.css">\n<base href="x">\n' }),
  ),
  fileCase("raw-text-tags", single({ screens: withLink("<xmp>x</xmp><noembed>x</noembed><noframes>x</noframes><noscript>x</noscript>") })),
  fileCase("plaintext", single({ screens: withLink("<plaintext>x") })),
  fileCase("svg-style", single({ screens: withLink('<svg aria-hidden="true"><style>p{}</style></svg>') })),
  fileCase("handler", single({ screens: withLink('<p onclick="x()">x</p>') })),
  fileCase("handler-raw", single({ screens: withLink('<p/onclick="x()">x</p>') })),
  fileCase("javascript-link", single({ screens: withLink('<a href=" JavaScript:x()" data-testid="start-bad">x</a>') })),
  fileCase("unclosed-textarea", single({ screens: withLink('<textarea data-testid="start-t" aria-label="T">') })),
  fileCase("stray-template-end", single({ screens: withLink("</template><template></template>") })),
  fileCase("template-in-attribute", single({ screens: withLink('<p title="<template">x</p>') })),
  fileCase("template-not-an-item", single({ screens: withLink("<template><p>x</p></template>") })),
  fileCase("unclosed-comment", single({ screens: withLink("<!-- open") })),
  fileCase("comment-tricks", single({ screens: withLink("<!--> x --!> <![CDATA[x]]>") })),
  fileCase("declaration", single({ screens: withLink('<!DOCTYPE html><?xml version="1.0"?>') })),
  fileCase("second-body", single({ screens: withLink("<body><p>x</p></body>") })),
  fileCase("screen-not-section", single({ screens: `${START}\n<div data-proto-screen="odd"><div data-proto-state="success">x</div></div>` })),
  fileCase("bad-screen-id", single({ screens: START.replace('data-proto-screen="start"', 'data-proto-screen="-bad id"') })),
  fileCase("bad-names", single({ screens: withLink('<p data-proto-component="BadName" data-proto-variant="Two Words">x</p><p data-testid="Start_X">y</p>') })),
  fileCase("bad-state-name", single({ screens: START.replace('data-proto-state="success"', 'data-proto-state="Not Kebab"') })),
  fileCase("state-near-core", single({ screens: START.replace('data-proto-state="success"', 'data-proto-state="errors"') })),
  fileCase("state-not-a-child", single({ screens: withLink('<div data-proto-state="inner">x</div>') })),
  fileCase("screen-unclosed", single({ screens: START.replace("</section>", "") })),
  fileCase("screen-no-state", single({ screens: `${START}\n<section data-proto-screen="empty" data-proto-title="Empty"><p>x</p></section>` })),
  fileCase("no-screen", single({ screens: "<p>No screen.</p>" })),
  fileCase("screen-repeat", single({ screens: `${START}\n${START.replace("start-success", "start-again")}` })),
  fileCase("bad-initial", single({ screens: START.replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-initial="sucess"') })),
  fileCase("bad-parent", single({ screens: START.replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-parent="hom"') })),
  fileCase("link-missing-screen", single({ screens: withLink('<button type="button" data-proto-go="nxt" data-testid="start-go">Go</button>') })),
  fileCase(
    "link-missing-state",
    single({
      screens: two("x").replace(
        '<p data-proto-text="welcome"></p>',
        `<p data-proto-text="welcome"></p><button type="button" data-proto-go="next/eror" data-testid="start-go">Go</button>`,
      ),
    }),
  ),
  fileCase("testid-repeat", single({ screens: withLink('<button type="button" data-testid="start-success">x</button>') })),
  fileCase("unreached", single({ screens: two("x") })),
  fileCase("reached", single({ screens: two("x").replace('<p data-proto-text="welcome"></p>', `<p data-proto-text="welcome"></p>${link}`) })),
  fileCase("id-and-labels", single({ screens: withLink('<p id="a">x</p><p id="a">y</p><p aria-labelledby="a b">z</p>') })),
  fileCase(
    "controls",
    single({
      screens: withLink(
        '<button type="button"></button><a href="#">x</a><input aria-label="x" data-testid="start-in"><select data-testid="start-sel"></select><img src="data:image/png;base64,AA=="><input type="hidden">',
      ),
    }),
  ),
  fileCase(
    "named-controls",
    single({
      screens: withLink(
        '<label>Name <input data-testid="start-name"></label><button type="button" aria-label="Close" data-testid="start-close"></button><button type="button" data-testid="start-icon"><img alt="Add" src="data:image/png;base64,AA=="></button><input type="submit" value="Send" data-testid="start-send"><img alt="" src="data:image/png;base64,AA=="><button type="button" data-testid="start-hidden"><span aria-hidden="true">x</span></button>',
      ),
    }),
  ),
  fileCase(
    "depth",
    single({
      screens: withLink('<svg aria-hidden="true"><path d="M0 0" fill="#ff0000" stroke="var(--color-ink)"/></svg>'),
      styles: STYLES.replace(
        "p { color: var(--color-ink); }",
        "p { color: var(--color-ink); box-shadow: 0 1px 2px rgba(0,0,0,.2); }\n.ring { box-shadow: var(--ring), 0 0 0 1px currentColor; }\n.soft { filter: blur(4px); }\n.calm { filter: blur(0); backdrop-filter: drop-shadow(0 0 0 red); }\n@supports (backdrop-filter: blur(10px)) { .x { color: inherit; } }",
      ),
    }),
  ),
  fileCase(
    "raw-colors",
    single({
      styles: STYLES.replace(
        "p { color: var(--color-ink); }",
        "p { color: #1c1e21; }\n.a { background: rgb(1, 2, 3); }\n.b { border-color: rebeccapurple; }\n.c { --local: red; --font: Tan Serif; }\n.d { color: transparent; outline-color: Canvas; }\n/* color: red */",
      ),
    }),
  ),
  fileCase(
    "hotlinks",
    single({
      screens: withLink('<img alt="" src="https://example.com/a.png"><p style="background: url(//cdn.example.com/x.png)">x</p>'),
      styles: STYLES.replace("</style>\n<style>", "</style>\n<style>@import url(https://example.com/x.css);\n"),
    }),
  ),
  fileCase(
    "placeholders",
    single({ screens: withLink('<p>Lorem ipsum dolor sit amet</p><p>TODO later</p><p>TODO-12 is a ticket</p><p>John Doe</p><p class="todo">Add a todo</p>') }),
  ),
  fileCase("emoji", single({ screens: withLink("<p>Done ✅ and © 2026</p>") })),
  fileCase(
    "frame-links",
    single({
      screens: withLink(
        '<a href="#start/success?frame=360" data-testid="start-a">a</a><a href="#start/success?theme=dark&frame=phone" data-testid="start-b">b</a><a href="#start/success?frame=ios" data-testid="start-c">c</a>',
      ),
    }),
  ),
  fileCase(
    "device-frames",
    single({
      screens: withLink(
        '<div data-proto-device="ios" style="width: 390px; height: 844px; overflow-y: auto">a</div><div data-proto-device="ios" style="width: 400px; height: 800px">b</div><div data-proto-device="ios">c</div><div data-proto-device="tablet" style="width: 1px">d</div><div data-proto-device="320" style="width:320px;height:568px;overflow:hidden auto">e</div>',
      ),
    }),
  ),
  fileCase("plain-page", "<!doctype html>\n<html><body><p>A page with no screen.</p></body></html>\n"),
  fileCase("no-body", "<!doctype html>\n<html><head><title>x</title></head></html>\n"),
  fileCase("two-fixtures", single({ screens: withLink('<script type="application/json" data-proto-fixtures>{}</script>') })),
  fileCase("fixtures-unclosed", single().replace(/\n<\/script>\n<\/body>/, "\n</body>")),
  fileCase("fixtures-not-json", single({ fixtures: "{ product: 'x' }" })),
  fileCase("no-fixtures", single().replace(/<script type="application\/json" data-proto-fixtures>[\s\S]*?<\/script>\n/, "")),
  fileCase("format-2", single({ format: ' data-proto-format="2"' })),
  fileCase("format-word", single({ format: ' data-proto-format="one"' })),
  fileCase("format-absent", single({ format: "" })),
  fileCase("product-name-long", single({ fixtures: `{ "product": "${"A very long product name ".repeat(4)}", "welcome": "Hi" }` })),
  fileCase(
    "image-fields",
    single({
      screens: withLink(
        '<img data-proto-image="photo" alt=""><img data-proto-image="other" alt=""><img data-proto-image="data" alt=""><img data-proto-image="list.0" alt="">',
      ),
      fixtures:
        '{ "product": "Cases", "welcome": "Hi", "photo": "pic.png", "other": "../outside.png", "data": "data:text/html;base64,AA==", "list": [{"0": "missing.png"}] }',
    }),
    { "design/pic.png": { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } },
  ),
  fileCase(
    "control-characters",
    single({ screens: START.replace('data-proto-title="Start"', 'data-proto-title="Start" data-proto-parent="evil\u001b[2Kok: fine‮"') }),
  ),
  fileCase("work-item", single({ head: '<meta name="work-item" content="SPEC-12">\n' })),
  fileCase("platforms-and-themes", single({ head: '<meta name="platforms" content="ios watch">\n<meta name="themes" content="dark sepia">\n' })),
  fileCase(
    "many-problems",
    single({ screens: withLink(Array.from({ length: 230 }, (_, i) => `<button type="button" data-testid="start-b${i}"></button>`).join("\n")) }),
  ),
  fileCase("deep", single({ screens: withLink("<div>".repeat(405) + "</div>".repeat(405)) })),
  fileCase(
    "list-item-component",
    single({
      screens: `${START.replace('<p data-proto-text="welcome"></p>', `<p data-proto-text="welcome"></p>${link}`)}\n<section data-proto-screen="next" data-proto-title="Next">\n  <div data-proto-state="success" data-testid="next-success"><ul data-proto-list="items"><template data-proto-item><li data-proto-component="row-card"><span data-proto-field="name"></span></li></template></ul></div>\n</section>`,
      fixtures: '{ "product": "Cases", "welcome": "Hi", "items": [{"name": "One"}] }',
    }),
  ),
  fileCase(
    "list-two-items",
    single({
      screens: withLink('<ul data-proto-list="items"><template data-proto-item><li>a</li></template><template data-proto-item><li>b</li></template></ul>'),
      fixtures: '{ "product": "Cases", "welcome": "Hi", "items": [] }',
    }),
  ),
  fileCase(
    "vocabulary",
    single({ screens: withLink('<p data-proto-txt="welcome">x</p><p data-proto-theme="dark">y</p><p data-proto-arg-x="1">z</p><p data-proto-fixtures>w</p>') }),
  ),
  fileCase(
    "slots",
    single({
      chrome: '<h1 data-proto-slot="title"></h1><h2 data-proto-slot="title"></h2><p data-proto-slot="subtitle"></p><div data-proto-slot="screens"></div>\n',
    }),
  ),
  fileCase(
    "blocks",
    single({
      screens: withLink(
        `${use("card", ' data-proto-arg-name="Ada &amp; &lt;b&gt;"')}${use("card")}${use("missing")}${use("loop")}<p data-proto-use="card" class="x"></p>`,
      ),
    }),
    {
      "design/blocks/card.html": '<article data-proto-component="card"><h3>{{name}}</h3><p title="{{name}}">x</p></article>\n',
      "design/blocks/loop.html": `<div>${use("loop")}</div>\n`,
    },
  ),
  fileCase("block-two-roots", single({ screens: withLink(use("pair")) }), { "design/blocks/pair.html": "<p>a</p>\n<p>b</p>\n" }),
  fileCase(
    "tokens-named",
    single({ head: '<meta name="tokens" content="brand/tokens.css missing.css">\n', styles: "<style>\np { color: var(--brand); }\n</style>" }),
    { "brand/tokens.css": ":root { --brand: #202020; }\n" },
  ),
  {
    name: "missing-file",
    files: {},
    commands: [
      ["check", "--json", "design/nope.html"],
      ["screens", "design/nope.html"],
      ["components", "design/nope.html"],
      ["shots", "design/nope.html"],
      ["build", "design/nope.html"],
    ],
  },
  {
    name: "starts",
    files: { "design/taken.html": single() },
    commands: [
      ["new-design", "design/a.html"],
      ["check", "--json", "design/a.html"],
      ["new-design", "design/taken.html"],
      ["new-design", "/tmp/x.html"],
      ["new-design", "../x.html"],
      ["new-design", "design/a b.html"],
      ["new-design", "design/a.txt"],
      ["example"],
    ],
  },
  {
    name: "rounds",
    files: {
      ...flowDesign(),
      "c.json": JSON.stringify({
        round: 1,
        items: [{ id: "r1-1", type: "remove", screen: "items:list", state: "empty", comment: "Remove this.", box: { x: 1.5, y: 2, width: 10, height: 5 } }],
      }),
      "bad.json": JSON.stringify({ round: 1, items: [{ id: "x", screen: "s" }] }),
      "many.json": JSON.stringify({ round: 1, items: Array.from({ length: 201 }, (_, i) => ({ id: `r1-${i + 1}`, screen: "s", state: "t", comment: "c" })) }),
      "long.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "x".repeat(2001) }] }),
      "nan.json": '{"round": 1, "items": [{"id": "r1-1", "screen": "s", "state": "t", "comment": NaN}]}',
      "design/rounds/app/2/changes.json": '{"changes": [{"answers": ["r1-1"], "summary": "Removed."}]}',
    },
    commands: [
      ["save-comments", "c.json", FLOW_DESIGN],
      ["save-comments", "c.json", FLOW_DESIGN],
      ["save-comments", "--round", "3", "c.json", FLOW_DESIGN],
      ["save-comments", "bad.json", FLOW_DESIGN],
      ["save-comments", "--round", "4", "many.json", FLOW_DESIGN],
      ["save-comments", "--round", "5", "long.json", FLOW_DESIGN],
      ["save-comments", "nan.json", FLOW_DESIGN],
      ["save-comments", "--round", "0", "c.json", FLOW_DESIGN],
      ["save-comments", "missing.json", FLOW_DESIGN],
      ["build", FLOW_DESIGN],
    ],
  },
  { name: "space-in-path", files: { "design/my case.html": single() }, commands: [["check", "--json", "design/my case.html"]] },
  { name: "no-design", files: {}, commands: [["check", "--json"], ["check"]] },
  flowCase("flow-without-file", (f) =>
    edit(f, FLOW_DESIGN, '<div data-proto-flow="items"', '<div data-proto-flow="ghost" data-proto-title="Ghost"></div>\n<div data-proto-flow="items"'),
  ),
  flowCase("flow-empty", (f) => {
    edit(f, FLOW_DESIGN, '<div data-proto-flow="items"', '<div data-proto-flow="blank" data-proto-title="Blank"></div>\n<div data-proto-flow="items"');
    f["design/flows/blank.html"] = "<p>No screens here.</p>\n";
  }),
  flowCase("flow-hostile", (f) =>
    edit(
      f,
      "design/flows/settings.html",
      /<\/section>\s*$/,
      '<script>x()</script><p onclick="y()">z</p><a href="javascript:void(0)" data-testid="prefs-js">j</a></template><form></form></section>\n',
    ),
  ),
  flowCase("flow-bad-link", (f) =>
    edit(
      f,
      "design/flows/settings.html",
      /<\/section>\s*$/,
      '<button type="button" data-proto-go="items:missing" data-testid="prefs-bad">Bad</button></section>\n',
    ),
  ),
  flowCase("flow-missing-list", (f) =>
    edit(f, "design/flows/settings.html", /<\/section>\s*$/, '<ul data-proto-list="x"><template data-proto-item><li>x</li></template></ul></section>\n'),
  ),
  flowCase("flow-unreached", (f) => {
    edit(f, FLOW_DESIGN, '<div data-proto-flow="settings"', '<div data-proto-flow="alone" data-proto-title="Alone"></div>\n<div data-proto-flow="settings"');
    f["design/flows/alone.html"] =
      '<section data-proto-screen="a" data-proto-title="A"><div data-proto-state="success" data-testid="alone-a">x</div></section>\n';
  }),
  flowCase("flow-duplicate-and-bad-id", (f) =>
    edit(
      f,
      FLOW_DESIGN,
      '<div data-proto-flow="items"',
      '<div data-proto-flow="Bad Id"></div>\n<div data-proto-flow="items" data-proto-title="Again"></div>\n<div data-proto-flow="items"',
    ),
  ),
  flowCase("flow-blocks", (f) => {
    edit(
      f,
      "design/flows/settings.html",
      /<\/section>\s*$/,
      `</section>\n${use("missing-block")}\n${use("loop-a")}\n${use("needs", ' data-proto-arg-x="1"')}\n${use("Bad_Name")}\n`,
    );
    f["design/blocks/loop-a.html"] = `<div>${use("loop-b")}</div>\n`;
    f["design/blocks/loop-b.html"] = `<div><p>b</p>\n${use("loop-a")}</div>\n`;
    f["design/blocks/needs.html"] = "<p>{{x}} and {{y}}</p>\n";
  }),
  flowCase("flow-screen-no-state", (f) =>
    edit(f, "design/flows/settings.html", /\s*$/, '\n<section data-proto-screen="bare" data-proto-title="Bare"><p>x</p></section>\n'),
  ),
  flowCase("flow-page-element", (f) => edit(f, "design/flows/settings.html", /\s*$/, "\n<body><p>x</p></body>\n<style>p {}</style>\n")),
  flowCase("flow-lint-in-block", (f) => edit(f, "design/blocks/item-card.html", '<p class="item-meta"', '<p style="color: #ff0000" class="item-meta"')),
];
