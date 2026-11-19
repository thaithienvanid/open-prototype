// Blocks: `<div data-proto-use="item-card" data-proto-arg-name="Starter"></div>` puts the block
// `blocks/item-card.html` here. The block's one root element replaces the host, and each `{{name}}` in the block's text
// or attribute values takes the host's `data-proto-arg-<name>`, escaped as text. A block may use another block. The read
// records, for each line of the result, the file and the line it came from, so a finding names the block's own line.
import { type Finding, finding, type RuleId } from "../finding.ts";
import { ARGUMENT, ATTR, BLOCKS, KEBAB, READ_LIMITS, VOID } from "../format.ts";
import { type Attribute, OpenElements, readMarkup, type TagPlace } from "../html/tokenizer.ts";
import { escapeHtml, lineFinder, quoted, strip } from "../text.ts";

/**
 * Where a line of an assembled design came from: its file, its line there, the flow it belongs to, and for a block's line,
 * where the block is used. A line that two texts share, such as a host's line with a block used in its middle, holds where
 * each later text starts on it (`after`), so a finding with its column names the text it stands in.
 */
export type Place = { file: string; line: number; flow: string; use?: Use; after?: Split[] };
/** The place of the text that starts at `column` of a shared line, up to the next split. */
type Split = { column: number; place: Place };
/** Where a block is used: the file and the line of the element that uses it, and where that file is used, for a block in a block. */
type Use = { file: string; line: number; from?: Use };

/** The texts a design's read may use, by their path in the design's folder, and why each unreadable one is, with its next step. */
export type Texts = { texts: ReadonlyMap<string, string>; unreadable: ReadonlyMap<string, string> };

/** A text with the place of each of its lines. */
export type Placed = { text: string; lines: Place[] };

/** Joins texts, keeping the place of each line: a line two texts share keeps the earlier place, unless it was blank. */
export class Joined {
  private readonly texts: string[] = [];
  readonly lines: Place[] = [];
  private last = "";

  add(text: string, lines: Place[]): void {
    if (!text) return;
    const first = lines[0];
    // Line by line: a text of a million lines spread as arguments overflows the call stack.
    if (!this.lines.length) for (const line of lines) this.lines.push(line);
    else if (first) {
      const column = this.last.length;
      const shared = this.lines[this.lines.length - 1];
      this.lines[this.lines.length - 1] = !strip(this.last) || !shared ? shifted(first, column) : sharedBy(shared, first, column);
      for (let index = 1; index < lines.length; index++) this.lines.push(lines[index] as Place);
    }
    this.texts.push(text);
    const end = text.lastIndexOf("\n");
    this.last = end < 0 ? this.last + text : text.slice(end + 1);
  }

  get text(): string {
    return this.texts.join("");
  }
}

/** A line's place with its splits moved `by` columns to the right, as the text it starts is. */
function shifted(place: Place, by: number): Place {
  return by && place.after ? { ...place, after: place.after.map((split) => ({ column: split.column + by, place: split.place })) } : place;
}

/** A shared line: what it held, then `next` from `column` on, with the splits `next` brings. */
function sharedBy(line: Place, next: Place, column: number): Place {
  const { after, ...own } = next;
  const splits = [{ column, place: own }, ...(after ?? []).map((split) => ({ column: split.column + column, place: split.place }))];
  return { ...line, after: [...(line.after ?? []), ...splits] };
}

/** The place of the text at `column` of a line: the last split at or before it, else the line's own place. */
export function placeAt(line: Place, column: number): Place {
  let found: Place = line;
  for (const split of line.after ?? []) if (split.column <= column) found = split.place;
  const { after: _after, ...own } = found;
  return own;
}

/** The slice of `text` from `from` to `to`, with the place of each of its lines in `file`, and the block's use when `text` is a block. */
function slice(text: string, from: number, to: number, file: string, flow: string, lineAt: (at: number) => number, use?: Use): Placed {
  const chunk = text.slice(from, to);
  const first = lineAt(from);
  return { text: chunk, lines: Array.from({ length: chunk.split("\n").length }, (_, n) => ({ file, line: first + n, flow, ...(use ? { use } : {}) })) };
}

