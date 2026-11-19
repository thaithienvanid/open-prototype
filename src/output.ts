// Where the tool writes: the output folder, with its pages in `views/` at the paths of their designs, under the one
// path rule.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Design } from "./design/load.ts";
import { projectPath, readText, writeWhole } from "./fs.ts";
import { EXAMPLE_PAGES, exampleFolder, type Project } from "./project.ts";

/** The ignore file the tool writes at the top of an output folder it makes. */
const IGNORE = "*\n";

/**
 * The output folder, made when missing. A folder the tool makes gets an ignore file at its top, so version control
 * skips all it holds, and so does one that exists and holds nothing yet, such as a `.prototype` a person made by hand:
 * it has nothing to hide. A folder that already holds something is the person's, such as `design/` or `docs/`, so it
 * gets none: an ignore file there would hide the files they keep in it, and one they took away is not written again.
 */
export function outputFolder(project: Project): string {
  const folder = projectPath(project.root, project.outDir, { what: "the output folder", dotted: true });
  const made = mkdirSync(folder, { recursive: true }) !== undefined;
  if (made || readdirSync(folder).length === 0) writeWhole(join(folder, ".gitignore"), IGNORE);
  return folder;
}

/**
 * Whether the output folder is one the tool made: it holds the tool's own ignore file. A folder of the person's, such
 * as `design/`, has none, and neither has one whose ignore file the person took away or a link stands at.
 */
export function madeByTool(project: Project): boolean {
  try {
    return readText(projectPath(project.root, `${project.outDir}/.gitignore`, { what: "the output folder", dotted: true })) === IGNORE;
  } catch {
    return false;
  }
}

/**
 * A page's path inside `views/`. The example, a design below `exampleFolder`, takes its path below that folder after
 * `.example/`, so `.prototype/example/app.html` gets `views/.example/app.html`; every other design takes its own path
 * from the project's top, one inside the output folder too, so `design/a.html` built into `design` gets
 * `views/design/a.html`. No two designs share a page, since no two share a path:
 * - a design outside the output folder: the path rule lets no part of its path start with a dot, so its page never
 *   starts with `.example/`, and its path is no other design's;
 * - a design inside the output folder but outside the example's folder: its page starts with the output folder's
 *   path, and the output folder may not start with `.example` (`loadProject` refuses it), so it is never an example's;
 * - a design in the example's folder: its page is `.example/` and its path below that one folder, so two of them
 *   differ as their paths do, and the two cases above never start with `.example/`;
 * - a design of the person's with a part named `.example`, which the path rule allows only below the output folder,
 *   such as `design/.example/a.html`: its page is its whole path, which starts with the output folder's, not
 *   `.example/`.
 */
function pagePath(project: Project, design: Design): string {
  const example = exampleFolder(project);
  return design.design.startsWith(`${example}/`) ? `${EXAMPLE_PAGES}/${design.design.slice(example.length + 1)}` : design.design;
}

/** Write a design's page, and return its path. */
export function writePage(project: Project, design: Design, text: string): string {
  outputFolder(project);
  const rel = `${project.outDir}/views/${pagePath(project, design)}`;
  const target = projectPath(project.root, rel, { what: "the page", dotted: true });
  mkdirSync(dirname(target), { recursive: true });
  writeWhole(target, text);
  return target;
}

/**
 * Remove a design's old page, so a page that may not be written never stays from an earlier build. The page's path is
 * held to the path rule as a write is, so a link in the output folder is refused and nothing is removed through it.
 */
export function removePage(project: Project, design: Design): void {
  const rel = `${project.outDir}/views/${pagePath(project, design)}`;
  rmSync(projectPath(project.root, rel, { what: "the page", dotted: true }), { force: true });
}
