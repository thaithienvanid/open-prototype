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

// The sets of the HTML standard's tree construction that say where an implied end tag stops (section 13.2.4.2, "has an
// element in scope"). A noscript and a select are limits of each but the table scope, so the reader never closes an
// element outside one by a tag inside it: a browser that runs scripts reads a noscript's content as text, and Chrome
// ends nothing outside a select by a tag inside it but a table's part. An svg's title and desc are limits, as the
// standard's SVG elements of each scope; a design's own title stands only in its head.
const SCOPE = ["applet", "caption", "html", "table", "td", "th", "marquee", "object", "template", "noscript", "select", "title", "desc"];
// The special elements of the standard (section 13.2.4.2), as a design may write them.
const SPECIAL = `address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd
  desc details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header
  hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed noframes noscript object ol p
  param plaintext pre script search section select source style summary table tbody td template textarea tfoot th thead
  title tr track ul wbr xmp`.split(/\s+/);
const TABLE_PARTS = new Set(["caption", "col", "colgroup", "tbody", "thead", "tfoot", "tr", "td", "th"]);
const LIMITS = {
  scope: new Set(SCOPE),
  button: new Set([...SCOPE, "button"]),
  listItem: new Set([...SCOPE, "ol", "ul"]),
  table: new Set(["html", "table", "template", "noscript"]),
  // The special elements but address, div, p, li, dd, and dt: one of these between an open li, dd, or dt and the
  // start tag of the next stops the next from closing it.
  item: new Set(SPECIAL.filter((tag) => !["address", "div", "p", "li", "dd", "dt"].includes(tag))),
  special: new Set(SPECIAL),
  // The elements that start a browser's list of formatting elements anew, beyond which an <a> sees no open <a>.
  link: new Set(["applet", "caption", "html", "marquee", "object", "td", "th", "template"]),
  // The elements that say how a table's part is read: the innermost is its context.
  context: new Set(["html", "table", "tbody", "thead", "tfoot", "tr", "td", "th", "caption", "colgroup", "template"]),
};
type Limit = keyof typeof LIMITS;
const KINDS = Object.keys(LIMITS) as Limit[];
const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
// The start tags that close an open p in button scope.
const CLOSES_P = new Set(
  `address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer header hgroup main
  menu nav ol p search section summary ul h1 h2 h3 h4 h5 h6 pre listing form table hr xmp plaintext li dd dt`.split(/\s+/),
);
// The elements whose end tag a browser may leave out, which it closes in "generate implied end tags".
const IMPLIED = new Set(["dd", "dt", "li", "optgroup", "option", "p", "rb", "rp", "rt", "rtc"]);
const SECTIONS = ["tbody", "thead", "tfoot"];
// The formatting elements, which a browser opens again after another tag closes one.
const FORMATTING = new Set(["a", "b", "big", "code", "em", "font", "i", "nobr", "s", "small", "strike", "strong", "tt", "u"]);
// The elements whose content a browser reads as a table's, where text or another element is moved out.
const TABLE_BODY = new Set(["table", "tbody", "thead", "tfoot", "tr", "colgroup"]);
// The start tags a table, and a template, take with no change to how they read the rest.
const HEAD_LIKE = new Set(["template", "style", "script", "meta", "link", "title", "base", "noscript"]);
// A template whose first start tag is a table's part reads as the part that holds it: a list's item of rows reads as a
// tbody, one of cells as a row.
const TEMPLATE_AS: Record<string, string> = { tr: "tbody", td: "tr", th: "tr", col: "colgroup" };
for (const tag of ["caption", "colgroup", "tbody", "thead", "tfoot"]) TEMPLATE_AS[tag] = "table";
// Where each table's part stands.
const PARENTS: Record<string, string[]> = { td: ["tr"], th: ["tr"], tr: ["table", ...SECTIONS], col: ["colgroup", "table"] };
for (const tag of ["caption", "colgroup", ...SECTIONS]) PARENTS[tag] = ["table"];

/**
 * Where a browser builds otherwise than the reader at a tag, or at text, told to the reader that asks: the walk says
 * so with a finding. `tag` is the element it is about; `other`, the tag or the element beside it.
 */
export type Fault = {
  kind: "closed-early" | "adopted" | "link-in-link" | "in-select" | "in-table" | "table-part" | "stray-end" | "heading-end" | "option-end";
  tag: string;
  other: string;
};

