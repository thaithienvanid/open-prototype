// A design's tokens, read from the text of its tokens block for the System view. Pure.
import { SYSTEM_THEME_RULE, THEME_RULE } from "./names.ts";

export type Token = { name: string; themes: Record<string, string>; light: string; dark: string };

/** Each custom property of the style text, with its value in each theme. A value under reduced motion, or under the system's own dark setting, is the same token again and is left out. */
export function readTokens(styleText: string): Token[] {
  const css = styleText.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Map<string, { name: string; themes: Record<string, string> }>();
  const context: string[] = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      context.push(css.slice(start, i).trim());
      start = i + 1;
    } else if (css[i] === "}") {
      const where = context.join(" ");
      const theme = THEME_RULE.exec(where)?.[1] ?? "light";
      if (!(/prefers-reduced-motion/.test(where) || SYSTEM_THEME_RULE.test(where))) {
        for (const match of css.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
          const [, name = "", value = ""] = match;
          const entry = found.get(name) ?? { name, themes: {} };
          entry.themes[theme] = value.trim();
          found.set(name, entry);
        }
      }
      context.pop();
      start = i + 1;
    }
  }
  return [...found.values()].map((token) => ({ ...token, light: token.themes.light || Object.values(token.themes)[0] || "", dark: token.themes.dark || "" }));
}

/** The groups the System view lists tokens in, by id, each with the names it takes (words.ts gives each its label). A design's illustration colors are a group of their own. */
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
