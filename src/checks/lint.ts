// The paint rules over a design's CSS: raw colours and depth, read from whole declarations as the one CSS reader,
// `cssSheet`, reads them, then each load of a file or from the network, `integrity.load`, read in the CSS the reader finds. And the copy rules over the words a person reads: filler text, and emoji used as
// icons. A class name or an attribute is no copy.

import { rawColor } from "../css/colors.ts";
import { fontUrls, NAME_CHAR } from "../css/fonts.ts";
import { type CssSheet, cssSheet, customProperties, type DepthFinding, depthFinding, lineAt, normal, stringEnd, tokenBlocks } from "../css/sheet.ts";
import type { Issue } from "../design/facts.ts";
import type { RuleId } from "../finding.ts";
import { ATTR, META } from "../format.ts";
import { quoted, words } from "../text.ts";

// A load in CSS: a `url()`, an `@import`'s string, or an `image-set()`'s string. A link's href is no load: the viewer
// cancels every click on a link in a frame. An image's src is either a data URI or unsafe markup, which the allow-list
// refuses.
const NETWORK = /^(?:https?:)?\/\//i;

/** A load a block of CSS names: where it starts, its address, how it is written, and whether it is an `@import`. */
type Load = { index: number; address: string; written: string; kind: "import" | "image" };

/**
 * Each load a block of CSS, its comments taken out, names, in the order they stand: a `url()` quoted or bare, and a
 * string that is an `@import`'s address or an argument of `image-set()`. Any other string is text, so a `url(` in
 * `content` loads nothing, and an `@namespace`'s `url()` or string names a namespace, no file.
 */
