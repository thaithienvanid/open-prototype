// The attack table: each hostile form forced into a design gets no page; each ordinary form a design needs gets one.
// The page's policy and the frames' sandbox stay behind the reader as the second and third layers.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readMarkup } from "../src/html/tokenizer.ts";
import { inertLinks, staysInTemplate } from "../src/page.ts";
import { single } from "./cases.ts";
import { cli, project } from "./helpers.ts";

const screen = (inner: string) =>
  `<section data-proto-screen="start" data-proto-title="Start">\n<div data-proto-state="success" data-testid="start-ok">${inner}</div>\n</section>`;

async function built(inner: string): Promise<{ code: number; page: boolean }> {
  const folder = project({ "design/case.html": single({ screens: screen(inner) }) });
  const ran = await cli(folder, "build", "design/case.html");
  return { code: ran.code, page: existsSync(join(folder, ".prototype/views/design/case.html")) };
}

const refusedByTheDenyList: [string, string][] = [
  ["a script", "<script>x()</script>"],
  ["an event handler", '<p onclick="x()">x</p>'],
  ["a javascript link", '<a href="javascript:x()" data-testid="start-a">x</a>'],
  ["an iframe", '<iframe src="x"></iframe>'],
  ["a form", "<form></form>"],
  ["a stray template end", "</template><template></template>"],
  ["a template in an attribute", '<p title="<template">x</p>'],
  ["a processing instruction", '<?xml version="1.0"?>'],
];

// The forms the deny-list let through, which the allow-list refuses.
const passedTheDenyList: [string, string][] = [
  ["a javascript link with a tab reference", '<a href="jav&#x09;ascript:x()" data-testid="start-a">x</a>'],
  ["a javascript link with a real tab", '<a href="java\tscript:x()" data-testid="start-a">x</a>'],
  ["a javascript link with a line feed reference", '<a href="java&#x0A;script:x()" data-testid="start-a">x</a>'],
  ["a javascript link after a control character", '<a href="\u0001javascript:x()" data-testid="start-a">x</a>'],
  ["a data link", '<a href="data:text/html,x" data-testid="start-a">x</a>'],
  ["a form action on a button", '<button type="submit" formaction="https://example.com" data-testid="start-b">x</button>'],
  ["a foreign object", '<svg aria-hidden="true"><foreignObject><p>x</p></foreignObject></svg>'],
  ["a fenced frame", "<fencedframe></fencedframe>"],
  ["a portal", "<portal></portal>"],
  ["a video poster", '<video poster="https://example.com/a.png"></video>'],
  ["an image input", '<input type="image" src="x.png" alt="Go" data-testid="start-i">'],
  ["a ping", '<a href="#x" ping="https://example.com" data-testid="start-a">x</a>'],
  ["a declarative shadow root", '<template shadowrootmode="open"><p>x</p></template>'],
  ["a script hidden in an svg textarea", '<svg aria-hidden="true"><textarea><script>x()</script></textarea></svg>'],
  ["a style hidden in an svg textarea", '<svg aria-hidden="true"><textarea><style>p{}</style></textarea></svg>'],
  ["a download link", '<a href="#x" download data-testid="start-a">x</a>'],
  ...["title", "desc"].flatMap((holder) =>
    ["<textarea>x</textarea>", "<style>p{}</style>", "<script>x()</script>", "<title>x</title>", "<!-- x -->", "<b>x</b>"].map((inner): [string, string] => [
      `${inner} inside an svg ${holder}`,
      `<svg role="img"><${holder}>${inner}</${holder}><path d="M0 0"/></svg>`,
    ]),
  ),
];

// The one line outside the frame: a design can never end its template early, however the end tag is spelled.
const templateEnds: [string, string][] = [
  ["lower case", "</template>"],
  ["upper case", "</TEMPLATE>"],
  ["mixed case", "</TeMpLaTe>"],
  ["a space before the end", "</template >"],
  ["a line break inside", "</template\n>"],
  ["an attribute", '</template x="1">'],
  ["a NUL after the name", "</template\u0000>"],
  ["inside a textarea", "<textarea></template></textarea>"],
  ["inside an svg textarea", "<svg><textarea></template></textarea></svg>"],
  ["inside a comment", "<!-- </template> -->"],
  ["inside an attribute", '<p title="</template>">x</p>'],
];

