// One `Design` for every design: an ordinary HTML file, with optional `flows/<id>.html` and `blocks/<name>.html`.
// `load` reads the files given, places every block and flow, walks the result once as one document, and keeps the place
// of each line, so every stage after it reads one shape. It is pure: the same files give the same design.
import { type Finding, finding, type RuleId } from "../finding.ts";
import {
  ATTR,
  BLOCKS,
  DEFAULT_PLATFORMS,
  DEFAULT_THEMES,
  FORMAT,
  isPlatform,
  isTheme,
  META,
  PLATFORMS,
  type Platform,
  THEMES,
  type Theme,
  WORK_ITEM_ID,
} from "../format.ts";
import type { Attribute } from "../html/tokenizer.ts";
import { isObject, type Json, readJson } from "../json.ts";
import { quoted, words } from "../text.ts";
import { budget, type Place, placeBlocks } from "./blocks.ts";
import type { Facts } from "./facts.ts";
import type { Files } from "./files.ts";
import { type FlowInfo, formatProblem, placeFlows } from "./flows.ts";
import { walk } from "./read.ts";
import { documentFindings, readSystem, type System, systemCss } from "./system.ts";

/** A text a rule reads, and the place of each of its lines. */
export type Source = { text: string; lines: Place[] };

export type Design = {
  /** The design's path inside the project, such as `design/app.html`. */
  design: string;
  /** The folder the design's own files are named from, inside the project: "" at the project's top. */
  folder: string;
  /** The design's name: the file's stem. */
  name: string;
  id: string;
  format: number;
  title: string;
  product: string;
  /** The work item the head names, or "" for none; the page config writes it as `work_item`. */
  workItem: string;
  platforms: Platform[];
  themes: Theme[];
  /** The design's `<html>` and `<body>` attributes, which a frame's root and body carry, less the tool's names. */
  html: Attribute[];
  bodyAttributes: Attribute[];
  /** The whole document the walk read, and the place of each of its lines. */
  text: string;
  lines: Place[];
  /** The markup the viewer shows: the head's styles, then the body, with no fixtures block. */
  body: string;
  /**
   * The tokens the build places before the design's styles, each with its text and its path from the project's top: the
   * design document's, marked generated, then each token file.
   */
  tokens: { file: string; css: string; generated?: boolean }[];
  /** The project's design document as tokens, or null when the project has none. */
  system: System | null;
  /** The findings of the token files, each naming its file from the project's top. */
  tokenFindings: Finding[];
  fixtures: Json;
  /** The text the fixtures were read from, for the rules that read words. */
  fixturesSource: Source;
  flows: FlowInfo[];
  /** The source files in reading order, each by its path in the design's folder: findings sort by it. */
  files: string[];
  /** What the walk found, or null when the design cannot be read. */
  facts: Facts | null;
  /** What reading found. */
  findings: Finding[];
  images: Files["images"];
  /** The font files the `@font-face` blocks name, by their path from the project's top, as `readFiles` read them. */
  fonts: Files["fonts"];
  /** The round files beside the design, by path in its folder. */
  rounds: Files["rounds"];
};

function base(files: Files): Design {
  const placed = tokensOf(files);
  const doc = files.designMd;
  const system = doc ? readSystem(doc.file, doc.blocks, doc.sections, doc.problem) : null;
  const stem = files.file.replace(/\.html$/, "");
  const folder = files.design.slice(0, Math.max(0, files.design.length - files.file.length - 1));
  return {
    design: files.design,
    folder,
    name: stem,
    id: files.id,
    format: FORMAT,
    title: files.design,
    product: "",
    workItem: "",
    platforms: [...DEFAULT_PLATFORMS],
    themes: [...DEFAULT_THEMES],
    html: [],
    bodyAttributes: [],
    text: "",
    lines: [],
    body: "",
    tokens: placed.tokens,
    system,
    tokenFindings: [
      ...documentFindings(system),
      ...files.tokenProblems.map((message) => finding("read.tokens", message, files.design)),
      ...files.misnamed.map((rel) =>
        finding(
          "read.file",
          "has a name the tool does not read: rename it with letters, digits, `.`, `_`, and `-`, starting with a letter, a digit, or `_`",
          folder ? `${folder}/${rel}` : rel,
        ),
      ),
      ...placed.findings,
    ],
    fixtures: {},
    fixturesSource: { text: "", lines: [] },
    flows: [],
    files: [],
    facts: null,
    findings: [],
    images: files.images,
    fonts: files.fonts,
    rounds: files.rounds,
  };
}

