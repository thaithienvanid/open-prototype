// The design document's tokens: the YAML that `design/designmd.ts` read, turned into CSS custom properties by the
// naming rule of `SYSTEM_NAMES`, and the findings of the document at its own lines. Every value is held to its form, so
// no text of the document reaches the page as written: the CSS is the tool's own text around values of known shapes.
// It is pure: the same document gives the same tokens.

import { type SystemShape, type SystemTokenShape, UNSAFE_KEYS } from "../contract.ts";
import { namedColor } from "../css/colors.ts";
import { followVars } from "../css/sheet.ts";
import { type Finding, finding, type RuleId } from "../finding.ts";
import { DESIGN_MD_VERSION, PROGRAM, type Theme } from "../format.ts";
import { kebabCase, quoted } from "../text.ts";
import type { DesignMdBlock, DesignMdSection } from "./designmd.ts";

/** A finding of the document: its rule, its line in the document, and its words. */
type SystemIssue = { rule: RuleId; line: number; message: string };

/** The form of a token's value: what a reference to it may stand for. */
type Form = "colour" | "dimension" | "number" | "family" | "weight" | "feature" | "time" | "easing" | "typography";
/** What a place of the document takes: one form, or several. */
type Takes = { what: string; forms: Form[] };

/** A token the document places: its path in the document, its CSS name, its line, and its value as the page writes it. */
type SystemToken = { path: string; name: string; line: number; css: string; form: Form };
/** A colour that both themes give: its CSS name, and the name of each member that exists. */
type SystemRole = { path: string; name: string; line: number; light: string | null; dark: string | null };

export type System = {
  /** The document, from the project's top. */
  file: string;
  /** The version the document names; `alpha` when it names none. */
  version: string;
  /** Every token placed, in the order of the document's lines. */
  tokens: SystemToken[];
  /** The colour roles, each joining a light and a dark member, after every token. */
  roles: SystemRole[];
  /** Each key of `components`, with its line, and whether the document has the key at all. */
  components: { name: string; line: number }[];
  hasComponents: boolean;
  sections: DesignMdSection[];
  /** The line of `colors`, and whether it holds a light group and a dark group. */
  colorsLine: number;
  groups: { light: boolean; dark: boolean };
  /** The document's findings, each at its line. */
  findings: SystemIssue[];
};

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const NODES = 10_000;
const LEVELS = 20;
const REFERENCE_STEPS = 20;
const FUNCTION_LEVELS = 4;
const NUMBER = "-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)";
const DIMENSION = new RegExp(`^${NUMBER}(?:px|em|rem)$`);
const LOOSE = new RegExp(`^${NUMBER}(?:[A-Za-z]+|%)?$`);
const PLAIN = new RegExp(`^${NUMBER}$`);
const TIME = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)ms$/;
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOUR_FUNCTIONS = new Set("rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix".split(" "));
const GENERIC = new Set("serif sans-serif monospace cursive fantasy system-ui ui-serif ui-sans-serif ui-monospace ui-rounded math emoji fangsong".split(" "));
const EASING = new Set("linear ease ease-in ease-out ease-in-out step-start step-end".split(" "));
const BEZIER = new RegExp(`^cubic-bezier\\(\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*\\)$`);
const STEPS = /^steps\(\s*[0-9]+\s*(?:,\s*(?:jump-start|jump-end|jump-none|jump-both|start|end)\s*)?\)$/;
const REFERENCE = /^\{([^{}]+)\}$/;
const TYPOGRAPHY = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "fontFeature", "fontVariation"] as const;
const MOTION = ["duration", "delay", "timingFunction"] as const;

