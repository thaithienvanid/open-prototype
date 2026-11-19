// The smallest HTML tokenizer a design needs: start tags with their attributes, end tags, text, and comments, each with
// the line it starts on. It follows the tokenizer states of the HTML standard for tags, comments, and the elements
// whose text is raw (script, style, and the rest), and it knows SVG and MathML content, where no element's text is
// raw, as in a browser. It builds no tree: each check keeps the open elements it needs. It never runs anything.
import { unescapeAttribute, unescapeText } from "./unescape.ts";

export type Attribute = [name: string, value: string | null];

/** Each attribute's first value, as a browser keeps it: a name written twice keeps its first. */
export function firstValues(attrs: readonly Attribute[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of attrs) if (!out.has(name)) out.set(name, value ?? "");
  return out;
}

export type TagPlace = {
  /** The line the tag starts on, from 1. */
  line: number;
  /** Where the tag starts in the text. */
  at: number;
  /** The tag as written, from `<` to `>`. */
  raw: string;
  /** Where each attribute's value stands in the text, as written, between its quotes, or null for an attribute with none; a start tag's alone. */
  values?: readonly ([start: number, end: number] | null)[];
};

interface MarkupHandler {
  start(tag: string, attrs: Attribute[], place: TagPlace): void;
  /** A start tag written `<tag/>`. */
  startEnd(tag: string, attrs: Attribute[], place: TagPlace): void;
  end(tag: string, place: TagPlace): void;
  /** Text, with the line it starts on and where it starts in the text. */
  data?(text: string, line: number, at: number): void;
  comment?(text: string, line: number): void;
  /**
   * The text ends inside a construct, which a browser lets take the rest of the text: a comment, or a tag, an attribute's
   * quote, an end tag, or a declaration. Told once, with the line the construct starts on.
   */
  unfinished?(construct: "comment" | "tag", line: number): void;
}

// Elements whose text is raw until their own end tag, and the two whose text still reads character references.
const RAW_TEXT = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes"]);
const ESCAPABLE_RAW_TEXT = new Set(["textarea", "title"]);

const START_TAG_OPEN = /<[a-zA-Z]/y;
const END_TAG_OPEN = /<\/[a-zA-Z]/y;
const TAG_NAME = /[a-zA-Z][^\t\n\r\f />]*/y;
const COMMENT_ABRUPT_END = /-?>/y;
const COMMENT_END = /--!?>/g;

function stickyMatch(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

const SPACE = new Set(["\t", "\n", "\r", "\f", " "]);

/** A tag's attributes, read from just after its name to its `>`, with where the tag ends and whether it ends with `/>`. */
type Scanned = { end: number; attrs: Attribute[]; values: ([start: number, end: number] | null)[]; selfClosing: boolean };

/**
 * Read a tag's attributes by the states of the HTML standard, one character at a time: before an attribute's name, the
 * name, after it, before its value, and the value. A quote that opens a value and is never closed takes the rest of the
 * text, as in a browser, so the tag is unfinished: null. No pattern can backtrack past such a quote.
 */
function scanAttributes(text: string, from: number): Scanned | null {
  const n = text.length;
  const attrs: Attribute[] = [];
  const values: ([number, number] | null)[] = [];
  let i = from;
  for (;;) {
    // Before an attribute's name: spaces, and a `/` that does not end the tag, are skipped.
    while (i < n && (SPACE.has(text[i] ?? "") || (text[i] === "/" && text[i + 1] !== ">"))) i++;
    if (i >= n) return null;
    if (text[i] === ">") return { end: i + 1, attrs, values, selfClosing: false };
    if (text[i] === "/") return { end: i + 2, attrs, values, selfClosing: true };
    // The name: its first character may be `=`; it ends at a space, `/`, `>`, or `=`.
    const start = i++;
    while (i < n && !SPACE.has(text[i] ?? "") && text[i] !== "/" && text[i] !== ">" && text[i] !== "=") i++;
    const name = text.slice(start, i).toLowerCase();
    // After the name: spaces, then `=` starts the value; anything else starts the next attribute.
    let j = i;
    while (j < n && SPACE.has(text[j] ?? "")) j++;
    if (text[j] !== "=") {
      attrs.push([name, null]);
      values.push(null);
      i = j;
      continue;
    }
    j++;
    while (j < n && SPACE.has(text[j] ?? "")) j++;
    if (j >= n) return null;
    const quote = text[j];
    let span: [number, number];
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, j + 1);
      if (close < 0) return null;
      span = [j + 1, close];
      i = close + 1;
    } else {
      let k = j;
      while (k < n && !SPACE.has(text[k] ?? "") && text[k] !== ">") k++;
      span = [j, k];
      i = k;
    }
    const value = text.slice(span[0], span[1]);
    attrs.push([name, value ? unescapeAttribute(value) : value]);
    values.push(span);
  }
}

