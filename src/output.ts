// Where the tool writes: the output folder, with its pages in `views/` at the paths of their designs, under the one
// path rule.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Design } from "./design/load.ts";
import { exists, projectPath, writeWhole } from "./fs.ts";
import type { Project } from "./project.ts";

/** The output folder, made when missing, with an ignore file at its top, so version control skips all it holds. */
export function outputFolder(project: Project): string {
  const folder = projectPath(project.root, project.outDir, { what: "the output folder", dotted: true });
  mkdirSync(folder, { recursive: true });
  if (!exists(join(folder, ".gitignore"))) writeWhole(join(folder, ".gitignore"), "*\n");
  return folder;
}

/**
 * A page's path inside `views/`: the design's own path from the project's top, so no two designs share a page. A
 * design inside the output folder, such as the example, takes its path below that folder with a dot before its first
 * part, so `.prototype/example/app.html` gets `views/.example/app.html`. The path rule lets no part of any
 * other design start with a dot, so such a page never takes another design's.
 */
function pagePath(project: Project, design: Design): string {
  const inside = design.design.startsWith(`${project.outDir}/`) ? `.${design.design.slice(project.outDir.length + 1)}` : null;
  return inside ?? design.design;
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
