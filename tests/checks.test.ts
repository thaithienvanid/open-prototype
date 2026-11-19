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
import { answerWithin, cli, json, project } from "./helpers.ts";

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
      "accessibility.name",
      screen('<button type="button" data-testid="start-go"></button>'),
      screen('<button type="button" data-testid="start-go" aria-label="Go"></button>'),
      [at("accessibility.name", 17)],
    ],
    [
      "accessibility.label",
      screen('<input data-testid="start-q">'),
      screen('<label>Query <input data-testid="start-q"></label>'),
      [at("accessibility.label", 17)],
    ],
    [
      "accessibility.alt",
      screen('<img src="data:image/png;base64,AA==">'),
      screen('<img alt="" src="data:image/png;base64,AA==">'),
      [at("accessibility.alt", 17)],
    ],
    ["integrity.id-repeat", screen('<p id="a">x</p><p id="a">y</p>'), screen('<p id="a">x</p><p id="b">y</p>'), [at("integrity.id-repeat", 17)]],
    [
      "integrity.labelledby",
      screen('<p aria-labelledby="nope">x</p>'),
      screen('<p id="t">T</p><p aria-labelledby="t">x</p>'),
      [at("integrity.labelledby", 17)],
    ],
    ["integrity.testid-repeat", screen('<p data-testid="start-ok">x</p>'), screen('<p data-testid="start-other">x</p>'), [at("integrity.testid-repeat", 17)]],
    [
      "integrity.link",
      screen('<button type="button" data-proto-go="nowhere" data-testid="start-go">Go</button>'),
      screen('<button type="button" data-proto-go="start" data-testid="start-go">Go</button>'),
      [at("integrity.link", 17)],
    ],
    [
      "integrity.link",
      screen('<button type="button" data-proto-go="start/nope" data-testid="start-go">Go</button>'),
      screen('<button type="button" data-proto-go="start/success" data-testid="start-go">Go</button>'),
      [at("integrity.link", 17)],
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
      "integrity.screen-repeat",
      `${screen('<button type="button" data-proto-go="Start" data-testid="start-go">Go</button>')}\n${screen("y").replace('"start"', '"Start"').replace("start-ok", "start-two")}`,
      `${screen('<button type="button" data-proto-go="Begin" data-testid="start-go">Go</button>')}\n${screen("y").replace('"start"', '"Begin"').replace("start-ok", "start-two")}`,
      [at("integrity.screen-repeat", 19)],
    ],
    [
      "structure.no-state",
      `${screen("x")}\n<section data-proto-screen="b"><p>y</p></section>`,
      screen("x"),
      [at("structure.no-state", 19), at("integrity.unreached", 19)],
    ],
    ["paint.raw-color", screen('<p style="color: #ff0000">x</p>'), screen('<p style="color: var(--color-ink)">x</p>'), [at("paint.raw-color", 17)]],
    [
      "paint.raw-color",
      screen('<svg aria-hidden="true"><path d="M0 0" fill="red"/></svg>'),
      screen('<svg aria-hidden="true"><path d="M0 0" fill="currentColor"/></svg>'),
      [at("paint.raw-color", 17)],
    ],
    [
      "paint.depth",
      screen('<p style="box-shadow: 0 2px 4px var(--color-ink)">x</p>'),
      screen('<p style="box-shadow: 0 0 0 2px var(--color-ink)">x</p>'),
      [at("paint.depth", 17)],
    ],
    [
      "integrity.load",
      screen('<p style="background: url(https://example.com/a.png)">x</p>'),
      screen('<p style="background: var(--color-ink)">x</p>'),
      [at("integrity.load", 17)],
    ],
    [
      "integrity.load",
      screen('<p style="background: url(hero.png)">x</p>'),
      screen('<p style="background: url(data:image/png;base64,AA==)">x</p>'),
      [at("integrity.load", 17)],
    ],
    ["copy.placeholder", screen("<p>Lorem ipsum</p>"), screen("<p>Ticket TODO-12</p>"), [at("copy.placeholder", 17)]],
    ["copy.emoji", screen("<p>Done ✅</p>"), screen("<p>© 2026</p>"), [at("copy.emoji", 17)]],
    [
      "device.frame",
      screen('<div data-proto-device="tablet">a</div>'),
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px; overflow-y: auto">a</div>'),
      [at("device.frame", 17)],
    ],
    [
      "device.frame-style",
      screen('<div data-proto-device="ios" style="width: 400px; height: 844px; overflow-y: auto">a</div>'),
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px; overflow: hidden auto">a</div>'),
      [at("device.frame-style", 17)],
    ],
    [
      "device.frame-style",
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px">a</div>'),
      screen('<div data-proto-device="ios" style="width: 390px; height: 844px; overflow-y: scroll">a</div>'),
      [at("device.frame-style", 17)],
    ],
    ["structure.name", screen('<p data-proto-component="Card">x</p>'), screen('<p data-proto-component="card">x</p>'), [at("structure.name", 17)]],
    ["structure.nesting", screen("<p><b>Due</p><p>Today</p>"), screen("<p><b>Due</b></p><p>Today</p>"), [at("structure.nesting", 17)]],
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
      'the raw colour in "color: red" is outside the tokens block; read a role with var(), such as var(--color-accent)',
    ]);
  });

  // The suggestions read a tokens block's names as the CSS reader does, capitals and `_` too; they named lower case only.
  test("a suggestion names a token whose name holds capitals or an underscore", () => {
    const tokens = "<style data-proto-tokens>:root { --brandBlue: #0055ff; --a_b: #112233; --Card_Shadow: 0 2px 8px; }</style>";
    expect(lint(`${tokens}<style>.x { color: #0055ff } .y { color: #112233 } .z { box-shadow: 0 2px 8px }</style>`).map((issue) => issue.message)).toEqual([
      expect.stringContaining("such as var(--brandBlue)"),
      expect.stringContaining("such as var(--a_b)"),
      expect.stringContaining("so read it with var(--Card_Shadow)"),
    ]);
  });

  // The rule reads the property and the value the CSS reader read: a property in any case and spacing, the shorthands
  // that name a colour, and a value with its strings and url()s cut out; a style attribute is read after its references.
  test.each([
    ["BACKGROUND: RED", 1],
    ["Color: #FFF", 1],
    ["color : blue", 1],
    ["text-decoration: underline red", 1],
    ["column-rule: 1px solid #ff0000", 1],
    ["text-emphasis: dot RGB(1, 2, 3)", 1],
    ['background: url("data:image/png;base64,AAAA") #ffffff', 1],
    ["mask: url(#fade)", 0],
    ["fill: url(#fade-out)", 0],
    ["background-image: url(sprite.svg#add)", 0],
    ['content: "{ color: red }"', 0],
    ["--label: 'Red'", 0],
  ])("paint.raw-color in %p: %d", (css, count) => {
    expect(lint(`<style>p { ${css} }</style>`).filter((issue) => issue.rule === "paint.raw-color").length).toBe(count);
  });

  test.each([
    ['<p style="--label: &#039;Red&#039;">x</p>', []],
    ['<p style="color: &#x72;ed">x</p>', ["paint.raw-color:1"]],
    ['<p style="&#47;* color: red */ margin: 0">x</p>', []],
    ['<p\nstyle="margin: 0;&#10;color: red">x</p>', ["paint.raw-color:2"]],
  ])("a style attribute is read after its references: %p", (markup, expected) => {
    expect(lint(markup).map((issue) => `${issue.rule}:${issue.line}`)).toEqual(expected);
  });

  // CSS stands where the tokenizer reads a style element or a style attribute, never in text that looks like one, and a
  // load the CSS spans over two lines is one load.
  test("the paint rules read no CSS in a page's words or comments, and find a load written over two lines", () => {
    const rules = (text: string) => lint(text).map((issue) => `${issue.rule}:${issue.line}`);
    expect(rules('<p>In CSS, avoid style="color: #ff0000" inline.</p>')).toEqual([]);
    expect(rules('<!-- @import "https://example.com/a.css" -->')).toEqual([]);
    expect(rules("<p>Use url(https://example.com/a.png)</p>")).toEqual([]);
    expect(rules("<style>/* url(https://example.com/a.png) */ p { margin: 0 }</style>")).toEqual([]);
    expect(rules("<style>body { background: url(\n  https://evil.example/a.png); }</style>")).toEqual(["integrity.load:1"]);
    expect(rules('<p>x</p>\n<p style="background: url(https://example.com/a.png)">x</p>')).toEqual(["integrity.load:2"]);
  });

  // Blocks are filled before the walk, so a `{{name}}` left in the design names nothing and is shown as written: no rule
  // passes it over.
  test.each([
    ["a go", '<button type="button" data-proto-go="{{nowhere}}" data-testid="start-go">Go</button>', "integrity.link"],
    ["a text key", '<p data-proto-text="no.such{{}}key"></p>', "integrity.fixture-key"],
    ["an aria-labelledby", '<p aria-labelledby="{{id}}">x</p>', "integrity.labelledby"],
    ["a repeated id", '<p id="{{a}}">1</p><p id="{{a}}">2</p>', "integrity.id-repeat"],
    ["an svg fill", '<svg aria-hidden="true"><rect fill="{{red}}" width="1" height="1"/></svg>', "paint.raw-color"],
    ["the copy", "<p>Hello {{name}}</p>", "copy.placeholder"],
  ])("a {{name}} in %s is a finding", async (_what, markup, rule) => {
    const result = await findings(single({ screens: screen(markup) }));
    expect([result.code, result.found]).toEqual([1, [at(rule, 17)]]);
  });

  // The page's policy loads an image only as a data: URI and no stylesheet but its own, so a url() that names a file
  // draws nothing; each load is named by its own address, an @import's string and an image-set()'s among them.
  test("a url(), an @import, or an image-set() that names a file or the network is a finding at its line, with its own address", () => {
    const found = (css: string) => lint(`<style>\n${css}\n</style>`).map((issue) => `${issue.rule}:${issue.line}: ${issue.message}`);
    expect(found('.x { background: url(hero.png); }\n.y { cursor: url("hand.cur"), auto; }')).toEqual([
      "integrity.load:2: url(hero.png) names a file, which the page's Content-Security-Policy never loads: write the image as a data: URI, or draw it in an <img> with data-proto-image and a key of the fixtures",
      "integrity.load:3: url(hand.cur) names a file, which the page's Content-Security-Policy never loads: write the image as a data: URI, or draw it in an <img> with data-proto-image and a key of the fixtures",
    ]);
    expect(found('@import "tokens.css";\n@import url(other.css) screen;')).toEqual(
      [
        '"tokens.css" names a file, which the page\'s Content-Security-Policy never loads: write its rules in a <style>, or name a tokens file with <meta name="tokens">',
        'url(other.css) names a file, which the page\'s Content-Security-Policy never loads: write its rules in a <style>, or name a tokens file with <meta name="tokens">',
      ].map((message, index) => `integrity.load:${index + 2}: @import ${message}`),
    );
    expect(found('@import "https://example.com/a.css";\n.y { background: image-set("https://cdn.example/b.png" 1x); }')).toEqual([
      "integrity.load:2: https://example.com/a.css loads from the network, which the page's Content-Security-Policy blocks: keep the image or the font in the project. For a font, download its files, for example from Google Fonts or Fontsource, keep them in the project, and point url() at them",
      "integrity.load:3: https://cdn.example/b.png loads from the network, which the page's Content-Security-Policy blocks: keep the image or the font in the project. For a font, download its files, for example from Google Fonts or Fontsource, keep them in the project, and point url() at them",
    ]);
    expect(found('.w { background: -webkit-image-set("hero.png" 1x, url(hero2.png) 2x); }').map((line) => line.split(":").slice(0, 2).join(":"))).toEqual([
      "integrity.load:2",
    ]);
    // A fragment names an element of the page, a data: URI is the image itself, and a font file is the font rules'.
    expect(
      found(
        '.z { mask: url(#fade); fill: url( "#grad" ); background: url("data:image/png;base64,AAAA"), url(data:image/gif;base64,R0lG); }\n@font-face { font-family: x; src: url(fonts/x.woff2); }\n.q { content: "url(a.png)"; }',
      ).filter((line) => !line.startsWith("paint.raw-color")),
    ).toEqual([]);
    // An @namespace names a namespace and loads nothing, and a load after its `;` is read.
    expect(
      found('@namespace svg url(http://www.w3.org/2000/svg);\n@NAMESPACE url(foo);\n@namespace x "y"; .a { background: url(hero.png) }').map((line) =>
        line.split(":").slice(0, 2).join(":"),
      ),
    ).toEqual(["integrity.load:4"]);
  });

  test("a quote after a backslash stays in its string, so the rule after it is read", () => {
    const sheet = cssSheet('<style>p { content: "a\\"b; color: red"; margin: 0 }</style>');
    expect(sheet.rules.map((rule) => rule.declarations.map((item) => item.property))).toEqual([["content", "margin"]]);
  });

  // A browser reads an unquoted url() to its `)`, a custom property's `{ }` as its value, and a declaration directly in
  // an at-rule nested in a rule as that rule's.
  test("the CSS reader reads an unquoted url(), a custom property's block, and an at-rule nested in a rule as a browser does", () => {
    const rules = (css: string) => lint(`<style>${css}</style>`).map((issue) => issue.rule);
    expect(rules(".a { background: url(data:image/png;base64,AA==) #ffffff; }")).toEqual(["paint.raw-color"]);
    expect(rules(".s { --stripe: { color: red }; margin: 0 }")).toEqual([]);
    const sheet = cssSheet("<style>.s { --stripe: { a: b }; margin: 0 }\n.a { @media (min-width: 1px) { color: red; } }</style>");
    expect(
      sheet.rules.map(({ selector, at, parents, declarations }) => [selector, at, parents, declarations.map((item) => `${item.property}: ${item.value}`)]),
    ).toEqual([
      [".s", [], [], ["--stripe: { a: b }", "margin: 0"]],
      [".a", ["@media (min-width: 1px)"], [], ["color: red"]],
      [".a", [], [], []],
    ]);
  });

  test("a device's style is read by the one CSS reader, so a comment in it hides no size", async () => {
    const style = "width: 390px; /* height: 1px; */ height: 844px; overflow-y: auto";
    const result = await findings(single({ screens: screen(`<div data-proto-device="ios" style="${style}">a</div>`) }));
    expect(result.found.filter((item) => item.rule.startsWith("device."))).toEqual([]);
  });

  // A style attribute and a tokens file took out each `/*` to the next `*/`, a `/*` in a string too, as a browser never does.
  test("a /* in a string of a device's style or a tokens file opens no comment, and one left open runs to the end", async () => {
    const style = "--label: '/*'; width: 390px; height: 844px; overflow-y: auto; --end: '*/'";
    const result = await findings(single({ screens: screen(`<div data-proto-device="ios" style="${style}">a</div>`) }));
    expect(result.found.filter((item) => item.rule.startsWith("device."))).toEqual([]);
    const names = (css: string) => cssSheet(css, { sheet: true }).rules.flatMap((rule) => rule.declarations.map((item) => item.property));
    expect(names(':root { --label: "a /* b"; --color-brand: #0055ff; --end: "*/"; }')).toEqual(["--label", "--color-brand", "--end"]);
    expect(names(":root { --color-brand: #0055ff; } /* :root { --lost: 1px; }")).toEqual(["--color-brand"]);
    const inPage = cssSheet("<style>:root { --color-brand: #0055ff; } /* :root { --lost: 1px; }</style><p>x</p>");
    expect(inPage.rules.flatMap((rule) => rule.declarations.map((item) => item.property))).toEqual(["--color-brand"]);
  });

  test("a state name close to a familiar one is a note, and the design still passes", async () => {
    const result = await findings(single({ screens: screen("x").replace('data-proto-state="success"', 'data-proto-state="errors"') }));
    expect([result.code, result.found.map((item) => item.rule)]).toEqual([0, ["structure.state-near-core"]]);
  });

  test("a document with no body is one read finding, at its first line", async () => {
    const result = await findings('<!doctype html>\n<html lang="en"><head><title>x</title></head></html>\n');
    expect(result.found).toEqual([at("read.document", 1), at("structure.no-screen", 1)]);
  });

  test("more than 200 problems print 200 and say how many more", async () => {
    const many = screen(Array.from({ length: 230 }, (_, i) => `<button type="button" data-testid="start-b${i}"></button>`).join("\n"));
    const result = await findings(single({ screens: many }));
    expect(result.found.length).toBe(201);
    expect(result.found.at(-1)?.rule).toBe("integrity.more");
  });

  // The limit keeps every finding that stops the page, then problems, then notes, so a problem past 200 notes is printed
  // and a design of notes alone passes; the last line is a note and names what it cut.
  describe("the findings limit cuts notes before problems", () => {
    // Screens whose state is `errors`, each one `structure.state-near-core` note, reached from the first screen.
    const notes = (count: number, last = "") =>
      `<section data-proto-screen="start" data-proto-title="Start">\n<div data-proto-state="success" data-testid="start-ok">${Array.from(
        { length: count },
        (_, i) => `<button type="button" data-proto-go="n${i}" data-testid="start-n${i}">N${i}</button>`,
      ).join("")}</div>\n</section>\n${Array.from(
        { length: count },
        (_, i) =>
          `<section data-proto-screen="n${i}" data-proto-title="N${i}"><div data-proto-state="errors" data-testid="n${i}-e">x${i === count - 1 ? last : ""}</div></section>`,
      ).join("\n")}`;
    const checked = async (screens: string) => {
      const ran = await cli(project({ "design/case.html": single({ screens }) }), "check", "--json", "design/case.html");
      return { code: ran.code, found: json<{ findings: (Finding & { level: string; message: string })[] }>(ran).findings };
    };

    test("a design with only notes past the limit passes, and the last line says how many notes it cut", async () => {
      const { code, found } = await checked(notes(210));
      expect(code).toBe(0);
      expect(found.length).toBe(201);
      expect(found.at(-1)).toMatchObject({ rule: "integrity.more", level: "note", message: "and 10 more notes; fix these, then check again" });
    });

    test("problems that come after 200 notes are printed, at their lines, and the design fails", async () => {
      const last = '<button type="button" data-testid="n209-b"></button><button type="button">Go</button><img src="data:image/png;base64,AA==">';
      const { code, found } = await checked(notes(210, last));
      expect(code).toBe(1);
      expect(found.filter((item) => item.level === "problem").map(({ rule, line }) => `${rule}:${line}`)).toEqual([
        "integrity.testid:228",
        "accessibility.name:228",
        "accessibility.alt:228",
      ]);
      expect(found.length).toBe(201);
      expect(found.at(-1)?.message).toBe("and 13 more notes; fix these, then check again");
    });

    test("more problems than the limit fail, and the last line counts the problems and the notes it cut", async () => {
      const problems = Array.from({ length: 205 }, (_, i) => `<button type="button" data-testid="start-b${i}"></button>`).join("\n");
      const { code, found } = await checked(notes(3).replace("</div>", `${problems}</div>`));
      expect(code).toBe(1);
      expect(found.filter((item) => item.level === "problem").length).toBe(200);
      expect(found.at(-1)?.message).toBe("and 5 more problems and 3 more notes; fix these, then check again");
    });

    test("a finding that stops the page is never cut, past any number of problems", async () => {
      const problems = Array.from({ length: 230 }, (_, i) => `<button type="button" data-testid="start-b${i}"></button>`).join("\n");
      const { found } = await checked(screen(`${problems}\n<iframe src="data:text/html,x"></iframe>`));
      // The iframe gives two findings that stop the page, so 198 other problems fill the limit and 32 are cut.
      expect(found.filter((item) => item.rule === "unsafe.markup").length).toBe(2);
      expect(found.length).toBe(201);
      expect(found.at(-1)?.message).toBe("and 32 more problems; fix these, then check again");
    });

    test("when every finding stops the page, none is cut past the limit, so no last line counts nothing", async () => {
      // Each element is one the allow-list refuses by its own name, so each is a finding of its own.
      const refused = Array.from({ length: 210 }, (_, i) => `<made-up-${i}></made-up-${i}>`).join("\n");
      const { code, found } = await checked(screen(refused));
      expect(code).toBe(1);
      expect(found.length).toBe(210);
      expect(found.map((item) => item.rule)).toEqual(Array.from({ length: 210 }, () => "unsafe.markup"));
    });
  });

  // A flow's start tag that names a link is written again with its flow. Its line breaks inside a value, counted
  // twice, moved every finding after it down, in the flow and in the main file.
  test.each([">", "/>"])("a flow's start tag whose value holds line breaks, ended with %p, keeps every finding at its line", async (end) => {
    const files = flowDesign();
    files[FLOW_DESIGN] = (files[FLOW_DESIGN] ?? "").replace("</main>", '<button type="button">After</button>\n</main>');
    files["design/flows/settings.html"] = (files["design/flows/settings.html"] ?? "").replace(
      "Save and return</button>",
      `Save and return</button>\n    <input type="button" value="Go" data-testid="go-a" data-proto-go="nowhere" title="a\nb\nc"${end}\n    <button type="button" data-proto-go="nowhere-b" data-testid="go-b">Go</button>`,
    );
    const ran = await cli(project(files), "check", "--json", FLOW_DESIGN);
    expect(json<{ findings: Finding[] }>(ran).findings.map(({ rule, file, line }) => ({ rule, file, line }))).toEqual([
      at("integrity.testid", 26, FLOW_DESIGN),
      at("integrity.link", 5, "design/flows/settings.html"),
      at("integrity.link", 8, "design/flows/settings.html"),
    ]);
  });

  // The fixtures' text starts where its start tag ends, so a JSON mistake and a finding in the fixtures are each at
  // their own line, however many lines the tag is written over.
  const OPEN_TAG = '<script type="application/json" data-proto-fixtures>';
  test.each([
    ["one line", OPEN_TAG, 0],
    ["three lines", '<script\n  type="application/json"\n  data-proto-fixtures>', 2],
  ])("a finding in the fixtures, with a start tag written on %s, is at the file's own line", async (_, tag, moved) => {
    const written = (fixtures: string) => single({ fixtures }).replace(OPEN_TAG, tag);
    const twice = await findings(written('{\n  "product": "Cases",\n  "welcome": "Welcome back",\n  "x": 1,\n  "x": 2\n}'));
    expect(twice.found).toEqual([at("read.fixtures", 26 + moved)]);
    const placeholder = await findings(written('{\n  "product": "Cases",\n  "welcome": "Welcome back",\n  "note": "TODO later"\n}'));
    expect(placeholder.found).toEqual([at("copy.placeholder", 25 + moved)]);
  });

  // The copy rules read the words the page shows: each string value of the parsed fixtures, never a key, and never a
  // data: URI, whose base64 may hold any capitals. A value's escapes are read as JSON reads them. The fixtures' `{` is on
  // line 22.
  test("the copy rules read the fixtures' string values, never a key or a data: URI, each at its own line", async () => {
    const fixtures = [
      "{",
      '  "product": "Cases", "welcome": "Welcome back",',
      '  "TODO": "Buy milk",',
      '  "pic": "data:image/png;base64,iVBOR/TBD/w0KGgo=",',
      '  "two": "Line one\\nFIXME", "esc": "\\u0054BD",',
      '  "rows": [{ "TBD": "fine" }, { "name": "Lorem ipsum" }],',
      '  "count": 3',
      "}",
    ].join("\n");
    const result = await findings(single({ fixtures }));
    expect(result.found).toEqual([at("copy.placeholder", 26), at("copy.placeholder", 26), at("copy.placeholder", 27)]);
  });
});

