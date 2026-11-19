/// <reference lib="dom" />
// The attack table: each hostile form forced into a design gets no page; each ordinary form a design needs gets one.
// The page's policy and the frames' sandbox stay behind the reader as the second and third layers.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { VOID } from "../src/format.ts";
import { type Fault, OpenElements, readMarkup } from "../src/html/tokenizer.ts";
import { inertLinks, staysInTemplate } from "../src/page.ts";
import { single } from "./cases.ts";
import { cli, project } from "./helpers.ts";
import { chromeTrees, documentOf, messyText, nestingFindings, readerTree, refusal, seeded, tidyText } from "./nesting.ts";
import { BROWSER, Browser } from "./viewer/page.ts";

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

// In a comment, `--!>` ends it in a browser, where a reader that ends a comment at `-->` reads on: the form is refused
// inside every comment, read from each `<!--` to its first `-->`, and is ordinary text outside them.
const commentBangs: [string, string][] = [
  ["a comment ended early by --!>", "<!-- a --!> <b>x</b> -->"],
  ["--! inside a comment", "<!-- a --! b -->"],
  ["--!> just after a comment's start", "<!--!> x -->"],
  ["--!> that ends a comment with no --> after it", "<!-- a --!><b>x</b>"],
  ["--!> in a comment inside an svg", '<svg aria-hidden="true"><!-- a --!><path d="M0 0"/> --></svg>'],
  ["--!> after a comment opened in an attribute's value", '<p title="<!--">a --!> b</p><p>c --></p>'],
  ["--!> in a comment after text that holds --!", "<p>Wait--!</p><!-- a --!> b -->"],
  ["--!> in the second comment", "<!-- a --><p>x--!</p><!-- b --!> -->"],
];

const textBangs: [string, string][] = [
  ["--! in a paragraph", "<p>Wait--!</p>"],
  ["--!> in a paragraph", "<p>a --!> b</p>"],
  ["--! in an attribute's value", '<p title="Wait--!">x</p>'],
  ["--! after a closed comment", "<!-- a note --><p>Wait--!</p>"],
];