// What a tokens file may not hold, since the build places its text in the page as a style block: each is a read finding.
const TOKEN_TEXT: [RegExp, string][] = [
  [/<\/style/i, "holds </style, which would end its style block"],
  [/<\/?template/i, "holds <template or </template, which would end the page's design part"],
  [/\u0000/, "holds a NUL character, which a browser replaces, so the block would not apply"],
];

/** The token files a design may place, and a read finding at the file and line of each fault of one that may not. */
function tokensOf(files: Files): { tokens: Design["tokens"]; findings: Finding[] } {
  const tokens: Design["tokens"] = [];
  const findings: Finding[] = [];
  for (const token of files.tokens) {
    const faults: Finding[] = [];
    token.css.split("\n").forEach((line, index) => {
      for (const [pattern, what] of TOKEN_TEXT)
        if (pattern.test(line)) faults.push(finding("read.tokens", `the tokens file ${what}: take it out`, token.file, index + 1));
    });
    if (faults.length) findings.push(...faults);
    else tokens.push({ file: token.file, css: token.css });
  }
  return { tokens, findings };
}

/** The place of a line of the walked text, its file named in the design's folder. */
export function placeOf(design: Design, line: number): Place {
  return design.lines[Math.max(0, Math.min(line - 1, design.lines.length - 1))] ?? { file: design.files[0] ?? design.name, line, flow: "" };
}

/** A file of the design, named from the project's top, so a person or an agent opens it from there. */
export function fromTop(design: Design, file: string): string {
  return design.folder ? `${design.folder}/${file}` : file;
}

/** A list of words a `<meta>` names, each from the choices, and a finding for each unknown one. */
function declared<Word extends string>(
  design: Design,
  name: string,
  choices: readonly Word[],
  isChoice: (word: string) => word is Word,
  fallback: readonly Word[],
  rule: RuleId,
): { words: Word[]; findings: Finding[] } {
  const meta = design.facts?.document?.metas.get(name);
  if (!meta) return { words: [...fallback], findings: [] };
  const place = placeOf(design, meta.line);
  const found = words(meta.content);
  const findings = found
    .filter((item) => !isChoice(item))
    .map((word) => finding(rule, `<meta name="${name}"> names \`${quoted(word)}\`, which is none of ${choices.join(", ")}`, place.file, place.line));
  const kept = [...new Set(found.filter(isChoice))];
  return { words: kept.length ? kept : [...fallback], findings };
}

/** The head's styles, then the body's markup with its fixtures block left out. */
function bodyOf(facts: Facts, text: string): string {
  const document = facts.document;
  if (!document?.body) return "";
  const [start, end] = document.body;
  const styles = document.headStyles.map(([from, to]) => text.slice(from, to)).join("\n");
  const fixtures = document.fixtures && document.fixtures.start >= start && document.fixtures.end <= end ? document.fixtures : null;
  const markup = fixtures ? text.slice(start, fixtures.start) + text.slice(fixtures.end, end) : text.slice(start, end);
  return styles ? `${styles}\n${markup}` : markup;
}

/** What a design reads from its walked document: its head, its body, and the names on `<html>`. */
type DocumentPart = Pick<Design, "title" | "workItem" | "platforms" | "themes" | "html" | "bodyAttributes" | "body">;

/** The walked document's part of a design, and the findings of its head; none when the walk read no document. */
function documentPart(design: Design): { part: DocumentPart; findings: Finding[] } | null {
  const facts = design.facts;
  const document = facts?.document;
  if (!facts || !document) return null;
  const findings: Finding[] = [];
  const meta = document.metas.get(META.workItem);
  const item = meta?.content ?? "";
  const workItem = WORK_ITEM_ID.test(item) ? item : "";
  if (meta && !workItem) {
    const place = placeOf(design, meta.line);
    findings.push(
      finding(
        "structure.work-item",
        `<meta name="${META.workItem}"> names ${JSON.stringify(item)}, which is no work item: write 1 to 64 characters with no space, such as CARD-12, so the page can name it`,
        place.file,
        place.line,
      ),
    );
  }
  const platforms = declared(design, META.platforms, PLATFORMS, isPlatform, DEFAULT_PLATFORMS, "device.platform");
  const themes = declared(design, META.themes, THEMES, isTheme, DEFAULT_THEMES, "device.theme");
  findings.push(...platforms.findings, ...themes.findings);
  return {
    part: {
      title: document.title || design.title,
      workItem,
      platforms: platforms.words,
      themes: themes.words,
      html: document.htmlAttributes.filter(([name]) => name !== ATTR.format),
      bodyAttributes: document.bodyAttributes,
      body: bodyOf(facts, design.text),
    },
    findings,
  };
}