/** Read the whole text and tell the handler what it finds, in order. */
export function readMarkup(text: string, handler: MarkupHandler): void {
  new Tokenizer(text, handler).run();
}

/**
 * The elements open at a point of a read, outermost first, with a count of each tag. An end tag closes the innermost
 * open element of its name and every element inside it, as a browser reads it. An end tag that names no open element
 * closes nothing and costs nothing, so a read costs in proportion to its text, however many end tags stray.
 */
export class OpenElements<Entry extends { tag: string }> {
  readonly entries: Entry[] = [];
  private readonly counts = new Map<string, number>();

  push(entry: Entry): void {
    this.entries.push(entry);
    this.counts.set(entry.tag, (this.counts.get(entry.tag) ?? 0) + 1);
  }

  /** Whether an element named `tag` is open. */
  has(tag: string): boolean {
    return (this.counts.get(tag) ?? 0) > 0;
  }

  /** The innermost open element. */
  top(): Entry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** The innermost open element named `tag`, if one is open. */
  innermost(tag: string): Entry | undefined {
    if (!this.has(tag)) return undefined;
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]?.tag === tag) return this.entries[i];
    return undefined;
  }

  /** Closes the innermost element named `tag` and every element inside it, and returns them innermost first: none when no element of the name is open. */
  close(tag: string): Entry[] {
    if (!this.has(tag)) return [];
    let i = this.entries.length - 1;
    while (i > 0 && this.entries[i]?.tag !== tag) i--;
    return this.cut(i);
  }

  /** Closes every open element, and returns them innermost first. */
  closeAll(): Entry[] {
    return this.cut(0);
  }

  private cut(from: number): Entry[] {
    const closed = this.entries.splice(from).reverse();
    for (const entry of closed) this.counts.set(entry.tag, (this.counts.get(entry.tag) ?? 1) - 1);
    return closed;
  }
}

class Tokenizer {
  private line = 1;
  private escapable = true;
  private rawEnd: RegExp | null = null;
  // How many <svg> or <math> elements are open: inside them, a <textarea> or a <style> holds markup, not text.
  private foreign = 0;

  constructor(
    private readonly text: string,
    private readonly handler: MarkupHandler,
  ) {
    this.nextBreak = text.indexOf("\n");
  }

  // The next line break at or after the place read so far, or -1 when none is left: kept, so a long line is searched
  // once, never again from each tag, and the cost stays in proportion to the text.
  private nextBreak: number;

  private move(from: number, to: number): number {
    if (from < to) {
      if (this.nextBreak >= 0 && this.nextBreak < from) this.nextBreak = this.text.indexOf("\n", from);
      while (this.nextBreak >= 0 && this.nextBreak < to) {
        this.line++;
        this.nextBreak = this.text.indexOf("\n", this.nextBreak + 1);
      }
    }
    return to;
  }

  private data(text: string, at: number): void {
    this.handler.data?.(this.escapable ? unescapeText(text) : text, this.line, at);
  }

  run(): void {
    const text = this.text;
    const n = text.length;
    let i = 0;
    while (i < n) {
      let j: number;
      if (this.rawEnd === null) {
        j = text.indexOf("<", i);
        if (j < 0) j = n;
      } else {
        this.rawEnd.lastIndex = i;
        const found = this.rawEnd.exec(text);
        if (!found) break;
        j = found.index;
      }
      if (i < j) this.data(text.slice(i, j), i);
      i = this.move(i, j);
      if (i === n) break;
      let k: number;
      if (stickyMatch(START_TAG_OPEN, text, i)) k = this.startTag(i);
      else if (text.startsWith("</", i)) k = this.endTag(i);
      else if (text.startsWith("<!--", i)) k = this.commentAt(i);
      else if (text.startsWith("<?", i)) k = text.indexOf(">", i + 2) < 0 ? -1 : text.indexOf(">", i + 2) + 1;
      else if (text.startsWith("<!", i)) k = this.declaration(i);
      else {
        this.data("<", i);
        k = i + 1;
      }
      if (k < 0) {
        this.unfinished(i);
        k = n;
      }
      i = this.move(i, k);
    }
    if (i < n) {
      this.data(text.slice(i, n), i);
      this.move(i, n);
    }
  }

