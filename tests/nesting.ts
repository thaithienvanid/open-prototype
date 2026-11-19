/// <reference lib="dom" />
// Texts for the comparison of the reader's nesting with Chrome's: two generators with their own seeded numbers, so a
// failure runs again from its seed, the reader's tree of a text, and Chrome's, in one form. The elements come from the
// allow-list, so an element it takes in a body joins the messy texts by itself.
import { ALLOW_LIST } from "../src/design/allow.ts";
import { walk } from "../src/design/read.ts";
import { stopsPage } from "../src/finding.ts";
import { VOID } from "../src/format.ts";
import { type Fault, OpenElements, readMarkup } from "../src/html/tokenizer.ts";

/** Numbers from a seed, the same each run: mulberry32. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const pick = <T>(random: Random, from: readonly T[]): T => from[Math.floor(random() * from.length)] as T;

const BODY = ALLOW_LIST.bodyElements.filter((tag) => tag !== "style");
const SVG = ALLOW_LIST.svgElements;
// The elements whose nesting a browser reads by rules of its own, met more often than the rest: each one the allow-list
// takes, so none stands here that a design cannot write.
const FOCUS = `a b i em strong code s small u p div span li ul ol dl dd dt h1 h2 table caption colgroup col tbody thead tfoot tr td th
  select option optgroup datalist button hr input br template textarea label section`
  .split(/\s+/)
  .filter((tag) => BODY.includes(tag));

// The children an element most often holds, which the messy texts open inside it half the time, so a table, a list,
// and a select stand whole often enough to be read with their parts.
const CHILDREN: Record<string, string[]> = {
  table: ["tr", "tr", "tbody", "thead", "tfoot", "caption", "colgroup", "td"],
  tbody: ["tr", "tr", "td"],
  thead: ["tr"],
  tfoot: ["tr"],
  tr: ["td", "th"],
  colgroup: ["col"],
  select: ["option", "optgroup", "hr"],
  optgroup: ["option"],
  datalist: ["option"],
  ul: ["li"],
  ol: ["li"],
  menu: ["li"],
  dl: ["dt", "dd"],
  template: ["tr", "td", "caption", "col", "li", "div"],
};

/** A start tag as the generators write it, each numbered, a template as a list's item. */
function startTag(tag: string, n: number): string {
  return `<${tag} data-n="${n}"${tag === "template" ? " data-proto-item" : ""}>`;
}

// The elements a part of a container is: the messy texts that start in a container open one only inside its container.
const PARTS = new Set(Object.values(CHILDREN).flat());
const LOOSE = FOCUS.filter((tag) => !PARTS.has(tag));

/**
 * A small text of any shape: elements nested at random, end tags left out, written out of order, or with no element
 * open, and text between. Half the texts start with a table, a select, or a list, and open a part only inside its
 * container, so the parts are read in place as often as out of it.
 */
