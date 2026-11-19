// The starts: a design file from the starter, and the project's design document. Each is an ordinary file with nothing
// of the tool's in it, and none is ever written over a file. In a project whose design document is read, the starter
// leaves out its tokens block, so a new design reads the document's tokens and overrides none.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ASSETS, assetText, EXAMPLE } from "./assets.ts";
import { productNameProblem } from "./checks/flows.ts";
import { Refusal } from "./errors.ts";
import { ATTR, CONFIG_FILE, DESIGN_MD, PROGRAM } from "./format.ts";
import { exists, projectPath, writeNew, writeWhole, writtenPath } from "./fs.ts";
import { outputFolder } from "./output.ts";
import { exampleFolder, type Project } from "./project.ts";
import { escapeHtml } from "./text.ts";

// The starter's own tokens block, with the line it ends.
const TOKENS_BLOCK = new RegExp(`<style ${ATTR.tokens}>\\n[\\s\\S]*?<\\/style>\\n`);

/** A start's text: with its tokens block, or without it when the project's design document gives the tokens. */
function started(text: string, withTokens: boolean): string {
  if (withTokens) return text;
  const out = text.replace(TOKENS_BLOCK, "");
  if (out === text) throw new Error("a starter has no tokens block to leave out: the tool's files changed");
  return out;
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

/** Write a starter design at `rel`, inside the project, never over a file and never through a link. */
export function newDesign(root: string, rel: string, title: string, withTokens = true): string {
  const path = projectPath(root, rel, { what: "a new design" });
  const shown = writtenPath(rel);
  if (!shown.endsWith(".html")) throw new Refusal(`${shown}: a design file's name ends with .html, such as design/cards.html`, "request.path");
  const there = () => new Refusal(`${shown} exists: open it with \`${PROGRAM} build ${shown}\``, "request.exists");
  if (exists(path)) throw there();
  writeStart(path, started(assetText(ASSETS.starter), withTokens).replaceAll("{{title}}", escapeHtml(title)), there);
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
 * Write the tool's example into the output folder's `example/`. It writes over its own earlier copy, as the output
 * folder is the tool's. It returns the folder and each file it wrote, from the project's top.
 */
export function writeExample(project: Project): { folder: string; written: string[] } {
  const folder = exampleFolder(project);
  outputFolder(project);
  const written: string[] = [];
  for (const [rel, source] of EXAMPLE) {
    const target = projectPath(project.root, `${folder}/${rel}`, { what: "the example", dotted: true });
    mkdirSync(dirname(target), { recursive: true });
    writeWhole(target, readFileSync(source));
    written.push(`${folder}/${rel}`);
  }
  return { folder, written };
}
