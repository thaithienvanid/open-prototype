// The font files a design's CSS names: each `url()` inside an `@font-face` block, in a design's style elements or in a
// tokens file. The blocks are read by their braces, as the one CSS reader reads them, with a comment and a string read as
// a browser reads them, so a `url(` in a comment or a string names no file. Pure: `readFiles` reads each file named
// here, and the build writes each into the page as a `data:` URL, which the page's policy allows.
import { posix } from "node:path";
import { FONT_TYPES } from "../format.ts";
import { styleElements } from "./sheet.ts";

/** A `url()` of an `@font-face` block: the address as written, and where the whole `url(...)` stands in the text. */
export type FontUrl = { url: string; start: number; end: number };

/** Why a `url()` of an `@font-face` names no font file of the project. */
export type FontFault = "scheme" | "absolute" | "outside" | "type";

/** A font file as the disk gave it: its bytes, or why the page cannot carry it. */
export type FontFile = { bytes: Uint8Array } | { why: string };

const SPACE = /\s/;
const NAME_CHAR = /[A-Za-z0-9_-]/;

/** The index of the quote that ends the string opened at `open`, or of the line break or end that cuts it. */
function stringEnd(css: string, open: number, to: number): number {
  const quote = css[open];
  let at = open + 1;
  while (at < to && css[at] !== quote && css[at] !== "\n") at += css[at] === "\\" ? 2 : 1;
  return Math.min(at, to);
}

/** The `url(...)` that starts at `start`, as a browser reads its address: quoted, or up to its `)`; null when it never ends. */
function urlAt(css: string, start: number, to: number): FontUrl | null {
  let at = start + 4;
  while (at < to && SPACE.test(css[at] ?? "")) at++;
  let url: string;
  if (css[at] === '"' || css[at] === "'") {
    const close = stringEnd(css, at, to);
    if (css[close] !== css[at]) return null;
    url = css.slice(at + 1, close);
    at = close + 1;
    while (at < to && SPACE.test(css[at] ?? "")) at++;
    if (css[at] !== ")") return null;
  } else {
    const close = css.indexOf(")", at);
    if (close < 0 || close >= to) return null;
    url = css.slice(at, close).trim();
    at = close;
  }
  return { url, start, end: at + 1 };
}

/** Each `url()` inside an `@font-face` block of the CSS between `from` and `to`, in the order they stand. */
export function fontUrls(css: string, from = 0, to = css.length): FontUrl[] {
  const found: FontUrl[] = [];
  let depth = 0;
  // The depth of the open `@font-face` block, or -1; and whether an `@font-face` waits for its brace.
  let face = -1;
  let waiting = false;
  for (let index = from; index < to; index++) {
    const char = css[index];
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end < 0 || end + 2 > to ? to : end + 1;
    } else if (char === '"' || char === "'") index = stringEnd(css, index, to);
    else if (char === "@") {
      waiting = /^@font-face(?![A-Za-z0-9_-])/i.test(css.slice(index, index + 11));
    } else if (char === "{") {
      depth++;
      if (waiting) face = depth;
      waiting = false;
    } else if (char === "}") {
      if (depth === face) face = -1;
      depth = Math.max(0, depth - 1);
      waiting = false;
    } else if (char === ";") waiting = false;
    else if (
      face === depth &&
      face > 0 &&
      (char === "u" || char === "U") &&
      !NAME_CHAR.test(css[index - 1] ?? "") &&
      /^url\(/i.test(css.slice(index, index + 4))
    ) {
      const url = urlAt(css, index, to);
      if (url) {
        found.push(url);
        index = url.end - 1;
      }
    }
  }
  return found;
}

/** Each `url()` inside an `@font-face` block of a page's style elements, where it stands in the page. */
export function markupFontUrls(text: string): FontUrl[] {
  return styleElements(text).flatMap((element) => fontUrls(text, element.start, element.end));
}

/** The folder a tokens file's paths are read from: its own, from the project's top, "" at the top. */
export function tokensFolder(file: string): string {
  const folder = posix.dirname(posix.normalize(file));
  return folder === "." ? "" : folder;
}

/**
 * Where a `url()` of an `@font-face` points, read from `folder`, a folder from the project's top: a font file's path
 * from the project's top with its media type, or why it names none. A `data:` URL and a load from the network name no
 * file, so they are null: the page carries the one as written, and `paint.network` finds the other.
 */
export function fontPath(folder: string, url: string): { path: string; mime: string } | { fault: FontFault } | null {
  const bare = url.replace(/[?#][\s\S]*$/, "");
  if (bare === "" || /^data:/i.test(url) || /^(?:https?:)?\/\//i.test(url)) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(bare)) return { fault: "scheme" };
  if (bare.startsWith("/") || bare.startsWith("\\")) return { fault: "absolute" };
  const type = FONT_TYPES[posix.extname(bare).toLowerCase()];
  if (!type) return { fault: "type" };
  const path = posix.normalize(folder ? `${folder}/${bare}` : bare);
  if (path === ".." || path.startsWith("../")) return { fault: "outside" };
  return { path, mime: type.mime };
}

/** The text with each `url()` of `urls` whose font file was read written as a `data:` URL; every other one stays as written. */
export function embedFonts(text: string, urls: FontUrl[], folder: string, fonts: ReadonlyMap<string, FontFile>): string {
  const parts: string[] = [];
  let pos = 0;
  for (const found of urls) {
    const target = fontPath(folder, found.url);
    const file = target && "path" in target ? fonts.get(target.path) : undefined;
    if (!target || !("path" in target) || !file || !("bytes" in file)) continue;
    parts.push(text.slice(pos, found.start), `url("data:${target.mime};base64,${Buffer.from(file.bytes).toString("base64")}")`);
    pos = found.end;
  }
  return parts.join("") + text.slice(pos);
}
