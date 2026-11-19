/// <reference lib="dom" />
// The System view on the existing test project, in a browser: its tokens stand under their sources, DESIGN.md first with
// each token's path and the members a role joins, then the token file, in each theme the design declares; and at a
// phone's width the view never scrolls sideways.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../../src/cli.ts";
import { tempFolder } from "../temp.ts";
import { BROWSER, Browser, type Page } from "./page.ts";
import { REPOSITORY } from "./pages.ts";

/** The existing test project's design, built by the tool's own command line, as a file address. */
function existingPage(): string {
  const folder = tempFolder(join(tmpdir(), "prototype-viewer-system-"));
  cpSync(join(REPOSITORY, "tests/projects/existing"), folder, { recursive: true });
  const ran = Bun.spawnSync(["bun", join(REPOSITORY, "src/cli.ts"), "build", "design/inbox.html"], { cwd: folder, stdout: "pipe", stderr: "pipe" });
  if (ran.exitCode !== 0) throw new Error(`the existing project's design did not build clean: ${ran.stdout.toString()}${ran.stderr.toString()}`);
  return pathToFileURL(join(folder, ".prototype/views/design/inbox.html")).href;
}

type Shown = { sources: string[]; role: { place: string; swatch: string[] } | null; file: string[]; tab: string; sideways: number };

async function systemView(page: Page, address: string, theme: string): Promise<Shown> {
  await page.goto(`${address}#inbox/list?tab=system&theme=${theme}`);
  await page.until(`document.querySelectorAll("#system-tokens .pv-source").length === 2`);
  await page.settled();
  return page.evaluate((): Shown => {
    const sources = [...document.querySelectorAll("#system-tokens .pv-source")];
    const row = (source: Element | undefined, name: string) =>
      [...(source?.querySelectorAll(".pv-token") ?? [])].find((token) => token.querySelector("code")?.textContent === name);
    const role = row(sources[0], "--color-surface");
    const primary = row(sources[1], "--color-primary");
    const scroller = document.scrollingElement!;
    const panel = document.getElementById("system-tokens")!.closest<HTMLElement>("[role=tabpanel]")!;
    return {
      sources: sources.map((source) => source.querySelector("h3")?.textContent ?? ""),
      role: role
        ? {
            place: role.querySelector(".pv-path")?.textContent ?? "",
            swatch: [...role.querySelectorAll(".pv-swatch i")].map((part) => getComputedStyle(part).backgroundColor),
          }
        : null,
      file: [...(sources[1]?.querySelectorAll(".pv-token code") ?? [])]
        .map((code) => code.textContent ?? "")
        .concat(primary?.querySelector(".pv-value")?.textContent ?? ""),
      tab: document.getElementById("workspace")!.dataset.tab ?? "",
      sideways: Math.max(scroller.scrollWidth - scroller.clientWidth, panel.scrollWidth - panel.clientWidth),
    };
  });
}

