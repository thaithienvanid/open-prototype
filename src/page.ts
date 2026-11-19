// The page: the viewer with a design filled in. The page holds one script, the viewer's, named by its hash in the
// page's Content-Security-Policy; each style block is named by its hash too, so nothing a design did not ship runs or
// applies. The design goes in last, so it can never move the page's own parts. Building a page is pure: the same
// design, findings, rounds, and settings give the same text.
import { createHash } from "node:crypto";
import { withImages } from "./checks/images.ts";
import { roundsFolder } from "./checks/rounds.ts";
import { findingData } from "./checks/rules.ts";
import { type EarlierRound, PAGE_BLOCKS, type PageConfig, type PageFrame, PRODUCT_NAME_LIMIT, ROUND_LIMITS } from "./contract.ts";
import { embedFonts, fontUrls, markupFontUrls, tokensFolder } from "./css/fonts.ts";
import { urlAsRead } from "./design/allow.ts";
import type { Design } from "./design/load.ts";
import { systemShape } from "./design/system.ts";
import type { Finding } from "./finding.ts";
import { ATTR, OUTPUT_VERSION, PREFIX, PROGRAM } from "./format.ts";
import type { Attribute, TagPlace } from "./html/tokenizer.ts";
import { firstValues, readMarkup } from "./html/tokenizer.ts";
import type { Project } from "./project.ts";
import { cut, escapeHtml } from "./text.ts";

/** The viewer's two files, as text. */
export type Viewer = { html: string; css: string };

/** What a page shows: the design, its findings, its earlier rounds, and the settings. */
export type PageInput = { design: Design; findings: Finding[]; rounds: EarlierRound[]; project: Project };

const FIXTURES = new RegExp(`(<script type="application/json" id="${PAGE_BLOCKS.fixtures}">)([\\s\\S]*?)(</script(?:[\\s/][^>]*)?>)`);
const PRODUCT = new RegExp(
  `(<template id="${PAGE_BLOCKS.product}">\\n)([\\s\\S]*)(</template>\\n<script type="application/json" id="${PAGE_BLOCKS.fixtures}">)`,
);
const POLICY = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
const SCRIPT = /<script>([\s\S]*?)<\/script(?:[\s/][^>]*)?>/gi;
const ANY_SCRIPT = /<script(?![\p{L}\p{N}_])/giu;
const DATA_SCRIPT = /<script type="application\/json"/gi;
const SCRIPT_SRC = /script-src [^;]*/;
const STYLE_SRC_ELEM = /style-src-elem [^;]*/;

