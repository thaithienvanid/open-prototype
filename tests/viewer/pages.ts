// The pages the viewer's tests open, built once for a test run by the tool's own command line.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { designOfScreens, FLOW_DESIGN, flowDesign } from "../cases.ts";
import { tempFolder } from "../temp.ts";

export const REPOSITORY = resolve(import.meta.dir, "../..");
const SCRATCH = tempFolder(join(tmpdir(), "prototype-viewer-tests-"));

function tool(folder: string, ...argv: string[]): void {
  const ran = Bun.spawnSync(["bun", join(REPOSITORY, "src/cli.ts"), ...argv], { cwd: folder, stdout: "pipe", stderr: "pipe" });
  if (ran.exitCode !== 0) throw new Error(`the tool could not build a test page: ${ran.stderr.toString() || ran.stdout.toString()}`);
}

let product = "";
let example = "";
let large = "";
let huge = "";

/** The page of the shipped example, as `example` writes and builds it, as a file address. */
export function examplePage(): string {
  if (!example) {
    const folder = join(SCRATCH, "example");
    mkdirSync(folder, { recursive: true });
    tool(folder, "example");
    example = pathToFileURL(join(folder, ".prototype/views/.example/app.html")).href;
  }
  return example;
}

/** The page of the generic synthetic multi-flow fixture (decoupled from `assets/examples/`), as a file address. */
export function productPage(): string {
  if (!product) {
    const folder = join(SCRATCH, "product");
    for (const [file, text] of Object.entries(flowDesign())) {
      mkdirSync(dirname(join(folder, file)), { recursive: true });
      writeFileSync(join(folder, file), text);
    }
    tool(folder, "build", FLOW_DESIGN);
    product = pathToFileURL(join(folder, ".prototype/views", FLOW_DESIGN)).href;
  }
  return product;
}

/** A design of `flows` flows of `screens` screens each, two states a screen, built once, as a file address. */
function screensPage(name: string, flows: number, screens: number): string {
  const folder = join(SCRATCH, name);
  for (const [file, text] of Object.entries(designOfScreens(flows, screens))) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), text);
  }
  tool(folder, "build", FLOW_DESIGN);
  return pathToFileURL(join(folder, ".prototype/views", FLOW_DESIGN)).href;
}

/** A product of 200 screens in 10 flows, two states each, as a file address: the size the viewer must still open. */
export function largePage(): string {
  if (!large) large = screensPage("large", 10, 20);
  return large;
}

/** A product of 2,000 screens in 20 flows, two states each, as a file address: the size the viewer's redraw has a ceiling at. */
export function hugePage(): string {
  if (!huge) huge = screensPage("huge", 20, 100);
  return huge;
}

let plain = "";
let cascade = "";
let hostile = "";
let unguarded = "";

/**
 * A design that tries every way a design could show what the viewer does not: a rule in a layer named as the
 * viewer's old one, an unlayered `[hidden]` rule, and `!important` behind a comment or an escape in a `style` attribute.
 */
export function hostilePage(): string {
  if (!hostile) {
    const folder = join(SCRATCH, "hostile");
    mkdirSync(join(folder, "design"), { recursive: true });
    cpSync(join(import.meta.dir, "designs/hostile.html"), join(folder, "design/hostile.html"));
    tool(folder, "build", "design/hostile.html");
    hostile = pathToFileURL(join(folder, ".prototype/views/design/hostile.html")).href;
  }
  return hostile;
}

/**
 * The hostile design's page with its policy opened wide and an image with a handler forced into the design, inside a
 * component, past the reader: a handler runs only where a live copy of the design sits in a document with a window.
 */
export function unguardedPage(): string {
  if (!unguarded) {
    const built = fileURLToPath(hostilePage());
    const text = readFileSync(built, "utf8");
    const open = text
      .replace(
        /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
        `<meta http-equiv="Content-Security-Policy" content="default-src * data: 'unsafe-inline'">`,
      )
      .replace(
        'data-testid="one-badge">Badge',
        'data-testid="one-badge">Badge<img alt="" src="data:image/gif;base64,R0lGOD" onerror="window.__ran = (window.__ran || 0) + 1" onload="window.__ran = (window.__ran || 0) + 1">',
      );
    if (open === text || !open.includes("window.__ran")) throw new Error("the hostile page did not take the forced image");
    unguarded = built.replace(/\.html$/, "-unguarded.html");
    writeFileSync(unguarded, open);
    unguarded = pathToFileURL(unguarded).href;
  }
  return unguarded;
}