describe.skipIf(!BROWSER)("the System view on an existing project", () => {
  let browser: Browser;
  let address = "";
  // The page is built before the browser starts, so no program the build starts runs beside it.
  beforeAll(() => {
    address = existingPage();
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test.each([
    ["wide", 1440, 900],
    ["at a phone's width", 390, 844],
  ] as const)(
    "%s, in each theme, the tokens stand under their sources and nothing scrolls sideways",
    async (_where, width, height) => {
      const page = await browser.open(width, height);
      for (const theme of ["light", "dark"]) {
        expect([theme, await systemView(page, address, theme)]).toEqual([
          theme,
          {
            sources: ["DESIGN.md (version alpha)", "tokens/brand.css"],
            role: { place: "colors.surface, line 7; joins --color-light-surface and --color-dark-surface", swatch: ["rgb(250, 250, 251)", "rgb(17, 19, 23)"] },
            file: ["--color-primary", "#1d4ed8 / dark #93c5fd"],
            tab: "system",
            sideways: 0,
          },
        ]);
      }
      await page.close();
    },
    60_000,
  );
});

// The forms a design's tokens take, painted as the design means them: light-dark() gives each half of a swatch its own
// colour, a value under the system's dark setting is the dark half, and an alias reads the design's tokens, never the
// viewer's own custom properties of the same name (the viewer has a --radius-lg, a --radius-sm, and a --spacing-3).
const TOKENS_DESIGN = `<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="platforms" content="web">
<meta name="themes" content="light dark">
<title>Tokens</title>
<style data-proto-tokens>
:root {
  color-scheme: light dark;
  --color-surface: light-dark(#fafafb, #111317);
  --color-line: #222222;
  --color-text: var(--color-line);
  --radius-lg: 12px;
  --radius-card: var(--radius-lg);
  --radius-ghost: var(--radius-sm);
  --spacing-3: 24px;
  --spacing-card: var(--spacing-3);
}
@media (prefers-color-scheme: dark) { :root { --color-line: #dddddd; } }
</style>
<style>
body { margin: 0; padding: var(--spacing-card); background: var(--color-surface); color: var(--color-text); }
section > div { border-radius: var(--radius-card); border: 1px solid var(--color-line); padding: var(--spacing-3); }
p { border-radius: var(--radius-ghost); }
</style>
</head>
<body>
<main><h1 data-proto-slot="title"></h1>
<section data-proto-screen="start" data-proto-title="Start">
  <div data-proto-state="ready" data-testid="start-ready"><p>Ready.</p></div>
</section></main>
</body>
</html>
`;

describe.skipIf(!BROWSER)("the System view paints a design's token forms", () => {
  const folder = tempFolder(join(tmpdir(), "prototype-viewer-token-forms-"));
  let browser: Browser;
  beforeAll(async () => {
    mkdirSync(join(folder, "design"));
    writeFileSync(join(folder, "design/tokens.html"), TOKENS_DESIGN);
    expect(await run(["build", "design/tokens.html"], { out: () => {}, err: () => {} }, folder)).toBe(0);
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("light-dark(), a dark value under the system's setting, and an alias of the design's own token", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${pathToFileURL(join(folder, ".prototype/views/design/tokens.html")).href}#start/ready?tab=system`);
    await page.until(`document.querySelectorAll("#system-tokens .pv-token").length > 0`);
    await page.settled();
    const painted = await page.evaluate(() => {
      const row = (name: string) => [...document.querySelectorAll(".pv-token")].find((token) => token.querySelector("code")?.textContent === name);
      const swatch = (name: string) => [...(row(name)?.querySelectorAll(".pv-swatch i") ?? [])].map((half) => getComputedStyle(half).backgroundColor);
      const style = (name: string, selector: string) => {
        const node = row(name)?.querySelector(selector);
        return node ? getComputedStyle(node) : null;
      };
      return {
        surface: swatch("--color-surface"),
        line: swatch("--color-line"),
        text: swatch("--color-text"),
        card: style("--radius-card", ".pv-radius")?.borderTopLeftRadius,
        ghost: style("--radius-ghost", ".pv-radius")?.borderTopLeftRadius,
        spacing: style("--spacing-card", ".pv-bar-sample")?.width,
      };
    });
    await page.close();
    expect(painted).toEqual({
      surface: ["rgb(250, 250, 251)", "rgb(17, 19, 23)"],
      line: ["rgb(34, 34, 34)", "rgb(221, 221, 221)"],
      text: ["rgb(34, 34, 34)", "rgb(221, 221, 221)"],
      card: "12px",
      ghost: "0px",
      spacing: "24px",
    });
  }, 60_000);
});

// A specimen is a picture of each variant, with none of the Prototype's handlers, and a spacing token as wide as a page
// keeps its row: a click on a link in a specimen leaves its frame showing the specimen, and the bar stops short of the name.
const SPECIMEN_DESIGN = `<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="platforms" content="web">
<meta name="themes" content="light">
<title>Specimens</title>
<style data-proto-tokens>
:root { --spacing-3: 16px; --spacing-page: 4000px; }
</style>
<style>
body { margin: 0; padding: var(--spacing-3); }
</style>
</head>
<body>
<main><h1 data-proto-slot="title"></h1>
<section data-proto-screen="start" data-proto-title="Start">
  <div data-proto-state="ready" data-testid="start-ready">
    <a href="https://example.com/" data-proto-component="nav-link" data-proto-variant="away" data-testid="start-away">Away</a>
    <a href="#start-ready" data-proto-component="nav-link" data-proto-variant="here" data-testid="start-here">Here</a>
  </div>
</section></main>
</body>
</html>
`;

describe.skipIf(!BROWSER)("the System view's specimens and its spacing bars", () => {
  const folder = tempFolder(join(tmpdir(), "prototype-viewer-specimens-"));
  let browser: Browser;
  beforeAll(async () => {
    mkdirSync(join(folder, "design"));
    writeFileSync(join(folder, "design/specimens.html"), SPECIMEN_DESIGN);
    expect(await run(["build", "design/specimens.html"], { out: () => {}, err: () => {} }, folder)).toBe(0);
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("a click on a link in a specimen leaves its frame on the specimen", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${pathToFileURL(join(folder, ".prototype/views/design/specimens.html")).href}#start/ready?tab=system`);
    await page.until(`document.querySelectorAll(".pv-specimen iframe").length === 2`);
    await page.settled();
    const shown: Record<string, string> = {};
    for (const testid of ["start-away", "start-here"]) {
      const at = await page.evaluate((id: string) => {
        const frame = [...document.querySelectorAll<HTMLIFrameElement>(".pv-specimen iframe")].find((one) =>
          one.contentDocument?.querySelector(`[data-testid="${id}"]`),
        )!;
        frame.scrollIntoView({ block: "center" });
        frame.dataset.probe = id;
        const outer = frame.getBoundingClientRect();
        const inner = frame.contentDocument!.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return { x: outer.x + inner.x + inner.width / 2, y: outer.y + inner.y + inner.height / 2 };
      }, testid);
      await page.clickAt(at.x, at.y);
      await page.tasksRun();
      await page.frames();
      shown[testid] = await page.evaluate((id: string) => {
        const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-probe="${id}"]`)!;
        return frame.contentDocument?.querySelector(`[data-testid="${id}"]`) ? "the specimen" : "another document";
      }, testid);
    }
    await page.close();
    expect(shown).toEqual({ "start-away": "the specimen", "start-here": "the specimen" });
  }, 60_000);

  test("a spacing token as wide as a page keeps its name beside its bar", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${pathToFileURL(join(folder, ".prototype/views/design/specimens.html")).href}#start/ready?tab=system`);
    await page.until(`document.querySelectorAll("#system-tokens .pv-bar-sample").length === 2`);
    await page.settled();
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll(".pv-token")].map((row) => {
        const bar = row.querySelector(".pv-bar-sample")!.getBoundingClientRect();
        const name = row.querySelector("code")!;
        return {
          name: name.textContent,
          inRow: bar.right <= row.getBoundingClientRect().right,
          nameWide: name.getBoundingClientRect().width >= name.scrollWidth - 1,
        };
      }),
    );
    await page.close();
    expect(rows).toEqual([
      { name: "--spacing-3", inRow: true, nameWide: true },
      { name: "--spacing-page", inRow: true, nameWide: true },
    ]);
  }, 60_000);
});
