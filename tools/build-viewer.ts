// Builds the viewer the tool ships, from the sources under viewer/:
//   assets/viewer.html  viewer/viewer.html with the modules as one script, the chrome's styles, and the frame's rules in place
//   assets/viewer.css   the tokens and the components, which the tool places in each page
// `bun run build:viewer` writes both; with `--check` it writes nothing and exits 1 when a shipped file is not what the
// sources build.
import { join, resolve } from "node:path";
import { frameRules } from "../viewer/names.ts";

const ROOT = resolve(import.meta.dir, "..");
const source = (path: string): Promise<string> => Bun.file(join(ROOT, "viewer", path)).text();

/** One slot of a template, filled once. */
function fill(template: string, slot: string, text: string): string {
  if (template.split(slot).length !== 2) throw new Error(`viewer/viewer.html must hold ${slot} once`);
  return template.replace(slot, () => text);
}

/** The viewer's script: every module as one classic script, strict, with no name left on the page. */
async function script(): Promise<string> {
  const built = await Bun.build({ entrypoints: [join(ROOT, "viewer/main.ts")], target: "browser", format: "esm", minify: false, sourcemap: "none" });
  const [output] = built.outputs;
  if (!built.success || built.outputs.length !== 1 || !output) throw new Error(`the viewer did not build to one script:\n${built.logs.join("\n")}`);
  const bundle = await output.text();
  if (/^\s*(import|export)\s/m.test(bundle)) throw new Error("the viewer's script still imports or exports: it must stand alone in the page");
  // The bundle sits inside one function. No text of it may end the script element early.
  return `(() => {\n"use strict";\n${bundle}})();`.replaceAll("</script", "<\\/script");
}

/** Each shipped file, by its path from the repository's top, as the sources build it now. */
export async function buildViewer(): Promise<Record<string, string>> {
  const style = async (name: string): Promise<string> => {
    const text = await source(`styles/${name}.css`);
    if (text.toLowerCase().includes("</style")) throw new Error(`viewer/styles/${name}.css holds </style, which would end a style block`);
    return text;
  };
  const frame = frameRules();
  if (frame.toLowerCase().includes("</style")) throw new Error("the frame's rules hold </style, which would end a style block");
  const page = fill(
    fill(fill(await source("viewer.html"), "{{chrome}}", (await style("chrome")) + (await style("devices"))), "{{frame}}", frame),
    "{{script}}",
    await script(),
  );
  return { "assets/viewer.html": page, "assets/viewer.css": (await style("tokens")) + (await style("components")) };
}

/** What `--check` prints for each shipped file, each compared on its own, and how many are stale. */
export function driftLines(built: Record<string, string>, shipped: Record<string, string | null>): { lines: string[]; stale: number } {
  const lines: string[] = [];
  let stale = 0;
  for (const [path, text] of Object.entries(built)) {
    const differs = shipped[path] !== text;
    if (differs) stale++;
    lines.push(`${path}: ${differs ? "not what viewer/ builds" : "up to date"}`);
  }
  return { lines, stale };
}

if (import.meta.main) {
  const built = await buildViewer();
  if (process.argv.includes("--check")) {
    const shipped: Record<string, string | null> = {};
    for (const path of Object.keys(built)) {
      const file = Bun.file(join(ROOT, path));
      shipped[path] = (await file.exists()) ? await file.text() : null;
    }
    const { lines, stale } = driftLines(built, shipped);
    for (const line of lines) console.log(line);
    if (stale) {
      console.error("run `bun run build:viewer`");
      process.exit(1);
    }
  } else
    for (const [path, text] of Object.entries(built)) {
      await Bun.write(join(ROOT, path), text);
      console.log(`wrote ${path}: ${text.length} characters`);
    }
}