describe("--! in a comment and in text", () => {
  test.each(commentBangs)("%s gets no page", async (_what, markup) => {
    expect(await built(markup)).toEqual({ code: 1, page: false });
  });
  test.each(textBangs)("%s is text, and gets a page", async (_what, markup) => {
    expect(await built(markup)).toEqual({ code: 0, page: true });
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

// The open elements as a browser builds them, read by the one model the walk and the two host readers share. Each row
// gives, for each start tag in written order, its tag and number, then `<` and the written element it stands in, or
// `-` for none. A row whose element must not close stands beside each that must.
function readerParents(html: string): string {
  const open = new OpenElements<{ tag: string; n: number }>();
  const rows: string[] = [];
  const start = (tag: string) => {
    open.opening(tag);
    const parent = open.top();
    rows.push(`${tag}${rows.length}<${parent ? `${parent.tag}${parent.n}` : "-"}`);
    if (!VOID.has(tag)) open.push({ tag, n: rows.length - 1 });
  };
  readMarkup(html, { start, startEnd: start, end: (tag) => void open.close(tag) });
  return rows.join(" ");
}

const nesting: [string, string][] = [
  // A start tag that ends an open element.
  ["<p>Intro<div>x</div>", "p0<- div1<-"],
  ["<p><span>a<div>b</div>", "p0<- span1<p0 div2<-"],
  ["<p>a<ul><li>b</ul>c", "p0<- ul1<- li2<ul1"],
  ["<p>a<h2>b</h2>", "p0<- h21<-"],
  ["<h1>a<h2>b</h2>", "h10<- h21<-"],
  ["<p>a<hr>b<table><tr><td>c</table>", "p0<- hr1<- table2<- tr3<table2 td4<tr3"],
  ["<section><p>Intro<div>x</div></section>", "section0<- p1<section0 div2<section0"],
  ["<ul><li>a<li>b</ul><p>c", "ul0<- li1<ul0 li2<ul0 p3<-"],
  ["<li>a<p><li>b", "li0<- p1<li0 li2<-"],
  ["<li>a<div><li>b", "li0<- div1<li0 li2<-"],
  ["<ul><li>a<li><ul><li>b<li>c</ul><li>d</ul>", "ul0<- li1<ul0 li2<ul0 ul3<li2 li4<ul3 li5<ul3 li6<ul0"],
  ["<dl><dt>a<dd>b<dt>c</dl>", "dl0<- dt1<dl0 dd2<dl0 dt3<dl0"],
  ["<dl><dd>a<div><dt>b</dl>", "dl0<- dd1<dl0 div2<dd1 dt3<dl0"],
  ["<table><tr><td>a<td>b<tr><th>c</table>", "table0<- tr1<table0 td2<tr1 td3<tr1 tr4<table0 th5<tr4"],
  [
    "<table><thead><tr><th>a<tbody><tr><td>b<tfoot><tr><td>c</table>",
    "table0<- thead1<table0 tr2<thead1 th3<tr2 tbody4<table0 tr5<tbody4 td6<tr5 tfoot7<table0 tr8<tfoot7 td9<tr8",
  ],
  ["<table><tr><td><p>a<td>b</table>", "table0<- tr1<table0 td2<tr1 p3<td2 td4<tr1"],
  [
    "<select><option>a<option>b<optgroup><option>c<optgroup><option>d</select>",
    "select0<- option1<select0 option2<select0 optgroup3<select0 option4<optgroup3 optgroup5<select0 option6<optgroup5",
  ],
  ["<select><option><p>a<option>b</select>", "select0<- option1<select0 p2<option1 option3<select0"],
  ["<option>a<option>b", "option0<- option1<-"],
  ["<ruby>a<rp>(<rt>b<rp>)</ruby>", "ruby0<- rp1<ruby0 rt2<ruby0 rp3<ruby0"],
  ["<button>a<button>b", "button0<- button1<-"],
  ["<button><p>a<button>b", "button0<- p1<button0 button2<-"],
  ["<button><div>a<button>b", "button0<- div1<button0 button2<-"],
  // An end tag that ends an open element, or that ends none.
  ["<ul><li><p>a</li><li>b</ul>", "ul0<- li1<ul0 p2<li1 li3<ul0"],
  ["<ol><li>a<ol><li>b</li></ol></li><li>c</ol>", "ol0<- li1<ol0 ol2<li1 li3<ol2 li4<ol0"],
  ["<table><tr><td>a</tr><tr><td>b</table>", "table0<- tr1<table0 td2<tr1 tr3<table0 td4<tr3"],
  ["<p>a</p></p><div>b</div>", "p0<- div1<-"],
  ["<select><optgroup><option>a</optgroup><option>b</select>", "select0<- optgroup1<select0 option2<optgroup1 option3<select0"],
  // What must not close: a p beyond a button, an li beyond a list, an element outside a template or a select, a button
  // beyond a table's cell or inside an svg.
  ["<p><button><p>x</p></button></p>", "p0<- button1<p0 p2<button1"],
  ["<p><button></p><div>x</div></button>", "p0<- button1<p0 div2<button1"],
  ["<ul><li>a<ul><li>b<div>c</div></ul></ul>", "ul0<- li1<ul0 ul2<li1 li3<ul2 div4<li3"],
  ["<li><ul></li><li></ul>", "li0<- ul1<li0 li2<ul1"],
  ["<li>a<section><li>b</section>", "li0<- section1<li0 li2<section1"],
  ["<li><button><li>a</button>", "li0<- button1<li0 li2<button1"],
  ["<dl><dt><dl><dd>a</dl><dd>b</dl>", "dl0<- dt1<dl0 dl2<dt1 dd3<dl2 dd4<dl0"],
  ["<p>a<template><div>b</div></template>c<div>d</div>", "p0<- template1<p0 div2<template1 div3<-"],
  ["<li>a<template><li>b</template>", "li0<- template1<li0 li2<template1"],
  ["<p><select><option>a<p>b</select>", "p0<- select1<p0 option2<select1 p3<option2"],
  ["<select><option>a<div>b<option>c</select>", "select0<- option1<select0 div2<option1 option3<div2"],
  ["<p><svg><text>a</text></svg>b<div>c</div>", "p0<- svg1<p0 text2<svg1 div3<-"],
  ["<button><table><tr><td>a<button>b</table>", "button0<- table1<button0 tr2<table1 td3<tr2 button4<td3"],
  ["<button><svg><button>b</button></svg>", "button0<- svg1<button0 button2<svg1"],
  // An end tag a browser takes only in its scope, or when no special element stands inside the element it names.
  ["<span><div>x</span><p>y", "span0<- div1<span0 p2<div1"],
  ["<label><div>x</label><i>y</i>", "label0<- div1<label0 i2<div1"],
  ["<div><table><tr><td></div><p>x", "div0<- table1<div0 tr2<table1 td3<tr2 p4<td3"],
  ["<h1><table><tr><td></h1><b>x</b>", "h10<- table1<h10 tr2<table1 td3<tr2 b4<td3"],
  ["<div><template data-proto-item></div><p>x", "div0<- template1<div0 p2<template1"],
  ["<div><svg><title>a</div><p>", "div0<- svg1<div0 title2<svg1 p3<title2"],
  ["<span><svg><g></span><b>x</b>", "span0<- svg1<span0 g2<svg1 b3<-"],
  // A table's parts: a caption, a column group, and a select in a cell end at the next part.
  ["<table><caption>a<tr><td>b</table>", "table0<- caption1<table0 tr2<table0 td3<tr2"],
  ["<table><colgroup><col><tr><td>a</table>", "table0<- colgroup1<table0 col2<colgroup1 tr3<table0 td4<tr3"],
  ["<table><colgroup></td><tr><td>a</table>", "table0<- colgroup1<table0 tr2<table0 td3<tr2"],
  ["<table><tr><td>a<caption>b</table>", "table0<- tr1<table0 td2<tr1 caption3<table0"],
  ["<table><tbody><tr><td>a<col></table>", "table0<- tbody1<table0 tr2<tbody1 td3<tr2 col4<table0"],
  ["<table><tr><td><select><td>x</table>", "table0<- tr1<table0 td2<tr1 select3<td2 td4<tr1"],
  ["<table><tr><td><select></td><td>x</table>", "table0<- tr1<table0 td2<tr1 select3<td2 td4<tr1"],
  ['<table><input type="hidden"><tr><td>a</table>', "table0<- input1<table0 tr2<table0 td3<tr2"],
  ["<table><tr>\n<td>a</td> </tr></table>", "table0<- tr1<table0 td2<tr1"],
  // A template whose first part is a table's reads the rest as that part.
  ["<template data-proto-item><td>a<td>b</template>", "template0<- td1<template0 td2<template0"],
  ["<template data-proto-item><tr><td>a<tr><td>b</template>", "template0<- tr1<template0 td2<tr1 tr3<template0 td4<tr3"],
  // A select: an hr ends its open option, and an option the open p.
  ["<select><option>a<hr><option>b</select>", "select0<- option1<select0 hr2<select0 option3<select0"],
  ["<select><optgroup><option>a<hr>b</select>", "select0<- optgroup1<select0 option2<optgroup1 hr3<select0"],
  ["<select><option><p>a<option>b</select>", "select0<- option1<select0 p2<option1 option3<select0"],
];

describe("the reader nests elements as a browser does", () => {
  test.each(nesting)("%s", (html, parents) => {
    expect(readerParents(html)).toBe(parents);
  });
});

// Each start tag numbered, as the browser tests number it, so the reader's tree and Chrome's name the same elements.
const numbered = (html: string) => {
  let n = 0;
  return html.replace(/<([a-zA-Z][a-zA-Z0-9]*)/g, (tag) => `${tag} data-n="${n++}"`);
};

// The markup a browser nests by rules the reader does not keep: each is a structure.nesting finding, which the walk
// gives, with the fault the open elements tell. The browser test beside it holds that Chrome builds each otherwise; a
// word it compares is written `t` and a number, as the random texts write one.
const nestingFaults: [string, Fault["kind"]][] = [
  ["<p><b>x</p>y", "closed-early"],
  ["<b><i>x</b>y", "closed-early"],
  ["<div><b>x</div>y", "closed-early"],
  ["<select><b>x</select>y", "closed-early"],
  ["<button><b>a<button>c", "closed-early"],
  ["<ul><li><b>a<li>b</ul>", "closed-early"],
  ["<b><p>x</b>y</p>", "adopted"],
  ["<a>1<a>2", "link-in-link"],
  ["<a><div><a>2</a></div>", "link-in-link"],
  ["<select><select><i>x</i>", "in-select"],
  ["<select><option>a<input><i>x</i>", "in-select"],
  ["<table>t0<tr><td>a</table>", "in-table"],
  ["<table><div>a</div><tr><td>b</table>", "in-table"],
  ["<table><tr><table>x", "in-table"],
  ["<table><tbody><span>a</span></table>", "in-table"],
  ["<table><colgroup><col>t0</table>", "in-table"],
  ["<td>a", "table-part"],
  ["<select><td>x</select>", "table-part"],
  ["<div><caption>x</caption></div>", "table-part"],
  ["<template data-proto-item><div></div><td>x</template>", "table-part"],
  ["<table><td>a</tr><i>b</i>", "table-part"],
  ["<template data-proto-item><td>a</td><tr><td>b</template>", "table-part"],
  ["<template data-proto-item><tr></tr><table></table></template>", "in-table"],
  ["<template data-proto-item><col><div>a</div></template>", "in-table"],
  ["<template data-proto-item><tr><td>a</td></tr><div>b<tr><td>c</template>", "in-table"],
  ["<template data-proto-item><tr><th>a</th></table><i>b</i></template>", "stray-end"],
  ["<template data-proto-item><caption>a</table><b>c</b></template>", "stray-end"],
  ["<b>1<div><b>2</div></b><i>3</i>", "closed-early"],
  ["</p>x", "stray-end"],
  ["<p><button></p></button>", "stray-end"],
  ["a</br>b", "stray-end"],
  ["<h1>a</h2><b>b</b>", "heading-end"],
  ["<option><span>a</option><b>b</b>", "option-end"],
  ["<table><tr><td>a</tbody><i>b</i>", "stray-end"],
];

describe("markup a browser nests by rules the reader does not keep is a nesting finding", () => {
  test.each(nestingFaults)("%s", (html, kind) => {
    const faults: Fault["kind"][] = [];
    readerTree(numbered(html), faults);
    expect([faults.includes(kind), refusal(numbered(html))]).toEqual([true, "structure.nesting"]);
  });
});

// Markup the reader flags though a browser would cope: a rule a designer can follow, stricter than a browser needs, so
// the reader keeps no state to tell these from the faults above. The browser test beside it holds that Chrome builds
// each as the reader reads it, so the strictness is seen and meant.
const strictNesting: [string, Fault["kind"]][] = [
  ["<div><b>x</div><div></div>", "closed-early"],
  ["<p><b>t0</p>", "closed-early"],
  ["<table><tr><td><b>x</td><td>y</table>", "closed-early"],
  ["<template data-proto-item><tr><td>a</td></tr><div>b</div></template>", "in-table"],
  ["<div>t0</table></div>", "stray-end"],
  ["<div>t0</tbody></div>", "stray-end"],
];

describe("markup a browser would cope with that the reader flags", () => {
  test.each(strictNesting)("%s", (html, kind) => {
    const faults: Fault["kind"][] = [];
    readerTree(numbered(html), faults);
    expect([faults.includes(kind), refusal(numbered(html))]).toEqual([true, "structure.nesting"]);
  });
});

// Where the reader cannot follow a browser's nesting and the allow-list already refuses the markup that would need it:
// an HTML element inside SVG, which a browser moves out of it; MathML; a form, which a browser drops inside a form; and
// the formatting elements a design does not hold.
const refusedNesting: [string, string][] = [
  ["a p in an svg, which a browser moves out of it", "<p><svg><p>x</p></svg>"],
  ["a div in an svg", "<svg><div>x</div></svg>"],
  ["a b in an svg", "<svg><b>x</b></svg>"],
  ["a table in an svg", "<svg><table><tr><td>x</td></tr></table></svg>"],
  ["a span in an svg's title", "<svg><title><span>x</span></title></svg>"],
  ["MathML", "<math><mi>x</mi></math>"],
  ["a form in a form", "<form><form></form></form>"],
  ...["big", "font", "nobr", "strike", "tt"].map((tag): [string, string] => [`a ${tag}`, `<${tag}><${tag}>x</p></${tag}>`]),
];

describe("markup whose nesting the reader cannot follow is refused by the allow-list", () => {
  test.each(refusedNesting)("%s", (_name, html) => {
    expect(refusal(html)).toBe("unsafe.markup");
  });
});

// The four groups below start Chrome, and are the run's first browser tests, so one of them pays for Chrome's start,
// which takes longer than the runner's default of five seconds on a slow machine, such as Windows CI: each test gets
// 60 seconds, as the other browser tests do.
// The same rows, held to Chrome's own parser: each start tag is numbered, and each element's parent is the nearest
// numbered element around it, through a template's content, so an element a browser adds, such as a tbody, is passed.
describe.skipIf(!BROWSER)("the nesting rows agree with Chrome", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(async () => {
    await browser.close();
  });
  test("each row", async () => {
    const page = await browser.open(400, 300);
    const read = await page.evaluate(
      (sources: string[]) =>
        sources.map((source) => {
          const doc = new DOMParser().parseFromString(`<!doctype html><body>${source}`, "text/html");
          const all: Element[] = [];
          const walk = (node: ParentNode) => {
            for (const child of Array.from(node.children)) {
              all.push(child);
              walk(child instanceof HTMLTemplateElement ? child.content : child);
            }
          };
          walk(doc);
          const parentOf = (element: Element): Element | null => {
            let node: Node | null = element.parentNode;
            while (node) {
              if (node instanceof Element && node.hasAttribute("data-n")) return node;
              node =
                node instanceof DocumentFragment ? (all.find((one) => one instanceof HTMLTemplateElement && one.content === node) ?? null) : node.parentNode;
            }
            return null;
          };
          const rows = new Map<number, string>();
          for (const element of all) {
            const n = Number(element.getAttribute("data-n") ?? "-1");
            if (n < 0 || rows.has(n)) continue;
            const parent = parentOf(element);
            rows.set(n, `${element.localName}${n}<${parent ? `${parent.localName}${parent.getAttribute("data-n")}` : "-"}`);
          }
          return [...rows.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, row]) => row)
            .join(" ");
        }),
      nesting.map(([html]) => numbered(html)),
    );
    expect(read).toEqual(nesting.map(([, parents]) => parents));
  }, 60_000);
});

// Each fault row is no false alarm: Chrome builds it otherwise than the reader reads it.
describe.skipIf(!BROWSER)("Chrome nests each fault row otherwise than the reader", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(async () => {
    await browser.close();
  });
  test("each row", async () => {
    const page = await browser.open(400, 300);
    const texts = nestingFaults.map(([html]) => numbered(html));
    const chrome = await page.evaluate(chromeTrees, texts.map(documentOf));
    expect(texts.filter((text, i) => readerTree(text) === chrome[i])).toEqual([]);
  }, 60_000);
});