async function builtWith(design: string): Promise<{ code: number; page: boolean }> {
  const folder = project({ "design/case.html": design });
  const ran = await cli(folder, "build", "design/case.html");
  return { code: ran.code, page: existsSync(join(folder, ".prototype/views/design/case.html")) };
}

// The allow-list by place: what a document's head may hold, and the one script and the one template a design holds.
const refusedByPlace: [string, string][] = [
  ["a refresh in the head", single({ head: '<meta http-equiv="refresh" content="0; url=https://example.com">\n' })],
  ["a stylesheet link in the head", single({ head: '<link rel="stylesheet" href="https://example.com/x.css">\n' })],
  ["a base in the head", single({ head: '<base href="https://example.com/">\n' })],
  ["a script with a source in the head", single({ head: '<script src="https://example.com/x.js"></script>\n' })],
  ["a meta of no allowed name", single({ head: '<meta name="referrer" content="unsafe-url">\n' })],
  ["a paragraph in the head", single({ head: "<p>x</p>\n" })],
  ["a JSON script that is no fixtures block", single({ screens: screen('<script type="application/json">{}</script>') })],
  ["a fixtures block with another attribute", single({ screens: screen('<script type="application/json" data-proto-fixtures id="x">{}</script>') })],
  ["a module script that names itself fixtures", single({ screens: screen('<script type="module" data-proto-fixtures>x()</script>') })],
  ["a second body", single({ screens: screen("<body><p>x</p></body>") })],
  ["a second html", single({ screens: screen("<html><p>x</p></html>") })],
  ["a template that is no list's item", single({ screens: screen("<template><p>x</p></template>") })],
  ["a doctype that is not first", single({ screens: screen("<!doctype html>") })],
  ["a style deep in the body", single({ screens: screen("<style>p {}</style>") })],
  ["a title in the body", single({ screens: screen("<title>x</title>") })],
  // A browser keeps an attribute's first value; a reader that kept the last would read another element.
  [
    "a refresh behind a repeated http-equiv",
    single({ head: '<meta http-equiv="refresh" http-equiv="Content-Security-Policy" content="0;url=https://example.com">\n' }),
  ],
  ["a referrer behind a repeated name", single({ head: '<meta name="referrer" name="viewport" content="unsafe-url">\n' })],
  ["an attribute written twice in the body", single({ screens: screen('<p class="a" class="b">x</p>') })],
  ["an attribute written twice on <html>", single({ format: ' data-proto-format="1" lang="fr"' })],
  ["an attribute written twice on <body>", single().replace("<body>", '<body class="a" CLASS="b">')],
  // The viewer takes what it does not show out of a frame's document; these would hide the whole document in every frame.
  ...["hidden", "inert"].flatMap((name): [string, string][] => [
    [`<body ${name}>`, single().replace("<body>", `<body ${name}>`)],
    [`<html ${name}>`, single({ format: ` data-proto-format="1" ${name}` })],
  ]),
];

const allowedByPlace: [string, string][] = [
  [
    "a design's own policy line, a viewport, and a charset",
    single({ head: '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">\n<meta name="viewport" content="width=device-width">\n' }),
  ],
  ["a style directly in the body", single({ before: "<style>p { margin: 0; }</style>\n" })],
  // A design's own display, hidden, and !important are its own: the viewer shows a state by putting it in the frame.
  [
    "a state whose own style sets display with !important",
    single({ screens: screen("<p>x</p>").replace('data-testid="start-ok"', 'data-testid="start-ok" style="display: grid !important"') }),
  ],
];

