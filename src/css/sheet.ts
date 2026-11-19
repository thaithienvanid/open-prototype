// The one CSS reader, `cssSheet`, and the depth rule. The reader reads each style element and style attribute by its
// braces, as a browser does: a comment, read only where a browser reads one, is no declaration; a string is kept whole;
// a value on two lines is one value; the text a person reads is no CSS; and an at-rule's condition is no declaration,
// so `@supports (backdrop-filter: blur(10px))` tests a feature and draws nothing. The paint rules read its declarations
// outside every tokens block, `<style data-proto-tokens>`, because a tokens block is where a design may hold any value.
// The reader is linear in the size of the text, so a hostile design takes time in proportion to its length.
import { ATTR, READ_LIMITS } from "../format.ts";
import { type Attribute, readMarkup, type TagPlace } from "../html/tokenizer.ts";
import { isSpace, lineFinder, strip, words } from "../text.ts";

// A style block's end tag, which the tokens blocks, found by a pattern, end at.
const STYLE_END = /<\/style(?:[\s/][^>]*)?>/gi;
// A tokens block's start tag: a `<style>` that carries the tokens attribute, in any spelling a formatter writes.
const TOKENS_OPEN = new RegExp(`<style(?=[\\s/])[^<>]*?(?<![\\p{L}\\p{N}_-])${ATTR.tokens}(?![\\p{L}\\p{N}_-])[^<>]*>`, "giu");
// Inside CSS, a string and an unquoted `url(` hold text, so a `/*` in one opens no comment. A string ends at its quote
// or at the end of its line.
const CSS_TOKEN = /"(?:\\[^\n]|[^"\\\n])*"?|'(?:\\[^\n]|[^'\\\n])*'?|url\(\s*(?!["'\s])[^)\s]*|\/\*/gi;
const CUSTOM_PROPERTY = /(--[a-z0-9-]+)\s*:\s*([^;}]+)/g;
const DEPTH_PROPERTY = /(?<![\p{L}\p{N}_.#-])(?:-webkit-)?(box-shadow|text-shadow|filter|backdrop-filter)\s*:/iu;
const IMPORTANT = /!\s*important\s*$/i;
// A CSS length: a number, with a unit or none. A zero is any spelling of 0 in any unit.
const LENGTH = /^[+-]?(?:\p{Nd}+\.?\p{Nd}*|\.\p{Nd}+)(?:e[+-]?\p{Nd}+)?(?:[a-z]+|%)?$/iu;
const ZERO = /^[+-]?(?:0+\.?0*|\.0+)(?:[a-z]+|%)?$/i;
const FILTER_FUNCTION = /^(blur|drop-shadow)\(([\s\S]*)\)$/i;
// The values every property takes, which draw nothing of their own.
const NO_DEPTH = new Set("none inherit initial unset revert revert-layer".split(" "));
const MIN_LENGTHS = 2; // x and y
const MAX_LENGTHS = 4; // up to blur and spread
const FALLBACK_LEVELS = 8; // how deep a `var()` may hold another in its fallback
const ZERO_LENGTHS = 3; // x, y, and blur are zero in a ring; a fourth length is the spread, which may be any length

/** The line of the character at `index` of a declaration's text. */
export function lineAt(declaration: { line: number; text: string }, index: number): number {
  return declaration.line + (declaration.text.slice(0, index).match(/\n/g)?.length ?? 0);
}

export type DepthFinding = { start: number; prop: string; layer: string; value: string };

/** A value as the tokens block is searched for it: lowercase, with each run of space one space. */
export function normal(value: string): string {
  return words(value.toLowerCase()).join(" ");
}

function* cssComments(text: string, begin: number, stop: number): Generator<[number, number]> {
  const part = text.slice(0, stop);
  let pos = begin;
  for (;;) {
    CSS_TOKEN.lastIndex = pos;
    const found = CSS_TOKEN.exec(part);
    if (!found) return;
    pos = found.index + found[0].length;
    if (found[0] !== "/*") continue;
    const end = part.indexOf("*/", pos);
    if (end < 0) return;
    yield [found.index, end + 2];
    pos = end + 2;
  }
}

// The end tag of a style block, searched before the text's last `>`: a candidate then always has a `>` to end at.
function styleEnd(text: string, from: number, room: number): RegExpExecArray | null {
  STYLE_END.lastIndex = from;
  return STYLE_END.exec(text.slice(0, room));
}

/** The text with each comment of its CSS replaced by one space and its line breaks, so each line keeps its number. */
function masked(text: string): string {
  const parts: string[] = [];
  let pos = 0;
  for (const [start, end] of cssRegions(text).flatMap((region) => [...cssComments(text, region.start, region.end)])) {
    parts.push(text.slice(pos, start), ` ${"\n".repeat(text.slice(start, end).split("\n").length - 1)}`);
    pos = end;
  }
  return parts.join("") + text.slice(pos);
}

/** Where each tokens block stands: from its opening tag to the end of its end tag, or to the end of the text. */
function tokenSpans(text: string): [start: number, end: number, inner: number][] {
  const spans: [number, number, number][] = [];
  const room = text.lastIndexOf(">") + 1;
  let pos = 0;
  for (;;) {
    TOKENS_OPEN.lastIndex = pos;
    const open = TOKENS_OPEN.exec(text);
    if (!open) return spans;
    const stop = styleEnd(text, open.index + open[0].length, room);
    pos = stop ? stop.index + stop[0].length : text.length;
    spans.push([open.index, pos, open.index + open[0].length]);
  }
}

/** The text of each tokens block. */
export function tokenBlocks(text: string): string[] {
  return tokenSpans(text).map(([, end, inner]) => text.slice(inner, end));
}

/** The custom properties a block of CSS sets, each as its name and value. */
export function customProperties(block: string): [string, string][] {
  return Array.from(block.matchAll(CUSTOM_PROPERTY), (found) => [found[1] ?? "", strip(found[2] ?? "")]);
}

/** `text` cut at each comma, or at each run of space, outside parentheses. */
function splitTop(text: string, comma: boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? "";
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (comma ? char === "," : isSpace(char))) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(strip).filter((part) => part !== "");
}

/** Whether the text is one `var(...)`, whole. */
function isVar(text: string): boolean {
  if (!text.startsWith("var(")) return false;
  let depth = 0;
  for (let index = 3; index < text.length; index++) {
    depth += Number(text[index] === "(") - Number(text[index] === ")");
    if (depth === 0) return index === text.length - 1;
  }
  return false;
}

function isLength(token: string): boolean {
  return LENGTH.test(token) || token.toLowerCase().startsWith("calc(");
}

/**
 * Whether a shadow layer is a ring: two to four lengths, a color before or after them, and `inset`. It is a ring when
 * x, y, and blur are zero, in any unit, with any spread: it draws an edge and no depth.
 */
function isRing(layer: string): boolean {
  const all = splitTop(layer, false);
  let tokens = all.filter((word) => word.toLowerCase() !== "inset");
  if (!tokens.length || all.length - tokens.length > 1) return false;
  if (!isLength(tokens[0] ?? "")) tokens = tokens.slice(1);
  else if (!isLength(tokens[tokens.length - 1] ?? "")) tokens = tokens.slice(0, -1);
  if (tokens.length < MIN_LENGTHS || tokens.length > MAX_LENGTHS) return false;
  return tokens.every((token, index) => (index < ZERO_LENGTHS ? ZERO.test(token) : isLength(token) || isVar(token)));
}

function shadowLayers(value: string): string[] {
  return NO_DEPTH.has(normal(value)) ? [] : splitTop(value, true);
}

/** A value as the rule reads it: no `!important`, and no text after a quote that ends a style attribute. */
function cleaned(value: string): string {
  let depth = 0;
  let text = value;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    depth += Number(char === "(") - Number(char === ")");
    if (char === "'" && depth <= 0) {
      text = text.slice(0, index);
      break;
    }
  }
  return strip(strip(text).replace(IMPORTANT, ""));
}

