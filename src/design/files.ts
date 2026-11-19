// The one stage that reads the disk for a design: its own file, its flows and blocks, the images its fixtures name, the
// font files its styles and its tokens files name, and its review rounds, each under the one path rule. Everything after
// it is plain data: `load` and the stages after it never touch the disk.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, posix } from "node:path";
import { type FontFile, type FontUrl, fontPath, fontUrls, markupFontUrls, tokensFolder } from "../css/fonts.ts";
import { Refusal, Unreadable } from "../errors.ts";
import { ATTR, BLOCKS, FLOWS, FONT_TYPES, IMAGE_TYPES, META, PROGRAM, READ_LIMITS, ROUNDS } from "../format.ts";
import { isFile, isFolder, isLink, isSafeName, linkBelow, pathInside, projectPath, readText, reasonOf, writtenPath } from "../fs.ts";
import { type Attribute, firstValues, readMarkup } from "../html/tokenizer.ts";
import { type Json, readJson, textsOf } from "../json.ts";
import type { Project } from "../project.ts";
import { quoted, words } from "../text.ts";
import { type DesignMdBlock, type DesignMdSection, readDesignMd } from "./designmd.ts";

/** An image a design's fixtures name: its bytes, or why it cannot be read. */
export type ImageFile = { bytes: Uint8Array } | { why: string };

/** A design's files as plain data, each by its path in the design's folder. */
export type Files = {
  /** The design's path inside the project, such as `design/app.html`. */
  design: string;
  /** The design's file name in its folder, such as `app.html`. */
  file: string;
  /**
   * The design's id, from the project folder's own name and the design's path inside the project: the same on every
   * machine that builds it, and another for the same path in a project of another name.
   */
  id: string;
  texts: Map<string, string>;
  unreadable: Map<string, string>;
  images: Map<string, ImageFile>;
  /**
   * The font files the `@font-face` blocks of the design's styles and of its tokens files name, by their path from the
   * project's top: the bytes, or why the page cannot carry them. A file that does not exist is not here.
   */
  fonts: Map<string, FontFile>;
  /** The round files beside the design, by path, as text or with why they are left out. */
  rounds: Map<string, string | { why: string }>;
  /** The token files the build places before the design's styles, by their path inside the project. */
  tokens: { file: string; css: string }[];
  /** Why a token file the design names cannot be placed. */
  tokenProblems: string[];
  /** The files in the design's `flows/` and `blocks/` whose names the path rule refuses, by path in the design's folder: none is read. */
  misnamed: string[];
  /** The project's design document: its path from the project's top, its YAML blocks and headings, or why it cannot be read. */
  designMd: DesignMdFile | null;
};

/** The design document as the disk gave it: read, or with the one problem that kept it from being read. */
type DesignMdFile = { file: string; text: string; blocks: DesignMdBlock[]; sections: DesignMdSection[]; problem: string };

/**
 * The id a page keeps its comments by: from the project folder's own name and the design's path inside the project.
 * Not from the root's full path: a built page travels to a reviewer, so its id must not change with the machine that
 * built it, nor carry a hash of a home folder. Two projects whose folders share a name and whose designs share a path
 * still share an id.
 */
