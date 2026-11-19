// Flows: `<div data-proto-flow="items" data-proto-title="Items"></div>` puts the flow `flows/items.html` here.
// Each flow's screen ids are qualified with its flow id, so `detail` in `items` becomes `items:detail`. A
// `data-proto-go` or `data-proto-parent` is qualified only when the flow holds that screen: a target the flow lacks
// stays as written and names a screen of the main file, and a link that already names a flow stays. Blocks inside a flow are placed
// with their own flow budget, and every line keeps its file and line provenance.
import { type Finding, finding } from "../finding.ts";
import { ATTR, FLOW_ID, FLOWS } from "../format.ts";
import { type Attribute, readMarkup, type TagPlace } from "../html/tokenizer.ts";
import { escapeHtml, lineFinder, quoted, strip } from "../text.ts";
import { type Budget, flowBudget, type Host, Joined, type Place, type Placed, placeBlocks, readHosts, type Texts } from "./blocks.ts";

const QUALIFIED = new Set<string>([ATTR.screen, ATTR.go, ATTR.parent]);

export type FlowInfo = { id: string; title: string; file: string; line: number };

/**
 * A target written again with its flow when the flow holds its screen: `detail` in `items` is `items:detail`. A target
 * with a flow, or one whose screen the flow lacks, stays, and is looked up among the main file's screens.
 */
function qualified(flow: string, target: string, own: ReadonlySet<string>): string {
  const slash = target.indexOf("/");
  const screen = slash < 0 ? target : target.slice(0, slash);
  return !screen.includes(":") && own.has(screen) ? `${flow}:${target}` : target;
}

// The screen ids the flow's own markup declares, blocks already placed, wherever they stand in it.
function ownScreens(text: string): Set<string> {
  const own = new Set<string>();
  const add = (_tag: string, attrs: Attribute[]) => {
    for (const [name, value] of attrs) if (name === ATTR.screen && value !== null) own.add(value);
  };
  readMarkup(text, { start: add, startEnd: add, end: () => undefined });
  return own;
}

// Each start tag that names a screen or a link written again with its flow, keeping its line count: the tag is written
// on one line, a value's line break as `&#10;`, and the raw tag's line breaks follow it, so each counts once.
function qualify(text: string, flow: string): string {
  const own = ownScreens(text);
  const edits: [at: number, length: number, tag: string][] = [];
  const edit = (tag: string, attrs: Attribute[], place: TagPlace) => {
    if (!attrs.some(([name]) => QUALIFIED.has(name))) return;
    const written = [
      tag,
      ...attrs.map(([name, value]) =>
        value === null
          ? name
          : `${name}="${escapeHtml(name === ATTR.screen ? (value.includes(":") ? value : `${flow}:${value}`) : QUALIFIED.has(name) ? qualified(flow, value, own) : value).replaceAll("\n", "&#10;")}"`,
      ),
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

type FlowHost = Host & { id: string; title: string };

// Outermost elements carrying `data-proto-flow`, read as a block's hosts are.
function readFlowHosts(text: string): FlowHost[] {
  return readHosts(text, ATTR.flow).hosts.map((host) => ({ ...host, id: host.name, title: host.attrs.find(([key]) => key === ATTR.title)?.[1] ?? "" }));
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
    const problem = (message: string) => findings.push(finding("flow.include", message, place.file, place.line));
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
      findings.push(finding("flow.include", `cannot be read, ${why}`, file));
      continue;
    }
    if (raw === undefined) {
      problem(`${file} does not exist: write ${named(file)}, or take out ${ATTR.flow}="${host.id}"`);
      continue;
    }
    const flow = placeBlocks(files, file, raw, host.id, findings, flowBudget(spent), named);
    if (spent.design.stopped) break;
    // A flow is included by the main file alone: one inside a flow would be read as plain markup, and its screens lost.
    for (const inner of readFlowHosts(flow.text)) {
      const at = flow.lines[inner.line - 1] ?? { file, line: inner.line, flow: host.id };
      findings.push(
        finding(
          "flow.include",
          `${ATTR.flow}="${quoted(inner.id)}" stands inside the flow ${host.id}: a flow cannot include a flow, so include it from the main file`,
          at.file,
          at.line,
        ),
      );
    }
    flows.push({ id: host.id, title: host.title || host.id, file, line: place.line });
    out.add(qualify(flow.text, host.id), flow.lines);
  }
  if (spent.design.stopped) return { text: out.text, lines: out.lines, flows };
  const rest = slicePlaced(placed, at, placed.text.length, lineAt);
  out.add(rest.text, rest.lines);
  return { text: out.text, lines: out.lines, flows };
}