export function messyText(random: Random): string {
  const out: string[] = [];
  const open: string[] = [];
  let n = 0;
  let words = 0;
  const inside = random() < 0.5;
  if (inside) {
    const tag = pick(
      random,
      ["table", "table", "select", "ul", "dl"].filter((one) => BODY.includes(one)),
    );
    out.push(startTag(tag, n++));
    open.push(tag);
  }
  const steps = 4 + Math.floor(random() * 16);
  for (let step = 0; step < steps; step++) {
    // Inside a table's own parts, a text that starts in a container mostly opens the next part.
    const strict = inside && ["table", "tbody", "thead", "tfoot", "tr", "colgroup"].includes(open.at(-1) ?? "");
    const r = strict ? random() * 0.85 : random();
    if (r < 0.46) {
      const children = CHILDREN[open.at(-1) ?? ""]?.filter((tag) => BODY.includes(tag));
      const tag =
        children?.length && random() < (strict ? 0.95 : inside ? 0.8 : 0.5)
          ? pick(random, children)
          : random() < 0.6
            ? pick(random, inside ? LOOSE : FOCUS)
            : pick(random, [...BODY.filter((one) => !inside || !PARTS.has(one)), "svg"]);
      if (tag === "svg") {
        out.push(
          svgText(
            random,
            () => n++,
            () => words++,
            random() < 0.8,
          ),
        );
        continue;
      }
      out.push(startTag(tag, n++));
      if (tag === "textarea") {
        out.push(`t${words++} </textarea>`);
        continue;
      }
      if (!VOID.has(tag)) open.push(tag);
    } else if (r < 0.62) {
      const tag = open.pop();
      if (tag) out.push(`</${tag}>`);
    } else if (r < 0.7) {
      if (open.length) {
        const at = Math.floor(random() * open.length);
        out.push(`</${open[at]}>`);
        open.splice(at, 1);
      }
    } else if (r < 0.75) {
      open.pop();
    } else if (r < 0.8) {
      out.push(`</${pick(random, [...FOCUS, "br", "p", "tbody", ...(strict ? ["tbody", "table"] : [])])}>`);
    } else if (r < 0.85) {
      out.push(pick(random, [" ", "\n"]));
    } else out.push(`t${words++} `);
  }
  while (open.length) {
    const tag = open.pop();
    if (random() < 0.5) out.push(`</${tag}>`);
  }
  return out.join("");
}

/**
 * An icon: svg's own elements, now and then one closed by `/>`, with text; `closed`, every element closed, and a title
 * or a desc holding text alone, as the allow-list takes them.
 */