function cssLoads(css: string): Load[] {
  const found: Load[] = [];
  let importing: number | null = null;
  // An `@namespace`'s `url()` or string names a namespace and loads nothing, up to its `;`.
  let naming = false;
  // The depth of each open bracket, and the depth an open `image-set(` stands at.
  let depth = 0;
  const sets: number[] = [];
  const word = (at: number, name: string) => !NAME_CHAR.test(css[at - 1] ?? "") && css.slice(at, at + name.length).toLowerCase() === name;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === '"' || char === "'") {
      const close = stringEnd(css, index);
      if (!naming && (importing !== null || sets.at(-1) === depth)) {
        const kind = importing !== null ? "import" : "image";
        found.push({ index: importing ?? index, address: css.slice(index + 1, close), written: css.slice(index, close + 1), kind });
      }
      importing = null;
      index = close;
    } else if (char === "@" && word(index, "@import")) {
      importing = index;
      index += 6;
    } else if (char === "@" && word(index, "@namespace")) {
      naming = true;
      index += 9;
    } else if ((char === "u" || char === "U") && word(index, "url(")) {
      let at = index + 4;
      while (/\s/.test(css[at] ?? "")) at++;
      const quote = css[at] === '"' || css[at] === "'" ? stringEnd(css, at) : -1;
      const close = css.indexOf(")", quote < 0 ? at : quote);
      const end = close < 0 ? css.length : close;
      const address = quote < 0 ? css.slice(at, end).trim() : css.slice(at + 1, quote);
      if (!naming) found.push({ index: importing ?? index, address, written: `url(${address})`, kind: importing !== null ? "import" : "image" });
      importing = null;
      index = end;
    } else if ((char === "i" || char === "I" || char === "-") && (word(index, "image-set(") || word(index, "-webkit-image-set("))) {
      index = css.indexOf("(", index);
      depth++;
      sets.push(depth);
    } else if (char === "(") depth++;
    else if (char === ")") {
      if (sets.at(-1) === depth) sets.pop();
      depth = Math.max(0, depth - 1);
    } else if (char === ";" || char === "{" || char === "}") {
      importing = null;
      naming = false;
    }
  }
  return found;
}
// Filler a person would never ship: in any case for the phrases, in capitals only for the markers, so "a todo list" is
// real copy and "TODO" is not.
const FILLER = /lorem ipsum|dolor sit amet|john doe|jane doe|placeholder text/iu;
const MARKERS = /(?<![\p{L}\p{N}_])(?:TODO(?![\p{L}\p{N}_])(?!-\p{Nd}+)|FIXME(?![\p{L}\p{N}_])|TBD(?![\p{L}\p{N}_]))/u;
// A block's argument left in the copy: blocks are filled before any check reads the copy, so a `{{name}}` still there is
// shown to a person as written. It finds one `{{name}}` within a line, so it is not `ARGUMENT` of `src/format.ts`, which
// is global, keeps its place between calls, and captures each name a block fills.
const ARGUMENT = /\{\{[^{}\n]*\}\}/u;
// Unicode's Extended_Pictographic, less the copyright, registered, and trade mark signs, which the lint allows: the
// ranges of emoji-data.txt.
const PICTOGRAPHS: [number, number][] = [
  [0x203c, 0x203c],
  [0x2049, 0x2049],
  [0x2139, 0x2139],
  [0x2194, 0x2199],
  [0x21a9, 0x21aa],
  [0x231a, 0x231b],
  [0x2328, 0x2328],
  [0x2388, 0x2388],
  [0x23cf, 0x23cf],
  [0x23e9, 0x23f3],
  [0x23f8, 0x23fa],
  [0x24c2, 0x24c2],
  [0x25aa, 0x25ab],
  [0x25b6, 0x25b6],
  [0x25c0, 0x25c0],
  [0x25fb, 0x25fe],
  [0x2600, 0x2605],
  [0x2607, 0x2612],
  [0x2614, 0x2685],
  [0x2690, 0x2705],
  [0x2708, 0x2712],
  [0x2714, 0x2714],
  [0x2716, 0x2716],
  [0x271d, 0x271d],
  [0x2721, 0x2721],
  [0x2728, 0x2728],
  [0x2733, 0x2734],
  [0x2744, 0x2744],
  [0x2747, 0x2747],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2763, 0x2767],
  [0x2795, 0x2797],
  [0x27a1, 0x27a1],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2934, 0x2935],
  [0x2b05, 0x2b07],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3297],
  [0x3299, 0x3299],
  [0x1f000, 0x1f0ff],
  [0x1f10d, 0x1f10f],
  [0x1f12f, 0x1f12f],
  [0x1f16c, 0x1f171],
  [0x1f17e, 0x1f17f],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f1ad, 0x1f1e5],
  [0x1f201, 0x1f20f],
  [0x1f21a, 0x1f21a],
  [0x1f22f, 0x1f22f],
  [0x1f232, 0x1f23a],
  [0x1f23c, 0x1f23f],
  [0x1f249, 0x1f3fa],
  [0x1f400, 0x1f53d],
  [0x1f546, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f774, 0x1f77f],
  [0x1f7d5, 0x1f7ff],
  [0x1f80c, 0x1f80f],
  [0x1f848, 0x1f84f],
  [0x1f85a, 0x1f85f],
  [0x1f888, 0x1f88f],
  [0x1f8ae, 0x1f8ff],
  [0x1f90c, 0x1f93a],
  [0x1f93c, 0x1f945],
  [0x1f947, 0x1faff],
  [0x1fc00, 0x1fffd],
];
const hex = (code: number) => `\\u{${code.toString(16)}}`;
const EMOJI = new RegExp(`[${PICTOGRAPHS.map(([low, high]) => `${hex(low)}-${hex(high)}`).join("")}]`, "u");

const HEX_COLOR = /#([0-9a-fA-F]{3,8})(?![\p{L}\p{N}_])/u;
const FUNC_COLOR = /(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\([^)]+\)/i;

