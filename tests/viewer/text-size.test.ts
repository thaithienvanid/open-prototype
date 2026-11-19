/// <reference lib="dom" />
// The side panel, the System view, and Compare at each width and text size: each probe is a number read in the browser,
// never a look at a picture. Large text is the root's font size doubled, as a person's browser setting does.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BROWSER, Browser, type Page } from "./page.ts";
import { productPage } from "./pages.ts";

/** Load screenshots into Compare, as a person's file pick does: tall grey pictures with these names. */
async function loadScreenshots(page: Page, names: string[]): Promise<void> {
  await page.evaluate(async (names: string[]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 800;
    const paint = canvas.getContext("2d")!;
    paint.fillStyle = "#888";
    paint.fillRect(0, 0, 400, 800);
    const blob = await new Promise<Blob>((done) => canvas.toBlob((made) => done(made!), "image/png"));
    const files = new DataTransfer();
    for (const name of names) files.items.add(new File([blob], name, { type: "image/png" }));
    const input = document.getElementById("compare-files") as HTMLInputElement;
    input.files = files.files;
    // Compare says the count once its pictures are read and the frame has fitted to them: that line is the wait's end.
    const announce = document.getElementById("announce")!;
    const loaded = new Promise((done) => {
      const watch = new MutationObserver(() => {
        if (/ loaded\b/.test(announce.textContent ?? "")) {
          watch.disconnect();
          done(true);
        }
      });
      watch.observe(announce, { childList: true, characterData: true, subtree: true });
    });
    input.dispatchEvent(new Event("change"));
    await loaded;
  }, names);
  await page.settled();
  await page.calm();
}

/** The scale the caption says the frame is fitted to, in percent. */
const fitted = (page: Page): Promise<number> =>
  page.evaluate(() => Number(/fitted to (\d+)%/.exec(document.getElementById("caption-size")!.textContent ?? "")?.[1] ?? 100));