// The first shadow layer that draws depth. A fallback nested deeper than a design needs is read as depth, so a hostile
// one costs no more than its length times that depth.
function shadowLayer(value: string): string {
  const todo: [string, number][] = [[value, 0]];
  while (todo.length) {
    const [text, level] = todo.pop() ?? ["", 0];
    for (const one of shadowLayers(text)) {
      if (!isVar(one)) {
        if (!isRing(one)) return one;
      } else if (level === FALLBACK_LEVELS) return one;
      else {
        const inner = one.slice(4, -1);
        const comma = inner.indexOf(",");
        const fallback = comma < 0 ? "" : strip(inner.slice(comma + 1));
        if (fallback) todo.push([fallback, level + 1]);
      }
    }
  }
  return "";
}

function filterLayer(value: string): string {
  for (const token of NO_DEPTH.has(normal(value)) ? [] : splitTop(value, false)) {
    const found = FILTER_FUNCTION.exec(token);
    if (!found) continue;
    const name = (found[1] ?? "").toLowerCase();
    const argument = strip(found[2] ?? "");
    const calm = isVar(argument) || (name === "blur" ? ZERO.test(argument) : isRing(argument));
    if (!calm) return token;
  }
  return "";
}

/** The depth a declaration draws outside the rule, or null. The declaration holds one property: the first is read. */
export function depthFinding(text: string): DepthFinding | null {
  const found = DEPTH_PROPERTY.exec(text);
  if (!found) return null;
  const prop = (found[1] ?? "").toLowerCase();
  const value = cleaned(text.slice(found.index + found[0].length));
  if (!value) return null;
  const layer = prop.endsWith("shadow") ? shadowLayer(value) : filterLayer(value);
  return layer ? { start: found.index, prop, layer, value } : null;
}

