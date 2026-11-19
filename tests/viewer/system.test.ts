/// <reference lib="dom" />
// The System view on the existing test project, in a browser: its tokens stand under their sources, DESIGN.md first with
// each token's path and the members a role joins, then the token file, in each theme the design declares; and at a
// phone's width the view never scrolls sideways.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