// A flow's go or parent names its own screen when the flow holds that screen, and a screen of the main file otherwise,
// so a screen moved into a flow keeps its links to the screens left behind.
describe("the screens a flow's links name, and a flow inside a flow", () => {
  const section = (id: string, inner: string, parent = "") =>
    `<section data-proto-screen="${id}" data-proto-title="${id}"${parent ? ` data-proto-parent="${parent}"` : ""}>\n<div data-proto-state="ready" data-testid="${id}-ready"><p>${id}</p>${inner}</div>\n</section>\n`;
  const go = (from: string, target: string) =>
    `<button type="button" data-proto-go="${target}" data-testid="${from}-to-${target.replace(/[:/]/g, "-")}">Go</button>`;
  // home and about in the main file, around the flows `items` and `settings`. Each link below is the only one to its
  // screen, so a link that named the wrong screen leaves one unreached.
  const files = (items: string, settings: string, top = "") => ({
    "design/case.html": single({
      screens: `${section("home", go("home", "items:list"))}<div data-proto-flow="items"></div>\n<div data-proto-flow="settings"></div>\n${section("about", "")}${top}`,
    }),
    "design/flows/items.html": items,
    "design/flows/settings.html": settings,
  });
  const run = async (written: Record<string, string>) => {
    const ran = await cli(project(written), "check", "--json", "design/case.html");
    return json<{ findings: (Finding & { message: string })[] }>(ran).findings;
  };
  // list links to detail before detail is declared, and detail to list after; detail names list as its parent.
  const items = (extra = "") =>
    section("list", `${go("list", "detail")}${extra}`) +
    section("detail", `${go("detail", "list/ready")}${go("detail", "about")}${go("detail", "settings:prefs")}`, "list");

  test("a flow's own screen, before and after the link, a main-file screen, and another flow's screen are each the one named", async () => {
    const settings = section("prefs", go("prefs", "items:detail/ready"), "home") + section("alerts", "", "items:list");
    const found = await run(files(items(go("list", "settings:alerts")), settings));
    expect(found.map(({ rule, file, line }) => ({ rule, file, line }))).toEqual([]);
  });

  test("a flow's screen hides a main-file screen of the same id", async () => {
    const top = section("detail", "");
    const found = await run(files(items(), section("prefs", ""), top));
    // home on lines 16 to 18, the two flow hosts on 19 and 20, about on 21 to 23, and the main file's detail on 24.
    expect(found.filter((item) => item.rule === "integrity.unreached").map(({ file, line, message }) => ({ file, line, message }))).toEqual([
      { file: "design/case.html", line: 24, message: expect.stringContaining("screen `detail` is not reached") },
    ]);
  });

  test("a parent in a flow names its own screen, a main-file screen, or another flow's screen", async () => {
    const settings = section("prefs", "", "home") + section("alerts", "", "items:list") + section("more", "", "alerts");
    const found = await run(files(items(go("list", "settings:prefs") + go("list", "settings:alerts") + go("list", "settings:more")), settings));
    expect(found.filter((item) => item.rule === "integrity.parent")).toEqual([]);
    const wrong = await run(files(items(go("list", "settings:prefs")), section("prefs", "", "nowhere")));
    expect(wrong.filter((item) => item.rule === "integrity.parent").map(({ file, line }) => ({ file, line }))).toEqual([
      { file: "design/flows/settings.html", line: 1 },
    ]);
  });

  test("a target that names nothing is a finding at its line, which quotes what was written and suggests something else", async () => {
    const found = await run(files(items(go("list", "abot")), section("prefs", go("prefs", "list"))));
    const links = found.filter((item) => item.rule === "integrity.link");
    expect(links.map(({ file, line }) => ({ file, line }))).toEqual([
      { file: "design/flows/items.html", line: 2 },
      { file: "design/flows/settings.html", line: 2 },
    ]);
    expect(links[0]?.message).toContain('data-proto-go="abot" names no screen; did you mean `about`?');
    expect(links[1]?.message).toStartWith('data-proto-go="list" names no screen;');
    expect(links[1]?.message).not.toContain("did you mean `list`");
  });

  test("a flow included inside a flow is a finding at its own file and line, and one inside a block of a flow too", async () => {
    const files = flowDesign();
    files["design/flows/settings.html"] =
      `${files["design/flows/settings.html"] ?? ""}<div data-proto-flow="inner"></div>\n<div data-proto-use="nest"></div>\n`;
    files["design/blocks/nest.html"] = '<div>\n<div data-proto-flow="deeper"></div>\n</div>\n';
    const ran = await cli(project(files), "check", "--json", FLOW_DESIGN);
    const found = json<{ findings: (Finding & { message: string })[] }>(ran).findings.filter((item) => item.rule === "flow.include");
    expect(found.map(({ file, line }) => ({ file, line }))).toEqual([
      { file: "design/flows/settings.html", line: 7 },
      { file: "design/blocks/nest.html", line: 2 },
    ]);
    expect(found[0]?.message).toContain('data-proto-flow="inner" stands inside the flow settings');
  });
  test("a fault of nesting in a flow or a block is told at its own file and line, once for a block used twice", async () => {
    const files = flowDesign();
    files["design/flows/settings.html"] = `${files["design/flows/settings.html"] ?? ""}<table>\n<tr>Loose</tr>\n</table>\n`;
    files["design/blocks/cell.html"] = "<div>\n<td>Cell</td>\n</div>\n";
    files["design/flows/settings.html"] += '<div data-proto-use="cell"></div>\n<div data-proto-use="cell"></div>\n';
    const ran = await cli(project(files), "check", "--json", FLOW_DESIGN);
    const found = json<{ findings: Finding[] }>(ran).findings.filter((item) => item.rule === "structure.nesting");
    expect(found.map(({ file, line }) => ({ file, line }))).toEqual([
      { file: "design/flows/settings.html", line: 8 },
      { file: "design/blocks/cell.html", line: 2 },
    ]);
  });
});

