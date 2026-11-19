// The starts: a design file from the starter, and the project's design document. Each is an ordinary file with nothing
// of the tool's in it, and none is ever written over a file. In a project whose design document is read, the starter
// keeps of its tokens block only the names the document lacks, so a new design reads the document's tokens, overrides
// none, and reads no name that nothing sets.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ASSETS, assetText, EXAMPLE } from "./assets.ts";
import { productNameProblem } from "./checks/flows.ts";
import { readDesignMdFile } from "./design/files.ts";
import { readSystem, systemNames } from "./design/system.ts";
import { Refusal } from "./errors.ts";
import { ATTR, CONFIG_FILE, DESIGN_MD, PROGRAM } from "./format.ts";
import { exists, projectPath, writeNew, writeWhole, writtenPath } from "./fs.ts";
import { madeByTool, outputFolder } from "./output.ts";
import { exampleFolder, type Project } from "./project.ts";
import { escapeHtml } from "./text.ts";

// The starter's own tokens block, with the line it ends, and each of its custom properties, one to a line.
const TOKENS_BLOCK = new RegExp(`<style ${ATTR.tokens}>\\n[\\s\\S]*?<\\/style>\\n`);
const TOKEN_LINE = /^ {2}(--[\w-]+): .*;$/;

/**
 * Which names the project's design document gives. A document that cannot be read, such as a link, which is never
 * followed, gives none, as `check` reads it: `project` and `check` tell it at its line.
 */
function documentGives(project: Project): (name: string) => boolean {
  const file = readDesignMdFile(project, "absent");
  const names = file ? systemNames(readSystem(file.file, file.blocks, file.sections, file.problem)) : new Set<string>();
  return (name) => names.has(name);
}

/**
 * A start's text, its tokens block holding only the names the document does not give: none left, and the block goes;
 * `color-scheme` stays while a kept name reads `light-dark()`.
 */
function started(text: string, gives: (name: string) => boolean): string {
  const block = TOKENS_BLOCK.exec(text)?.[0];
  if (!block) throw new Error("a starter has no tokens block: the tool's files changed");
  const lines = block.split("\n");
  const kept = lines.filter((line) => {
    const name = TOKEN_LINE.exec(line)?.[1];
    return name === undefined || !gives(name);
  });
  const tokens = kept.filter((line) => TOKEN_LINE.test(line));
  if (!tokens.length) return text.replace(block, "");
  const scheme = tokens.some((line) => line.includes("light-dark("));
  return text.replace(block, kept.filter((line) => scheme || !/^ {2}color-scheme:/.test(line)).join("\n"));
}

/**
 * Write a new file of a start, never over a file: a file that comes between the check and the write is refused as one
 * that was there, since the write fails with nothing written (EEXIST).
 */
function writeStart(path: string, text: string, exists: () => Refusal): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeNew(path, text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw exists();
    throw error;
  }
}

/**
 * Write a starter design at `rel`, inside the project, never over a file and never through a link. Its tokens block
 * keeps the names the project's design document lacks.
 */
export function newDesign(project: Project, rel: string, title: string): string {
  const path = projectPath(project.root, rel, { what: "a new design" });
  const shown = writtenPath(rel);
  if (!shown.endsWith(".html")) throw new Refusal(`${shown}: a design file's name ends with .html, such as design/cards.html`, "request.path");
  const there = () => new Refusal(`${shown} exists: open it with \`${PROGRAM} build ${shown}\``, "request.exists");
  if (exists(path)) throw there();
  writeStart(
    path,
    started(assetText(ASSETS.starter), documentGives(project)).replaceAll("{{title}}", () => escapeHtml(title)),
    there,
  );
  return shown;
}

/**
 * Write the project's design document once, at the path the settings name, from the starter: its name is written as one
 * JSON string, which YAML reads as one value, so no line break or `: ` in it adds a key.
 */
export function newDesignMd(root: string, rel: string | null, name: string): string {
  if (rel === null)
    throw new Refusal(
      `${CONFIG_FILE} sets \`design_md\` to null, so the project reads no design document: set it to the document's path, such as "${DESIGN_MD}", first`,
      "request.settings",
    );
  const path = projectPath(root, rel, { what: "the design document" });
  const there = () => new Refusal(`${rel} exists: read it, and change it by hand`, "request.exists");
  if (exists(path)) throw there();
  const product = name || "Your product";
  const problem = productNameProblem(product);
  if (problem) throw new Refusal(problem, "request.value");
  writeStart(
    path,
    assetText(ASSETS.designMd).replace("{{name}}", () => JSON.stringify(product)),
    there,
  );
  return rel;
}

/**
 * Write the tool's example into the output folder's `example/`. In a folder the tool made, it writes over its own
 * earlier copy. An output folder of the person's, such as `design/`, may hold their own files, so there it writes over
 * none: a file in the way refuses the whole write before any is written. It returns the folder and each file it wrote,
 * from the project's top.
 */
export function writeExample(project: Project): { folder: string; written: string[] } {
  const folder = exampleFolder(project);
  outputFolder(project);
  const files = [...EXAMPLE].map(([name, source]) => {
    const rel = `${folder}/${name}`;
    return { rel, source, target: projectPath(project.root, rel, { what: "the example", dotted: true }) };
  });
  const inWay = madeByTool(project) ? undefined : files.find(({ target }) => exists(target));
  if (inWay)
    throw new Refusal(
      `${inWay.rel} exists, and ${project.outDir} is a folder of yours, not one the tool made, so the example writes over none of its files: move ${folder} away, or name another output folder with --out-dir`,
      "request.exists",
    );
  for (const { source, target } of files) {
    mkdirSync(dirname(target), { recursive: true });
    writeWhole(target, readFileSync(source));
  }
  const written = files.map(({ rel }) => rel);
  return { folder, written };
}