function sha256(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** The hash of each style block of the texts, once each, as the policy names them. */
export function styleHashes(...texts: string[]): string {
  const blocks = texts.flatMap(styleBlocks).map((block) => block.replaceAll("\r\n", "\n").replaceAll("\r", "\n"));
  return [...new Set(blocks.map(sha256))].join(" ") || "'none'";
}

/** The text of each `<style>` element as the tokenizer reads it, outside SVG and MathML, so no hidden style is named. */
function styleBlocks(text: string): string[] {
  const blocks: string[] = [];
  let foreign = 0;
  let current: string | null = null;
  readMarkup(text, {
    start: (tag) => {
      if (tag === "svg" || tag === "math") foreign++;
      else if (tag === "style" && !foreign) current = "";
    },
    startEnd: () => undefined,
    end: (tag) => {
      if ((tag === "svg" || tag === "math") && foreign) foreign--;
      if (tag === "style" && current !== null) {
        blocks.push(current);
        current = null;
      }
    },
    data: (data) => {
      if (current !== null) current += data;
    },
  });
  return blocks;
}

const TEMPLATE_TAG = /<(\/?)template(?![\p{L}\p{N}_])/giu;

/**
 * Whether markup stays inside the page's `<template>`: it ends inside no tag and no comment, every `<template` and
 * `</template` in its text is a real tag, as the tokenizer reads it, and no end tag closes more than it opened. The design's own check holds this for a design; the
 * page holds it again, because outside its template a design's markup is the viewer's own page, where the policy cannot
 * stop a redirect.
 */
export function staysInTemplate(markup: string): boolean {
  const real = new Set<number>();
  let cut = false;
  const mark = (tag: string, place: { at: number }) => {
    if (tag === "template") real.add(place.at);
  };
  readMarkup(markup, {
    start: (tag, _attrs, place) => mark(tag, place),
    startEnd: (tag, _attrs, place) => mark(tag, place),
    end: mark,
    unfinished: () => {
      cut = true;
    },
  });
  // Markup that ends inside a tag or a comment would take the page's own end of the template.
  if (cut) return false;
  let depth = 0;
  for (const found of markup.matchAll(TEMPLATE_TAG)) {
    if (!real.has(found.index)) return false;
    depth += found[1] ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** The hash of the viewer's one script. The build stops when the template holds a script the policy cannot name. */
function scriptHashes(template: string): string {
  const scripts = Array.from(template.matchAll(SCRIPT), (found) => found[1] ?? "");
  const all = template.match(ANY_SCRIPT)?.length ?? 0;
  const data = template.match(DATA_SCRIPT)?.length ?? 0;
  if (all !== scripts.length + data) throw new Error("the viewer holds a script element the page's policy cannot name: the tool's files changed");
  return scripts.map(sha256).join(" ") || "'none'";
}

function pagePolicy(template: string, body: string): string {
  const found = POLICY.exec(template)?.[0];
  if (!found || !SCRIPT_SRC.test(found) || !STYLE_SRC_ELEM.test(found))
    throw new Error("the viewer's Content-Security-Policy changed: the tool's files changed");
  return found.replace(SCRIPT_SRC, () => `script-src ${scriptHashes(template)}`).replace(STYLE_SRC_ELEM, () => `style-src-elem ${styleHashes(template, body)}`);
}

/** JSON for a script block: no `<`, `>`, or `&` reaches the HTML parser, so no value can close the block. */
function scriptSafe(text: string): string {
  return text.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

/** The device frames, in the menu's order: the first of each platform is its default. */
function frameList(project: Project): PageFrame[] {
  return Array.from(project.devices.frames, ([id, frame]) => ({
    id,
    name: frame.name,
    platform: frame.platform,
    width: frame.width,
    height: frame.height,
    safe_area: { top: frame.safe_area?.top ?? 0, bottom: frame.safe_area?.bottom ?? 0 },
  }));
}

/** The command that writes a design's page, as a message names it. */
export function buildCommand(design: Design): string {
  return `${PROGRAM} build ${design.design}`;
}

/** A document element's attributes, first value of each, less the names the tool reads. */
function attributes(list: Attribute[]): Record<string, string> {
  return Object.fromEntries([...firstValues(list)].filter(([name]) => !name.startsWith(PREFIX)));
}

/**
 * The markup a page carries for its frames: one tokens block, the design document's tokens then the token files', then
 * the design's styles and body. Each font file an `@font-face` names, and `readFiles` read, is written in as a `data:` URL.
 */
function frameMarkup(design: Design): string {
  const body = embedFonts(design.body, markupFontUrls(design.body), design.folder, design.fonts);
  if (!design.tokens.length) return body;
  const tokens = design.tokens.map((token) =>
    token.generated ? token.css : embedFonts(token.css, fontUrls(token.css), tokensFolder(token.file), design.fonts),
  );
  return `<style ${ATTR.tokens}>\n${tokens.join("\n")}\n</style>\n${body}`;
}

// A link that leaves its screen goes nowhere in the viewer, and Chrome still opens a connection to its address when a
// person presses it, before the viewer cancels the press. So the page holds no such address: each link's `href` that
// names no place in the screen becomes `about:blank`, which Chrome never connects to, and the address the design wrote
// stays on the link as `data-proto-href`, as text, for the viewer to say. The design file is never changed.
const INERT = "about:blank";
const LINK_ADDRESS = `${PREFIX}href` as const;
const LINK_TAGS = new Set(["a", "area"]);
const LINK_ATTRIBUTES = new Set(["href", "xlink:href"]);
const TAG_OPEN = /^<[^\t\n\r\f />]+/;

/** The markup with every link's address that leaves its screen made inert, each start tag of a link rewritten whole, and nothing else moved. */
export function inertLinks(markup: string): string {
  const edits: { at: number; length: number; text: string }[] = [];
  const visit = (tag: string, attrs: Attribute[], place: TagPlace, selfClosing: boolean) => {
    if (!LINK_TAGS.has(tag)) return;
    const leaving = attrs.map(([name, value]) => LINK_ATTRIBUTES.has(name) && !urlAsRead(value ?? "").startsWith("#"));
    if (!leaving.includes(true)) return;
    // The address a browser would follow: the first `href`, as SVG reads it, then the first `xlink:href`.
    const first = (name: string) => attrs.findIndex(([found], index) => found === name && leaving[index]);
    const address = attrs[first("href") >= 0 ? first("href") : first("xlink:href")]?.[1] ?? "";
    const kept: Attribute[] = attrs.flatMap(([name, value], index) => (name === LINK_ADDRESS ? [] : [[name, leaving[index] ? INERT : value] as Attribute]));
    const written = [[LINK_ADDRESS, address] as Attribute, ...kept].map(([name, value]) => (value === null ? ` ${name}` : ` ${name}="${escapeHtml(value)}"`));
    edits.push({ at: place.at, length: place.raw.length, text: `${TAG_OPEN.exec(place.raw)?.[0] ?? `<${tag}`}${written.join("")}${selfClosing ? "/>" : ">"}` });
  };
  readMarkup(markup, {
    start: (tag, attrs, place) => visit(tag, attrs, place, false),
    startEnd: (tag, attrs, place) => visit(tag, attrs, place, true),
    end: () => undefined,
  });
  let out = markup;
  for (const edit of edits.reverse()) out = out.slice(0, edit.at) + edit.text + out.slice(edit.at + edit.length);
  return out;
}

/** The page-config block of the page contract. */
export function pageConfig(input: PageInput): PageConfig {
  const { design, findings, rounds, project } = input;
  const folder = design.folder;
  return {
    schema_version: OUTPUT_VERSION,
    design_id: design.id,
    design: design.design,
    product: cut(design.product || design.name || "Design", PRODUCT_NAME_LIMIT),
    work_item: design.workItem,
    platforms: design.platforms,
    themes: design.themes,
    html: attributes(design.html),
    body: attributes(design.bodyAttributes),
    tokens: design.tokens.map((token) => ({ file: token.file, css: token.css })),
    design_md: design.system ? systemShape(design.system) : null,
    frames: frameList(project),
    flows: design.flows.map((flow) => ({ id: flow.id, title: flow.title })),
    rounds: rounds.map((round) => ({
      round: round.round,
      items: round.items.map((item) => ({
        id: item.id,
        screen: item.screen,
        state: item.state,
        testid: item.testid,
        comment: item.comment,
        type: item.type,
        by: item.by,
        done: item.done,
        shown_theme: item.shown_theme,
        ...(item.answered_by ? { answered_by: { round: item.answered_by.round, summary: item.answered_by.summary } } : {}),
      })),
    })),
    rounds_path: folder ? `${folder}/${roundsFolder(design.name)}` : roundsFolder(design.name),
    findings: findings.map(findingData),
    limits: ROUND_LIMITS,
  };
}

/** The page: the viewer with the design, its data, and its settings filled in, in a fixed order. */
export function page(input: PageInput, viewer: Viewer): string {
  const { design } = input;
  if (viewer.css.toLowerCase().includes("</style"))
    throw new Error("viewer.css holds </style, which would end the viewer's style block: the tool's files changed");
  const fixtures = JSON.stringify(design.facts ? withImages(design.fixtures, design.facts.imageFields, design.images).fixtures : design.fixtures, null, 2);
  const command = `\`${buildCommand(design)}\``;
  const writtenBy = escapeHtml(
    `A view of ${design.design} in the current viewer, written by ${command}: change the design, never this page.`.replaceAll("--", "- -"),
  );
  const values: Record<string, string> = {
    title: escapeHtml(design.title),
    subtitle: escapeHtml(design.design),
    written_by: writtenBy,
    system: viewer.css,
  };
  for (const key of Object.keys(values)) {
    if (viewer.html.split(`{{${key}}}`).length !== 2) throw new Error(`the viewer no longer has its {{${key}}}: the tool's files changed`);
  }
  const template = viewer.html.replace(/\{\{(title|subtitle|written_by|system)\}\}/g, (_whole, key: string) => values[key] ?? "");
  const markup = inertLinks(frameMarkup(design));
  if (!staysInTemplate(markup)) throw new Error("the design's markup would end the page's template: no page is written for it");
  const policy = pagePolicy(template, markup);
  const block = (id: string, text: string) => `<script type="application/json" id="${id}">\n${scriptSafe(text)}\n</script>`;
  const steps: [RegExp, (found: RegExpExecArray) => string][] = [
    [FIXTURES, (found) => `${found[1]}\n${scriptSafe(fixtures)}\n${found[3]}\n${block(PAGE_BLOCKS.config, JSON.stringify(pageConfig(input), null, 2))}`],
    [POLICY, () => policy],
    [PRODUCT, (found) => `${found[1]}${markup}${found[3]}`],
  ];
  let out = template;
  for (const [pattern, replacement] of steps) {
    const found = pattern.exec(out);
    if (!found) throw new Error(`the viewer no longer has the part \`${pattern.source.slice(0, 40)}\` the tool fills: the tool's files changed`);
    out = out.slice(0, found.index) + replacement(found) + out.slice(found.index + found[0].length);
  }
  return out;
}