// Each strict row nests in Chrome as the reader reads it: the finding is strictness, not a difference.
describe.skipIf(!BROWSER)("Chrome nests each strict row as the reader does", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(async () => {
    await browser.close();
  });
  test("each row", async () => {
    const page = await browser.open(400, 300);
    const texts = strictNesting.map(([html]) => numbered(html));
    const chrome = await page.evaluate(chromeTrees, texts.map(documentOf));
    expect(texts.filter((text, i) => readerTree(text) !== chrome[i])).toEqual([]);
  }, 60_000);
});

// The claim the reader keeps: every text it reads with no nesting finding and nothing that stops the page nests as in
// Chrome. Random texts of the elements the allow-list takes, from fixed seeds so a failure runs again from its seed
// (PROTOTYPE_NESTING_SEEDS names others, such as "7,8"), are each read by the reader and, when it accepts them,
// compared with Chrome's tree, element by element and word by word. Two guards keep the claim from holding by refusing
// everything: a floor on the share accepted, about half in a run, and texts written in full, none of which is refused.
describe.skipIf(!BROWSER)("the reader nests every text it accepts as Chrome does", () => {
  const seeds = (process.env.PROTOTYPE_NESTING_SEEDS ?? "1,2,3,4").split(",").map(Number);
  const perSeed = 4000;
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(async () => {
    await browser.close();
  });
  const chromeOf = async (texts: string[]) => {
    const page = await browser.open(400, 300);
    const trees: string[] = [];
    for (let i = 0; i < texts.length; i += 1000) trees.push(...(await page.evaluate(chromeTrees, texts.slice(i, i + 1000).map(documentOf))));
    return trees;
  };
  test.each(seeds)(
    "messy texts from seed %d",
    async (seed) => {
      const random = seeded(seed);
      const texts = Array.from({ length: perSeed }, () => messyText(random));
      const faults: Fault["kind"][] = [];
      for (const text of texts) readerTree(text, faults);
      const accepted = texts.filter((text) => !refusal(text));
      const chrome = await chromeOf(accepted);
      const differ = accepted.flatMap((text, i) => {
        const reader = readerTree(text);
        return reader === chrome[i] ? [] : [`seed ${seed}: ${text}\n  reader ${reader}\n  chrome ${chrome[i]}`];
      });
      expect(differ.slice(0, 3)).toEqual([]);
      expect(accepted.length / texts.length).toBeGreaterThan(0.2);
      // Each fault is met, so each rule of the reader is tried against Chrome.
      const kinds: Fault["kind"][] = [
        "closed-early",
        "adopted",
        "link-in-link",
        "in-select",
        "in-table",
        "table-part",
        "stray-end",
        "heading-end",
        "option-end",
      ];
      expect(kinds.filter((kind) => faults.filter((one) => one === kind).length < 3)).toEqual([]);
      // And the parts a browser reads by rules of their own stand in the texts it accepts.
      const holding = (pattern: RegExp) => accepted.filter((text) => pattern.test(text)).length;
      expect([/<td\b/, /<option\b/, /<(b|i|em|strong|a|code|s|small|u) /, /<svg\b/, /<template\b/].filter((pattern) => holding(pattern) < 20)).toEqual([]);
    },
    60_000,
  );
  test("texts written in full are never refused, and nest as in Chrome", async () => {
    const random = seeded(seeds[0] ?? 1);
    const texts = Array.from({ length: 1000 }, () => tidyText(random));
    expect(texts.filter((text) => nestingFindings(text).length || refusal(text))).toEqual([]);
    const chrome = await chromeOf(texts);
    expect(texts.filter((text, i) => readerTree(text) !== chrome[i]).slice(0, 3)).toEqual([]);
  }, 60_000);
});
