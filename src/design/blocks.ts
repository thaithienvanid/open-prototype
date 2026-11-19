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
/** Where a block is used: the file and the line of the element that uses it. */
type Use = { file: string; line: number };

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
    if (!this.lines.length) this.lines.push(...lines);
    else if (first) {
      const column = this.last.length;
      const shared = this.lines[this.lines.length - 1];
      this.lines[this.lines.length - 1] = !strip(this.last) || !shared ? shifted(first, column) : sharedBy(shared, first, column);
      this.lines.push(...lines.slice(1));
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

/** A finding's words with the place a block is used, so a block used twenty times names the one at fault. */
export function withUse(message: string, use: Use | undefined, named: (file: string) => string = (file) => file): string {
  return use ? `${message} (used at ${named(use.file)}:${use.line})` : message;
}

type Host = { name: string; tag: string; attrs: Attribute[]; line: number; start: number; end: number; content: string; closed: boolean; slashed: boolean };
/**
 * What a read may still place: the blocks used in this flow, or in this design, and for the whole design the text
 * the blocks add and the one finding that stopped the read, once a limit is passed.
 */
export type Budget = { uses: number; design: { size: number; stopped: Finding | null } };

/** A new budget for a design, and a new count of blocks for each flow of it. */
export function budget(): Budget {
  return { uses: 0, design: { size: 0, stopped: null } };
}

export function flowBudget(of: Budget): Budget {
  return { uses: 0, design: of.design };
}

/** What one read of a text gives: its hosts, outermost only, and whether it is one root element. */
type Read = { hosts: Host[]; oneRoot: boolean };

// The hosts of a text, outermost only: each element with data-proto-use, its place, and what it holds. The same pass
// says whether the text is one root element, with nothing but space and comments around it, as a block must be.
function readHosts(text: string): Read {
  const hosts: Host[] = [];
  const open = new OpenElements<{ tag: string; host: Host | null; contentStart: number }>();
  // How many open elements are hosts, so a use inside a host is known at once.
  let inHosts = 0;
  // The root count: an element that starts while no element is open, as the open elements, closed as a browser closes
  // them, say; an end tag closes every element inside the one it names.
  let roots = 0;
  let loose = false;
  const push = (tag: string, host: Host | null, place: TagPlace) => {
    if (VOID.has(tag)) return;
    open.push({ tag, host, contentStart: place.at + place.raw.length });
    if (host) inHosts++;
  };
  readMarkup(text, {
    start: (tag, attrs, place) => {
      if (!open.entries.length) roots++;
      const name = attrs.find(([key]) => key === ATTR.use)?.[1];
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
      if (!open.entries.length) roots++;
      const name = attrs.find(([key]) => key === ATTR.use)?.[1];
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
    end: (tag, place) => {
      for (const entry of open.close(tag)) {
        if (!entry.host) continue;
        inHosts--;
        entry.host.content = text.slice(entry.contentStart, place.at);
        entry.host.end = place.at + place.raw.length;
        entry.host.closed = true;
      }
    },
    data: (data) => {
      if (!open.entries.length && strip(data)) loose = true;
    },
  });
  return { hosts, oneRoot: roots === 1 && !loose };
}

type Context = {
  files: Texts;
  flow: string;
  findings: Finding[];
  budget: Budget;
  named: (file: string) => string;
  /** Each text read once: a block used many times with the same arguments is read once. */
  reads: Map<string, Read>;
};

/** A text's read, from the context's reads when the same text was read before. */
function readOnce(context: Context, text: string): Read {
  let read = context.reads.get(text);
  if (!read) {
    read = readHosts(text);
    context.reads.set(text, read);
  }
  return read;
}

function fill(context: Context, block: string, host: Host, file: string, use: string, at: Use | undefined): string {
  const values = new Map(host.attrs.filter(([key]) => key.startsWith(ATTR.arg)).map(([key, value]) => [key.slice(ATTR.arg.length), value ?? ""]));
  return block.replace(ARGUMENT, (whole, name: string) => {
    if (!KEBAB.test(name)) {
      context.findings.push(
        finding(
          "read.use-arg",
          withUse(`${whole} names an argument with lowercase letters, digits, and - only: rename it`, { file: use, line: host.line }, context.named),
          file,
          null,
        ),
      );
      return whole;
    }
    // A line break of an argument is written as its reference, so the block keeps its own lines and each finding its line.
    const value = values.get(name);
    if (value !== undefined) return escapeHtml(value).replaceAll("\n", "&#10;");
    context.findings.push(
      finding(
        "read.use-arg",
        withUse(`uses ${BLOCKS}/${host.name}.html with no ${ATTR.arg}${name} for its {{${name}}}: add it`, at, context.named),
        use,
        host.line,
      ),
    );
    return "";
  });
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
    const problem = (rule: RuleId, message: string) => context.findings.push(finding(rule, withUse(message, use, context.named), file, host.line));
    const extra = host.attrs.filter(([key]) => key !== ATTR.use && !key.startsWith(ATTR.arg)).map(([key]) => key);
    if (!KEBAB.test(host.name)) {
      problem("read.use", `${ATTR.use}="${quoted(host.name)}": a block is named in lowercase words joined by hyphens`);
      continue;
    }
    if (extra.length)
      problem(
        "read.use",
        `the element that uses ${host.name} also holds ${extra.join(", ")}: the block replaces it, so move them into the block, or pass them as ${ATTR.arg}<name>`,
      );
    if (host.slashed)
      problem("read.use", `the element that uses ${host.name} is written <${host.tag} .../>, which HTML leaves open: write <${host.tag} ...></${host.tag}>`);
    else if (!host.closed) problem("read.use", `the element that uses ${host.name} has no end tag: close it`);
    else if (strip(host.content)) problem("read.use", `the element that uses ${host.name} holds content: the block replaces it, so leave it empty`);
    if (stack.includes(host.name)) {
      problem("read.use-cycle", `the block ${host.name} uses itself again (${[...stack, host.name].join(" -> ")}): break the cycle`);
      continue;
    }
    if (++context.budget.uses > READ_LIMITS.uses) {
      context.budget.design.stopped = finding(
        "read.use-limit",
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
      problem("read.use", why !== undefined ? `${path} cannot be read, ${why}` : `${path} does not exist: write it, or take out ${ATTR.use}="${host.name}"`);
      continue;
    }
    const here: Use = { file, line: host.line };
    const filled = fill(context, block.replace(/\s+$/, ""), host, path, file, use);
    if (!readOnce(context, filled).oneRoot)
      context.findings.push(
        finding(
          "read.use",
          withUse("a block is one root element, which replaces the element that uses it: wrap the block in one", here, context.named),
          path,
          null,
        ),
      );
    const placed = resolve(context, path, filled, [...stack, host.name], here);
    context.budget.design.size += placed.text.length;
    if (context.budget.design.size > READ_LIMITS.expansion && !context.budget.design.stopped) {
      context.budget.design.stopped = finding(
        "read.use-limit",
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
  const placed = resolve({ files, flow, findings, budget: spent, named, reads: new Map() }, file, text, flow ? [`flow:${flow}`] : []);
  // A text that uses no block keeps one line for each of its lines, even when it is empty.
  return placed.lines.length ? placed : slice(text, 0, text.length, file, flow, lineFinder(text));
}
