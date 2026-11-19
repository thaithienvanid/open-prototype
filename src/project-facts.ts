// What a project holds for a design, as `open-prototype project` prints it: the design document and its tokens, the token
// files the settings name, and Storybook's story index at its default place. It reads only, and decides nothing:
// whether a project is new or exists, and which of two documents is its own, are the person's answers or a setting.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SystemShape } from "./contract.ts";
import { type CssSheet, commaParts, cssSheet, tooLongVars } from "./css/sheet.ts";
import { readDesignMdFile } from "./design/files.ts";
import { documentFindings, readSystem, type System, systemShape } from "./design/system.ts";
import { Unreadable } from "./errors.ts";
import { type Finding, finding } from "./finding.ts";
import { DESIGN_MD, DESIGN_MD_VERSION, PREFIX, READ_LIMITS, THEMES, type Theme } from "./format.ts";
import { isFile, isFolder, isLink, linkBelow, projectPath, readText } from "./fs.ts";
import type { Project } from "./project.ts";
import { quoted } from "./text.ts";

/** Storybook's own default output: the one place the tool looks for a story index. */
const STORY_INDEX = "storybook-static/index.json";

export type ProjectFacts = {
  design_md: (SystemShape & { exists: boolean }) | null;
  design_md_elsewhere: string[];
  tokens: { file: string; exists: boolean }[];
  story_index: string | null;
};

/** Each other design document in the top folder and one level below, outside dot-folders, `node_modules`, and the output folder. */
function elsewhere(project: Project): string[] {
  const found: string[] = [];
  const skip = (name: string) => name.startsWith(".") || name === "node_modules" || name === project.outDir.split("/")[0];
  const look = (folder: string, rel: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(folder).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(folder, name);
      const shown = rel ? `${rel}/${name}` : name;
      if (isLink(path)) continue;
      if (name === DESIGN_MD && isFile(path) && shown !== project.designMd) found.push(shown);
      else if (depth < 1 && !skip(name) && isFolder(path)) look(path, shown, depth + 1);
    }
  };
  look(project.root, "", 0);
  return found;
}

/** A selector of the frame's root in one theme, as the tool sets `data-proto-theme` there. */
const THEMED = new RegExp(`^(?:html|:root)?\\[${PREFIX}theme=(["']?)(${THEMES.join("|")})\\1\\]$`);

/**
 * What the token files set, as the page's cascade applies it after the document's one `:root` rule: a `:root` or `html`
 * rule in both themes, a rule of one theme's root in that theme, and over a `:root` rule. Any other rule that sets a name,
 * inside `@media` or under another selector, is one the tool does not follow, so the name has no value it can print.
 */
function tokenFileValues(sheets: CssSheet[]): {
  plain: Record<Theme, Map<string, string>>;
  themed: Record<Theme, Map<string, string>>;
  unfollowed: Set<string>;
} {
  const plain = { light: new Map<string, string>(), dark: new Map<string, string>() };
  const themed = { light: new Map<string, string>(), dark: new Map<string, string>() };
  const unfollowed = new Set<string>();
  for (const sheet of sheets)
    for (const rule of sheet.rules) {
      const parts = rule.selector.split(",").map((part) => part.trim().toLowerCase());
      const top = !rule.inline && !rule.parents.length && !rule.at.length;
      const themes = top ? parts.map((part) => THEMED.exec(part)?.[2] as Theme | undefined) : [];
      for (const item of rule.declarations) {
        if (!item.property.startsWith("--")) continue;
        if (top && parts.every((part) => part === ":root" || part === "html")) {
          const pair = /^light-dark\(([\s\S]*)\)$/i.exec(item.value.trim());
          const [light = "", dark = ""] = pair ? commaParts(pair[1] ?? "") : [item.value, item.value];
          plain.light.set(item.property, light.trim());
          plain.dark.set(item.property, dark.trim());
        } else if (themes.length && themes.every(Boolean)) for (const theme of themes) themed[theme as Theme].set(item.property, item.value.trim());
        else unfollowed.add(item.property);
      }
    }
  return { plain, themed, unfollowed };
}

/**
 * A token's value in a theme as the page draws it, every reference followed; null when a step is one the tool does not
 * follow, or when the value grows past `READ_LIMITS.followed_value`. Each name is followed once at each step, in `seen`.
 */
