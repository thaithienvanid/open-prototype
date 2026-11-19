// A design's tokens, read from the text of its tokens block for the System view. Pure.
import { SYSTEM_THEME_RULE, THEME_RULE } from "./names.ts";

export type Token = { name: string; themes: Record<string, string>; light: string; dark: string };

/**
 * Where a quoted string that opens at `at` ends, past its closing quote: a backslash escapes the next character. The
 * viewer imports the tool only through `names.ts`, so it keeps this copy of `stringEnd` in `src/css/sheet.ts`, which
 * returns the quote itself and ends a string at its line too.
 */
function stringEnd(css: string, at: number): number {
  const quote = css[at];
  let i = at + 1;
  while (i < css.length && css[i] !== quote) i += css[i] === "\\" ? 2 : 1;
  return Math.min(css.length, i + 1);
}

/** The declarations of a block's text, split at each `;` outside a string and outside brackets, so a `url()` keeps its `;`. */
function declarations(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") i = stringEnd(text, i) - 1;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  return parts.concat(text.slice(from));
}

/** Under the system's dark setting: a value of the dark theme, unless a rule of the theme itself names one. */
const SYSTEM_DARK = /prefers-color-scheme\s*:\s*dark/;

/**
 * Each custom property of the style text, with its value in each theme. A block's text is read outside its comments and
 * its strings, so a `}` in a string or a `;` in a `url()` never ends a value. A value under reduced motion is the same
 * token again and is left out, and so is one under the system's dark setting that the tool's own rule of the dark theme
 * repeats; one under the system's dark setting alone is the dark value.
 */
export function readTokens(styleText: string): Token[] {
  const css = styleText;
  const found = new Map<string, { name: string; themes: Record<string, string>; system: string }>();
  const context: string[] = [];
  let pending = "";
  const read = (text: string) => {
    const where = context.join(" ");
    if (/prefers-reduced-motion/.test(where) || SYSTEM_THEME_RULE.test(where)) return;
    const named = THEME_RULE.exec(where)?.[1];
    for (const declaration of declarations(text)) {
      const match = /^\s*(--[\w-]+)\s*:([\s\S]*)$/.exec(declaration);
      if (!match) continue;
      const [, name = "", value = ""] = match;
      const entry = found.get(name) ?? { name, themes: {}, system: "" };
      if (!named && SYSTEM_DARK.test(where)) entry.system = value.trim();
      else entry.themes[named ?? "light"] = value.trim();
      found.set(name, entry);
    }
  };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 1;
      pending += " ";
    } else if (ch === '"' || ch === "'") {
      const end = stringEnd(css, i);
      pending += css.slice(i, end);
      i = end - 1;
    } else if (ch === "{") {
      // The text before a nested block holds the declarations before it, then the block's own selector or rule.
      const cut = declarations(pending);
      read(cut.slice(0, -1).join(";"));
      context.push((cut.at(-1) ?? "").trim());
      pending = "";
    } else if (ch === "}") {
      read(pending);
      context.pop();
      pending = "";
    } else pending += ch;
  }
  return [...found.values()].map(({ name, themes: given, system }) => {
    const themes = system && given.dark === undefined ? { ...given, dark: system } : given;
    return { name, themes, light: themes.light || Object.values(themes)[0] || "", dark: themes.dark || "" };
  });
}

/** Where the bracket that opens at `open` closes, or -1: a string inside is skipped. */
function closeOf(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") i = stringEnd(text, i) - 1;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}

/** A value with each call of the function `name` replaced, or null when a call is not closed or `replace` gives null. */
function replaceCalls(value: string, name: string, replace: (args: string[]) => string | null): string | null {
  const call = new RegExp(`(?<![\\w-])${name}\\(`, "gi");
  let out = "";
  let from = 0;
  for (let found = call.exec(value); found; found = call.exec(value)) {
    const open = found.index + found[0].length - 1;
    const close = closeOf(value, open);
    if (close < 0) return null;
    const args: string[] = [];
    let depth = 0;
    let start = open + 1;
    for (let i = open + 1; i < close; i++) {
      const ch = value[i];
      if (ch === '"' || ch === "'") i = stringEnd(value, i) - 1;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        args.push(value.slice(start, i));
        start = i + 1;
      }
    }
    args.push(value.slice(start, close));
    const replaced = replace(args);
    if (replaced === null) return null;
    out += value.slice(from, found.index) + replaced;
    from = close + 1;
    call.lastIndex = from;
  }
  return out + value.slice(from);
}

