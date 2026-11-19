// Flows: `<div data-proto-flow="items" data-proto-title="Items"></div>` puts the flow `flows/items.html` here.
// Each flow's screen ids, `data-proto-go`, and `data-proto-parent` are qualified with its flow id, so `detail` in
// `items` becomes `items:detail` while a link that already names a flow stays. Blocks inside a flow are placed
// with their own flow budget, and every line keeps its file and line provenance.
import { type Finding, finding } from "../finding.ts";
import { ATTR, FLOW_ID, FLOWS, FORMAT, VOID } from "../format.ts";
import { type Attribute, OpenElements, readMarkup, type TagPlace } from "../html/tokenizer.ts";
import type { Json } from "../json.ts";
import { escapeHtml, lineFinder, quoted, shown, strip } from "../text.ts";
import { type Budget, flowBudget, Joined, type Place, type Placed, placeBlocks, type Texts } from "./blocks.ts";

const QUALIFIED = new Set<string>([ATTR.screen, ATTR.go, ATTR.parent]);

export type FlowInfo = { id: string; title: string; file: string; line: number };

/** Why a format is refused, or "": a value that is no whole number, or a format newer than this tool's. */
export function formatProblem(found: Json | undefined): string {
  if (typeof found !== "number" || !Number.isInteger(found) || found < 1)
    return `names the design format ${shown(found ?? null)}, which is no whole number: write ${FORMAT}`;
  return found > FORMAT ? `is design format ${found}, newer than this tool's ${FORMAT}: update the tool` : "";
}

/** A target written again with its flow: `detail` in `items` is `items:detail`; a target with a flow stays. */
function qualified(flow: string, target: string): string {
  const slash = target.indexOf("/");
  const screen = slash < 0 ? target : target.slice(0, slash);
  return (screen.includes(":") ? screen : `${flow}:${screen}`) + (slash < 0 ? "" : target.slice(slash));
}

// Each start tag that names a screen or a link written again with its flow, keeping its line count.
function qualify(text: string, flow: string): string {
  const edits: [at: number, length: number, tag: string][] = [];
  const edit = (tag: string, attrs: Attribute[], place: TagPlace) => {
    if (!attrs.some(([name]) => QUALIFIED.has(name))) return;
    const written = [
      tag,
      ...attrs.map(([name, value]) => (value === null ? name : `${name}="${escapeHtml(QUALIFIED.has(name) ? qualified(flow, value) : value)}"`)),
    ];
    const newlines = "\n".repeat(place.raw.split("\n").length - 1);
    edits.push([place.at, place.raw.length, `<${written.join(" ")}${place.raw.endsWith("/>") ? `${newlines}/>` : `${newlines}>`}`]);
  };
  readMarkup(text, { start: edit, startEnd: edit, end: () => undefined });
  const pieces: string[] = [];
  let from = 0;
  for (const [at, size, tag] of edits) {
    pieces.push(text.slice(from, at), tag);
    from = at + size;
  }
  pieces.push(text.slice(from));
  return pieces.join("");
}

type FlowHost = {
  id: string;
  title: string;
  tag: string;
  attrs: Attribute[];
  line: number;
  start: number;
  end: number;
  content: string;
  closed: boolean;
  slashed: boolean;
};