/**
 * The elements open at a point of a read, outermost first, as a browser builds them. A start tag first closes the
 * elements the HTML standard says it ends, such as an open p before a div, or an li before the next li; an end tag
 * closes what the standard's rule for it closes: an element in its scope, or the innermost of its name when no special
 * element stands inside it, and nothing otherwise. Inside SVG or MathML a start tag closes nothing, and an end tag first
 * closes a foreign element of its name. Where a browser would build otherwise, it tells `fault`, the first at each tag
 * or text, and reads on: after a fault the nesting is the reader's best guess, so the rules here keep no state but what
 * a text with no fault needs. A formatting element closed by anything but its own end tag is one, since a browser opens
 * it again. Each tag keeps where it is open, and each element the innermost limit of each scope at or below it, so a
 * lookup costs the same however deep the design, and a read costs in proportion to its text.
 */
export class OpenElements<Entry extends { tag: string }> {
  readonly entries: Entry[] = [];
  // Where each tag is open, innermost last.
  private readonly places = new Map<string, number[]>();
  // For each open element, by its place, the place of the innermost limit of each scope at or below it, or -1.
  private readonly limits: Record<Limit, number[]> = { scope: [], button: [], listItem: [], table: [], item: [], special: [], link: [], context: [] };
  // For each open template, by its place, the part it reads as, from its first start tag, or "".
  private readonly roles: (string | undefined)[] = [];
  // How many svg and math elements are open.
  private foreign = 0;
  // The tag being read, which closes what a cut closes, and the name of its end tag, or "" for a start tag.
  private closing = "";
  private own = "";
  // Whether the tag or the text being read has told its fault.
  private told = false;

  constructor(private readonly report: (fault: Fault) => void = () => {}) {}

  private fault(kind: Fault["kind"], tag: string, other = ""): void {
    if (!this.told) this.report({ kind, tag, other });
    this.told = true;
  }

  push(entry: Entry): void {
    const at = this.entries.length;
    this.entries.push(entry);
    const places = this.places.get(entry.tag);
    if (places) places.push(at);
    else this.places.set(entry.tag, [at]);
    for (const kind of KINDS) this.limits[kind].push(LIMITS[kind].has(entry.tag) ? at : (this.limits[kind][at - 1] ?? -1));
    this.roles.push(undefined);
    if (entry.tag === "svg" || entry.tag === "math") this.foreign++;
  }

  /** Whether an element named `tag` is open. */
  has(tag: string): boolean {
    return this.place(tag) >= 0;
  }

  /** The innermost open element. */
  top(): Entry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** The innermost open element named `tag`, if one is open. */
  innermost(tag: string): Entry | undefined {
    return this.entries[this.place(tag)];
  }

  /** The part of a table the element at `at` reads as: its tag, or for a template the part its first tag makes it. */
  private role(at: number): string {
    const tag = this.entries[at]?.tag ?? "";
    return tag === "template" ? this.roles[at] || "template" : tag;
  }

  /**
   * Closes the elements a start tag of `tag` ends before it opens, by the HTML standard's rules for the body and a
   * table, and returns them innermost first. `hidden` says the tag is an input of type hidden, which a table takes.
   */
  opening(tag: string, hidden = false): Entry[] {
    this.told = false;
    if (this.foreign) return [];
    this.closing = `<${tag}>`;
    this.own = "";
    const closed: Entry[] = [];
    const cut = (at: number) => {
      if (at >= 0) closed.push(...this.cut(at));
    };
    const last = this.entries.length - 1;
    if (this.entries[last]?.tag === "template" && this.roles[last] === undefined && !HEAD_LIKE.has(tag)) this.roles[last] = TEMPLATE_AS[tag] ?? "";
    if (TABLE_PARTS.has(tag)) {
      this.tablePart(tag, cut);
      return closed;
    }
    if (tag === "a" && this.inScope(["a"], "link") >= 0) this.fault("link-in-link", tag);
    if ((tag === "select" || tag === "input") && this.inScope(["select"], "scope") >= 0) this.fault("in-select", tag);
    if (tag === "li") cut(this.item(["li"], ["dd", "dt"]));
    else if (tag === "dd" || tag === "dt") cut(this.item(["dd", "dt"], ["li"]));
    else if (tag === "option" || tag === "optgroup") {
      // In a select an optgroup ends the open option and optgroup, and an option the open option; outside one, an
      // option or an optgroup ends an open option.
      if (this.inScope(["select"], "scope") >= 0) closed.push(...this.implied(tag === "option" ? "optgroup" : ""));
      else if (this.top()?.tag === "option") cut(this.entries.length - 1);
    } else if (tag === "rb" || tag === "rtc" || tag === "rp" || tag === "rt") {
      if (this.inScope(["ruby"], "scope") >= 0) closed.push(...this.implied(tag === "rp" || tag === "rt" ? "rtc" : ""));
    } else if (tag === "button") {
      // A button ends an open button in its scope, and every element inside that: two buttons never nest.
      cut(this.inScope(["button"], "scope"));
    }
    if (CLOSES_P.has(tag)) cut(this.inScope(["p"], "button"));
    // In a select an hr ends an open option or optgroup, as the next option does.
    if (tag === "hr" && this.inScope(["select"], "scope") >= 0) closed.push(...this.implied(""));
    if (HEADINGS.includes(tag) && HEADINGS.includes(this.top()?.tag ?? "")) cut(this.entries.length - 1);
    // A table takes its own parts, a template, a style, a script, and a hidden input; a browser moves any other
    // element out of it, or ends the table at a table.
    const top = this.role(this.entries.length - 1);
    if (TABLE_BODY.has(top) && !HEAD_LIKE.has(tag) && !(tag === "input" && hidden)) this.fault("in-table", tag, top);
    return closed;
  }