/** A colour as two values are compared: lowercase, a short hex written long, and one space where a run stood. */
export function normalColor(value: string): string {
  const raw = value.trim().toLowerCase();
  const found = new RegExp(`^${HEX_COLOR.source}$`, "u").exec(raw);
  if (found) {
    const digits = found[1] ?? "";
    return `#${digits.length === 3 || digits.length === 4 ? Array.from(digits, (char) => char + char).join("") : digits}`;
  }
  return raw.replace(/\s+/g, " ");
}

/**
 * Each colour the tokens block holds, normalised, with the first custom property that holds it; a member of a colour role
 * is named by its role, which a design reads, so `roles` maps each member's name to its role's, or to "" for a member
 * with no role, which is never named.
 */
export function tokenColors(text: string, roles: ReadonlyMap<string, string> = new Map()): Map<string, string> {
  const byColor = new Map<string, string>();
  const whole = new RegExp(`^(?:${HEX_COLOR.source}|${FUNC_COLOR.source})$`, "iu");
  for (const block of tokenBlocks(text)) {
    for (const [name, value] of customProperties(block)) {
      const key = normalColor(value);
      const named = roles.get(name) ?? name;
      if (named && whole.test(value) && !byColor.has(key)) byColor.set(key, named);
    }
  }
  return byColor;
}

/** The token that holds a raw colour's value, or "" when none does. */
function suggestVar(value: string, tokens: Map<string, string>): string {
  if (!tokens.size) return "";
  const found = HEX_COLOR.exec(value) ?? FUNC_COLOR.exec(value);
  return found ? (tokens.get(normalColor(found[0])) ?? "") : "";
}

// Each value the tokens blocks set, with the first custom property that holds it in the last block that sets it.
function tokenNames(text: string): Map<string, string> {
  const named = new Map<string, string>();
  for (const block of tokenBlocks(text)) for (const [name, value] of customProperties(block).reverse()) named.set(normal(value), name);
  return named;
}

function depthMessage(found: DepthFinding, named: Map<string, string>): string {
  const token = named.get(normal(found.layer)) || named.get(normal(found.value));
  const what = `the depth in "${quoted(`${found.prop}: ${found.layer}`)}" is outside the tokens block`;
  if (token) return `${what}; the tokens block already holds ${token} with this value, so read it with var(${token})`;
  return `${what}; move the value into the tokens block as a custom property, and read it with var()`;
}