/**
 * A finding's words with the place a block is used, so a block used twenty times names the one at fault. A block in a
 * block names each use out to the design's own file, since the nearest alone names a line of a block used many times.
 */
export function withUse(message: string, use: Use | undefined, named: (file: string) => string = (file) => file): string {
  if (!use) return message;
  const uses: string[] = [];
  for (let at: Use | undefined = use; at; at = at.from) uses.push(`${named(at.file)}:${at.line}`);
  return `${message} (used at ${uses.join(", itself used at ")})`;
}

export type Host = {
  name: string;
  tag: string;
  attrs: Attribute[];
  line: number;
  start: number;
  end: number;
  content: string;
  closed: boolean;
  slashed: boolean;
};
/**
 * What a read may still place: the blocks used in this flow, or in this design, and for the whole design the text
 * the blocks add and the one finding that stopped the read, once a limit is passed.
 */
export type Budget = { uses: number; design: { size: number; stopped: Finding | null } };

/** A new budget for a design. */
export function budget(): Budget {
  return { uses: 0, design: { size: 0, stopped: null } };
}

/** A new count of blocks for one flow of a design, which shares the design's text and its stop. */
export function flowBudget(of: Budget): Budget {
  return { uses: 0, design: of.design };
}

/** What one read of a text gives: its hosts, outermost only, and the line of what stands beside its one root element, or null. */
type Read = { hosts: Host[]; stray: number | null };

// The hosts of a text, outermost only: each element with `attr`, data-proto-use or data-proto-flow, its place, and what
// it holds. The same pass says whether the text is one root element, with nothing but space and comments around it, as
// a block must be.
export function readHosts(text: string, attr: string = ATTR.use): Read {
  const hosts: Host[] = [];
  const open = new OpenElements<{ tag: string; host: Host | null; contentStart: number }>();
  // How many open elements are hosts, so a use inside a host is known at once.
  let inHosts = 0;
  // The root count: an element that starts while no element is open, as the open elements, closed as a browser closes
  // them, say; an end tag closes every element inside the one it names.
  let roots = 0;
  let stray: number | null = null;
  // A host is closed by its own end tag, by the end tag of an element around it, or by a start tag that ends it, as an
  // open <li> is by the next: its content stops where that tag starts, and the host ends after its own end tag, or
  // where the other tag starts, which stays as written. The element an end tag names is the last it closes.
  const ended = (closed: { host: Host | null; contentStart: number }[], at: number, end: number) => {
    for (const entry of closed) {
      if (!entry.host) continue;
      inHosts--;
      entry.host.content = text.slice(entry.contentStart, at);
      entry.host.end = entry === closed[closed.length - 1] ? end : at;
      entry.host.closed = true;
    }
  };
  const push = (tag: string, host: Host | null, place: TagPlace) => {
    if (VOID.has(tag)) return;
    open.push({ tag, host, contentStart: place.at + place.raw.length });
    if (host) inHosts++;
  };
  readMarkup(text, {
    start: (tag, attrs, place) => {
      ended(open.opening(tag), place.at, place.at);
      if (!open.entries.length && ++roots === 2) stray ??= place.line;
      const name = attrs.find(([key]) => key === attr)?.[1];
      const host =
        name !== undefined && !inHosts
          ? {
              name: name ?? "",
              tag,
              attrs,
              line: place.line,
              start: place.at,
              end: place.at + place.raw.length,
              content: "",
              closed: VOID.has(tag),
              slashed: false,
            }
          : null;
      if (host) hosts.push(host);
      push(tag, host, place);
    },
    startEnd: (tag, attrs, place) => {
      ended(open.opening(tag), place.at, place.at);
      if (!open.entries.length && ++roots === 2) stray ??= place.line;
      const name = attrs.find(([key]) => key === attr)?.[1];
      // HTML ignores the slash of <div/>: the element stays open, so a use written so is unclosed.
      if (name !== undefined && !inHosts)
        hosts.push({
          name: name ?? "",
          tag,
          attrs,
          line: place.line,
          start: place.at,
          end: place.at + place.raw.length,
          content: "",
          closed: true,
          slashed: !VOID.has(tag),
        });
      push(tag, null, place);
    },
    end: (tag, place) => ended(open.close(tag), place.at, place.at + place.raw.length),
    data: (data, line) => {
      // The text's own line: the line it starts on, and each line break before its first word.
      if (!open.entries.length && strip(data)) stray ??= line + (data.slice(0, data.search(/\S/)).match(/\n/g)?.length ?? 0);
    },
  });
  return { hosts, stray: roots === 0 ? 1 : stray };
}

