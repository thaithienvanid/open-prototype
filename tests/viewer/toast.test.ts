/// <reference lib="dom" />
// The toast takes its place when it shows, against what shows then: a copy whose clipboard settles late, after a drawer
// opened, and a toast at 200% text, each cover no control a person can see. A refused storage write loses no comment,
// and it is shown and said once, with the outcome it follows.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BROWSER, Browser, type Page } from "./page.ts";
import { productPage } from "./pages.ts";

/** The controls a person can see under the shown toast, by box and by the window's hit test, since the toast takes no pointer. */
function coveredByToast(): string[] {
  const toast = document.getElementById("toast")!;
  if (!toast.hasAttribute("data-on")) return ["no toast"];
  const box = toast.getBoundingClientRect();
  const controls = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll<HTMLElement>(controls)]
    .filter((control) => control.getClientRects().length && !toast.contains(control))
    .filter((control) => {
      const at = control.getBoundingClientRect();
      if (Math.min(at.right, box.right) - Math.max(at.left, box.left) <= 0.5 || Math.min(at.bottom, box.bottom) - Math.max(at.top, box.top) <= 0.5)
        return false;
      // A box that holds the whole toast is a surface, such as a scrolling region, not a control.
      if (at.left <= box.left && at.right >= box.right && at.top <= box.top && at.bottom >= box.bottom) return false;
      const seen = document.elementFromPoint(
        (Math.max(at.left, box.left) + Math.min(at.right, box.right)) / 2,
        (Math.max(at.top, box.top) + Math.min(at.bottom, box.bottom)) / 2,
      );
      return Boolean(seen && (seen === control || control.contains(seen) || toast.contains(seen)));
    })
    .map((control) => control.dataset.testid || control.id || control.className);
}

describe.skipIf(!BROWSER)("the toast", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());
  async function open(width: number, height: number, text = 100): Promise<Page> {
    const page = await browser.open(width, height);
    await page.goto(productPage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    if (text !== 100) await page.evaluate(`document.documentElement.style.fontSize = "${text}%"`);
    await page.calm();
    return page;
  }

  test("a link copied after the clipboard settles late, once a drawer opened, covers at most one control on a phone and none at 1024", async () => {
    const out: Record<number, string[]> = {};
    for (const width of [390, 320, 1024]) {
      const page = await open(width, 900);
      await page.evaluate(() => {
        let release = () => {};
        (window as unknown as { releaseClip: () => void }).releaseClip = () => release();
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise<void>((done) => (release = done)) } });
      });
      await page.click("#copy-link");
      await page.click("#inspect-toggle");
      await page.calm();
      await page.evaluate(`window.releaseClip()`);
      await page.until(`document.getElementById("toast").hasAttribute("data-on")`);
      await page.frames();
      out[width] = await page.evaluate(coveredByToast);
      await page.close();
    }
    // A phone with a drawer open has no place clear of every control: the toast takes the one that covers the least. The
    // old placement, fixed at the click, covered the drawer's foot: Copy the JSON and the download.
    expect([out[390]!.length <= 1, out[320]!.length <= 1, out[1024]]).toEqual([true, true, []]);
  }, 90_000);

  test("at 200% text the toast after loading a screenshot into Compare covers no control at 1440", async () => {
    const page = await open(1440, 900, 200);
    await page.click("#compare");
    await page.settled();
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 800;
      canvas.getContext("2d")!.fillRect(0, 0, 400, 800);
      const blob = await new Promise<Blob>((done) => canvas.toBlob((made) => done(made!), "image/png"));
      const files = new DataTransfer();
      files.items.add(new File([blob], "shot.png", { type: "image/png" }));
      const input = document.getElementById("compare-files") as HTMLInputElement;
      input.files = files.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.until(`document.getElementById("toast").hasAttribute("data-on")`);
    await page.frames();
    const covered = await page.evaluate(coveredByToast);
    await page.close();
    expect(covered).toEqual([]);
  }, 60_000);

  test("when the storage is full, every comment stays in memory, and the refusal shows on the toast and is said once with the outcome", async () => {
    const page = await open(1440, 900);
    await page.evaluate(() => {
      // Every text the toast shows, sampled on each frame, and every text the live region says, in order: each setting of
      // the text adds a node, so the records keep every text, even two set in one task.
      const shown: string[] = [];
      const said: string[] = [];
      Object.assign(window, { shown, said });
      const toast = document.getElementById("toast")!;
      const tick = () => {
        if (toast.hasAttribute("data-on")) shown.push(toast.textContent ?? "");
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) said.push(node.textContent ?? "");
      }).observe(document.getElementById("announce")!, { childList: true });
      // The page has stored its record at load. Fill the browser's real storage to its quota, so each later write is refused.
      let n = 0;
      for (const size of [1 << 20, 1 << 10, 1])
        try {
          for (;;) localStorage.setItem(`filler-${n++}`, "x".repeat(size));
        } catch {}
    });
    await page.click('[data-testid="proto-comments-toggle"]');
    for (const text of ["First.", "Second."]) {
      await page.click('[data-testid="items-refresh"]', true);
      await page.type(text);
      await page.click("#comment-add");
      await page.calm();
    }
    await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
    const found = await page.evaluate(() => {
      const { shown, said } = window as unknown as { shown: string[]; said: string[] };
      const refused = (text: string) => text.includes("will not keep your comments");
      const result = {
        items: [...document.querySelectorAll("#comments-list > li")].map(
          (item) => ["First.", "Second."].find((text) => item.textContent?.includes(text)) ?? "",
        ),
        shown: shown.some(refused),
        said: said.filter(refused),
      };
      localStorage.clear();
      return result;
    });
    await page.close();
    expect(found).toEqual({
      items: ["First.", "Second."],
      shown: true,
      said: ["Comment 1 added. This browser will not keep your comments, so they live in this tab only. Download the round before you close it."],
    });
  }, 60_000);
});