/** A declaration of a rule: its property, its value with no `!important`, and its line. */
export type CssDeclaration = { property: string; value: string; line: number };
/**
 * A rule: its selector text, the preludes of the at-rules it stands in (`@media (prefers-reduced-motion: reduce)`), the
 * selectors of the rules it is nested in, its declarations, and its line. A style attribute is a rule with no selector.
 */
export type CssRule = { selector: string; at: string[]; parents: string[]; declarations: CssDeclaration[]; line: number; tokens: boolean; inline: boolean };
/** A keyframes block: its name, the at-rules it stands in, its line, and its stops, each a selector and declarations. */
export type CssKeyframes = { name: string; at: string[]; line: number; stops: { selector: string; line: number; declarations: CssDeclaration[] }[] };
/**
 * A declaration as written, from its first character to its end, `!important` and its spacing kept, with its line, and
 * whether a tokens block holds it: what the paint rules read, which quote a declaration as the design writes it. It is
 * every declaration a block holds, in the order they stand, an at-rule's own block's, such as `@font-face`'s, among them.
 */
export type CssWritten = { text: string; line: number; tokens: boolean };
/** The CSS of a text as rules and keyframes blocks, each with its line in the text, and each declaration as written. */
export type CssSheet = { rules: CssRule[]; keyframes: CssKeyframes[]; written: CssWritten[]; blocks: CssBlock[] };
/** The text of one place CSS stands, a style element's or a style attribute's, its comments taken out, with the line it starts on. */
export type CssBlock = { text: string; line: number; tokens: boolean };

type Region = { start: number; end: number; tokens: boolean; inline: boolean };

/**
 * Where CSS stands in a page, as the tokenizer reads the page: each style element's text, marked when it is a tokens
 * block, and each quoted style attribute's value, in the order they stand. A text that only looks like a tag or an
 * attribute, in a comment or in the words a person reads, holds no CSS.
 */
