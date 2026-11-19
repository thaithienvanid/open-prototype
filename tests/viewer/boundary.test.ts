/// <reference lib="dom" />
// The boundary between a design and the viewer. What the viewer does not show is not in the frame: the screens and
// states it does not show are taken out of the frame's document, so no rule a design writes can show them. The viewer injects no rule for `hidden` and keeps no style layer, and a design's own
// `hidden` stays the design's. And the viewer never holds a live copy of a design outside a frame, where a design's
// image would load and its handlers could run.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BROWSER, Browser, type Page } from "./page.ts";
import { hostilePage, unguardedPage } from "./pages.ts";

type Holds = { screens: string[]; states: string[] };

/** The Prototype frame: what it holds, which of its screens and states carry `hidden`, the design's own `hidden`, and the viewer's rules. */
function prototypeFrame(): Holds & { hiddenSet: string[]; ownHidden: boolean | null; viewerRules: string } {
  const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
  const found = (selector: string) =>
    [...doc.querySelectorAll(selector)].map((el) => el.getAttribute("data-proto-screen") ?? el.getAttribute("data-proto-state") ?? "");
  const own = doc.querySelector('[data-testid="one-own-hidden"]');
  return {
    screens: found("[data-proto-screen]"),
    states: found("[data-proto-state]"),
    hiddenSet: found("[data-proto-screen][hidden], [data-proto-state][hidden]"),
    ownHidden: own ? own.hasAttribute("hidden") : null,
    viewerRules: doc.head.querySelector("style")?.textContent ?? "",
  };
}

async function settledBoard(page: Page): Promise<void> {
  await page.until(`document.getElementById("board").dataset.ready === "true"`);
}

describe.skipIf(!BROWSER)("what is not shown is not in the frame", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("a design that tries every way to show what the viewer does not shows only the shown screen and state", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(hostilePage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const steps: Holds[] = [];
    const take = async () => {
      const frame = await page.evaluate(prototypeFrame);
      steps.push({ screens: frame.screens, states: frame.states });
      return frame;
    };
    const first = await take();
    // The viewer sets no `hidden` on a screen or a state, adds no rule for it and no layer, and leaves the design's own.
    expect(first.hiddenSet).toEqual([]);
    expect(first.ownHidden).toBe(true);
    expect(first.viewerRules).not.toMatch(/hidden|@layer/i);
    for (const press of ["j", "j", "j", "j"]) {
      await page.key(press);
      await page.settled();
      await take();
    }
    await page.key("k");
    await page.settled();
    await take();
    expect(steps).toEqual([
      { screens: ["one"], states: ["ready"] },
      { screens: ["one"], states: ["loading"] },
      { screens: ["one"], states: ["empty"] },
      { screens: ["two"], states: ["ready"] },
      { screens: ["two"], states: ["error"] },
      { screens: ["two"], states: ["ready"] },
    ]);
    // A go in the design opens its screen the same way.
    await page.key("k");
    await page.key("k");
    await page.key("k");
    await page.settled();
    await page.click('[data-testid="one-two"]', true);
    await page.settled();
    expect(await page.evaluate(prototypeFrame)).toMatchObject({ screens: ["two"], states: ["ready"], hiddenSet: [] });
    await page.close();
  }, 60_000);

  test("each Board cell holds its one screen and state, and each System specimen its one component", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(hostilePage());
    await page.key("v");
    await settledBoard(page);
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLIFrameElement>("#board iframe")].map((frame) => {
        const doc = frame.contentDocument!;
        return (
          [...doc.querySelectorAll("[data-proto-screen]")].map((el) => el.getAttribute("data-proto-screen")).join(",") +
          "/" +
          [...doc.querySelectorAll("[data-proto-state]")].map((el) => el.getAttribute("data-proto-state")).join(",")
        );
      }),
    );
    expect(cells.sort()).toEqual(["one/empty", "one/loading", "one/ready", "two/error", "two/ready"]);
    await page.key("v");
    await page.until(
      `document.querySelectorAll("#system-components iframe").length === 2 && [...document.querySelectorAll("#system-components iframe")].every((frame) => frame.contentDocument && frame.contentDocument.querySelector("[data-proto-component]"))`,
    );
    const specimens = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLIFrameElement>("#system-components iframe")].map((frame) => {
        const doc = frame.contentDocument!;
        const component = doc.querySelectorAll("[data-proto-component]");
        // A specimen keeps the screen and state around its component, so the design's own rules still reach it, and nothing else of them.
        return {
          components: component.length,
          screens: doc.querySelectorAll("[data-proto-screen]").length,
          states: doc.querySelectorAll("[data-proto-state]").length,
          other: doc.body.textContent!.replace(/\s+/g, " ").trim(),
        };
      }),
    );
    expect(specimens).toEqual([
      { components: 1, screens: 1, states: 1, other: "Badge" },
      { components: 1, screens: 1, states: 1, other: "Quiet badge" },
    ]);
    await page.close();
  }, 60_000);

  test("no live copy of the design sits in the viewer's own document: a forced handler never runs", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(unguardedPage());
    await page.key("v");
    await settledBoard(page);
    await page.key("v");
    await page.until(`document.querySelectorAll("#system-components iframe").length === 2`);
    await Bun.sleep(300);
    expect(
      await page.evaluate(() => ({
        ran: (window as unknown as { __ran?: number }).__ran ?? 0,
        inViewer: document.querySelectorAll("[data-proto-screen], [data-proto-component]").length,
      })),
    ).toEqual({ ran: 0, inViewer: 0 });
    await page.close();
  }, 60_000);
});