describe("the allow-list by place", () => {
  test.each(refusedByPlace)("%s gets no page", async (_what, design) => {
    expect(await builtWith(design)).toEqual({ code: 1, page: false });
  });
  test.each(allowedByPlace)("%s gets a page", async (_what, design) => {
    expect(await builtWith(design)).toEqual({ code: 0, page: true });
  });
  test("a document with no html and no head tag gets a page, and its one problem is the language it cannot name", async () => {
    const design = `<!doctype html>\n<title>A case</title>\n<body>\n${screen("<p>x</p>")}\n</body>\n`;
    expect(await builtWith(design)).toEqual({ code: 1, page: true });
    const found = JSON.parse((await cli(project({ "design/case.html": design }), "check", "--json", "design/case.html")).out).findings as {
      rule: string;
      level: string;
    }[];
    expect(found.filter((item) => item.level === "problem").map((item) => item.rule)).toEqual(["accessibility.lang"]);
  });
});

describe("hostile forms get no page", () => {
  test.each(refusedByTheDenyList)("%s", async (_what, markup) => {
    expect(await built(markup)).toEqual({ code: 1, page: false });
  });
  test.each(passedTheDenyList)("%s", async (_what, markup) => {
    expect(await built(markup)).toEqual({ code: 1, page: false });
  });
});

describe("a design never ends its template early", () => {
  test.each(templateEnds)("%s", async (_what, markup) => {
    expect(await built(markup.replace("\\n", "\n").replace("\\u0000", "\u0000"))).toEqual({ code: 1, page: false });
  });
});

// A design cut off inside a tag: in the page, that tag would take the viewer's own end of the template, its data, and its script.
const endsInsideATag: [string, string][] = [
  ["an unfinished start tag, inside a quoted attribute", '<p class="x'],
  ["an unfinished start tag, inside another quoted attribute", '<p title="x'],
  // A quote after a name, spaces, and `=` opens the value, as in a browser, so no reader backtracks past it to end the tag.
  ["a value's quote after a space and =, never closed", '<p data-x =">x</p>'],
  ["a value's quote after =, a space, and never closed", '<p data-x = ">x</p>'],
  ["a value's single quote after a space and =, never closed", "<p data-x ='>x</p>"],
  ["an unfinished end tag", "</p"],
  ["an unfinished start tag with no attribute", "<p"],
  ["an unfinished declaration", "<!doctype"],
];

describe("a design that ends inside a tag", () => {
  test.each(endsInsideATag)("%s is unsafe, at its line, and gets no page", async (_what, cut) => {
    const folder = project({ "design/case.html": single() + cut });
    const ran = await cli(folder, "check", "--json", "design/case.html");
    const found = (JSON.parse(ran.out) as { findings: { rule: string; line: number | null }[] }).findings;
    expect([ran.code, [...new Set(found.map((item) => `${item.rule}:${item.line}`))]]).toEqual([1, [`unsafe.markup:${single().split("\n").length}`]]);
    expect(await builtWith(single() + cut)).toEqual({ code: 1, page: false });
  });
  test.each(endsInsideATag)("%s: the template guard says it would not stay in its template", (_what, cut) => {
    expect(staysInTemplate(`<p>x</p>${cut}`)).toBe(false);
  });
});

describe("ordinary forms a design needs get a page with no problem", () => {
  test("an icon named by its svg title", async () => {
    expect(await built('<svg role="img" viewBox="0 0 1 1"><title>Close</title><path d="M0 0"/></svg>')).toEqual({ code: 0, page: true });
  });
  test("a link to an outside page, which the viewer cancels", async () => {
    expect(await built('<a href="https://example.com/terms" data-testid="start-terms">Terms</a>')).toEqual({ code: 0, page: true });
  });
  test("a link to a place in the same screen, and a dialog", async () => {
    expect(
      await built('<a href="#more" rel="help" target="_blank" data-testid="start-more">More</a><dialog id="more" open><p>Details <wbr>here.</p></dialog>'),
    ).toEqual({ code: 0, page: true });
  });
  test("a link to another view is a problem that names data-proto-go", async () => {
    const folder = project({ "design/case.html": single({ screens: screen('<a href="#start/success" data-testid="start-self">Again</a>') }) });
    const ran = await cli(folder, "check", "--json", "design/case.html");
    expect(ran.code).toBe(1);
    expect((JSON.parse(ran.out) as { findings: { rule: string }[] }).findings.map((item) => item.rule)).toEqual(["structure.view-link"]);
  });
});