// The design reads its main file's first fixtures block. One in a flow or a block, and a second in the main file, is
// told at its own file and line.
test("a fixtures block in a flow or a block, and a second in the main file, are each a finding at its own place", async () => {
  const block = '<script type="application/json" data-proto-fixtures>{}</script>';
  const files = flowDesign();
  files["design/flows/settings.html"] = `${files["design/flows/settings.html"] ?? ""}${block}\n<div data-proto-use="data"></div>\n`;
  files["design/blocks/data.html"] = `<div>\n${block}\n</div>\n`;
  files[FLOW_DESIGN] = (files[FLOW_DESIGN] ?? "").replace("</body>", `${block}\n</body>`);
  const ran = await cli(project(files), "check", "--json", FLOW_DESIGN);
  const found = json<{ findings: (Finding & { message: string })[] }>(ran).findings.filter((item) => item.rule === "read.fixtures");
  const second = (files[FLOW_DESIGN] ?? "").split("\n").indexOf(block) + 1;
  expect(found.map(({ file, line }) => ({ file, line }))).toEqual([
    { file: FLOW_DESIGN, line: second },
    { file: "design/flows/settings.html", line: 7 },
    { file: "design/blocks/data.html", line: 2 },
  ]);
  expect(found[0]?.message).toContain("a second fixtures block");
  expect(found[1]?.message).toContain("a fixtures block in a flow or a block");
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

  // 400,000 spaces after a fallback's comma, with no `)`: a pattern that reads those spaces two ways took seconds at half as many.
  test("a var() that never closes is read in time in step with its length", async () => {
    const script = `import { followVars } from "./src/css/sheet.ts";
const value = "var(--a," + " ".repeat(400_000);
console.log(JSON.stringify(followVars(value, () => undefined, { fallbacks: true, keep: true }) === value));`;
    expect(await answerWithin(script, 4_000)).toEqual({ answer: true, within: true });
  });

  // A custom property's value of many blocks after a long run of space: a reader that read the segment again at each
  // `{` would take the square.
  test("a custom property's value of many blocks is read in time in step with its length", async () => {
    const script = `import { cssSheet } from "./src/css/sheet.ts";
const sheet = cssSheet("<style>.s {" + " ".repeat(100_000) + "--x: " + "{}".repeat(100_000) + "; margin: 0 }</style>");
console.log(JSON.stringify(sheet.rules[0]?.declarations.map((item) => item.property)));`;
    expect(await answerWithin(script, 4_000)).toEqual({ answer: ["--x", "margin"], within: true });
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
    // The viewer writes a text's or a field's value with String(), and nothing for null, so only a string, a number, or
    // a boolean shows as copy.
    test("a text or a field that names a list, an object, or null is told what the page would show", async () => {
      const fixtures = JSON.stringify({
        product: "x",
        due: "Due back on",
        ...{ user: { name: "A" }, tags: ["a", "b"], none: null, count: 3, done: true, word: "Hi" },
        loans: [
          { title: "Solaris", meta: "ok" },
          { title: "Dune", meta: { x: 1 } },
        ],
      });
      const inner = ["user", "tags", "none", "count", "done", "word"].map((key) => `<p data-proto-text="${key}"></p>`).join("");
      const found = await message(
        project({ "design/a.html": single({ screens: loan(`${inner}<p data-proto-field="meta"></p>`), fixtures }) }),
        "integrity.fixture-key",
        "design/a.html",
      );
      expect(found).toEqual([
        'data-proto-text="user" names a key that holds an object, which the page shows as [object Object]: name a key that holds a text, a number, or true or false',
        'data-proto-text="tags" names a key that holds a list, which the page shows as its entries joined by commas: name a key that holds a text, a number, or true or false',
        'data-proto-text="none" names a key that holds null, which the page shows as nothing: name a key that holds a text, a number, or true or false',
        'data-proto-field="meta" names a key that holds an object in an entry of `loans`, which the page shows as [object Object]: name a key that holds a text, a number, or true or false',
      ]);
    });
  });
  describe("among what shows at once, one back-label slot and one title slot", () => {
    const back = (testid: string) => `<button type="button" data-proto-back data-testid="${testid}"><span data-proto-slot="back-label">Back</span></button>`;
    const detail = (ready: string, overdue: string, own = "") =>
      `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><button type="button" data-proto-go="detail" data-testid="go">Go</button></div></section>\n<section data-proto-screen="detail" data-proto-parent="start">${own}<div data-proto-state="ready" data-testid="r">${ready}</div><div data-proto-state="overdue" data-testid="o">${overdue}</div></section>`;
    const said = async (screens: string, chrome = "") => message(project({ "design/a.html": single({ screens, chrome }) }), "structure.slot", "design/a.html");
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
  test("a heading message names a line in another file by its file", async () => {
    const folder = project({
      "design/a.html": single({ screens: screen('<div data-proto-use="title"></div>\n<h2>Sub</h2>') }),
      "design/blocks/title.html": "<h1>Title</h1>\n",
    });
    const found = (await rulesOf(folder, "design/a.html")).filter((item) => item.rule === "accessibility.headings").map((item) => item.message);
    expect(found).toEqual([expect.stringContaining("on design/a.html:14 and line 1: keep one (used at design/a.html:16)")]);
    const skip = project({
      "design/a.html": single({ screens: screen('<h2>Sub</h2>\n<div data-proto-use="deep"></div>') }),
      "design/blocks/deep.html": "<h4>Deep</h4>\n",
    });
    const skipped = (await rulesOf(skip, "design/a.html")).filter((item) => item.rule === "accessibility.headings").map((item) => item.message);
    expect(skipped).toEqual([expect.stringMatching(/^the h2 on design\/a\.html:\d+ is followed by an h4 on line 1 in /)]);
  });
  test("several faults of one rule on one line are one finding that counts them", async () => {
    const found = await rulesOf(
      project({
        "design/a.html": single({ screens: screen('<button type="button" data-testid="s-a"></button><button type="button" data-testid="s-b"></button>') }),
      }),
      "design/a.html",
    );
    expect(found.map((item) => item.message)).toEqual(["<button> has no name; put text inside it, or add an aria-label (2 on this line)"]);
  });
  test("a frame that is no frame of the table is told the nearest and each frame once", async () => {
    const found = await rulesOf(project({ "design/a.html": single({ screens: screen('<div data-proto-device="androd">a</div>') }) }), "design/a.html");
    const message = found.find((item) => item.rule === "device.frame")?.message ?? "";
    expect(message).toStartWith('data-proto-device="androd" is no frame of the device table; did you mean `android`? name one: `ios` (390 by 844), ');
    expect(message.split("`android`").length - 1).toBe(2);
  });
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
    expect(found.map((item) => item.rule)).toEqual(["structure.list"]);
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
  // A browser names a control by none of its hidden text, and by all of its text when the control itself is hidden.
  test.each([
    ["text under hidden", '<button type="button" data-testid="s-b"><span hidden>Close</span></button>', ["accessibility.name"]],
    ["an image's alt under hidden", '<a href="#x" data-testid="s-b"><img hidden alt="Close" src="data:image/png;base64,AA=="></a>', ["accessibility.name"]],
    ["text beside hidden text", '<button type="button" data-testid="s-b"><span hidden>Close</span> Shut</button>', []],
    ["text in a hidden button", '<button type="button" data-testid="s-b" hidden>Close</button>', []],
    ["text in a button in a hidden panel", '<div hidden><button type="button" data-testid="s-b"><span>Close</span></button></div>', []],
  ])("a button whose name is %s", async (_what, inner, rules) => {
    const found = await rulesOf(project({ "design/a.html": single({ screens: screen(inner) }) }), "design/a.html");
    expect(found.map((item) => item.rule)).toEqual(rules);
  });
  test("a format newer than the tool's is told at the line of <html>", async () => {
    const design = single({ format: ' data-proto-format="9"' }).replace("<!doctype html>\n", "<!doctype html>\n<!-- a note -->\n\n");
    const ran = await cli(project({ "design/a.html": design }), "check", "--json", "design/a.html");
    expect(json<{ findings: Finding[] }>(ran).findings.map(({ rule, line }) => [rule, line])).toEqual([["read.format", 4]]);
  });
  // An argument no {{name}} of the block reads changes nothing on the page: a note at each use, never a problem.
  describe("an argument a block never reads", () => {
    const placedOf = async (files: Record<string, FileContent>) => {
      const ran = await cli(project(files), "check", "--json", "design/a.html");
      const found = json<{ findings: { rule: string; file: string; line: number; message: string }[] }>(ran).findings;
      return { code: ran.code, found: found.map(({ rule, file, line, message }) => ({ rule, place: `${file}:${line}`, message })) };
    };
    const card = "<p>{{title}}</p>\n";
    test("is a note at the line of the element that uses the block, naming the argument and the block, and the design passes", async () => {
      const use = '<div data-proto-use="card" data-proto-arg-title="Plan" data-proto-arg-subtitle="Old"></div>';
      const result = await placedOf({ "design/a.html": single({ screens: screen(`\n${use}`) }), "design/blocks/card.html": card });
      expect(result).toEqual({
        code: 0,
        found: [
          {
            rule: "compose.unused-arg",
            place: "design/a.html:17",
            message: "uses blocks/card.html with data-proto-arg-subtitle, which the block never reads: take it out, or read it in the block as {{subtitle}}",
          },
        ],
      });
      const built = await cli(project({ "design/a.html": single({ screens: screen(`\n${use}`) }), "design/blocks/card.html": card }), "build", "design/a.html");
      expect(built.code).toBe(0);
    });
    test("is told once for each use, since each use is its own fault", async () => {
      const use = '<div data-proto-use="card" data-proto-arg-title="Plan" data-proto-arg-subtitle="Old"></div>';
      const result = await placedOf({ "design/a.html": single({ screens: screen(`\n${use}\n${use}\n${use}`) }), "design/blocks/card.html": card });
      expect(result.found.map(({ rule, place }) => `${rule} ${place}`)).toEqual([17, 18, 19].map((line) => `compose.unused-arg design/a.html:${line}`));
    });
    test("is read when the block passes it on in a nested use's argument; a nested use's own is told in the block that holds it", async () => {
      const outer = '<div>\n<div data-proto-use="card" data-proto-arg-title="{{title}}" data-proto-arg-extra="x"></div>\n</div>\n';
      const use = '<div data-proto-use="frame" data-proto-arg-title="Plan"></div>';
      const result = await placedOf({
        "design/a.html": single({ screens: screen(`\n${use}`) }),
        "design/blocks/frame.html": outer,
        "design/blocks/card.html": card,
      });
      expect(result.found.map(({ rule, place, message }) => [rule, place, message.includes("data-proto-arg-extra")])).toEqual([
        ["compose.unused-arg", "design/blocks/frame.html:2", true],
      ]);
    });
  });
  test("a use written <div/> is unclosed, as a browser reads it", async () => {
    const found = await rulesOf(
      project({ "design/a.html": single({ screens: screen('<div data-proto-use="row"/>') }), "design/blocks/row.html": "<p>Row</p>\n" }),
      "design/a.html",
    );
    expect(found.map((item) => item.rule)).toContain("compose.use");
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
    [
      "system.unitless",
      {
        ...doc((text) => text.replace('  "3": 1rem', '  "3": 1rem\n  md: 16\n  columns: 12')),
        "design/case.html": sound({ styles: css(".row {\n  margin: 0 var(--spacing-md);\n}") }),
      },
      {
        ...doc((text) => text.replace('  "3": 1rem', '  "3": 1rem\n  md: 16\n  columns: 12')),
        "design/case.html": sound({
          styles: css(
            ".row { margin: calc(var(--spacing-md) * 1px); grid-template-columns: repeat(var(--spacing-columns), 1fr); line-height: var(--spacing-md); }",
          ),
        }),
      },
      "design/case.html",
      "margin: 0 var(--spacing-md)",
    ],
    ["accessibility.lang", { "design/case.html": single().replace(' lang="en"', "") }, { "design/case.html": single() }, "design/case.html", "<html"],
    [
      "accessibility.headings",
      { "design/case.html": single().replace("<h1>A case</h1>", "") },
      { "design/case.html": single({ screens: screen('<div role="dialog" aria-label="Edit"><h1>Edit</h1></div>') }) },
      "design/case.html",
      "data-proto-state",
    ],
    [
      "accessibility.headings",
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

  // A var() whose fallback holds brackets is followed like one that holds none, so its motion is told.
  test.each([
    ".sheet { transition: transform var(--dur, var(--dur-default)); }",
    ":root { --dur-default: 300ms; }\n.sheet { transition: transform var(--dur, var(--dur-default)); }",
    ".sheet { transition: transform var(--dur, calc(1s * 2)); }",
    ".sheet { transition: transform var(--dur); }",
    ".sheet { transition: transform calc(1s * 2); }",
  ])("a motion read through a nested var() needs reduced motion: %p", async (css) => {
    expect((await checked(motion(css))).filter((item) => item.rule === "accessibility.motion-reduce").length).toBe(1);
  });

  test("a transition-duration after the shorthand sets its duration, as the cascade reads it", async () => {
    const told = async (css: string) => (await checked(motion(css))).filter((item) => item.rule === "accessibility.motion-reduce").length;
    expect(await told(".sheet { transition: transform; transition-duration: 300ms; }")).toBe(1);
    expect(await told(".sheet { transition: transform 300ms; transition-duration: 0s; }")).toBe(0);
    expect(await told(".sheet { transition-duration: 300ms; transition: transform; }")).toBe(0);
  });

  test("a transition set in an at-rule nested in a rule needs reduced motion, and a custom property's block sets none", async () => {
    const told = async (css: string) => (await checked(motion(css))).filter((item) => item.rule === "accessibility.motion-reduce").length;
    expect(await told(".a { @media (min-width: 1px) { transition: transform 1s; } }")).toBe(1);
    expect(await told(".a { @media (prefers-reduced-motion: no-preference) { transition: transform 1s; } }")).toBe(0);
    expect(await told(".s { --stripe: { transition: transform 1s }; }")).toBe(0);
  });

  test("a var() with a nested fallback is followed to its end", () => {
    const tokens = new Map([["--b", "var(--c, 2s)"]]);
    expect(followVars("transform var(--a, var(--b, calc(1s * 2)))", (name) => tokens.get(name), { fallbacks: true, keep: false })).toBe("transform 2s");
    expect(followVars("var(--a, var(--x))", () => undefined, { fallbacks: true, keep: false })).toBe(null);
    expect(followVars("var(--a, var(--x))", () => undefined, { fallbacks: true, keep: true })).toBe("var(--x)");
    expect(followVars("var(--a, var(--x))", () => undefined, { fallbacks: false, keep: true })).toBe("var(--a, var(--x))");
  });

  test.each([
    ["english language", 1],
    ["en_US", 1],
    ["en-", 1],
    ["en", 0],
    ["en-GB", 0],
    ["zh-Hant-TW", 0],
    ["x-klingon", 0],
  ])("<html lang=%p> is checked by its form: %d", async (lang, count) => {
    const found = await checked({ "design/case.html": single().replace(' lang="en"', ` lang="${lang}"`) });
    expect(found.filter((item) => item.rule === "accessibility.lang").length).toBe(count);
  });

  test("a rule whose selector list holds :root sets its tokens on the root, so a changed one is an override", async () => {
    const found = await checked({ ...doc(), "design/case.html": sound({ styles: tokens(":root, .x { --color-primary: #000; }") }) });
    expect(found.map((item) => item.rule)).toEqual(["system.override"]);
    expect(await checked({ ...doc(), "design/case.html": sound({ styles: tokens(".x, .y { --color-primary: #000; }") }) })).toEqual([]);
  });

  // A file outside the design's own, the design document or a tokens file, sorts by its name, then by line.
  test("findings in the design document and a tokens file sort by file, then line", async () => {
    const found = await checked({
      ...doc((text) => text.replace("components:", '  "bad name": 2rem\ncomponents:')),
      "design/case.html": sound({ head: `${THEMES}<meta name="tokens" content="tokens.css">\n` }),
      "tokens.css": ":root {\n  --color-primary: #1d4ed8;\n  --color-promo: #f00;\n}\n",
    });
    expect(found.map((item) => `${item.file}:${item.line}`)).toEqual(["DESIGN.md:10", "tokens.css:3"]);
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
