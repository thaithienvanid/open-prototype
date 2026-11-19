/// <reference lib="dom" />
// Every example the tool ships, and the starter's first build, show every screen of theirs, in each theme they declare,
// on a narrow and a wide window: the frame shows that screen alone, in its first state, in that
// theme, and the link names no problem.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_THEMES } from "../../src/format.ts";
import { BROWSER, Browser, type Page } from "./page.ts";
import { examplePage, REPOSITORY, starterPage } from "./pages.ts";

/**
 * The themes the shipped example declares, or the one a design without the name takes.
 */
function shippedThemes(): string[] {
  const main = readFileSync(join(REPOSITORY, "assets/examples/app.html"), "utf8");
  const declared = /<meta name="themes" content="([^"]*)">/.exec(main)?.[1];
  return declared === undefined ? [...DEFAULT_THEMES] : declared.split(/\s+/).filter(Boolean);
}

type Shown = { screens: string[]; states: number; theme: string | null; problem: boolean };

async function everyScreen(page: Page, address: string): Promise<string[]> {
  await page.goto(`${address}#`);
  await page.evaluate(`localStorage.clear()`);
  const { screens, themes } = await page.evaluate(() => {
    const config = JSON.parse(document.getElementById("page-config")!.textContent!) as { themes: string[] };
    const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
    return { screens: [...doc.querySelectorAll("[data-proto-screen]")].map((screen) => screen.getAttribute("data-proto-screen")!), themes: config.themes };
  });
  const faults: string[] = [];
  for (const theme of themes) {
    for (const screen of screens) {
      await page.evaluate(
        (hash: string) => {
          location.hash = hash;
        },
        `#${encodeURIComponent(screen)}/?theme=${theme}`,
      );
      await page.tasksRun();
      await page.settled();
      const shown = await page.evaluate((): Shown => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        const seen = (el: Element) => el.getClientRects().length > 0;
        return {
          screens: [...doc.querySelectorAll("[data-proto-screen]")].filter(seen).map((one) => one.getAttribute("data-proto-screen")!),
          states: [...doc.querySelectorAll("[data-proto-screen] > [data-proto-state]")].filter(seen).length,
          theme: doc.documentElement.getAttribute("data-proto-theme"),
          problem: !document.getElementById("link-problem")!.hidden,
        };
      });
      const want: Shown = { screens: [screen], states: 1, theme, problem: false };
      if (JSON.stringify(shown) !== JSON.stringify(want)) faults.push(`${screen} in ${theme}: ${JSON.stringify(shown)}`);
    }
  }
  return faults.length ? faults : [`every screen, in ${themes.join(" and ")}`];
}

describe.skipIf(!BROWSER)("every example shows every screen", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  for (const width of [320, 1440]) {
    test(`at ${width} px, the shipped example and the starter`, async () => {
      const page = await browser.open(width, 900);
      expect(await everyScreen(page, examplePage())).toEqual([`every screen, in ${shippedThemes().join(" and ")}`]);
      expect(await everyScreen(page, starterPage())).toEqual(["every screen, in light and dark"]);
      await page.close();
    }, 120_000);
  }

  // With no theme chosen, the frame follows the system, so a design that declares dark draws dark when the system is.
  test("with the system dark and no theme chosen, the shipped example and the starter draw their dark theme", async () => {
    const page = await browser.open(1024, 768);
    await page.media({ dark: true });
    const surface = async (address: string, query: string) => {
      await page.goto(`${address}#`);
      await page.evaluate((query: string) => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        location.hash = `#${encodeURIComponent(doc.querySelector("[data-proto-screen]")!.getAttribute("data-proto-screen")!)}/${query}`;
      }, query);
      await page.tasksRun();
      await page.settled();
      return page.evaluate(() => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        return [doc.documentElement.getAttribute("data-proto-theme"), getComputedStyle(doc.body).backgroundColor];
      });
    };
    for (const address of [examplePage(), starterPage()]) {
      const [, auto] = await surface(address, "");
      const [theme, dark] = await surface(address, "?theme=dark");
      expect([theme, auto]).toEqual(["dark", dark]);
    }
    await page.close();
  }, 60_000);
});