function svgText(random: Random, number: () => number, word: () => number, closed: boolean): string {
  const out = [startTag("svg", number())];
  const open = ["svg"];
  const steps = 1 + Math.floor(random() * 4);
  for (let step = 0; step < steps; step++) {
    const r = random();
    const inName = open.at(-1) === "title" || open.at(-1) === "desc";
    if (r < 0.5 && !(closed && inName)) {
      const tag = pick(random, SVG);
      if (random() < 0.3) out.push(`<${tag} data-n="${number()}"/>`);
      else {
        out.push(startTag(tag, number()));
        open.push(tag);
      }
    } else if (r < 0.75 && open.length > 1) out.push(`</${open.pop()}>`);
    else out.push(`t${word()} `);
  }
  if (closed) while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

// The tidy texts' content: what a phrasing element holds, what a block holds, and the controls that hold no control.
const PHRASING = "abbr b bdi bdo cite code del dfn em i ins kbd mark q s samp small span strong sub sup time u var"
  .split(" ")
  .filter((tag) => BODY.includes(tag));
const BLOCKS = "address article aside blockquote div footer header main nav section".split(" ").filter((tag) => BODY.includes(tag));

/** A small text written in full: every end tag, each element where its content model puts it, tables whole. */
export function tidyText(random: Random): string {
  let n = 0;
  let words = 0;
  const el = (tag: string, inner = "") => `${startTag(tag, n++)}${VOID.has(tag) ? "" : `${inner}</${tag}>`}`;
  const text = () => `t${words++}${random() < 0.3 ? "\n" : " "}`;
  const many = (count: number, make: () => string) => Array.from({ length: 1 + Math.floor(random() * count) }, make).join("");
  const deep = 2;
  // `interactive`: whether a link or a control may stand here; `label`, whether a label may.
  const phrasing = (depth: number, interactive = true, label = true): string =>
    many(3, () => {
      const r = random();
      if (depth > deep || r < 0.35) return text();
      if (r < 0.7) return el(pick(random, PHRASING), phrasing(depth + 1, interactive, label));
      if (r < 0.75) return el(pick(random, ["br", "img", "wbr"]));
      if (!interactive) return text();
      if (r < 0.82) return el("a", phrasing(depth + 1, false, label));
      if (r < 0.88) return el("button", phrasing(depth + 1, false, label));
      if (r < 0.92 && label) return el("label", phrasing(depth + 1, true, false));
      if (r < 0.95) return el("input");
      return el(
        "select",
        many(3, () => el("option", text())),
      );
    });
  const cells = (depth: number) => many(3, () => el(pick(random, ["td", "th"]), flow(depth + 1)));
  const rows = (depth: number) => many(2, () => `${el("tr", cells(depth))}${random() < 0.3 ? "\n" : ""}`);
  const table = (depth: number): string => {
    const parts: string[] = [];
    if (random() < 0.2) parts.push(el("caption", phrasing(depth + 1)));
    if (random() < 0.2)
      parts.push(
        el(
          "colgroup",
          many(2, () => el("col")),
        ),
      );
    if (random() < 0.3) parts.push(el("thead", rows(depth)));
    const r = random();
    if (r < 0.4) parts.push(rows(depth));
    else if (r < 0.6) parts.push(listOf("tbody", rows(depth)));
    else parts.push(el("tbody", rows(depth)));
    if (random() < 0.2) parts.push(el("tfoot", rows(depth)));
    return el("table", parts.join(random() < 0.5 ? "\n" : ""));
  };
  // A list: its one item, a template, holds what each entry draws.
  const listOf = (tag: string, inner: string) => `<${tag} data-n="${n++}" data-proto-list="rows">${startTag("template", n++)}${inner}</template></${tag}>`;
  const flow = (depth: number): string =>
    many(3, () => {
      const r = random();
      if (depth > deep || r < 0.25) return phrasing(depth);
      if (r < 0.35) return el(pick(random, BLOCKS), flow(depth + 1));
      if (r < 0.45) return el("p", phrasing(depth + 1));
      if (r < 0.5) return el(pick(random, ["h1", "h2", "h3"]), phrasing(depth + 1));
      if (r < 0.6)
        return el(
          pick(random, ["ul", "ol", "menu"]),
          many(3, () => el("li", flow(depth + 1))),
        );
      if (r < 0.65)
        return el(
          "dl",
          many(2, () => el("dt", phrasing(depth + 1)) + el("dd", flow(depth + 1))),
        );
      if (r < 0.75) return table(depth);
      if (r < 0.8)
        return el(
          "select",
          many(3, () =>
            random() < 0.7
              ? el("option", text())
              : el(
                  "optgroup",
                  many(2, () => el("option", text())),
                ),
          ),
        );
      if (r < 0.83) return el("details", el("summary", phrasing(depth + 1, false)) + flow(depth + 1));
      if (r < 0.86) return el("fieldset", el("legend", phrasing(depth + 1)) + flow(depth + 1));
      if (r < 0.88) return el("figure", flow(depth + 1) + el("figcaption", phrasing(depth + 1)));
      if (r < 0.9) return el("hr");
      if (r < 0.92) return el("textarea", text());
      if (r < 0.94) return el("pre", phrasing(depth + 1));
      if (r < 0.97) return listOf("ul", el("li", phrasing(depth + 1)));
      return svgText(
        random,
        () => n++,
        () => words++,
        true,
      );
    });
  return flow(0);
}

/** The document a text is read in, by the reader and by Chrome alike. */
export function documentOf(text: string): string {
  return `<!doctype html><html lang="en"><head><title>A case</title></head><body>${text}</body></html>`;
}

/** The rule that refuses a text, one that stops the page first, then `structure.nesting`, or "" for none. */
export function refusal(text: string): string {
  const issues = walk(documentOf(text)).issues;
  return (issues.find((issue) => stopsPage(issue.rule)) ?? issues.find((issue) => issue.rule === "structure.nesting"))?.rule ?? "";
}

/** The nesting rules give no finding of nesting: each text that gets one, with its words. */
export function nestingFindings(text: string): string[] {
  return walk(documentOf(text))
    .issues.filter((issue) => issue.rule === "structure.nesting")
    .map((issue) => issue.message);
}

type Row = { key: number; row: string };
const joined = (rows: Row[]) =>
  rows
    .sort((a, b) => a.key - b.key || (a.row < b.row ? -1 : a.row > b.row ? 1 : 0))
    .map(({ row }) => row)
    .join(" ");

/**
 * The reader's tree of a text: each written element as its tag and number, then `<` and the numbered element it stands
 * in, or `-`; each word of text, `t` and its number, in the same form. It reads the document as the walk does, through
 * `OpenElements`, and closes a foreign element written `.../>`. Each fault it tells is added to `faults`.
 */
export function readerTree(text: string, faults: Fault["kind"][] = []): string {
  type Entry = { tag: string; label: string; foreign: boolean };
  const open = new OpenElements<Entry>((fault) => faults.push(fault.kind));
  const rows: Row[] = [];
  const label = () => open.top()?.label ?? "-";
  const start = (tag: string, attrs: [string, string | null][], slashed: boolean) => {
    open.opening(tag, tag === "input" && attrs.some(([name, value]) => name === "type" && value?.trim().toLowerCase() === "hidden"));
    const n = attrs.find(([name]) => name === "data-n")?.[1];
    const parent = label();
    if (n !== undefined && n !== null) rows.push({ key: Number(n), row: `${tag}${n}<${parent}` });
    const foreign = Boolean(open.top()?.foreign) || tag === "svg" || tag === "math";
    if (VOID.has(tag)) return;
    open.push({ tag, label: n === undefined || n === null ? parent : `${tag}${n}`, foreign });
    if (slashed && foreign) open.close(tag);
  };
  readMarkup(documentOf(text), {
    start: (tag, attrs) => start(tag, attrs, false),
    startEnd: (tag, attrs) => start(tag, attrs, true),
    end: (tag) => void open.close(tag),
    data: (data) => {
      open.text(data);
      for (const word of data.match(/\bt\d+\b/g) ?? []) rows.push({ key: 100_000 + Number(word.slice(1)), row: `${word}<${label()}` });
    },
  });
  return joined(rows);
}

/**
 * Chrome's tree of each text, in the reader's form, run in a page: the nearest numbered element around each element and
 * each word, through a template's content. An element a browser adds that the text never wrote is left out, as a table's
 * `tbody`, `tr`, and `colgroup` are, but for a `p` or a `br`, which stands as `p?` or `br?`; an element a browser opens
 * again stands once for each copy. It is self-contained, since it runs in the page.
 */
export function chromeTrees(sources: string[]): string[] {
  return sources.map((source) => {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const rows: { key: number; row: string }[] = [];
    const nameOf = (element: Element | null) => (element ? `${element.localName.toLowerCase()}${element.getAttribute("data-n")}` : "-");
    const visit = (node: Node, parent: Element | null) => {
      for (const child of Array.from(node.childNodes)) {
        if (child instanceof Element) {
          const n = child.getAttribute("data-n");
          const tag = child.localName.toLowerCase();
          if (n !== null) rows.push({ key: Number(n), row: `${tag}${n}<${nameOf(parent)}` });
          else if (tag === "p" || tag === "br") rows.push({ key: 200_000, row: `${tag}?<${nameOf(parent)}` });
          const inner = n === null ? parent : child;
          visit(child instanceof HTMLTemplateElement ? child.content : child, inner);
        } else if (child.nodeType === 3) {
          for (const word of (child.textContent ?? "").match(/\bt\d+\b/g) ?? [])
            rows.push({ key: 100_000 + Number(word.slice(1)), row: `${word}<${nameOf(parent)}` });
        }
      }
    };
    visit(doc.body, null);
    return rows
      .sort((a, b) => a.key - b.key || (a.row < b.row ? -1 : a.row > b.row ? 1 : 0))
      .map(({ row }) => row)
      .join(" ");
  });
}