  // A construct the text ends inside: a comment takes the rest of the text, and a tag takes it, as in a browser; the
  // handler is told either way, since in a page that rest is the page's own markup.
  private unfinished(i: number): void {
    const text = this.text;
    if (!(text.startsWith("</", i) && i + 2 === text.length)) this.handler.unfinished?.(text.startsWith("<!--", i) ? "comment" : "tag", this.line);
    if (stickyMatch(START_TAG_OPEN, text, i)) return;
    if (text.startsWith("</", i)) {
      if (i + 2 === text.length) this.data("</", i);
      else if (!stickyMatch(END_TAG_OPEN, text, i)) this.handler.comment?.(text.slice(i + 2), this.line);
      return;
    }
    if (text.startsWith("<!--", i)) {
      let j = text.length;
      for (const suffix of ["--!", "--", "-"]) {
        if (text.length - suffix.length >= i + 4 && text.endsWith(suffix)) {
          j -= suffix.length;
          break;
        }
      }
      this.handler.comment?.(text.slice(i + 4, j), this.line);
      return;
    }
    if (text.startsWith("<![CDATA[", i) || text.slice(i, i + 9).toLowerCase() === "<!doctype" || text.startsWith("<?", i)) return;
    if (text.startsWith("<!", i)) this.handler.comment?.(text.slice(i + 2), this.line);
  }

  private startTag(i: number): number {
    const text = this.text;
    const name = stickyMatch(TAG_NAME, text, i + 1);
    if (!name) return -1;
    const scanned = scanAttributes(text, i + 1 + name[0].length);
    if (!scanned) return -1;
    const endpos = scanned.end;
    const raw = text.slice(i, endpos);
    const tag = name[0].toLowerCase();
    const attrs = scanned.attrs;
    const place = { line: this.line, at: i, raw, values: scanned.values };
    if (scanned.selfClosing) this.handler.startEnd(tag, attrs, place);
    else {
      this.handler.start(tag, attrs, place);
      if (tag === "svg" || tag === "math") this.foreign++;
      else if (this.foreign) return endpos;
      else if (RAW_TEXT.has(tag) || tag === "plaintext") this.enterRawText(tag, false);
      else if (ESCAPABLE_RAW_TEXT.has(tag)) this.enterRawText(tag, true);
    }
    return endpos;
  }

  private enterRawText(tag: string, escapable: boolean): void {
    this.escapable = escapable;
    this.rawEnd = tag === "plaintext" ? /$(?![\s\S])/g : new RegExp(`</${tag}(?=[\\t\\n\\r\\f />])`, "gi");
  }

  private endTag(i: number): number {
    const text = this.text;
    if (text.indexOf(">", i + 2) < 0) return -1;
    if (!stickyMatch(END_TAG_OPEN, text, i)) {
      if (text[i + 2] === ">") return i + 3;
      const close = text.indexOf(">", i + 2);
      this.handler.comment?.(text.slice(i + 2, close), this.line);
      return close + 1;
    }
    const name = stickyMatch(TAG_NAME, text, i + 2);
    const scanned = name ? scanAttributes(text, i + 2 + name[0].length) : null;
    if (!name || !scanned) return -1;
    const j = scanned.end;
    const tag = name[0].toLowerCase();
    if ((tag === "svg" || tag === "math") && this.foreign) this.foreign--;
    this.handler.end(tag, { line: this.line, at: i, raw: text.slice(i, j) });
    this.rawEnd = null;
    this.escapable = true;
    return j;
  }

  private commentAt(i: number): number {
    const text = this.text;
    const abrupt = stickyMatch(COMMENT_ABRUPT_END, text, i + 4);
    if (abrupt) {
      this.handler.comment?.("", this.line);
      return i + 4 + abrupt[0].length;
    }
    COMMENT_END.lastIndex = i + 4;
    const found = COMMENT_END.exec(text);
    if (!found) return -1;
    this.handler.comment?.(text.slice(i + 4, found.index), this.line);
    return found.index + found[0].length;
  }

  private declaration(i: number): number {
    const text = this.text;
    if (text.startsWith("<![CDATA[", i)) {
      const close = text.indexOf("]]>", i + 9);
      return close < 0 ? -1 : close + 3;
    }
    if (text.slice(i, i + 9).toLowerCase() === "<!doctype") {
      const close = text.indexOf(">", i + 9);
      return close < 0 ? -1 : close + 1;
    }
    const close = text.indexOf(">", i + 2);
    if (close < 0) return -1;
    this.handler.comment?.(text.slice(i + 2, close), this.line);
    return close + 1;
  }
}