/** How many tokens an alias is followed through before it counts as no value: a cycle ends there too. */
const ALIAS_STEPS = 16;

/**
 * The value the System view paints for a token on one side, light or dark: each `var()` resolved against the design's
 * tokens, its fallback when the design has no such token, and each `light-dark()` as its side. A value that does not
 * resolve is "", which paints nothing, so a name is never read from the viewer's own custom properties.
 */
export function paintOf(token: Pick<Token, "light" | "dark">, side: "light" | "dark", byName: ReadonlyMap<string, Pick<Token, "light" | "dark">>): string {
  const sideOf = (of: Pick<Token, "light" | "dark">) => (side === "dark" && of.dark ? of.dark : of.light);
  const resolve = (value: string, steps: number): string | null =>
    replaceCalls(value, "var", ([name = "", ...fallback]) => {
      const named = byName.get(name.trim());
      const next = named ? sideOf(named) : fallback.length ? fallback.join(",") : null;
      return next === null || steps <= 0 ? null : resolve(next.trim(), steps - 1);
    });
  let value = resolve(sideOf(token), ALIAS_STEPS);
  for (let step = 0; value !== null && /light-dark\(/i.test(value) && step < ALIAS_STEPS; step++)
    value = replaceCalls(value, "light-dark", (args) => (args.length === 2 ? (args[side === "light" ? 0 : 1] ?? "").trim() : null));
  return value === null || /(?<![\w-])(var|light-dark)\(/i.test(value) ? "" : value.trim();
}

/** The groups the System view lists tokens in, by id, each with the names it takes (words.ts gives each its label). A design's illustration colours are a group of their own. */
export const TOKEN_GROUPS: readonly (readonly [string, RegExp])[] = [
  ["color", /^--colou?r-(?!illustration-)/],
  ["illustration", /^--colou?r-illustration-/],
  ["spacing", /^--spac(?:e|ing)/],
  ["radius", /^--radius/],
  ["typography", /^--(font|typography|text|line|leading|tracking)/],
  ["motion", /^--(duration|ease|motion)/],
  ["size", /^--size/],
  ["component", /^--component-/],
  ["other", /./],
];

/** A token of the design document as the page config holds it: its path, CSS name, line, and value in each theme. */
type DocumentToken = { path: string; name: string; line: number; light: string; dark: string };
/** The design document as the page config holds it, or null. */
export type DocumentShape = { file: string; version: string; tokens: DocumentToken[]; components: { name: string; line: number }[] };

/**
 * A source of tokens, in the order the build places them: the design document, each token file, then the design's own
 * tokens blocks. A document token keeps its path and line, and a role names the two members it joins.
 */
export type TokenSource = {
  kind: "design-md" | "file" | "design";
  file: string;
  version: string;
  tokens: Token[];
  paths: Record<string, { path: string; line: number; joins: string[] }>;
};

/** The sources of the System view: the document's tokens from its shape, never from the CSS the tool wrote for it. */
export function tokenSources(files: readonly { file: string; css: string }[], designMd: DocumentShape | null, own: string): TokenSource[] {
  const sources: TokenSource[] = [];
  if (designMd) {
    const names = new Set(designMd.tokens.map((token) => token.name));
    const paths: TokenSource["paths"] = {};
    for (const token of designMd.tokens) {
      const role = /^--color-(.+)$/.exec(token.name)?.[1] ?? "";
      const joins =
        role && !/^colors\.(light|dark)\./.test(token.path) ? [`--color-light-${role}`, `--color-dark-${role}`].filter((name) => names.has(name)) : [];
      paths[token.name] = { path: token.path, line: token.line, joins };
    }
    sources.push({
      kind: "design-md",
      file: designMd.file,
      version: designMd.version,
      paths,
      tokens: designMd.tokens.map((token) => ({
        name: token.name,
        themes: token.dark && token.dark !== token.light ? { light: token.light, dark: token.dark } : { light: token.light },
        light: token.light,
        dark: token.dark && token.dark !== token.light ? token.dark : "",
      })),
    });
  }
  for (const file of files) {
    if (designMd && file.file === designMd.file) continue;
    sources.push({ kind: "file", file: file.file, version: "", paths: {}, tokens: readTokens(file.css) });
  }
  const mine = readTokens(own);
  if (mine.length) sources.push({ kind: "design", file: "", version: "", paths: {}, tokens: mine });
  return sources;
}