function designId(root: string, design: string): string {
  return createHash("sha256")
    .update(`${basename(root)}/${design}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

function emptyFiles(root: string, design: string, file: string): Files {
  return {
    design,
    file,
    id: designId(root, design),
    texts: new Map(),
    unreadable: new Map(),
    images: new Map(),
    fonts: new Map(),
    rounds: new Map(),
    tokens: [],
    tokenProblems: [],
    misnamed: [],
    designMd: null,
  };
}

/** A design file a command names: a `.html` file inside the project. */
function designPath(project: Project, rel: string): { path: string; shown: string } {
  // A design the tool wrote into its own output folder, such as an example, may sit under the dotted folder.
  const path = projectPath(project.root, rel, { what: "a design file", dotted: rel.startsWith(`${project.outDir}/`) });
  const shown = writtenPath(rel);
  if (!shown.endsWith(".html") || !isFile(path))
    throw new Refusal(`${rel} is no design file in this project: name one, such as design/cards.html`, "request.path");
  // A disk that ignores case finds `Design/A.html` at `design/a.html`; the id and the page's path follow the spelling,
  // so a design named in another spelling would open with another id and an empty round. It is refused, with the disk's.
  const spelled = spelledOnDisk(project.root, shown);
  if (spelled !== shown)
    throw new Refusal(
      `${shown} is spelled ${spelled} on the disk: name the design as the disk spells it, so its page and its comments keep one name`,
      "request.path",
    );
  return { path, shown };
}

/** A path below `folder` with each part as its folder lists it: a part the folder lists in another case takes that case. */
function spelledOnDisk(folder: string, rel: string): string {
  const parts: string[] = [];
  let current = folder;
  for (const part of rel.split("/")) {
    // A folder that cannot be listed keeps the part as written: the read that follows tells what is wrong.
    let names: string[] = [];
    try {
      names = readdirSync(current);
    } catch {
      names = [part];
    }
    const name = names.includes(part) ? part : (names.find((found) => found.toLowerCase() === part.toLowerCase()) ?? part);
    parts.push(name);
    current = join(current, name);
  }
  return parts.join("/");
}

/**
 * A file of the design as text, or null when it does not exist; one past its limit is never read whole. One leading
 * byte order mark is dropped, as an editor shows none: so a block that starts with one is still one root element, and
 * none reaches the page as a character. It stands before the first line, so no line moves.
 */
function designText(path: string): string | null {
  if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > READ_LIMITS.design_file)
    throw new Unreadable(`it is larger than ${READ_LIMITS.design_file / 1_000_000} MB, the most one file of a design may take: split it into blocks or flows`);
  const text = readText(path);
  return text?.startsWith("\uFEFF") ? text.slice(1) : text;
}

function readInto(files: Files, folder: string, rel: string, what: string): void {
  try {
    const text = designText(pathInside(folder, rel, what));
    if (text !== null) files.texts.set(rel, text);
  } catch (error) {
    if (error instanceof Unreadable) files.unreadable.set(rel, error.message);
    else throw error;
  }
}

/**
 * The HTML files of a folder of the design, by path in the design's folder. A name the path rule refuses, such as one
 * that holds a control character, is never read: it goes in `misnamed`, so a finding names it.
 */
function htmlFiles(files: Files, folder: string, sub: string): string[] {
  const at = join(folder, sub);
  if (isLink(at) || !isFolder(at)) return [];
  const names = readdirSync(at)
    .filter((name) => name.endsWith(".html") && !name.startsWith("."))
    .sort();
  files.misnamed.push(...names.filter((name) => !isSafeName(name)).map((name) => `${sub}/${name}`));
  return names.filter(isSafeName).map((name) => `${sub}/${name}`);
}

/** Read each file the fixtures name that an image field may show, inside the design's folder and within its limits. */
function readImages(files: Files, folder: string, fixtures: Json | undefined): void {
  // Every text of the fixtures is a path an image field may name.
  const names = new Set(textsOf(fixtures));
  let left = READ_LIMITS.images;
  for (const rel of [...names].sort()) {
    if (rel.startsWith("data:") || !IMAGE_TYPES[extname(rel).toLowerCase()]) continue;
    const clean = rel.replaceAll("\\", "/");
    if (clean.startsWith("/") || /^[A-Za-z]:/.test(clean) || clean.split("/").includes("..")) {
      files.images.set(rel, { why: `names \`${quoted(rel)}\`, which is outside the design's folder: put the image beside the design, or under it` });
      continue;
    }
    if (linkBelow(folder, clean)) {
      files.images.set(rel, { why: `names \`${quoted(rel)}\`, which passes through a link: put the image itself beside the design` });
      continue;
    }
    const path = join(folder, clean);
    let size: number;
    try {
      const info = statSync(path);
      if (!info.isFile()) continue;
      size = info.size;
    } catch {
      continue;
    }
    if (size > READ_LIMITS.image || size > left) {
      files.images.set(rel, {
        why: `names \`${quoted(rel)}\`, larger than the ${READ_LIMITS.image / 1_000_000} MB an image, or the ${READ_LIMITS.images / 1_000_000} MB a page, may take`,
      });
      continue;
    }
    // A file the system will not let the tool read is a refused request, with the step that works.
    const bytes = readFileSync(path).subarray(0, READ_LIMITS.image + 1);
    left -= bytes.length;
    files.images.set(rel, { bytes });
  }
}

/**
 * Read each font file an `@font-face` names, under the one path rule and within its limits: in the design's style
 * elements, read from the design's folder, and in each tokens file, read from that file's folder. A file that does not
 * exist is left out, so the check names it; every other file that cannot be carried has why.
 */