/** A single design with its own style layers and its own !important rules, in a right-to-left language. */
export function cascadePage(): string {
  if (!cascade) {
    const folder = join(SCRATCH, "cascade");
    mkdirSync(join(folder, "design"), { recursive: true });
    cpSync(join(import.meta.dir, "designs/cascade.html"), join(folder, "design/cascade.html"));
    tool(folder, "build", "design/cascade.html");
    cascade = pathToFileURL(join(folder, ".prototype/views/design/cascade.html")).href;
  }
  return cascade;
}

/** A single design with no plumbing of its own (no wrapper, no rule that hides a screen, a title slot), as a file address. */
export function plainPage(): string {
  if (!plain) {
    const folder = join(SCRATCH, "plain");
    mkdirSync(join(folder, "design"), { recursive: true });
    cpSync(join(import.meta.dir, "designs/plain.html"), join(folder, "design/plain.html"));
    tool(folder, "build", "design/plain.html");
    plain = pathToFileURL(join(folder, ".prototype/views/design/plain.html")).href;
  }
  return plain;
}

/**
 * A copy of a built page with its page config changed by hand, beside it: for a field the build does not write yet, or a
 * round the test names. The config is a JSON block, which runs nothing, so the page's policy needs no change.
 */
export function pageWith(address: string, name: string, change: (config: Record<string, unknown>) => void): string {
  const built = fileURLToPath(address);
  const text = readFileSync(built, "utf8");
  const found = /(<script type="application\/json" id="page-config">)([\s\S]*?)(<\/script>)/.exec(text);
  if (!found) throw new Error("the page holds no page config");
  const config = JSON.parse(found[2] ?? "{}") as Record<string, unknown>;
  change(config);
  const json = JSON.stringify(config).replaceAll("<", "\\u003c");
  const out = built.replace(/\.html$/, `-${name}.html`);
  writeFileSync(out, text.slice(0, found.index) + found[1] + json + found[3] + text.slice(found.index + found[0].length));
  return pathToFileURL(out).href;
}

let starter = "";

/** The starter's first build: `new-design`, then `build`, as the README's first run gives them. */
export function starterPage(): string {
  if (!starter) {
    const folder = join(SCRATCH, "starter");
    mkdirSync(folder, { recursive: true });
    tool(folder, "new-design", "design/first.html");
    tool(folder, "build", "design/first.html");
    starter = pathToFileURL(join(folder, ".prototype/views/design/first.html")).href;
  }
  return starter;
}

/**
 * Every test page, built before a browser starts: a program started while a test's Chrome runs inherits the file numbers
 * of its pipe, and a page is built by starting the tool, so building first keeps the pipe the browser's alone.
 */
export function buildPages(): void {
  productPage();
  examplePage();
  largePage();
  cascadePage();
  plainPage();
  starterPage();
  hostilePage();
  unguardedPage();
  entriesPage();
}

let entries = "";

/**
 * A single design whose detail screen shows the chosen entry of a list: its own words from the fixtures' top, its fields
 * from the entry, and a list of its own whose items read their own entries and the fixtures' top.
 */
export function entriesPage(): string {
  if (!entries) {
    const folder = join(SCRATCH, "entries");
    mkdirSync(join(folder, "design"), { recursive: true });
    const item = (go: string) =>
      `<template data-proto-item><li><span data-proto-text="label"></span> <button type="button" ${go}data-testid="row-open" data-proto-field="title"></button></li></template>`;
    writeFileSync(
      join(folder, "design/entries.html"),
      `<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8">
<title>Entries</title>
</head>
<body>
<h1 data-proto-slot="title"></h1>
<section data-proto-screen="loans" data-proto-title="Loans">
  <div data-proto-state="ready" data-testid="loans-ready"><ul data-proto-list="loans">${item('data-proto-go="loan" ')}</ul></div>
</section>
<section data-proto-screen="loan" data-proto-title="Loan" data-proto-parent="loans" data-proto-source="loans">
  <div data-proto-state="ready" data-testid="loan-ready"><p data-proto-text="ask" data-testid="loan-ask"></p><h2 data-proto-field="title" data-testid="loan-title"></h2><ul data-proto-list="shelves">${item("")}</ul></div>
</section>
<script type="application/json" data-proto-fixtures>
{ "product": "Entries", "label": "Book", "ask": "Renew this loan?", "loans": [{ "title": "The Dispossessed" }, { "title": "Solaris" }], "shelves": [{ "title": "Fiction" }] }
</script>
</body>
</html>
`,
    );
    tool(folder, "build", "design/entries.html");
    entries = pathToFileURL(join(folder, ".prototype/views/design/entries.html")).href;
  }
  return entries;
}