  /**
   * A table's part: a browser ends the open cell, row, section, caption, or column group it ends, as the next row ends
   * a row; a part that stands where a table does not take it is a fault, since a browser drops it, or adds the parts
   * around it.
   */
  private tablePart(tag: string, cut: (at: number) => void): void {
    const table = this.entries[this.limits.table[this.entries.length - 1] ?? -1]?.tag;
    const around = this.entries[this.limits.context[this.entries.length - 1] ?? -1]?.tag;
    if (table !== "table" && table !== "template") {
      this.fault("table-part", tag);
      return;
    }
    if (around === "td" || around === "th" || around === "caption") cut(this.limits.context[this.entries.length - 1] ?? -1);
    if (tag !== "td" && tag !== "th") cut(this.inScope(["tr"], "table"));
    if (tag !== "td" && tag !== "th" && tag !== "tr") cut(this.inScope(SECTIONS, "table"));
    if (tag !== "col" && this.top()?.tag === "colgroup") cut(this.entries.length - 1);
    const parent = this.role(this.limits.context[this.entries.length - 1] ?? -1);
    if (!PARENTS[tag]?.includes(parent)) this.fault("table-part", tag, parent);
  }

  /** Text, which a browser moves out of a table when it stands directly in one, but for spaces. */
  text(data: string): void {
    this.told = false;
    const top = this.role(this.entries.length - 1);
    if (!this.foreign && TABLE_BODY.has(top) && /[^\t\n\f\r ]/.test(data)) this.fault("in-table", "", top);
  }

  /**
   * Closes what an end tag of `tag` ends, and returns it innermost first, by the HTML standard's rule for the tag: an
   * element of a scope's list in that scope, a heading, a table's part, or a formatting element in its scope, and any
   * other the innermost of its name, unless a special element stands inside it; none when no such element is open.
   */
  close(tag: string): Entry[] {
    this.told = false;
    this.closing = `</${tag}>`;
    this.own = tag;
    if (this.foreign) {
      // A foreign element of the name closes first; an end tag that names none is read as HTML's.
      const first = Math.min(this.places.get("svg")?.[0] ?? Infinity, this.places.get("math")?.[0] ?? Infinity);
      const at = this.place(tag);
      if (at >= first) return this.cut(at);
    }
    // A column group takes no end tag but its own: any other ends it, then is read in its table.
    const n = this.entries.length;
    const colgroup = this.entries[n - 1]?.tag === "colgroup" && tag !== "colgroup" && tag !== "col" && tag !== "template" ? this.cut(n - 1) : [];
    return [...colgroup, ...this.htmlEnd(tag)];
  }