function drawnValue(
  system: System,
  files: ReturnType<typeof tokenFileValues>,
  name: string,
  theme: Theme,
  seen: Map<string, string | null>,
  depth = 0,
): string | null {
  if (depth > 20 || files.unfollowed.has(name)) return null;
  const key = `${theme}\u0000${depth}\u0000${name}`;
  if (seen.has(key)) return seen.get(key) ?? null;
  const role = system.roles.find((item) => item.name === name);
  const member = role ? (theme === "dark" ? (role.dark ?? role.light) : (role.light ?? role.dark)) : null;
  const text =
    files.themed[theme].get(name) ?? files.plain[theme].get(name) ?? (member ? `var(${member})` : system.tokens.find((item) => item.name === name)?.css);
  if (text === undefined) return "";
  let unfollowed = false;
  let size = text.length;
  const out = text.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g, (whole, inner: string) => {
    if (unfollowed) return "";
    const found = drawnValue(system, files, inner, theme, seen, depth + 1);
    size += (found || whole).length - whole.length;
    if (found === null || size > READ_LIMITS.followed_value) unfollowed = true;
    return found || whole;
  });
  const value = unfollowed ? null : out;
  seen.set(key, value);
  return value;
}

/**
 * The document's tokens with the values the page draws once the token files the settings name apply, never the
 * document's alone where a file sets a name again; "" where a file sets a name in a way the tool does not follow. A file
 * the tool cannot read, or one past a limit, is a finding with the words a design's read gives, never a file with no
 * values in silence.
 */
function withTokenFiles(
  shape: SystemShape,
  system: System,
  project: Project,
  files: { file: string; exists: boolean }[],
): { shape: SystemShape; findings: Finding[] } {
  const findings: Finding[] = [];
  const read = files.flatMap(({ file, exists: there }) => {
    if (!there) return [];
    const path = projectPath(project.root, file, { what: "a tokens file" });
    // A file past the tokens file's limit is read by no design, as the disk stage leaves it out, so its values draw nothing.
    if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > READ_LIMITS.tokens_file) {
      findings.push(
        finding(
          "read.tokens",
          `the tokens file ${quoted(file)} is larger than ${READ_LIMITS.tokens_file / 1_000_000} MB, so it is left out: keep the tokens a design reads, and split the rest`,
          file,
        ),
      );
      return [];
    }
    let text: string | null;
    try {
      text = readText(path);
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      findings.push(finding("read.tokens", `the tokens file ${quoted(file)} cannot be read, ${error.message}`, file));
      return [];
    }
    return text === null ? [] : [{ file, sheet: cssSheet(text, { sheet: true }) }];
  });
  for (const { sheet, declaration } of tooLongVars(read.map((item) => item.sheet)))
    findings.push(
      finding(
        "read.var-limit",
        `${declaration.property}, with each var() in it followed, is longer than ${READ_LIMITS.followed_value} characters, so its value is not shown: name each token fewer times`,
        read[sheet]?.file ?? null,
        declaration.line,
      ),
    );
  if (!read.length) return { shape, findings };
  const values = tokenFileValues(read.map((item) => item.sheet));
  const seen = new Map<string, string | null>();
  const drawn = (name: string, theme: Theme) => drawnValue(system, values, name, theme, seen) ?? "";
  return {
    shape: { ...shape, tokens: shape.tokens.map((token) => ({ ...token, light: drawn(token.name, "light"), dark: drawn(token.name, "dark") })) },
    findings,
  };
}

/** The project's facts, and the design document's findings, each at its line from the project's top. */
export function projectFacts(project: Project): { facts: ProjectFacts; findings: Finding[] } {
  const file = readDesignMdFile(project, "absent");
  const system = file ? readSystem(file.file, file.blocks, file.sections, file.problem) : null;
  // A path the settings name that the path rule refuses, such as a link, is refused here as every command refuses it.
  const tokens = (project.tokens ?? []).map((rel) => ({ file: rel, exists: isFile(projectPath(project.root, rel, { what: "a tokens file" })) }));
  const drawn = system ? withTokenFiles(systemShape(system), system, project, tokens) : null;
  const design_md =
    project.designMd === null
      ? null
      : drawn
        ? { ...drawn.shape, exists: true }
        : { file: project.designMd, version: DESIGN_MD_VERSION, tokens: [], components: [], sections: [], exists: false };
  // The story index is found, not named, so one behind a link, its own or its folder's, is no index.
  const story = linkBelow(project.root, STORY_INDEX) ? "" : join(project.root, STORY_INDEX);
  return {
    facts: { design_md, design_md_elsewhere: elsewhere(project), tokens, story_index: story && isFile(story) ? STORY_INDEX : null },
    findings: [...documentFindings(system), ...(drawn?.findings ?? [])],
  };
}