const TAKES = {
  colour: { what: "a colour", forms: ["colour"] },
  dimension: { what: "a dimension", forms: ["dimension", "number"] },
  size: { what: "a dimension", forms: ["dimension"] },
  leading: { what: "a line height", forms: ["dimension", "number"] },
  family: { what: "a font family", forms: ["family"] },
  weight: { what: "a font weight", forms: ["weight"] },
  feature: { what: "a font feature", forms: ["feature"] },
  time: { what: "a duration", forms: ["time"] },
  easing: { what: "a timing function", forms: ["easing"] },
  typography: { what: "a typography token", forms: ["typography"] },
  any: { what: "a colour or a dimension", forms: ["colour", "dimension", "number"] },
} as const satisfies Record<string, Takes>;
/** What a place of the document takes, by name: a key of `TAKES`. */
type PlaceTakes = keyof typeof TAKES;
const FORM_WORDS: Record<Form, string> = {
  colour: "a colour",
  dimension: "a dimension",
  number: "a number",
  family: "a font family",
  weight: "a font weight",
  feature: "a font feature",
  time: "a duration",
  easing: "a timing function",
  typography: "a typography token",
};
const HOW: Record<PlaceTakes, string> = {
  colour: 'which is no colour: write a hex such as "#1d4ed8", a colour\'s name, or rgb(), hsl(), oklch(), or color-mix() of numbers',
  dimension: "which is no dimension: write a number with px, em, or rem, such as 16px",
  size: "which is no dimension: write a number with px, em, or rem, such as 16px",
  leading: "which is no line height: write a number, such as 1.5, or a dimension, such as 24px",
  family: "which is no font family: write names of letters, digits, spaces, -, _, and ., separated by commas, such as Inter, sans-serif",
  weight: "which is no font weight: write a whole number from 1 to 1000, such as 400",
  feature: 'which is no font feature: write letters, digits, spaces, paired quotes, and commas, such as "liga" 1',
  time: "which is no duration: write a number of milliseconds, such as 200ms",
  easing: "which is no timing function: write a keyword, such as ease-out, or cubic-bezier() or steps() of numbers",
  typography: "which is no reference to a typography token: write one, such as {typography.body}",
  any: "which is no colour or dimension",
};
// A component's known properties, and what each takes.
const COMPONENT: Record<string, PlaceTakes> = {
  backgroundColor: "colour",
  textColor: "colour",
  rounded: "dimension",
  padding: "dimension",
  size: "dimension",
  height: "dimension",
  width: "dimension",
  typography: "typography",
};

/** A value of the document's YAML, as the YAML reader gives it: no shape is known until it is checked. */
type YamlValue = unknown;
type Candidate = { path: string; segments: string[]; prefix: string; suffix: string; line: number; raw: YamlValue; takes: PlaceTakes; whole?: string[] };