type Context = {
  files: Texts;
  flow: string;
  findings: Finding[];
  budget: Budget;
  named: (file: string) => string;
  /** Each text read once: a block used many times with the same arguments is read once. */
  reads: Map<string, Read>;
  /** Each finding told, by its rule, file, line, and words: a fault of a block is told once, at its first use. */
  told: Set<string>;
};

/** Tell a finding once, with the place its file is used. */
function tell(context: Context, rule: RuleId, message: string, file: string, line: number | null, use: Use | undefined): void {
  const key = `${rule}\u0000${file}\u0000${line}\u0000${message}`;
  if (context.told.has(key)) return;
  context.told.add(key);
  context.findings.push(finding(rule, withUse(message, use, context.named), file, line));
}

/** A text's read, from the context's reads when the same text was read before. */
function readOnce(context: Context, text: string): Read {
  let read = context.reads.get(text);
  if (!read) {
    read = readHosts(text);
    context.reads.set(text, read);
  }
  return read;
}

// The block's text with each argument filled. `here` is the use being filled, and `at` where the file that holds it is used.
function fill(context: Context, block: string, host: Host, file: string, here: Use, at: Use | undefined): string {
  const values = new Map(host.attrs.filter(([key]) => key.startsWith(ATTR.arg)).map(([key, value]) => [key.slice(ATTR.arg.length), value ?? ""]));
  const lineAt = lineFinder(block);
  const read = new Set<string>();
  const filled = block.replace(ARGUMENT, (whole, name: string, offset: number) => {
    if (!KEBAB.test(name)) {
      tell(context, "compose.arg", `${whole} names an argument with lowercase letters, digits, and - only: rename it`, file, lineAt(offset), here);
      return whole;
    }
    read.add(name);
    // A line break of an argument is written as its reference, so the block keeps its own lines and each finding its line.
    const value = values.get(name);
    if (value !== undefined) return escapeHtml(value).replaceAll("\n", "&#10;");
    tell(context, "compose.arg", `uses ${BLOCKS}/${host.name}.html with no ${ATTR.arg}${name} for its {{${name}}}: add it`, here.file, here.line, at);
    return "";
  });
  // An argument the block never reads, a nested use's argument among what it reads, is a note at each use that passes
  // it: the page is the same with it or without it, so it only misleads whoever reads the use.
  for (const name of values.keys())
    if (!read.has(name))
      tell(
        context,
        "compose.unused-arg",
        `uses ${BLOCKS}/${host.name}.html with ${ATTR.arg}${name}, which the block never reads: take it out, or read it in the block as {{${name}}}`,
        here.file,
        here.line,
        at,
      );
  return filled;
}