  private htmlEnd(tag: string): Entry[] {
    const n = this.entries.length;
    const scope = tag === "p" ? "button" : END_SCOPES[tag];
    if (scope) {
      const at = this.inScope([tag], scope);
      // A browser reads a </p> it cannot close as an empty paragraph, and a table's end tag it cannot close as the
      // end of a part it added, or of a template's.
      if (at < 0 && (tag === "p" || tag === "table" || SECTIONS.includes(tag))) this.fault("stray-end", tag);
      return this.cut(at);
    }
    if (tag === "br") {
      this.fault("stray-end", tag);
      return [];
    }
    if (HEADINGS.includes(tag)) {
      // Any heading's end tag ends the innermost heading in scope. The reader closes less than a browser here, on
      // purpose: only a heading of the tag's own name, so no element the allow-list read inside another heading moves
      // out of it. The fault says where a browser would close it otherwise.
      const at = this.inScope(HEADINGS, "scope");
      if (at >= 0 && this.entries[at]?.tag !== tag) {
        this.fault("heading-end", tag, this.entries[at]?.tag ?? "");
        return this.cut(this.place(tag));
      }
      return this.cut(at);
    }
    if (FORMATTING.has(tag)) {
      // The adoption agency: one in scope ends here, and a browser splits it at a special element open inside it.
      const at = this.inScope([tag], "scope");
      const special = this.limits.special[n - 1] ?? -1;
      if (at >= 0 && special > at) this.fault("adopted", tag, this.entries[special]?.tag ?? "");
      return this.cut(at);
    }
    if (tag === "template") return this.cut(this.place(tag));
    if (tag === "colgroup") return this.entries[n - 1]?.tag === "colgroup" ? this.cut(n - 1) : [];
    // Any other end tag: the innermost element of the name, unless a special element stands inside it.
    const at = this.place(tag);
    const reachable = at >= 0 && at >= (this.limits.special[n - 1] ?? -1);
    if (tag === "option" || tag === "optgroup") {
      // A browser closes an option or an optgroup as any other. The reader closes less than a browser here, on
      // purpose: one only from the top, an optgroup with its last option, so no element the allow-list read inside one
      // moves out of it.
      const top = this.entries[n - 1]?.tag;
      let own = -1;
      if (top === tag) own = n - 1;
      else if (tag === "optgroup" && top === "option" && this.entries[n - 2]?.tag === "optgroup") own = n - 2;
      if (own < 0 && reachable) this.fault("option-end", tag, top ?? "");
      return this.cut(own);
    }
    return reachable ? this.cut(at) : [];
  }

  /** Closes every open element, at the end of the text, and returns them innermost first. */
  closeAll(): Entry[] {
    this.closing = "";
    return this.cut(0);
  }

  /** "Generate implied end tags": closes the innermost element while it is one whose end tag may be left out, but `except`. */
  private implied(except: string): Entry[] {
    const closed: Entry[] = [];
    for (let top = this.top(); top && IMPLIED.has(top.tag) && top.tag !== except; top = this.top()) closed.push(...this.cut(this.entries.length - 1));
    return closed;
  }

  /** The place of the innermost open element named `tag`, or -1. */
  private place(tag: string): number {
    const places = this.places.get(tag);
    return places?.[places.length - 1] ?? -1;
  }

  /** The place of the innermost open element of one of `tags`, if it is in the scope `kind`, or -1. */
  private inScope(tags: readonly string[], kind: Limit): number {
    const at = Math.max(...tags.map((tag) => this.place(tag)));
    return at >= 0 && at >= (this.limits[kind][this.entries.length - 1] ?? -1) ? at : -1;
  }

  /**
   * The place of the innermost open element of `tags` that the start tag of the next item closes, or -1: the next li
   * closes an li, and the next dd or dt a dd or a dt, unless a special element other than address, div, or p, or an
   * item of the other kind, stands between.
   */
  private item(tags: readonly string[], others: readonly string[]): number {
    const at = Math.max(...tags.map((tag) => this.place(tag)));
    const limit = Math.max(this.limits.item[this.entries.length - 1] ?? -1, ...others.map((tag) => this.place(tag)));
    return at > limit ? at : -1;
  }

  /**
   * Closes the element at `from` and every element inside it. A formatting element among them that is not the one its
   * own end tag names is closed too soon: a browser opens it again, so it is a fault, but at the end of the text.
   */
  private cut(from: number): Entry[] {
    if (from < 0) return [];
    const closed = this.entries.splice(from).reverse();
    for (const kind of KINDS) this.limits[kind].length = from;
    this.roles.length = from;
    for (const [i, entry] of closed.entries()) {
      this.places.get(entry.tag)?.pop();
      if (entry.tag === "svg" || entry.tag === "math") this.foreign--;
      if (this.closing && FORMATTING.has(entry.tag) && !(i === closed.length - 1 && entry.tag === this.own))
        this.fault("closed-early", entry.tag, this.closing);
    }
    return closed;
  }
}

// The end tags a browser honours only in a scope: an element of the standard's list for the body, an element whose end
// tag may be left out, and a table's parts.
const END_SCOPES: Record<string, Limit> = {
  ...Object.fromEntries(
    `address article aside blockquote button center details dialog dir div dl fieldset figcaption figure footer header
    hgroup listing main menu nav ol pre search section select summary ul dd dt`
      .split(/\s+/)
      .map((tag) => [tag, "scope" as Limit]),
  ),
  li: "listItem",
  td: "table",
  th: "table",
  tr: "table",
  tbody: "table",
  thead: "table",
  tfoot: "table",
  table: "table",
  caption: "table",
};

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
      else if (text.startsWith("<?", i)) k = text.indexOf(">", i + 2) + 1 || -1;
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
    const close = text.indexOf(">", i + 2);
    if (close < 0) return -1;
    if (!stickyMatch(END_TAG_OPEN, text, i)) {
      if (text[i + 2] === ">") return i + 3;
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