/** The design with its document's part, and the findings of its head after the ones it holds. */
function readDocument(design: Design): void {
  const read = documentPart(design);
  if (!read) return;
  Object.assign(design, read.part);
  design.findings.push(...read.findings);
}

/** A design's fixtures, from its one fixtures block, and the finding of a block that is no JSON object. */
function fixturesPart(
  design: Design,
  fixtures: { text: string; line: number },
): { part: Pick<Design, "fixturesSource"> & Partial<Pick<Design, "fixtures">>; findings: Finding[] } {
  const read = readJson(fixtures.text);
  const place = placeOf(design, fixtures.line);
  const fixturesSource = { text: fixtures.text, lines: design.lines.slice(fixtures.line - 1) };
  if (!read.ok)
    return { part: { fixturesSource }, findings: [finding("read.fixtures", `its fixtures block is not JSON (${read.error})`, place.file, place.line)] };
  if (!isObject(read.value))
    return { part: { fixturesSource }, findings: [finding("read.fixtures", "its fixtures block holds no JSON object: write { ... }", place.file, place.line)] };
  return { part: { fixtures: read.value, fixturesSource }, findings: [] };
}

function loadDesign(files: Files, design: Design): Design {
  const shown = files.file;
  design.files = [shown];
  const why = files.unreadable.get(files.file);
  if (why !== undefined) {
    design.findings.push(finding("read.file", `cannot be read, ${why}`, shown));
    return design;
  }
  const raw = files.texts.get(files.file) ?? "";
  const spent = budget();
  const named = (file: string) => fromTop(design, file);
  const withBlocks = placeBlocks(files, shown, raw, "", design.findings, spent, named);
  if (spent.design.stopped) {
    // A read stopped at a limit holds a fragment of the design: the limit is the one thing to fix.
    design.findings = [spent.design.stopped];
    return design;
  }
  const assembled = placeFlows(files, withBlocks, design.findings, spent, named);
  if (spent.design.stopped) {
    design.findings = [spent.design.stopped];
    return design;
  }
  design.flows = assembled.flows;
  design.files = [shown, ...assembled.flows.map((flow) => flow.file), ...[...files.texts.keys()].filter((name) => name.startsWith(`${BLOCKS}/`)).sort()];
  design.text = assembled.text;
  design.lines = assembled.lines;
  design.facts = walk(assembled.text, { document: true, qualified: assembled.flows.length > 0 });
  const document = design.facts.document;
  const format = document?.htmlAttributes.find(([name]) => name === ATTR.format);
  if (format) {
    const written = format[1] ?? "";
    const problem = formatProblem(/^[0-9]+$/.test(written) ? Number(written) : written);
    if (problem) {
      design.findings.push(finding("read.format", problem, shown, 1));
      design.facts = null;
      return design;
    }
    design.format = Number(written);
  }
  readDocument(design);
  const fixtures = document?.fixtures;
  if (fixtures) {
    const read = fixturesPart(design, fixtures);
    Object.assign(design, read.part);
    design.findings.push(...read.findings);
  }
  design.product = isObject(design.fixtures) && typeof design.fixtures.product === "string" ? design.fixtures.product : "";
  return design;
}

/** One design, from its files. The design document's tokens go first, written for the themes the design declares. */
export function load(files: Files): Design {
  const design = base(files);
  const loaded = loadDesign(files, design);
  const css = loaded.system ? systemCss(loaded.system, loaded.themes) : "";
  if (loaded.system && css) loaded.tokens.unshift({ file: loaded.system.file, css, generated: true });
  return loaded;
}
