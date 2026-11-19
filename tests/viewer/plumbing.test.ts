/// <reference lib="dom" />
// A design holds nothing of the viewer: the viewer shows one screen in one state by taking the others out
// of the frame, finds the title by its slot, and gives a frame's root and body the design's own attributes. Proved
// against a design with no plumbing, and against one with its own style layers and its own !important rules: what is not
// shown is not in the frame.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BROWSER, Browser } from "./page.ts";
import { cascadePage, entriesPage, plainPage } from "./pages.ts";

/** What the frame shows: the screens and states a person can see, and the title. */
function shown(): { screens: string[]; states: string[]; title: string; root: string; body: string } {
  const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
  const seen = (el: Element) => el.getClientRects().length > 0;
  return {
    screens: [...doc.querySelectorAll<HTMLElement>("[data-proto-screen]")].filter(seen).map((el) => el.getAttribute("data-proto-screen") ?? ""),
    states: [...doc.querySelectorAll<HTMLElement>("[data-proto-screen] > [data-proto-state]")]
      .filter(seen)
      .map((el) => el.getAttribute("data-proto-state") ?? ""),
    title: doc.querySelector('[data-proto-slot="title"]')?.textContent ?? "",
    root: ["lang", "dir", "class"].map((name) => doc.documentElement.getAttribute(name)).join(" "),
    body: doc.body.className,
  };
}

/** What the frame's document holds, the `hidden` the viewer leaves as the design wrote it, and the viewer's first rule. */
function heldCheck(): { held: string[]; hiddenOnScreensAndStates: string[]; panelHidden: boolean | null; untilFound: string; firstStyle: string } {
  const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
  const named = (el: Element) => el.getAttribute("data-testid") ?? el.getAttribute("data-proto-screen") ?? "";
  return {
    held: [...doc.querySelectorAll("[data-proto-screen], [data-proto-state]")].map(named),
    hiddenOnScreensAndStates: [...doc.querySelectorAll("[data-proto-screen][hidden], [data-proto-state][hidden]")].map(named),
    panelHidden: doc.querySelector('[data-proto-panel="more"]')?.hasAttribute("hidden") ?? null,
    untilFound: (() => {
      const found = doc.querySelector('[data-testid="one-found"]');
      return found ? doc.defaultView!.getComputedStyle(found).display : "";
    })(),
    firstStyle: (doc.head.querySelector("style")?.textContent ?? "").trim().split("\n")[0] ?? "",
  };
}

describe.skipIf(!BROWSER)("a design that holds nothing of the viewer", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("shows one screen in one state with its title, and its links, Board and System view work", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(plainPage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    expect(await page.evaluate(shown)).toEqual({ screens: ["list"], states: ["ready"], title: "List", root: "en ltr plain", body: "plain-body" });
    await page.key("j");
    await page.settled();
    expect(await page.evaluate(shown)).toMatchObject({ screens: ["list"], states: ["empty"] });
    await page.key("k");
    await page.settled();
    await page.click('[data-testid="list-open"]', true);
    await page.settled();
    expect(await page.evaluate(shown)).toMatchObject({ screens: ["detail"], states: ["ready"], title: "Detail" });
    expect(
      await page.evaluate(() => (document.getElementById("frame") as HTMLIFrameElement).contentDocument!.activeElement?.getAttribute("data-proto-slot")),
    ).toBe("title");
    // The right-to-left pass sets dir="rtl", and gives the design's own value back.
    const rtl = async () => {
      await page.evaluate(() => (document.querySelector('[data-check="dir"]') as HTMLElement).click());
      await page.settled();
      return (await page.evaluate(shown)).root;
    };
    expect([await rtl(), await rtl()]).toEqual(["en rtl plain", "en ltr plain"]);
    await page.key("v");
    await page.until(`document.getElementById("board").dataset.ready === "true"`);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLIFrameElement>("#board iframe")].map(
          (frame) => [...frame.contentDocument!.querySelectorAll("[data-proto-screen] > [data-proto-state]")].filter((el) => el.getClientRects().length).length,
        ),
      ),
    ).toEqual(Array(13).fill(1));
    await page.key("v");
    expect(
      await page.evaluate(() => `${document.getElementById("workspace")!.dataset.tab}, ${document.querySelectorAll("#system-tokens .pv-token").length > 0}`),
    ).toBe("system, true");
    await page.close();
  }, 60_000);

  test("the viewer looks for nothing unprefixed in a design: the skip link moves to the title slot, and only a slot gets a tabindex", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(plainPage());
    await page.key("Tab");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("proto-skip-link");
    await page.key("Enter");
    await page.settled();
    expect(
      await page.evaluate(() => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        return {
          focused: doc.activeElement?.getAttribute("data-proto-slot") ?? doc.activeElement?.tagName ?? "",
          tabindex: [...doc.querySelectorAll("[tabindex]")].map((el) => el.getAttribute("data-proto-slot") ?? el.tagName),
        };
      }),
    ).toEqual({ focused: "title", tabindex: ["title"] });
    await page.close();
  }, 60_000);

  test("the frame holds only the shown screen and state, against the design's own layers and !important", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(cascadePage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    expect(await page.evaluate(heldCheck)).toEqual({
      held: ["one", "one-ready"],
      hiddenOnScreensAndStates: [],
      panelHidden: true,
      untilFound: "block",
      firstStyle: expect.not.stringContaining("@layer"),
    });
    expect(await page.evaluate(shown)).toEqual({ screens: ["one"], states: ["ready"], title: "One", root: "ar rtl cascade", body: "cascade-body" });
    // The design's own hidden on a screen stays the design's: its own rules show it here. The state shown keeps the display the design's own cascade gives it (its first layer's !important).
    await page.click('[data-testid="one-two"]', true);
    await page.settled();
    expect(await page.evaluate(heldCheck)).toMatchObject({ held: ["two", "two-ready"] });
    expect(
      await page.evaluate(() => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        return [
          doc.querySelector<HTMLElement>('[data-proto-screen="two"]')!.hidden,
          doc.defaultView!.getComputedStyle(doc.querySelector('[data-testid="two-ready"]')!).display,
        ];
      }),
    ).toEqual([true, "block"]);
    await page.key("k");
    await page.settled();
    expect((await page.evaluate(heldCheck)).held).toEqual(["one", "one-empty"]);
    await page.close();
  }, 60_000);

  test("a text reads the fixtures from the top wherever it stands, and a field reads the current item: its list's entry, or the screen's chosen entry", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(entriesPage());
    const read = () =>
      page.evaluate(() => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        const texts = (selector: string) => [...doc.querySelectorAll(selector)].map((el) => el.textContent ?? "");
        return { rows: texts("li"), ask: texts('[data-testid="loan-ask"]'), title: texts('[data-testid="loan-title"]') };
      });
    expect(await read()).toEqual({ rows: ["Book The Dispossessed", "Book Solaris"], ask: [], title: [] });
    await page.evaluate(() =>
      (document.getElementById("frame") as HTMLIFrameElement).contentDocument!.querySelectorAll<HTMLElement>('[data-testid="row-open"]')[1]!.click(),
    );
    await page.settled();
    expect(await read()).toEqual({ rows: ["Book Fiction"], ask: ["Renew this loan?"], title: ["Solaris"] });
    await page.close();
  }, 60_000);
});