// A pressed link makes Chrome connect to its address before the viewer cancels the press, so the page holds no live
// address: each link's address that leaves its screen is about:blank, and the design's own is kept as text.
describe("the page holds no address that leaves the machine", () => {
  test.each([
    [
      "an https:// link",
      '<a href="https://example.com/terms" class="x">T</a>',
      '<a data-proto-href="https://example.com/terms" href="about:blank" class="x">T</a>',
    ],
    ["an http:// link", "<a href=http://example.com>T</a>", '<a data-proto-href="http://example.com" href="about:blank">T</a>'],
    ["a mailto: link", '<a href="mailto:a@example.com">M</a>', '<a data-proto-href="mailto:a@example.com" href="about:blank">M</a>'],
    ["a tel: link", '<a href="tel:+1555">C</a>', '<a data-proto-href="tel:+1555" href="about:blank">C</a>'],
    ["a relative link", '<A HREF="terms.html">T</A>', '<A data-proto-href="terms.html" href="about:blank">T</A>'],
    ["an empty link", "<a href>T</a>", '<a data-proto-href="" href="about:blank">T</a>'],
    ["an area", '<area href="https://example.com/a"/>', '<area data-proto-href="https://example.com/a" href="about:blank"/>'],
    [
      "an svg link, by href and xlink:href",
      '<svg><a xlink:href="https://example.com/x" href="https://example.com/h"><text>x</text></a></svg>',
      '<svg><a data-proto-href="https://example.com/h" xlink:href="about:blank" href="about:blank"><text>x</text></a></svg>',
    ],
    [
      "an address the design wrote as the tool's",
      '<a data-proto-href="#x" href="https://e.com">T</a>',
      '<a data-proto-href="https://e.com" href="about:blank">T</a>',
    ],
    [
      "a value that quotes",
      '<a href="https://e.com/?a=1&amp;b=&quot;2&quot;" title=\'"\'>T</a>',
      '<a data-proto-href="https://e.com/?a=1&amp;b=&quot;2&quot;" href="about:blank" title="&quot;">T</a>',
    ],
  ])("%s is inert, and keeps its address as text", (_what, markup, inert) => {
    expect(inertLinks(markup)).toBe(inert);
  });
  test.each([
    ["a place in the screen", '<a href="#more">M</a>'],
    ["a place after a tab", '<a href="\t#more">M</a>'],
    ["an svg icon", '<svg><use href="#icon"/></svg>'],
    ["a link with no href", '<a data-proto-go="a/b">A</a>'],
    ["a link in a style's text", "<style>a[href='https://e.com'] {}</style>"],
    ["a link in a comment", '<!-- <a href="https://e.com"> -->'],
  ])("%s stays as written", (_what, markup) => {
    expect(inertLinks(markup)).toBe(markup);
  });
});

// The runtime's own HTML parser, as an oracle: the tokenizer sees the same start tags in the same order.
function rewriterTags(html: string): string[] {
  const tags: string[] = [];
  new HTMLRewriter().on("*", { element: (element) => void tags.push(element.tagName) }).transform(html);
  return tags;
}

function tokenizerTags(html: string): string[] {
  const tags: string[] = [];
  readMarkup(html, { start: (tag) => tags.push(tag), startEnd: (tag) => tags.push(tag), end: () => undefined });
  return tags;
}

describe("the tokenizer agrees with the runtime's parser", () => {
  test.each([
    ["<div a=1><p>x</p><br/><img src=x></div>"],
    ["<script>if (a < b) '<div>'</script><p>after</p>"],
    ["<style>p > b {}</style><b>x</b>"],
    ["<textarea><b>x</b></textarea><i>y</i>"],
    ["<!-- <b> --><i>x</i>"],
    ['<p title="<b>">x</p>'],
    ["<xmp><b></xmp><u>x</u>"],
    ["<svg><path d='M0 0'/><circle r=1></circle></svg>"],
  ])("%s", (html) => {
    expect(tokenizerTags(html)).toEqual(rewriterTags(html));
  });
  test("an svg textarea holds markup, not text", () => {
    const html = "<svg><textarea><script>x</script></textarea></svg>";
    expect(tokenizerTags(html)).toEqual(rewriterTags(html));
  });
});
