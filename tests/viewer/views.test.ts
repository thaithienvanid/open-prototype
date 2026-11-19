/// <reference lib="dom" />
// The table of views is the one place a view is named: a scratch copy of the viewer gains a view by
// its own file and one row of the table, with its tab's label in the row and no markup added, and the page shows its tab,
// with that label, and its panel. Every other file of the copy is the repository's, byte for byte, so the view needed
// nothing else. A row with no label fails the type check.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import * as entry from "../../src/index.ts";
import { tempFolder } from "../temp.ts";
import { BROWSER, Browser } from "./page.ts";
import { REPOSITORY } from "./pages.ts";

/** Every file under a folder, by its path in it, with its parts joined by `/` on every system. */
function filesIn(folder: string, top = folder): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? filesIn(join(folder, entry.name), top) : [relative(top, join(folder, entry.name)).split(sep).join("/")]))
    .sort();
}
/** The files of the scratch copy's viewer that differ from the repository's, or that it alone holds. */
let changed: string[] = [];

/** A page of the plain design, built with a copy of the viewer that has one more view. */
function pageWithAddedView(): string {
  const scratch = tempFolder(join(tmpdir(), "prototype-viewer-views-"));
  cpSync(join(REPOSITORY, "viewer"), join(scratch, "viewer"), { recursive: true });
  cpSync(join(REPOSITORY, "tools/build-viewer.ts"), join(scratch, "tools/build-viewer.ts"));
  // The tool's files the viewer imports through names.ts, and the schema the contract reads.
  for (const file of ["src/format.ts", "src/contract.ts", "schemas/round-comments.schema.json"]) {
    mkdirSync(dirname(join(scratch, file)), { recursive: true });
    cpSync(join(REPOSITORY, file), join(scratch, file));
  }
  writeFileSync(
    join(scratch, "viewer/views/glossary.ts"),
    'import { panelOf } from "../dom.ts";\nexport function renderGlossary(): void {\n  const panel = panelOf("glossary");\n  if (panel && !panel.textContent) panel.textContent = "Glossary, drawn by its own module";\n}\n',
  );
  const table = join(scratch, "viewer/views/table.ts");
  const text = readFileSync(table, "utf8")
    .replace('import * as W from "../words.ts";', 'import { renderGlossary } from "./glossary.ts";\nimport * as W from "../words.ts";')
    .replace(
      '  { name: "compare",',
      '  { name: "glossary", label: "Glossary", render: renderGlossary, ready: () => $.workspace, drawnAlways: false, zoom: false, controls: () => [], opened: () => {} },\n  { name: "compare",',
    );
  if (!text.includes("renderGlossary, ready") || !text.includes("import { renderGlossary }"))
    throw new Error("the table of views changed its form: update this test");
  writeFileSync(table, text);
  const ours = join(REPOSITORY, "viewer"),
    theirs = join(scratch, "viewer");
  changed = filesIn(theirs).filter((file) => {
    try {
      return !readFileSync(join(ours, file)).equals(readFileSync(join(theirs, file)));
    } catch {
      return true;
    }
  });
  const built = Bun.spawnSync(["bun", join(scratch, "tools/build-viewer.ts")], { stdout: "pipe", stderr: "pipe" });
  if (built.exitCode !== 0) throw new Error(built.stderr.toString());
  const viewer = { html: readFileSync(join(scratch, "assets/viewer.html"), "utf8"), css: readFileSync(join(scratch, "assets/viewer.css"), "utf8") };
  mkdirSync(join(scratch, "project/design"), { recursive: true });
  cpSync(join(import.meta.dir, "designs/plain.html"), join(scratch, "project/design/plain.html"));
  const project = entry.loadProject(join(scratch, "project"), {});
  const design = entry.load(entry.readFiles(project, "design/plain.html"));
  writeFileSync(join(scratch, "page.html"), entry.page({ design, findings: entry.check(design, project), rounds: [], project }, viewer));
  return pathToFileURL(join(scratch, "page.html")).href;
}

describe.skipIf(!BROWSER)("the table of views", () => {
  let browser: Browser;
  let address = "";
  // The copy is built before the browser starts, so no program the build starts runs beside it.
  beforeAll(() => {
    address = pageWithAddedView();
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("a view added by its own file and one row of the table has its tab and its panel, with no markup added", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(address);
    const tabs = () =>
      page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[role=tab][data-tab]")].map((tab) => `${tab.dataset.tab}:${tab.textContent}`).join(" "));
    expect(changed).toEqual(["views/glossary.ts", "views/table.ts"]);
    expect(await tabs()).toBe("prototype:Prototype board:Board system:System glossary:Glossary");
    await page.click("#tab-glossary");
    await page.settled();
    expect(
      await page.evaluate(() => {
        const panel = document.getElementById("panel-glossary")!;
        return [
          panel.getAttribute("role"),
          panel.getAttribute("aria-labelledby"),
          panel.hidden,
          panel.textContent,
          document.getElementById("panel-prototype")!.hidden,
          location.hash.includes("tab=glossary"),
        ];
      }),
    ).toEqual(["tabpanel", "tab-glossary", false, "Glossary, drawn by its own module", true, true]);
    await page.close();
  }, 60_000);
});