function resolve(context: Context, file: string, text: string, stack: string[], use?: Use): Placed {
  const lineAt = lineFinder(text);
  const out = new Joined();
  let at = 0;
  for (const host of readOnce(context, text).hosts) {
    if (context.budget.design.stopped) break;
    const before = slice(text, at, host.start, file, context.flow, lineAt, use);
    out.add(before.text, before.lines);
    at = host.end;
    const problem = (rule: RuleId, message: string) => tell(context, rule, message, file, host.line, use);
    const extra = host.attrs.filter(([key]) => key !== ATTR.use && !key.startsWith(ATTR.arg)).map(([key]) => key);
    if (!KEBAB.test(host.name)) {
      problem("compose.use", `${ATTR.use}="${quoted(host.name)}": a block is named in lowercase words joined by hyphens`);
      continue;
    }
    if (extra.length)
      problem(
        "compose.use",
        `the element that uses ${host.name} also holds ${extra.join(", ")}: the block replaces it, so move them into the block, or pass them as ${ATTR.arg}<name>`,
      );
    if (host.slashed)
      problem("compose.use", `the element that uses ${host.name} is written <${host.tag} .../>, which HTML leaves open: write <${host.tag} ...></${host.tag}>`);
    else if (!host.closed) problem("compose.use", `the element that uses ${host.name} has no end tag: close it`);
    else if (strip(host.content)) problem("compose.use", `the element that uses ${host.name} holds content: the block replaces it, so leave it empty`);
    if (stack.includes(host.name)) {
      problem("compose.cycle", `the block ${host.name} uses itself again (${[...stack, host.name].join(" -> ")}): break the cycle`);
      continue;
    }
    if (++context.budget.uses > READ_LIMITS.uses) {
      context.budget.design.stopped = finding(
        "compose.limit",
        `${context.flow ? "the flow" : "the design"} uses more than ${READ_LIMITS.uses} blocks: use fewer, nest them less, or split the flow`,
        file,
        host.line,
      );
      break;
    }
    const path = `${BLOCKS}/${host.name}.html`;
    const why = context.files.unreadable.get(path);
    const block = context.files.texts.get(path);
    if (why !== undefined || block === undefined) {
      problem(
        "compose.use",
        why !== undefined ? `${path} cannot be read, ${why}` : `${path} does not exist: write ${context.named(path)}, or take out ${ATTR.use}="${host.name}"`,
      );
      continue;
    }
    const here: Use = { file, line: host.line, ...(use ? { from: use } : {}) };
    const filled = fill(context, block.replace(/\s+$/, ""), host, path, here, use);
    const stray = readOnce(context, filled).stray;
    if (stray !== null)
      tell(context, "compose.use", "a block is one root element, which replaces the element that uses it: wrap the block in one", path, stray, here);
    const placed = resolve(context, path, filled, [...stack, host.name], here);
    // The block's own text: a block it uses counted its own, so the placed text would count it again at each level.
    context.budget.design.size += filled.length;
    if (context.budget.design.size > READ_LIMITS.expansion && !context.budget.design.stopped) {
      context.budget.design.stopped = finding(
        "compose.limit",
        `the blocks add more than ${READ_LIMITS.expansion} characters to the design: use fewer`,
        file,
        host.line,
      );
    }
    if (context.budget.design.stopped) break;
    out.add(placed.text, placed.lines);
  }
  if (context.budget.design.stopped) return { text: out.text, lines: out.lines };
  const rest = slice(text, at, text.length, file, context.flow, lineAt, use);
  out.add(rest.text, rest.lines);
  return { text: out.text, lines: out.lines };
}

/** A text with every block it uses in place, and the place of each line; `named` names a file of the design from the project's top, for the words of a finding. */
export function placeBlocks(
  files: Texts,
  file: string,
  text: string,
  flow: string,
  findings: Finding[],
  spent: Budget = budget(),
  named: (file: string) => string = (name) => name,
): Placed {
  const placed = resolve({ files, flow, findings, budget: spent, named, reads: new Map(), told: new Set() }, file, text, flow ? [`flow:${flow}`] : []);
  // A text that uses no block keeps one line for each of its lines, even when it is empty.
  return placed.lines.length ? placed : slice(text, 0, text.length, file, flow, lineFinder(text));
}