/** The paint rules over a text that holds CSS, each finding with its line, in the order of their lines; `sheet` is the text's, when it was read. */
export function lint(text: string, tokens: Map<string, string> = tokenColors(text), sheet: CssSheet = cssSheet(text)): Issue[] {
  const found: Issue[] = [];
  const push = (line: number, message: string, rule: RuleId) => found.push({ rule, line, message });
  const named = tokenNames(text);
  // The declarations as the one CSS reader reads them, outside every tokens block.
  for (const declaration of sheet.written) {
    if (declaration.tokens) continue;
    const color = rawColor(declaration.property, declaration.value);
    if (color !== null) {
      // The declaration as written, on one line and cut short; the token is named for the colour, never a URL's `#name`.
      const written = Array.from(words(declaration.text).join(" ")).slice(0, 70).join("");
      const token = suggestVar(color, tokens);
      push(
        declaration.line,
        `the raw colour in "${quoted(written)}" is outside the tokens block; read a role with var(), such as var(${token || "--color-accent"})`,
        "paint.raw-color",
      );
    }
    const depth = depthFinding(declaration.text);
    if (depth) push(lineAt(declaration, depth.start), depthMessage(depth, named), "paint.depth");
  }
  // A load is read in the CSS alone, its comments taken out, across lines as CSS spans them; one finding of each kind a line.
  // A data: URI is the image itself and a `#name` an element of the page; a font file is the font rules'.
  const lines = new Set<string>();
  for (const block of sheet.blocks) {
    const fonts = new Set(fontUrls(block.text).map((url) => url.start));
    for (const load of cssLoads(block.text)) {
      if (load.address === "" || load.address.startsWith("#") || /^data:/i.test(load.address)) continue;
      const network = NETWORK.test(load.address);
      if (!network && fonts.has(load.index)) continue;
      const number = block.line + (block.text.slice(0, load.index).match(/\n/g)?.length ?? 0);
      // A load from the network and one of a file are told apart on a line, each once, as their words differ.
      const kind = `${network ? "network" : "file"}:${number}`;
      if (lines.has(kind)) continue;
      lines.add(kind);
      const what = load.kind === "import" ? `@import ${load.written}` : load.written;
      const next =
        load.kind === "import"
          ? `write its rules in a <style>, or name a tokens file with <meta name="${META.tokens}">`
          : `write the image as a data: URI, or draw it in an <img> with ${ATTR.image} and a key of the fixtures`;
      push(
        number,
        network
          ? `${quoted(load.address)} loads from the network, which the page's Content-Security-Policy blocks: keep the image or the font in the project. For a font, download its files, for example from Google Fonts or Fontsource, keep them in the project, and point url() at them`
          : `${quoted(what)} names a file, which the page's Content-Security-Policy never loads: ${next}`,
        "integrity.load",
      );
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

/** The copy rules over the words a person reads, each run of text with the line it starts on. */
export function copyIssues(texts: [line: number, text: string, at?: number | undefined][]): Issue[] {
  const found: Issue[] = [];
  for (const [first, text, start] of texts) {
    text.split("\n").forEach((line, index) => {
      // The text's first line starts where the text does; each later line starts a line of its own.
      const at = index === 0 && start !== undefined ? { at: start } : {};
      const word = FILLER.exec(line) ?? MARKERS.exec(line) ?? ARGUMENT.exec(line);
      if (word)
        found.push({ rule: "copy.placeholder", line: first + index, ...at, message: `placeholder text "${word[0]}"; write the real copy a person would read` });
      const emoji = EMOJI.exec(line);
      if (emoji)
        found.push({
          rule: "copy.emoji",
          line: first + index,
          ...at,
          message: `the emoji ${emoji[0]} is not an icon; draw it from the system's icon set, with a name or aria-hidden="true"`,
        });
    });
  }
  return found;
}

/**
 * The words the fixtures show, each with its line in the fixtures' text: every string value, read as JSON reads it, and
 * never a key or a `data:` URI, which is an image's bytes. A string holds no raw line break, so each value is on the
 * line its quote opens; a value's own escaped line breaks are lines of that one line.
 */
export function fixtureCopy(json: string): [line: number, text: string][] {
  const found: [number, string][] = [];
  let line = 1;
  for (let index = 0; index < json.length; index++) {
    if (json[index] === "\n") line++;
    if (json[index] !== '"') continue;
    let end = index + 1;
    // A line break ends a string that JSON would refuse, so every line is still counted.
    while (end < json.length && json[end] !== '"' && json[end] !== "\n") end += json[end] === "\\" ? 2 : 1;
    if (json[end] !== '"') {
      index = end - 1;
      continue;
    }
    let after = end + 1;
    while (/\s/.test(json[after] ?? "")) after++;
    if (json[after] !== ":") {
      let value: unknown = null;
      try {
        value = JSON.parse(json.slice(index, end + 1));
      } catch {}
      if (typeof value === "string" && !/^\s*data:/i.test(value)) for (const part of value.split(/\r\n|\r|\n/)) found.push([line, part]);
    }
    index = end;
  }
  return found;
}

/** An SVG fill or stroke that holds a raw colour, as a message that names the token holding its colour, when one does. */
export function paintMessage(attribute: string, value: string, tokens: Map<string, string>): string {
  const token = suggestVar(value, tokens) || "--color-accent";
  return `the raw colour in ${attribute}="${quoted(value)}" is outside the tokens block; use currentColor or var(), such as var(${token})`;
}