function cssRegions(text: string): Region[] {
  const regions: Region[] = [];
  let open: { start: number; tokens: boolean } | null = null;
  const start = (tag: string, attrs: Attribute[], place: TagPlace) => {
    const index = attrs.findIndex(([name]) => name === "style");
    const span = index >= 0 ? place.values?.[index] : null;
    if (span && (text[span[0] - 1] === '"' || text[span[0] - 1] === "'")) regions.push({ start: span[0], end: span[1], tokens: false, inline: true });
    if (tag === "style" && !open) open = { start: place.at + place.raw.length, tokens: attrs.some(([name]) => name === ATTR.tokens) };
  };
  readMarkup(text, {
    start,
    startEnd: start,
    end: (tag, place) => {
      if (tag !== "style" || !open) return;
      regions.push({ start: open.start, end: place.at, tokens: open.tokens, inline: false });
      open = null;
    },
  });
  const last = open as { start: number; tokens: boolean } | null;
  if (last) regions.push({ start: last.start, end: text.length, tokens: last.tokens, inline: false });
  return regions.sort((a, b) => a.start - b.start);
}

/** Where each style element's text stands in a page, as the tokenizer reads the page: after its start tag, to its end tag or to the end of the text. */
export function styleElements(text: string): { start: number; end: number }[] {
  return cssRegions(text)
    .filter((region) => !region.inline)
    .map((region) => ({ start: region.start, end: region.end }));
}