describe.skipIf(!BROWSER)("the side panel, the System view, and Compare, at each width and text size", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());
  async function open(width: number, height: number, text = 100, hash = ""): Promise<Page> {
    const page = await browser.open(width, height);
    await page.goto(productPage() + hash);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    if (text !== 100) await page.evaluate(`document.documentElement.style.fontSize = "${text}%"`);
    await page.calm();
    return page;
  }

  test("with the text doubled, the side panel's body is never cut to nothing, its tabs keep inside their row, and at 100% its foot stays at the panel's foot", async () => {
    const found: string[] = [];
    for (const [width, height, text] of [
      [390, 844, 200],
      [1280, 720, 200],
      [1440, 900, 200],
      [1440, 900, 100],
    ] as const) {
      const page = await open(width, height, text);
      // At 390 the panel is a drawer, opened at Build details; on a wide window it is open beside the artboard.
      if (width < 768) await page.click("#build-toggle");
      await page.calm();
      const at = `${width}x${height} at ${text}%`;
      const panel = await page.evaluate(() => {
        const body = document.querySelector(".pv-ibody")!;
        const tabs = document.querySelector(".pv-itabs")!.getBoundingClientRect();
        const last = Math.max(...[...document.querySelectorAll(".pv-itabs > *")].map((tab) => tab.getBoundingClientRect().bottom));
        const foot = document.querySelector(".pv-finish")!.getBoundingClientRect();
        const parts = document.querySelector(".pv-iparts")!.getBoundingClientRect();
        return { body: body.clientHeight, content: body.scrollHeight, tabs: tabs.bottom, last, foot: foot.bottom, parts: parts.bottom };
      });
      if (panel.body < Math.min(panel.content, 100)) found.push(`${at}: the body shows ${panel.body} px of ${panel.content}`);
      if (panel.last > panel.tabs + 0.5) found.push(`${at}: a tab is drawn ${Math.round(panel.last - panel.tabs)} px under its row`);
      if (text === 100 && Math.abs(panel.foot - panel.parts) > 0.5)
        found.push(`${at}: the foot ends ${Math.round(panel.parts - panel.foot)} px above the panel's foot`);
      await page.close();
    }
    expect(found).toEqual([]);
  }, 90_000);

  test("with no picture to show, Compare fits the frame as large as it fits alone, whether nothing is loaded or none is named for the view", async () => {
    const found: string[] = [];
    for (const [width, height, text] of [
      [1440, 900, 200],
      [1440, 900, 100],
      [1280, 800, 100],
      [1024, 800, 100],
    ] as const) {
      const page = await open(width, height, text);
      const alone = await fitted(page);
      await page.click("#compare");
      await page.settled();
      await page.calm();
      const empty = await fitted(page);
      // Two pictures, neither named for this view: the placeholder says which is missing.
      await loadScreenshots(page, ["one.png", "two.png"]);
      const missing = await page.evaluate(() => document.getElementById("compare-side")!.classList.contains("pv-compare-missing"));
      const named = await fitted(page);
      const sideways = await page.evaluate(() => {
        const scroller = document.getElementById("scroller")!;
        return scroller.scrollWidth - scroller.clientWidth;
      });
      if (empty < alone || named < alone || !missing || sideways > 0)
        found.push(`${width}x${height} at ${text}%: ${alone}% alone, ${empty}% with nothing loaded, ${named}% with none named, ${sideways} px sideways`);
      await page.close();
    }
    expect(found).toEqual([]);
  }, 90_000);

  test("the System view stacks a card whose columns do not fit, so no specimen leaves its card, keeps two columns where they fit, and never scrolls sideways", async () => {
    const found: string[] = [];
    for (const [width, text] of [
      [1440, 200],
      [1440, 100],
      [390, 100],
      [390, 200],
    ] as const) {
      const page = await open(width, 900, text, "#items%3Alist/populated?tab=system");
      await page.until(`document.querySelectorAll(".pv-component .pv-specimen").length > 0`);
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll(".pv-component")].map((card) => {
          const box = card.getBoundingClientRect();
          const out = [...card.querySelectorAll(".pv-specimen")].filter((one) => {
            const at = one.getBoundingClientRect();
            return at.left < box.left - 0.5 || at.right > box.right + 0.5;
          }).length;
          return { out, columns: getComputedStyle(card).gridTemplateColumns.split(" ").length };
        }),
      );
      const out = cards.reduce((sum, card) => sum + card.out, 0);
      if (out) found.push(`${width} at ${text}%: ${out} specimens leave their card`);
      const columns = width === 1440 && text === 100 ? 2 : 1;
      if (cards.some((card) => card.columns !== columns)) found.push(`${width} at ${text}%: a card does not have ${columns} column(s)`);
      const sideways = await page.evaluate(() => {
        const scroller = document.getElementById("scroller")!;
        return scroller.scrollWidth - scroller.clientWidth;
      });
      if (sideways > 0) found.push(`${width} at ${text}%: the view scrolls ${sideways} px sideways`);
      await page.close();
    }
    expect(found).toEqual([]);
  }, 90_000);

  test("with a picture under a wide frame, the frame's caption sits right under the frame, and the picture's own caption under it names it as the built UI", async () => {
    const page = await open(1440, 900, 100, "#items%3Alist/populated?compare=1&frame=1440");
    await loadScreenshots(page, ["shot.png"]);
    const found = await page.evaluate(() => {
      const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
      const [frame, caption, picture] = [box("shell"), box("caption"), box("compare-beside")];
      const named = document.querySelector("#compare-side figcaption")!;
      return {
        stack: document.getElementById("device")!.hasAttribute("data-stack"),
        gap: Math.round(caption.top - frame.bottom),
        order: caption.bottom <= picture.top && picture.bottom <= named.getBoundingClientRect().top,
        names: /^The built UI: /.test(named.querySelector(".pv-compare-name")!.textContent ?? ""),
      };
    });
    await page.close();
    expect([found.stack, found.gap >= 0 && found.gap <= 24, found.order, found.names]).toEqual([true, true, true, true]);
  }, 60_000);

  test("Compare's picture caption keeps to the picture's width and shows its name, so the artboard never scrolls sideways", async () => {
    const found: string[] = [];
    for (const [width, text] of [
      [390, 100],
      [390, 200],
      [1440, 200],
    ] as const) {
      const page = await open(width, 900, text, "#items%3Alist/populated?compare=1&frame=320");
      await loadScreenshots(page, ["shot.png"]);
      const box = await page.evaluate(() => {
        const scroller = document.getElementById("scroller")!;
        const picture = document.getElementById("compare-beside")!.getBoundingClientRect();
        const parts = [...document.querySelectorAll("#compare-side figcaption, #compare-side figcaption > *")].filter((part) => part.getClientRects().length);
        return {
          sideways: scroller.scrollWidth - scroller.clientWidth,
          wider: parts.some((part) => part.getBoundingClientRect().right > picture.right + 0.5 || part.getBoundingClientRect().left < picture.left - 0.5),
          // The name keeps a line of its own where the button leaves it no room, so it is never cut to nothing.
          name: document.getElementById("compare-name")!.clientWidth,
        };
      });
      if (box.sideways > 0 || box.wider || box.name < 40)
        found.push(`${width} at ${text}%: ${box.sideways} px sideways, caption wider than its picture: ${box.wider}, name ${box.name} px wide`);
      await page.close();
    }
    expect(found).toEqual([]);
  }, 90_000);
});