function readFonts(project: Project, files: Files, folder: string): void {
  const named = new Set<string>();
  const add = (from: string, urls: FontUrl[]) => {
    for (const found of urls) {
      const target = fontPath(from, found.url);
      if (target && "path" in target) named.add(target.path);
    }
  };
  for (const [rel, text] of files.texts) if (rel.endsWith(".html")) add(folder, markupFontUrls(text));
  for (const token of files.tokens) add(tokensFolder(token.file), fontUrls(token.css));
  let left = READ_LIMITS.fonts;
  for (const rel of [...named].sort()) {
    let path: string;
    try {
      path = projectPath(project.root, rel, { what: "a font file" });
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      files.fonts.set(rel, { why: `which the path rule refuses: ${error.message}` });
      continue;
    }
    let size: number;
    try {
      const info = statSync(path);
      if (!info.isFile()) continue;
      size = info.size;
    } catch {
      continue;
    }
    if (size > READ_LIMITS.font || size > left) {
      files.fonts.set(rel, {
        why: `which is larger than the ${READ_LIMITS.font / 1_000_000} MB a font file, or the ${READ_LIMITS.fonts / 1_000_000} MB all the fonts of a page, may take: subset it to the scripts the design shows, or use its .woff2`,
      });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(path).subarray(0, READ_LIMITS.font + 1);
    } catch (error) {
      files.fonts.set(rel, { why: `which cannot be read (${reasonOf(error)}): give yourself access to it, then run again` });
      continue;
    }
    left -= bytes.length;
    const type = posix.extname(rel).toLowerCase();
    const head = String.fromCharCode(...bytes.subarray(0, 4));
    if (!FONT_TYPES[type]?.signatures.includes(head)) {
      files.fonts.set(rel, { why: `whose bytes are no ${type} font: download the font file again, and keep the name its type gives` });
      continue;
    }
    files.fonts.set(rel, { bytes });
  }
}

/** The round files of a design: every JSON file of `rounds/<name>/<N>/`, as text, or why it is left out. */
function readRoundFiles(files: Files, folder: string, name: string): void {
  const top = join(folder, ROUNDS, name);
  if (isLink(join(folder, ROUNDS)) || isLink(top) || !isFolder(top)) return;
  for (const round of readdirSync(top).filter((entry) => /^[0-9]{1,4}$/.test(entry))) {
    const dir = join(top, round);
    if (isLink(dir) || !isFolder(dir)) continue;
    for (const file of readdirSync(dir).filter((item) => item.endsWith(".json"))) {
      const rel = `${ROUNDS}/${name}/${round}/${file}`;
      const path = join(dir, file);
      try {
        const info = lstatSync(path);
        if (info.isSymbolicLink() || !info.isFile()) files.rounds.set(rel, { why: "is not a plain file in the design's folder, so it is left out" });
        else if (info.size > READ_LIMITS.round_file) files.rounds.set(rel, { why: `is larger than ${READ_LIMITS.round_file} bytes, so it is left out` });
        else files.rounds.set(rel, readText(path) ?? "");
      } catch (error) {
        files.rounds.set(rel, { why: `cannot be read (${reasonOf(error)}), so it is left out` });
      }
    }
  }
}

/** What a document's head and body say before it is walked: its fixtures text, and the token files its head names. */
function documentHints(text: string): { fixtures: string | null; tokens: string[] | null } {
  let fixtures: string | null = null;
  let tokens: string[] | null = null;
  let inFixtures = false;
  const start = (tag: string, attrs: Attribute[]) => {
    const a = firstValues(attrs);
    if (tag === "script" && a.has(ATTR.fixtures) && fixtures === null) {
      inFixtures = true;
      fixtures = "";
    }
    if (tag === "meta" && (a.get("name") ?? "").toLowerCase() === META.tokens && tokens === null) tokens = words(a.get("content") ?? "");
  };
  readMarkup(text, {
    start,
    // HTML ignores `/>` on a start tag, as the walk reads it, so `<meta name="tokens" ... />` names the files too.
    startEnd: start,
    end: (tag) => {
      if (tag === "script") inFixtures = false;
    },
    data: (data) => {
      if (inFixtures) fixtures += data;
    },
  });
  return { fixtures, tokens };
}