// Outermost elements carrying `data-proto-flow`, with their span and content.
function readFlowHosts(text: string): FlowHost[] {
  const hosts: FlowHost[] = [];
  const open = new OpenElements<{ tag: string; host: FlowHost | null; contentStart: number }>();
  let inHosts = 0;
  const push = (tag: string, host: FlowHost | null, place: TagPlace) => {
    if (VOID.has(tag)) return;
    open.push({ tag, host, contentStart: place.at + place.raw.length });
    if (host) inHosts++;
  };
  const makeHost = (tag: string, attrs: Attribute[], place: TagPlace, closed: boolean, slashed: boolean): FlowHost => {
    const id = attrs.find(([key]) => key === ATTR.flow)?.[1] ?? "";
    const title = attrs.find(([key]) => key === ATTR.title)?.[1] ?? "";
    return { id, title, tag, attrs, line: place.line, start: place.at, end: place.at + place.raw.length, content: "", closed, slashed };
  };
  readMarkup(text, {
    start: (tag, attrs, place) => {
      const hasFlow = attrs.some(([key]) => key === ATTR.flow);
      const host = hasFlow && !inHosts ? makeHost(tag, attrs, place, VOID.has(tag), false) : null;
      if (host) hosts.push(host);
      push(tag, host, place);
    },
    startEnd: (tag, attrs, place) => {
      const hasFlow = attrs.some(([key]) => key === ATTR.flow);
      if (hasFlow && !inHosts) hosts.push(makeHost(tag, attrs, place, true, !VOID.has(tag)));
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
  });
  return hosts;
}

/** Slice a `Placed` text from `from` to `to`, keeping the exact `Place` of each line. */
function slicePlaced(placed: Placed, from: number, to: number, lineAt: (at: number) => number): Placed {
  const chunk = placed.text.slice(from, to);
  if (!chunk) return { text: "", lines: [] };
  const first = lineAt(from);
  const count = chunk.split("\n").length;
  return { text: chunk, lines: placed.lines.slice(first - 1, first - 1 + count) };
}

/**
 * Replace every `<div data-proto-flow="<id>" ...></div>` in `placed` with its `flows/<id>.html` (with its own blocks
 * placed and its screen ids qualified), keeping each line's provenance.
 */
export function placeFlows(files: Texts, placed: Placed, findings: Finding[], spent: Budget, named: (file: string) => string): Placed & { flows: FlowInfo[] } {
  const hosts = readFlowHosts(placed.text);
  if (!hosts.length) return { ...placed, flows: [] };
  const lineAt = lineFinder(placed.text);
  const out = new Joined();
  const flows: FlowInfo[] = [];
  const seen = new Set<string>();
  let at = 0;
  for (const host of hosts) {
    if (spent.design.stopped) break;
    const before = slicePlaced(placed, at, host.start, lineAt);
    out.add(before.text, before.lines);
    at = host.end;
    const place: Place = placed.lines[host.line - 1] ?? { file: "", line: host.line, flow: "" };
    const problem = (message: string) => findings.push(finding("read.flow", message, place.file, place.line));
    const extra = host.attrs.filter(([key]) => key !== ATTR.flow && key !== ATTR.title).map(([key]) => key);
    if (!FLOW_ID.test(host.id)) {
      problem(`${ATTR.flow}="${quoted(host.id)}": a flow id must be lowercase letters, digits, and hyphens, starting with a letter`);
      continue;
    }
    if (seen.has(host.id)) {
      problem(`${ATTR.flow}="${quoted(host.id)}" is included more than once: include each flow once`);
      continue;
    }
    if (extra.length)
      problem(
        `the element that includes flow ${host.id} also holds ${extra.join(", ")}: the flow replaces it, so leave only ${ATTR.flow} and optional ${ATTR.title}`,
      );
    if (host.slashed)
      problem(`the element that includes flow ${host.id} is written <${host.tag} .../>, which HTML leaves open: write <${host.tag} ...></${host.tag}>`);
    else if (!host.closed) problem(`the element that includes flow ${host.id} has no end tag: close it`);
    else if (strip(host.content)) problem(`the element that includes flow ${host.id} holds content: the flow replaces it, so leave it empty`);
    seen.add(host.id);
    const file = `${FLOWS}/${host.id}.html`;
    const why = files.unreadable.get(file);
    const raw = files.texts.get(file);
    if (why !== undefined) {
      findings.push(finding("read.flow", `cannot be read, ${why}`, file));
      continue;
    }
    if (raw === undefined) {
      problem(`${file} does not exist: write ${named(file)}, or take out ${ATTR.flow}="${host.id}"`);
      continue;
    }
    const flow = placeBlocks(files, file, raw, host.id, findings, flowBudget(spent), named);
    if (spent.design.stopped) break;
    flows.push({ id: host.id, title: host.title || host.id, file, line: place.line });
    out.add(qualify(flow.text, host.id), flow.lines);
  }
  if (spent.design.stopped) return { text: out.text, lines: out.lines, flows };
  const rest = slicePlaced(placed, at, placed.text.length, lineAt);
  out.add(rest.text, rest.lines);
  return { text: out.text, lines: out.lines, flows };
}
