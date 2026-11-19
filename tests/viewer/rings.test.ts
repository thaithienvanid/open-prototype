// Rule K8 of the skill's review checklist, as a test: no control's focus ring crosses a sibling control, its group's edge, the
// window's edge, or a scrolling parent, and its corners follow its cell's. It runs at the narrowest and the widest
// width, in both themes, with each layer of the viewer open, by keyboard focus and after a pointer click.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BROWSER, Browser, type Page } from "./page.ts";
import { productPage } from "./pages.ts";
import { ringFaults } from "./probes.ts";
import { LAYERS } from "./surfaces.ts";

/** The controls a browser marks as focused after a pointer click. */
const POINTER = ["#frame-pick", "#screen-filter", "#round-number"];

async function fresh(page: Page): Promise<void> {
  await page.goto(productPage());
  await page.evaluate(`localStorage.clear()`);
  await page.reload();
}

async function faultsOf(page: Page, width: number): Promise<string[]> {
  const found: string[] = [];
  for (const [layer, opens] of Object.entries(LAYERS)) {
    const steps = width < 768 ? opens.narrow : opens.wide;
    if (!steps) continue;
    await fresh(page);
    for (const step of steps) {
      await page.click(step);
      await page.calm();
    }
    if (layer === "the Board") await page.until(`document.getElementById("board").dataset.ready === "true"`);
    await page.key("Shift"); // the last input is the keyboard, so a script's focus shows as a key's does
    for (const fault of await page.evaluate(ringFaults, false)) found.push(`${layer}, by keyboard: ${fault}`);
  }
  for (const control of POINTER) {
    await fresh(page);
    if (!(await page.evaluate((on: string) => Boolean(document.querySelector(on)?.getClientRects().length), control))) continue;
    await page.click(control);
    await page.key("Escape");
    if (!(await page.evaluate((on: string) => document.activeElement === document.querySelector(on), control))) continue;
    for (const fault of await page.evaluate(ringFaults, true)) found.push(`after a pointer click: ${fault}`);
  }
  return [...new Set(found)];
}

describe.skipIf(!BROWSER)("no focus ring crosses a neighbour, a group's edge, or the window (rule K8 of the skill's review checklist)", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  for (const width of [320, 1440]) {
    for (const dark of [false, true]) {
      test(`at ${width} px, ${dark ? "dark" : "light"}`, async () => {
        const page = await browser.open(width, 900, { dark });
        const faults = await faultsOf(page, width);
        await page.close();
        if (process.env.PROTOTYPE_SHOW_FAULTS === "1") console.log(faults.join("\n"));
        if (process.env.PROTOTYPE_SHOW_FAULTS === "kinds")
          console.log([...new Set(faults.map((fault) => fault.replace(/^[^:]*: /, "").slice(0, 150)))].join("\n"));
        expect(faults).toEqual([]);
      }, 120_000);
    }
  }
});