/** The token files a design names, else the ones the settings name: each is read, or a problem says why it is not. */
function readTokens(project: Project, files: Files, named: string[] | null): void {
  const fromDesign = named !== null;
  for (const rel of named ?? project.tokens ?? []) {
    let path: string;
    try {
      path = projectPath(project.root, rel, { what: "a tokens file" });
    } catch (error) {
      if (!fromDesign) throw error;
      files.tokenProblems.push(`<meta name="tokens"> names ${quoted(rel)}: ${(error as Error).message}`);
      continue;
    }
    let css: string | null;
    try {
      if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > READ_LIMITS.tokens_file) {
        files.tokenProblems.push(
          `the tokens file ${quoted(rel)} is larger than ${READ_LIMITS.tokens_file / 1_000_000} MB, so it is left out: keep the tokens a design reads, and split the rest`,
        );
        continue;
      }
      css = readText(path);
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      if (!fromDesign) throw new Refusal(`the settings' tokens file ${rel} cannot be read, ${error.message}`, "request.settings");
      files.tokenProblems.push(`the tokens file ${quoted(rel)} cannot be read, ${error.message}`);
      continue;
    }
    if (css === null) {
      if (!fromDesign) throw new Refusal(`the settings' tokens file ${rel} does not exist: write it, or take it out of \`tokens\``, "request.settings");
      files.tokenProblems.push(`<meta name="tokens"> names ${quoted(rel)}, which does not exist: write it, or name a tokens file inside the project`);
      continue;
    }
    files.tokens.push({ file: rel, css });
  }
}

/**
 * The project's design document, under the one path rule: null when the settings turn it off, or when the default file
 * is not there. A file the settings name and the disk lacks is a refused request, unless `missing` says to read it as
 * absent, as `open-prototype project` does. A link, a file past the limit, or a file that is not UTF-8 is read as its problem.
 */
export function readDesignMdFile(project: Project, missing: "refuse" | "absent" = "refuse"): DesignMdFile | null {
  const rel = project.designMd;
  if (rel === null) return null;
  const unread = (problem: string): DesignMdFile => ({ file: rel, text: "", blocks: [], sections: [], problem });
  let path: string;
  try {
    path = projectPath(project.root, rel, { what: "the design document" });
  } catch (error) {
    if (error instanceof Refusal)
      return unread("is a link, or stands below one, so it is not read: the tool reads only real files inside the project; replace the link with the file");
    throw error;
  }
  const size = statSync(path, { throwIfNoEntry: false })?.size;
  if (size === undefined) {
    if (!project.designMdNamed || missing === "absent") return null;
    throw new Refusal(
      `\`design_md\` names ${rel}, which does not exist: write it with \`${PROGRAM} new-design-md\`, or set \`design_md\` to null`,
      "request.settings",
    );
  }
  if (size > READ_LIMITS.design_md)
    return unread(`is larger than ${READ_LIMITS.design_md / 1_000_000} MB, so none of it is read: keep the tokens and the words a design needs`);
  let text: string | null;
  try {
    text = readText(path);
  } catch (error) {
    if (error instanceof Unreadable) return unread(`cannot be read, ${error.message}`);
    throw error;
  }
  const read = readDesignMd(text ?? "");
  return { file: rel, text: text ?? "", blocks: read.blocks, sections: read.sections, problem: "" };
}

/** Read the files of the design `rel` names: the `.html` file, its `flows/` and `blocks/`, images, fonts, tokens, and rounds. */
export function readFiles(project: Project, rel: string): Files {
  const { path, shown } = designPath(project, rel);
  const name = shown.split("/").at(-1) ?? shown;
  const folder = path.slice(0, path.length - name.length - 1);
  const files = emptyFiles(project.root, shown, name);
  try {
    files.texts.set(name, designText(path) ?? "");
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    files.unreadable.set(name, error.message);
    return files;
  }
  for (const sub of [...htmlFiles(files, folder, FLOWS), ...htmlFiles(files, folder, BLOCKS)]) readInto(files, folder, sub, sub);
  const hints = documentHints(files.texts.get(name) ?? "");
  const fixtures = hints.fixtures === null ? null : readJson(hints.fixtures);
  readImages(files, folder, fixtures?.ok ? fixtures.value : undefined);
  readTokens(project, files, hints.tokens);
  readFonts(project, files, shown.slice(0, Math.max(0, shown.length - name.length - 1)));
  files.designMd = readDesignMdFile(project);
  readRoundFiles(files, folder, name.replace(/\.html$/, ""));
  return files;
}