function declaration(css: string, from: number, to: number, line: (at: number) => number): CssDeclaration | null {
  const text = css.slice(from, to);
  const colon = text.indexOf(":");
  const lead = text.length - text.trimStart().length;
  if (colon < 0 || !text.trim()) return null;
  const name = strip(text.slice(0, colon));
  if (!/^-?-?[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) return null;
  return {
    property: name.startsWith("--") ? name : name.toLowerCase(),
    value: strip(strip(text.slice(colon + 1)).replace(IMPORTANT, "")),
    line: line(from + lead),
  };
}

/** Read one region of CSS: blocks by their braces, a string kept whole, so a brace in a string opens no block. */
function readRegion(
  css: string,
  start: number,
  end: number,
  region: { tokens: boolean; inline: boolean },
  line: (at: number) => number,
  sheet: CssSheet,
): void {
  type Open = { kind: "at" | "rule" | "keyframes" | "stop"; prelude: string; line: number; declarations: CssDeclaration[]; keyframes?: CssKeyframes };
  const stack: Open[] = [];
  const inline: CssRule | null = region.inline ? { selector: "", at: [], parents: [], declarations: [], line: line(start), tokens: false, inline: true } : null;
  let segment = start;
  const top = () => stack[stack.length - 1];
  const take = (to: number) => {
    const open = top();
    const list = inline && !open ? inline.declarations : open && (open.kind === "rule" || open.kind === "stop") ? open.declarations : null;
    const found = list ? declaration(css, segment, to, line) : null;
    if (found) list?.push(found);
    // Every declaration a block holds, as written; an at-rule's statement, such as `@import`, is none.
    const text = css.slice(segment, to);
    const lead = text.length - text.trimStart().length;
    if ((inline || open) && strip(text) && !text.trimStart().startsWith("@"))
      sheet.written.push({ text: text.slice(lead), line: line(segment + lead), tokens: region.tokens });
  };
  for (let index = start; index < end; index++) {
    const char = css[index];
    if (char === '"' || char === "'") {
      // A string ends at its own quote or at the end of its line; a quote or a line break after a backslash is the string's.
      let close = index + 1;
      while (close < end && css[close] !== char && css[close] !== "\n") close += css[close] === "\\" ? 2 : 1;
      index = Math.min(close, end);
      continue;
    }
    if (char === ";") {
      take(index);
      segment = index + 1;
    } else if (char === "{" && !inline) {
      const prelude = strip(css.slice(segment, index));
      const at = line(segment + (css.slice(segment, index).length - css.slice(segment, index).trimStart().length));
      const outer = top();
      if (outer?.kind === "keyframes") {
        const stop = { selector: prelude, line: at, declarations: [] as CssDeclaration[] };
        outer.keyframes?.stops.push(stop);
        stack.push({ kind: "stop", prelude, line: at, declarations: stop.declarations });
      } else if (/^@(?:-webkit-)?keyframes\s/i.test(prelude)) {
        const keyframes: CssKeyframes = {
          name: strip(prelude.replace(/^@(?:-webkit-)?keyframes\s+/i, "")).replace(/^["']|["']$/g, ""),
          at: stack.filter((item) => item.kind === "at").map((item) => item.prelude),
          line: at,
          stops: [],
        };
        sheet.keyframes.push(keyframes);
        stack.push({ kind: "keyframes", prelude, line: at, declarations: [], keyframes });
      } else stack.push({ kind: prelude.startsWith("@") ? "at" : "rule", prelude, line: at, declarations: [] });
      segment = index + 1;
    } else if (char === "}" && !inline) {
      take(index);
      const open = stack.pop();
      if (open?.kind === "rule") {
        sheet.rules.push({
          selector: open.prelude,
          at: stack.filter((item) => item.kind === "at").map((item) => item.prelude),
          parents: stack.filter((item) => item.kind === "rule").map((item) => item.prelude),
          declarations: open.declarations,
          line: open.line,
          tokens: region.tokens,
          inline: false,
        });
      }
      segment = index + 1;
    }
  }
  take(end);
  if (inline) sheet.rules.push(inline);
}

/**
 * The rules and keyframes blocks of the CSS a page holds, in its style elements and style attributes, with comments
 * read as a browser reads them; `sheet: true` reads the whole text as one stylesheet, as a tokens file is read.
 */
export function cssSheet(source: string, options: { sheet?: boolean } = {}): CssSheet {
  const sheet: CssSheet = { rules: [], keyframes: [], written: [], blocks: [] };
  const text = options.sheet ? withoutComments(source) : masked(source);
  const line = lineFinder(text);
  const regions = options.sheet ? [{ start: 0, end: text.length, tokens: true, inline: false }] : cssRegions(text);
  for (const region of regions) {
    readRegion(text, region.start, region.end, region, line, sheet);
    sheet.blocks.push({ text: text.slice(region.start, region.end), line: line(region.start), tokens: region.tokens });
  }
  sheet.rules.sort((a, b) => a.line - b.line);
  return sheet;
}

/** CSS with each comment replaced by one space and its line breaks, so each line keeps its number. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (comment) => ` ${"\n".repeat(comment.split("\n").length - 1)}`);
}

/** A style attribute's value as the one reader reads one: its declarations in order, its comments taken out. */
export function inlineDeclarations(style: string): CssDeclaration[] {
  const sheet: CssSheet = { rules: [], keyframes: [], written: [], blocks: [] };
  const text = withoutComments(style);
  readRegion(text, 0, text.length, { tokens: false, inline: true }, lineFinder(text), sheet);
  return sheet.rules[0]?.declarations ?? [];
}

/** Whether a rule always applies: a top-level `:root` or `html` rule, outside every at-rule but `@layer`. */
export function alwaysApplies(rule: CssRule): boolean {
  if (rule.inline || rule.parents.length || rule.at.some((prelude) => !/^@layer\b/i.test(prelude))) return false;
  const parts = rule.selector.split(",").map((part) => part.trim().toLowerCase());
  return parts.length > 0 && parts.every((part) => part === ":root" || part === "html");
}

/** How `followVars` reads a `var()` whose name has no value. */
type Follow = {
  /** The `var()`'s own fallback stands in for a name with no value. */
  fallbacks: boolean;
  /** A `var()` whose name has no value stays as written, where it would make the whole value unknown. */
  keep: boolean;
};

// The fallback keeps the spaces after its comma, and each reader trims it: a `\s*` before `[^()]*` would match the same
// spaces two ways, so a `var(` with no `)` would take time in the square of its length.
const VAR = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([^()]*))?\)/g;

/**
 * A value with each `var()` replaced by its name's value from `lookup`, and each `var()` inside that value followed in
 * turn, up to 20 steps: null when a name has no value and `keep` is off, or when the value grows past
 * `READ_LIMITS.followed_value`. Each name is followed once at each step, so a name a value names many times costs one
 * walk. The one resolver of the design document's values, the system rules' values, and the motion rules' values.
 */
export function followVars(value: string, lookup: (name: string) => string | undefined, how: Follow): string | null {
  const seen = new Map<string, string | null>();
  const walk = (text: string, depth: number): string | null => {
    if (depth > 20) return null;
    let missing = false;
    let size = text.length;
    const out = text.replace(VAR, (whole, name: string, fallback?: string) => {
      if (missing) return "";
      const found = lookup(name) ?? (how.fallbacks && fallback?.trim() ? fallback.trim() : undefined);
      if (found === undefined) {
        if (how.keep) return whole;
        missing = true;
        return "";
      }
      const key = `${depth}\u0000${name}\u0000${found}`;
      let followed = seen.get(key);
      if (followed === undefined) {
        followed = walk(found, depth + 1);
        seen.set(key, followed);
      }
      size += (followed?.length ?? 0) - whole.length;
      if (followed === null || size > READ_LIMITS.followed_value) missing = true;
      return followed ?? "";
    });
    return missing ? null : out;
  };
  return walk(value, 0);
}

/**
 * Each custom property's declaration whose value, every `var()` followed through the sheets, grows past
 * `READ_LIMITS.followed_value` characters, while each name it reads stays under it: the first step of such a chain, so a
 * chain is told once. A name set several times reads its longest value, so a sheet cannot hide a long one behind a
 * short one. It counts lengths alone, each name once, so it costs time in proportion to the sheets' text.
 */
export function tooLongVars(sheets: CssSheet[]): { sheet: number; declaration: CssDeclaration }[] {
  const values = new Map<string, string[]>();
  for (const sheet of sheets)
    for (const rule of sheet.rules)
      for (const item of rule.declarations) if (item.property.startsWith("--")) values.set(item.property, [...(values.get(item.property) ?? []), item.value]);
  const lengths = new Map<string, number>();
  const valueLength = (text: string, open: Set<string>): number => {
    let size = text.length;
    for (const found of text.matchAll(VAR)) {
      const name = found[1] ?? "";
      const fallback = found[2]?.trim();
      const inner = values.has(name) ? nameLength(name, open) : fallback ? valueLength(fallback, open) : 0;
      size += inner - found[0].length;
      if (size > READ_LIMITS.followed_value) return size;
    }
    return size;
  };
  const nameLength = (name: string, open: Set<string>): number => {
    const known = lengths.get(name);
    if (known !== undefined) return known;
    // A name that leads back to itself has no value, as a browser reads it.
    if (open.has(name)) return 0;
    open.add(name);
    const size = Math.max(...(values.get(name) ?? [""]).map((text) => valueLength(text, open)));
    open.delete(name);
    lengths.set(name, size);
    return size;
  };
  const out: { sheet: number; declaration: CssDeclaration }[] = [];
  sheets.forEach((sheet, index) => {
    for (const rule of sheet.rules)
      for (const item of rule.declarations) {
        if (!item.property.startsWith("--") || valueLength(item.value, new Set([item.property])) <= READ_LIMITS.followed_value) continue;
        if (varNames(item.value).every((name) => nameLength(name, new Set()) <= READ_LIMITS.followed_value)) out.push({ sheet: index, declaration: item });
      }
  });
  return out;
}

/** Each `var(--name)` a value reads, by its name, in the order it stands. */
export function varNames(value: string): string[] {
  return Array.from(value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g), (found) => found[1] ?? "");
}

/** A text cut at each comma outside parentheses, each part trimmed. */
export function commaParts(text: string): string[] {
  return splitTop(text, true);
}

/** A text cut at each run of space outside parentheses. */
export function spaceParts(text: string): string[] {
  return splitTop(text, false);
}