const isMap = (value: YamlValue): value is Record<string, YamlValue> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Whether a text is one colour function, its inside of numbers, words, and these functions again, at most four deep. */
function colourFunction(text: string, level: number): boolean {
  const open = /^([A-Za-z-]+)\(/.exec(text);
  if (!open || level > FUNCTION_LEVELS || !COLOUR_FUNCTIONS.has((open[1] ?? "").toLowerCase()) || !text.endsWith(")")) return false;
  const inner = text.slice(open[0].length, -1);
  for (let index = 0; index < inner.length; ) {
    const name = /^[A-Za-z-]+\(/.exec(inner.slice(index));
    if (name) {
      let depth = 0;
      let end = index + name[0].length - 1;
      for (; end < inner.length; end++) {
        depth += Number(inner[end] === "(") - Number(inner[end] === ")");
        if (depth === 0) break;
      }
      if (depth !== 0 || !colourFunction(inner.slice(index, end + 1), level + 1)) return false;
      index = end + 1;
    } else if (/[0-9A-Za-z#%.,/+\- ]/.test(inner[index] ?? "")) index++;
    else return false;
  }
  return true;
}

function isColour(text: string): boolean {
  return HEX.test(text) || namedColor(text) || text.toLowerCase() === "transparent" || colourFunction(text, 1);
}

/** A value of a place, written for the page, with its form; or null when it has no form the place takes. */
function written(takes: PlaceTakes, raw: YamlValue): { css: string; form: Form } | null {
  const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : null;
  if (text === null || text === "") return null;
  switch (takes) {
    case "colour":
      return typeof raw === "string" && isColour(text) ? { css: text, form: "colour" } : null;
    case "dimension":
      return LOOSE.test(text) ? { css: text, form: PLAIN.test(text) ? "number" : "dimension" } : null;
    case "size":
      return DIMENSION.test(text) ? { css: text, form: "dimension" } : null;
    case "leading":
      return DIMENSION.test(text) ? { css: text, form: "dimension" } : PLAIN.test(text) ? { css: text, form: "number" } : null;
    case "weight":
      return /^[0-9]{1,4}$/.test(text) && Number(text) >= 1 && Number(text) <= 1000 ? { css: String(Number(text)), form: "weight" } : null;
    case "family": {
      if (typeof raw !== "string") return null;
      const families = text
        .split(",")
        .map((part) => part.trim())
        .map((part) => (/^(["']).*\1$/.test(part) && part.length >= 2 ? part.slice(1, -1).trim() : part));
      if (families.some((family) => !/^[A-Za-z0-9 _.-]+$/.test(family))) return null;
      return { css: families.map((family) => (GENERIC.has(family.toLowerCase()) ? family : `"${family}"`)).join(", "), form: "family" };
    }
    case "feature":
      return typeof raw === "string" && /^[A-Za-z0-9 ",]+$/.test(text) && (text.match(/"/g)?.length ?? 0) % 2 === 0 ? { css: text, form: "feature" } : null;
    case "time":
      return TIME.test(text) ? { css: text, form: "time" } : null;
    case "easing":
      return EASING.has(text) || BEZIER.test(text) || STEPS.test(text) ? { css: text, form: "easing" } : null;
    case "typography":
      return null;
    case "any":
      return written("colour", raw) ?? (LOOSE.test(text) ? { css: text, form: PLAIN.test(text) ? "number" : "dimension" } : null);
  }
}

/** The tree's size: past the limits, the walk stops, so an alias that YAML shares is never counted for ever. */
function tooLarge(value: YamlValue): boolean {
  const todo: [YamlValue, number][] = [[value, 0]];
  let nodes = 0;
  while (todo.length) {
    const [node, level] = todo.pop() ?? [null, 0];
    if (++nodes > NODES || level > LEVELS) return true;
    if (Array.isArray(node)) for (const item of node) todo.push([item, level + 1]);
    else if (isMap(node)) for (const item of Object.values(node)) todo.push([item, level + 1]);
  }
  return false;
}

/** What every phase of the read shares: the system it fills, the words of the lint step, and the line of each path. */
type Reading = { system: System; lint: string; lineOf: (path: string) => number };

function issue(reading: Reading, rule: RuleId, line: number, message: string): void {
  reading.system.findings.push({ rule, line, message });
}

function valueIssue(reading: Reading, path: string[], message: string): void {
  issue(reading, "system.value", reading.lineOf(path.join(".")), message);
}

/**
 * The first phase: the document's blocks as one tree of top-level keys, and the line of each path, or null when the
 * format rejects the file, as when a top-level key is written in two blocks.
 */
function collect(system: System, file: string, blocks: DesignMdBlock[]): { tree: Record<string, YamlValue>; reading: Reading } | null {
  const lint = `\`npx @google/design.md lint ${file}\``;
  const lines = new Map<string, number>();
  const blockOf = new Map<string, number>();
  const tree: Record<string, YamlValue> = {};
  const say = (rule: RuleId, line: number, message: string) => system.findings.push({ rule, line, message });
  let rejected = false;
  for (const [index, block] of blocks.entries()) {
    const what = index === 0 && block.line === 1 ? "its front matter" : `its yaml block at line ${block.line}`;
    if (block.error) {
      say("system.read", block.line, `${what} is not YAML (${quoted(block.error)}): fix it, then run ${lint}`);
      continue;
    }
    if (block.value === null || block.value === undefined) continue;
    if (!isMap(block.value)) {
      say("system.read", block.line, `${what} holds no map of keys: write \`key: value\` lines, such as \`colors:\`, then run ${lint}`);
      continue;
    }
    if (tooLarge(block.value)) {
      say(
        "system.read",
        block.line,
        `${what} is nested more than ${LEVELS} levels deep, or holds more than ${NODES.toLocaleString("en-US")} values: keep the tokens a design reads`,
      );
      continue;
    }
    const seen = new Map<string, number>();
    for (const key of block.keys) {
      if (key.path.includes("[")) continue;
      const first = seen.get(key.path);
      if (first !== undefined)
        say("system.read", key.line, `writes \`${quoted(key.path)}\` twice, at lines ${first} and ${key.line}; YAML keeps the last: keep one`);
      else seen.set(key.path, key.line);
      lines.set(key.path, key.line);
    }
    for (const [key, value] of Object.entries(block.value)) {
      const earlier = blockOf.get(key);
      if (earlier !== undefined) {
        rejected = true;
        say(
          "system.read",
          block.line,
          `writes the top-level key \`${quoted(key)}\` again, after the block at line ${earlier}: the format rejects such a file, so none of its tokens is read; keep each key in one block`,
        );
        continue;
      }
      blockOf.set(key, block.line);
      tree[key] = value;
    }
  }
  const lineOf = (path: string): number => {
    for (let parts = path.split("."); parts.length; parts = parts.slice(0, -1)) {
      const found = lines.get(parts.join("."));
      if (found !== undefined) return found;
    }
    return blockOf.get(path.split(".")[0] ?? "") ?? 1;
  };
  return rejected ? null : { tree, reading: { system, lint, lineOf } };
}

/** Each key of a path is a segment of a CSS name: a segment of another shape, or a name JavaScript keeps for itself, is left out. */
function safe(reading: Reading, full: string[]): boolean {
  const bad = full.slice(1).find((part) => UNSAFE_KEYS.has(part) || !SEGMENT.test(part));
  if (bad === undefined) return true;
  const line = reading.lineOf(full.join("."));
  if (UNSAFE_KEYS.has(bad))
    issue(reading, "system.name", line, `\`${quoted(full.join("."))}\` holds the key \`${bad}\`, a name the tool never reads: rename it`);
  else
    issue(
      reading,
      "system.name",
      line,
      `\`${quoted(full.join("."))}\` holds the key \`${quoted(bad)}\`, which a CSS name cannot take: use letters, digits, and hyphens, starting with a letter or a digit`,
    );
  return false;
}

const TYPE_PLACES: Record<(typeof TYPOGRAPHY)[number], [prefix: string, takes: PlaceTakes]> = {
  fontFamily: ["--font-", "family"],
  fontSize: ["--text-", "size"],
  lineHeight: ["--leading-", "leading"],
  letterSpacing: ["--tracking-", "size"],
  fontWeight: ["--font-weight-", "weight"],
  fontFeature: ["--font-feature-", "feature"],
  fontVariation: ["--font-variation-", "feature"],
};
const MOTION_PLACES: Record<(typeof MOTION)[number], [suffix: string, takes: PlaceTakes]> = {
  duration: ["-duration", "time"],
  delay: ["-delay", "time"],
  timingFunction: ["-timing-function", "easing"],
};

/** The second phase: every place of the tree that may become a token, each with the form it takes, and the component keys. */
function candidatesOf(reading: Reading, tree: Record<string, YamlValue>): Candidate[] {
  const { system, lineOf } = reading;
  const candidates: Candidate[] = [];

  // colors, spacing, rounded: a scalar is a token, a map a group.
  const plain = (group: string, prefix: string, takes: PlaceTakes) => {
    const walk = (node: YamlValue, path: string[]) => {
      for (const [key, item] of Object.entries(node as Record<string, YamlValue>)) {
        const at = [...path, key];
        if (!safe(reading, at)) continue;
        if (isMap(item)) walk(item, at);
        else if (Array.isArray(item))
          valueIssue(reading, at, `\`${quoted(at.join("."))}\` is a list, and a token is one value: write one, or a group of named tokens`);
        else candidates.push({ path: at.join("."), segments: at.slice(1), prefix, suffix: "", line: lineOf(at.join(".")), raw: item, takes });
      }
    };
    if (isMap(tree[group])) walk(tree[group], [group]);
  };
  plain("colors", "--color-", "colour");
  plain("spacing", "--spacing-", "dimension");
  plain("rounded", "--radius-", "dimension");

  // typography and motion: a map with a known property is a token, one of maps a group, and one with both is neither.
  const tokens = (group: string, known: readonly string[], each: (path: string[], node: Record<string, YamlValue>) => void) => {
    const walk = (node: Record<string, YamlValue>, path: string[]) => {
      for (const [key, item] of Object.entries(node)) {
        const at = [...path, key];
        if (!isMap(item) || !safe(reading, at)) continue;
        const own = Object.keys(item).filter((name) => known.includes(name));
        const inner = Object.values(item).some(isMap);
        if (own.length && inner)
          valueIssue(reading, at, `\`${quoted(at.join("."))}\` holds both a token's properties and other tokens: move the tokens into a group of their own`);
        else if (own.length) each(at, item);
        else if (inner) walk(item, at);
      }
    };
    if (isMap(tree[group])) walk(tree[group], [group]);
  };
  tokens("typography", TYPOGRAPHY, (path, node) => {
    for (const property of TYPOGRAPHY) {
      if (node[property] === undefined) continue;
      const [prefix, takes] = TYPE_PLACES[property];
      candidates.push({
        path: `${path.join(".")}.${property}`,
        segments: path.slice(1),
        prefix,
        suffix: "",
        line: lineOf(`${path.join(".")}.${property}`),
        raw: node[property],
        takes,
      });
    }
    candidates.push({
      path: path.join("."),
      segments: path.slice(1),
      prefix: "--typography-",
      suffix: "",
      line: lineOf(path.join(".")),
      raw: null,
      takes: "typography",
      whole: TYPOGRAPHY.filter((property) => node[property] !== undefined),
    });
  });
  tokens("motion", MOTION, (path, node) => {
    for (const property of MOTION) {
      if (node[property] === undefined) continue;
      const [suffix, takes] = MOTION_PLACES[property];
      candidates.push({
        path: `${path.join(".")}.${property}`,
        segments: path.slice(1),
        prefix: "--motion-",
        suffix,
        line: lineOf(`${path.join(".")}.${property}`),
        raw: node[property],
        takes,
      });
    }
  });
  if (isMap(tree.components)) {
    system.hasComponents = true;
    for (const [name, node] of Object.entries(tree.components)) {
      if (!safe(reading, ["components", name])) continue;
      system.components.push({ name, line: lineOf(`components.${name}`) });
      if (!isMap(node)) continue;
      for (const [property, raw] of Object.entries(node)) {
        if (isMap(raw) || Array.isArray(raw) || !safe(reading, ["components", name, property])) continue;
        candidates.push({
          path: `components.${name}.${property}`,
          segments: [name, kebabCase(property)],
          prefix: "--component-",
          suffix: "",
          line: lineOf(`components.${name}.${property}`),
          raw,
          takes: COMPONENT[property] ?? "any",
        });
      }
    }
  } else system.hasComponents = tree.components !== undefined;
  return candidates;
}

/** A candidate with its CSS name, and its own value and form, or the path of the token it names. */
type Entry = Candidate & { name: string; css: string; form: Form | null; target: string };
type Entries = { entries: Entry[]; byPath: Map<string, Entry>; byName: Map<string, Entry> };

/** The third phase: each candidate's own form, or the reference it names, in line order; a name two candidates take is the first's. */
function entriesOf(reading: Reading, candidates: Candidate[]): Entries {
  const asWritten = (raw: YamlValue): string => (typeof raw === "string" ? quoted(raw) : quoted(JSON.stringify(raw) ?? "null"));
  const byPath = new Map<string, Entry>();
  const byName = new Map<string, Entry>();
  const entries: Entry[] = [];
  for (const candidate of candidates.sort((a, b) => a.line - b.line)) {
    const name = `${candidate.prefix}${candidate.segments.join("-")}${candidate.suffix}`;
    const other = byName.get(name);
    if (other) {
      issue(reading, "system.name", candidate.line, `\`${quoted(other.path)}\` and \`${quoted(candidate.path)}\` both become ${name}: rename one`);
      continue;
    }
    const entry: Entry = { ...candidate, name, css: "", form: null, target: "" };
    if (candidate.whole) entry.form = "typography";
    else {
      const reference = typeof candidate.raw === "string" ? REFERENCE.exec(candidate.raw.trim()) : null;
      if (reference) entry.target = (reference[1] ?? "").trim();
      else {
        const read = written(candidate.takes, candidate.raw);
        if (read) Object.assign(entry, read);
        else if (candidate.raw === null && candidate.takes === "colour") {
          valueIssue(
            reading,
            candidate.path.split("."),
            `\`${quoted(candidate.path)}\` is empty, as YAML reads an unquoted # as a comment: quote it, such as "#1d4ed8"`,
          );
          continue;
        } else if (candidate.takes === "any")
          continue; // an unknown property of a component takes a colour or a dimension, and is left out otherwise
        else {
          valueIssue(reading, candidate.path.split("."), `\`${quoted(candidate.path)}\` is \`${asWritten(candidate.raw)}\`, ${HOW[candidate.takes]}`);
          continue;
        }
      }
    }
    byName.set(name, entry);
    byPath.set(entry.path, entry);
    entries.push(entry);
  }
  return { entries, byPath, byName };
}

/**
 * The fourth phase: how a reference resolves, through its chain to a token with a value of a form its place takes. A
 * reference that does not resolve is a finding, told once; it resolves to null.
 */
function resolverOf(reading: Reading, { entries, byPath }: Entries): (entry: Entry) => Entry | null {
  const isGroup = (path: string): boolean => entries.some((entry) => entry.path.startsWith(`${path}.`));
  const resolved = new Map<Entry, Entry | null>();
  const resolve = (entry: Entry): Entry | null => {
    if (!entry.target) return entry;
    if (resolved.has(entry)) return resolved.get(entry) ?? null;
    let current: Entry = entry;
    const chain = new Set<Entry>([entry]);
    let why = "";
    for (let steps = 0; current.target; steps++) {
      const next = byPath.get(current.target);
      if (steps >= REFERENCE_STEPS) why = `which is more than ${REFERENCE_STEPS} references deep: name the token itself`;
      else if (!next)
        why = isGroup(current.target)
          ? "which is a group of tokens, not one: name one of them"
          : "which DESIGN.md does not define: add it, or name a token it holds";
      else if (chain.has(next)) why = "which leads back to itself: name a token with a value";
      if (why || !next) break;
      chain.add(next);
      current = next;
    }
    const takes: Takes = TAKES[entry.takes];
    if (!why && current.form && !takes.forms.includes(current.form)) why = `which is ${FORM_WORDS[current.form]}, where ${takes.what} goes`;
    // A typography token is a whole font only with a family and a size that each resolve: else the page writes none.
    const part = (property: string) => {
      const found = byPath.get(`${current.path}.${property}`);
      return found !== undefined && found !== current && resolve(found) !== null;
    };
    if (!why && current.whole && !(part("fontFamily") && part("fontSize")))
      why = "which lacks a fontFamily or a fontSize that resolves, so it is no whole font: give it both";
    resolved.set(entry, why ? null : current);
    const through = current !== entry && current.target ? `, which names {${quoted(current.target)}}` : "";
    if (why) issue(reading, "system.reference", entry.line, `\`${quoted(entry.path)}\` names {${quoted(entry.target)}}${through}, ${why}`);
    return why ? null : current;
  };
  return resolve;
}

/** The fifth phase: the colour roles, each path both theme groups hold, or each path of the one group there is. */
function rolesOf(reading: Reading, tree: Record<string, YamlValue>, kept: Entry[], { byPath, byName }: Entries): void {
  const { system } = reading;
  const colours = isMap(tree.colors) ? tree.colors : {};
  system.groups = { light: isMap(colours.light), dark: isMap(colours.dark) };
  const members = (theme: string) =>
    kept.filter((entry) => entry.path.startsWith(`colors.${theme}.`)).map((entry) => entry.path.slice(`colors.${theme}.`.length));
  const light = members("light");
  const dark = members("dark");
  const lightPaths = new Set(light);
  const darkPaths = new Set(dark);
  const both = system.groups.light && system.groups.dark;
  const paths = both ? light.filter((path) => darkPaths.has(path)) : system.groups.light ? light : system.groups.dark ? dark : [];
  for (const path of paths) {
    const name = `--color-${path.split(".").join("-")}`;
    const lightName = lightPaths.has(path) ? `--color-light-${path.split(".").join("-")}` : null;
    const darkName = darkPaths.has(path) ? `--color-dark-${path.split(".").join("-")}` : null;
    const line = byPath.get(`colors.${lightName ? "light" : "dark"}.${path}`)?.line ?? system.colorsLine;
    const flat = byName.get(name);
    if (flat) {
      issue(
        reading,
        "system.name",
        line,
        `\`${quoted(flat.path)}\` and the role of colors.light.${quoted(path)} and colors.dark.${quoted(path)} both become ${name}: rename one`,
      );
      continue;
    }
    system.roles.push({ path: `colors.${path}`, name, line, light: lightName, dark: darkName });
  }
}

/**
 * The last phase: each kept token, in line order, its value as the page writes it; a reference names its target's CSS
 * name, so a chain stays live. A reference to a theme's member reads the member's role, so it follows the theme, but
 * from a member of a theme it reads the member it names: the role would lead back to the member itself, or to the
 * other theme's value.
 */
function placeTokens(system: System, kept: Entry[], { byPath }: Entries, resolve: (entry: Entry) => Entry | null): void {
  const keptPaths = new Set(kept.map((entry) => entry.path));
  const roleOf = new Map<string, string>();
  for (const role of system.roles) for (const member of [role.light, role.dark]) if (member) roleOf.set(member, role.name);
  for (const entry of kept.sort((a, b) => a.line - b.line)) {
    let css = entry.css;
    let form = entry.form;
    if (entry.whole) {
      const part = (property: string) => (keptPaths.has(`${entry.path}.${property}`) ? (byPath.get(`${entry.path}.${property}`)?.name ?? "") : "");
      const family = part("fontFamily");
      const size = part("fontSize");
      if (!family || !size) continue;
      const weight = part("fontWeight");
      const leading = part("lineHeight");
      css = `${weight ? `var(${weight}) ` : ""}var(${size})${leading ? `/var(${leading})` : ""} var(${family})`;
    } else if (entry.target) {
      const target = byPath.get(entry.target);
      const end = resolve(entry);
      if (!target || !end) continue;
      const member = entry.path.startsWith("colors.light.") || entry.path.startsWith("colors.dark.");
      css = `var(${(member ? undefined : roleOf.get(target.name)) ?? target.name})`;
      form = end.form;
    }
    system.tokens.push({ path: entry.path, name: entry.name, line: entry.line, css, form: form ?? "dimension" });
  }
}

/** Read the document's blocks into tokens, roles, components, and findings, in its phases: collect, candidates, entries, references, roles, and tokens. */
export function readSystem(file: string, blocks: DesignMdBlock[], sections: DesignMdSection[], problem = ""): System {
  const system: System = {
    file,
    version: DESIGN_MD_VERSION,
    tokens: [],
    roles: [],
    components: [],
    hasComponents: false,
    sections,
    colorsLine: 1,
    groups: { light: false, dark: false },
    findings: [],
  };
  if (problem) {
    system.findings.push({ rule: "system.read", line: 1, message: problem });
    return system;
  }
  const collected = collect(system, file, blocks);
  if (!collected) return system;
  const { tree, reading } = collected;
  if (tree.version !== undefined && tree.version !== null) {
    system.version = typeof tree.version === "string" ? tree.version : String(tree.version);
    if (system.version !== DESIGN_MD_VERSION)
      issue(
        reading,
        "system.version",
        reading.lineOf("version"),
        `written for DESIGN.md version ${quoted(system.version)}; this tool reads ${DESIGN_MD_VERSION}, so it reads the keys it knows`,
      );
  }
  system.colorsLine = reading.lineOf("colors");
  const entries = entriesOf(reading, candidatesOf(reading, tree));
  const resolve = resolverOf(reading, entries);
  const kept = entries.entries.filter((entry) => (entry.whole ? true : resolve(entry) !== null));
  rolesOf(reading, tree, kept, entries);
  placeTokens(system, kept, entries, resolve);
  const problems = system.findings.some((item) => item.rule !== "system.version");
  if (!system.tokens.length && !problems)
    issue(reading, "system.empty", 1, `${file} holds no tokens: add front matter, as \`${PROGRAM} new-design-md\` writes it`);
  system.findings.sort((a, b) => a.line - b.line);
  return system;
}

/** Whether a role takes `light-dark()` for a design that declares these themes: both members, and both themes. */
function joins(role: SystemRole, themes: readonly string[]): boolean {
  return Boolean(role.light && role.dark && themes.includes("light") && themes.includes("dark"));
}

/** The member a role reads for a design that does not show both themes: the declared theme's, else the one there is. */
function memberOf(role: SystemRole, themes: readonly string[]): string {
  const declared = themes.includes("dark") && !themes.includes("light") ? role.dark : themes.includes("light") && !themes.includes("dark") ? role.light : null;
  return declared ?? role.light ?? role.dark ?? "";
}

/** The document's tokens as one `:root` rule, in the order of its lines, roles last, for a design that declares these themes. */
export function systemCss(system: System, themes: readonly string[]): string {
  if (!system.tokens.length) return "";
  const lines = system.tokens.map((token) => `  ${token.name}: ${token.css};`);
  const roles = system.roles.map(
    (role) => `  ${role.name}: ${joins(role, themes) ? `light-dark(var(${role.light}), var(${role.dark}))` : `var(${memberOf(role, themes)})`};`,
  );
  const scheme = system.roles.some((role) => joins(role, themes)) ? ["  color-scheme: light dark;"] : [];
  return [":root {", ...scheme, ...lines, ...roles, "}"].join("\n");
}

/** Each name the document gives, roles among them. */
export function systemNames(system: System): Set<string> {
  return new Set([...system.tokens.map((token) => token.name), ...system.roles.map((role) => role.name)]);
}

/** The document's roles and tokens by name, the first of each name, built once for each document it reads. */
const NAMED = new WeakMap<System, { count: number; roles: Map<string, SystemRole>; tokens: Map<string, SystemToken> }>();
function byName(system: System): { roles: Map<string, SystemRole>; tokens: Map<string, SystemToken> } {
  const count = system.roles.length + system.tokens.length;
  const known = NAMED.get(system);
  if (known && known.count === count) return known;
  const first = <T extends { name: string }>(items: T[]) => {
    const out = new Map<string, T>();
    for (const item of items) if (!out.has(item.name)) out.set(item.name, item);
    return out;
  };
  const built = { count, roles: first(system.roles), tokens: first(system.tokens) };
  NAMED.set(system, built);
  return built;
}

/**
 * A name's value in a theme, every `var()` of the document followed to a value of its own: a role takes its member of
 * that theme, or the one it has; "" for a name the document does not give.
 */
export function literal(system: System, name: string, theme: Theme, depth = 0): string {
  if (depth > REFERENCE_STEPS) return "";
  const { roles, tokens } = byName(system);
  const role = roles.get(name);
  if (role) return literal(system, (theme === "dark" ? (role.dark ?? role.light) : (role.light ?? role.dark)) ?? "", theme, depth + 1);
  const token = tokens.get(name);
  if (!token) return "";
  return followVars(token.css, (inner) => literal(system, inner, theme, depth + 1) || undefined, { fallbacks: false, keep: true }) ?? "";
}

/** Each colour role's member name, with the role's name: a suggestion names the role a design reads, never its member. */
export function roleNames(system: System | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const role of system?.roles ?? []) for (const member of [role.light, role.dark]) if (member) out.set(member, role.name);
  return out;
}

/** The document's findings as findings of its file, each at its line: none when the project has no document. */
export function documentFindings(system: System | null): Finding[] {
  return (system?.findings ?? []).map((item) => finding(item.rule, item.message, system?.file ?? null, item.line));
}

/** The document's shape: each token, roles last, with its literal in each theme; its component keys; its headings. */
export function systemShape(system: System): SystemShape {
  const entry = (path: string, name: string, line: number): SystemTokenShape => ({
    path,
    name,
    line,
    light: literal(system, name, "light"),
    dark: literal(system, name, "dark"),
  });
  return {
    file: system.file,
    version: system.version,
    tokens: [...system.tokens.map((token) => entry(token.path, token.name, token.line)), ...system.roles.map((role) => entry(role.path, role.name, role.line))],
    components: system.components.map((item) => ({ name: item.name, line: item.line })),
    sections: system.sections.map((item) => ({ heading: item.heading, line: item.line })),
  };
}
