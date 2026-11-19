/// <reference lib="dom" />
// The walk: a person's steps through the viewer, by key and by pointer, over both examples. After each step the test
// reads what a person would notice (the deep link, the focused control, the counts, what was announced) and compares it
// with the recorded walk beside this file. The record changes only on purpose: run with PROTOTYPE_RECORD=1, read the
// difference, and commit it with the change that caused it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BROWSER, Browser, type Page } from "./page.ts";
import { hugePage, largePage, productPage } from "./pages.ts";

type Step =
  | { do: "key"; key: string; shift?: boolean }
  | { do: "click"; on: string }
  | { do: "frame"; on: string }
  | { do: "type"; text: string }
  | { do: "pick"; on: string; value: string }
  | { do: "focus"; on: string };
type Seen = { step: string; link: string; focus: string; tab: string; where: string; seen: string; comments: string; said: string; panels: string };

const key = (name: string, shift = false): Step => ({ do: "key", key: name, shift });
const click = (on: string): Step => ({ do: "click", on });
const id = (testid: string): string => `[data-testid="${testid}"]`;

/** What a person would notice now. */
function notice(): Omit<Seen, "step"> {
  const text = (name: string) => (document.getElementById(name)?.textContent ?? "").replace(/\s+/g, " ").trim();
  const active = document.activeElement as HTMLElement | null;
  const workspace = document.getElementById("workspace") as HTMLElement;
  const shown = (name: string) => {
    const found = document.getElementById(name);
    return Boolean(found?.getClientRects().length);
  };
  return {
    link: location.hash,
    focus: !active || active === document.body ? "the page body" : active.dataset.testid || active.id || active.tagName.toLowerCase(),
    tab: workspace.dataset.tab + (workspace.dataset.present === "true" ? ", full screen" : ""),
    where: shown("crumb") ? text("crumb") : shown("where-board") ? text("where-board") : text("where-system"),
    seen: `${text("seen-count")} | ${text("seen-where")}`,
    comments:
      text("comments-count") +
      " | " +
      document.querySelectorAll("#comments-list > li").length +
      " listed | " +
      document.querySelectorAll(".pv-pin").length +
      " pins",
    said: text("announce"),
    panels:
      (shown("screen-menu") ? "screens " : "") +
      (shown("inspector") ? "inspector " : "") +
      (shown("checks-menu") ? "menu " : "") +
      ((document.getElementById("shortcuts") as HTMLDialogElement).open ? "shortcuts " : "") +
      (shown("comment-form") ? "form" : ""),
  };
}

async function settle(page: Page): Promise<void> {
  await page.until(
    `document.getElementById("workspace").dataset.ready === "true" && (document.getElementById("workspace").dataset.tab !== "board" || document.getElementById("board").dataset.ready === "true")`,
  );
  await page.evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`);
}

async function act(page: Page, step: Step): Promise<string> {
  if (step.do === "key") {
    await page.key(step.key, step.shift);
    return `${step.shift ? "Shift+" : ""}key ${step.key}`;
  }
  if (step.do === "click") {
    await page.click(step.on);
    return `click ${step.on}`;
  }
  if (step.do === "frame") {
    await page.click(step.on, true);
    return `click in the frame ${step.on}`;
  }
  if (step.do === "type") {
    await page.type(step.text);
    return `type ${step.text}`;
  }
  if (step.do === "focus") {
    await page.evaluate((on: string) => (document.querySelector(on) as HTMLElement).focus(), step.on);
    return `focus ${step.on}`;
  }
  await page.evaluate(
    ({ on, value }: { on: string; value: string }) => {
      const select = document.querySelector(on) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { on: step.on, value: step.value },
  );
  return `pick ${step.value} in ${step.on}`;
}

async function walk(page: Page, address: string, steps: Step[]): Promise<Seen[]> {
  await page.goto(address);
  await page.evaluate(`localStorage.clear()`);
  await page.goto(`${address}#`);
  await page.reload();
  const seen: Seen[] = [{ step: "open the page", ...(await page.evaluate(notice)) }];
  for (const step of steps) {
    const name = await act(page, step);
    await page.tasksRun();
    await settle(page);
    seen.push({ step: name, ...(await page.evaluate(notice)) });
  }
  return seen;
}

const WALKS: Record<string, { page: () => string; width: number; steps: Step[] }> = {
  "the product example, by keys": {
    page: productPage,
    width: 1440,
    steps: [
      key("1"),
      key("2"),
      key("j"),
      key("j"),
      key("j"),
      key("j"),
      key("k"),
      key("n"),
      key("n"),
      key("t"),
      key("t"),
      key("t"),
      key("d"),
      key("d"),
      key("v"),
      key("v"),
      key("v"),
      key("c"),
      key("Escape"),
      key("f"),
      key("Escape"),
      key("["),
      key("["),
      key("]"),
      key("]"),
      key("?"),
      key("Escape"),
    ],
  },
  "the product example, by pointer": {
    page: productPage,
    width: 1440,
    steps: [
      click("#state-prev"),
      click("#state-next"),
      click(id("proto-theme-dark")),
      click(id("proto-theme-system")),
      click(id("proto-zoom-actual")),
      click(id("proto-zoom-fit")),
      click("#checks-toggle"),
      click(id("proto-check-text")),
      key("Escape"),
      { do: "pick", on: "#frame-pick", value: "ios" },
      { do: "pick", on: "#frame-pick", value: "1024" },
      click(id("proto-screen-items-list-empty")),
      click(id("proto-screen-items-detail")),
      click("#next-unseen"),
      click("#itab-screen"),
      click("#itab-comments"),
      click("#compare"),
      click("#compare"),
      click("#copy-link"),
      click("#shortcuts-open"),
      click("#keys-switch"),
      key("j"),
      click("#keys-switch"),
      click("#shortcuts-close"),
      click("#tab-board"),
      click(id("proto-board-unseen")),
      click(id("proto-board-all")),
      click(id("proto-board-items-detail-ready")),
      click("#tab-system"),
      click("#tab-prototype"),
      click("#screen-filter"),
      { do: "type", text: "alert" },
      click(id("proto-screen-settings-prefs")),
    ],
  },
  "the product example, a comment": {
    page: productPage,
    width: 1440,
    steps: [
      key("c"),
      { do: "frame", on: "[data-testid]" },
      click("#comment-add"),
      { do: "type", text: "Say what the request is waiting for." },
      click("#comment-add"),
      click(id("proto-comments-type-question")),
      { do: "pick", on: "#comment-target", value: "" },
      key("Escape"),
      key("j"),
      click(id("proto-comments-copy-json")),
      click("#comments-send"),
    ],
  },
  "the product example, a narrow window": {
    page: productPage,
    width: 320,
    steps: [
      click(id("proto-screens-toggle")),
      key("Escape"),
      click("#inspect-toggle"),
      key("Escape"),
      click("#build-toggle"),
      key("Escape"),
      key("t"),
      click("#checks-toggle"),
      key("Escape"),
      click("#tab-board"),
      click("#tab-prototype"),
    ],
  },
  "a flow design, by keys and pointer": {
    page: productPage,
    width: 1440,
    steps: [
      key("n"),
      key("n"),
      key("n"),
      key("n"),
      key("n"),
      key("3"),
      key("j"),
      key("v"),
      click(id("proto-board-commented")),
      key("v"),
      key("v"),
      { do: "frame", on: "[data-proto-go]" },
      key("k"),
      click("#state-next"),
    ],
  },
};

/** The order Tab visits the controls, by test id or id, from a fresh page. */
async function tabOrder(page: Page, address: string): Promise<string[]> {
  await page.goto(address);
  await page.evaluate(`localStorage.clear()`);
  await page.reload();
  const order: string[] = [];
  for (let stop = 0; stop < 80; stop++) {
    await page.key("Tab");
    const at = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return !active || active === document.body ? "the page body" : active.tagName === "IFRAME" ? "the frame" : active.dataset.testid || active.id;
    });
    if (at === "the page body" || (order.length > 3 && at === order[0])) break;
    if (order[order.length - 1] !== at) order.push(at);
  }
  return order;
}

const RECORD = join(import.meta.dir, "walk.recorded.json");

describe.skipIf(!BROWSER)("the walk", () => {
  let browser: Browser;
  const walked: Record<string, unknown> = {};
  const recorded = existsSync(RECORD) ? (JSON.parse(readFileSync(RECORD, "utf8")) as Record<string, unknown>) : {};
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(async () => {
    await browser.close();
    if (process.env.PROTOTYPE_RECORD === "1") writeFileSync(RECORD, `${JSON.stringify(walked, null, 1)}\n`);
  });

  for (const [name, { page: address, width, steps }] of Object.entries(WALKS)) {
    test(name, async () => {
      const page = await browser.open(width, 900);
      walked[name] = await walk(page, address(), steps);
      await page.close();
      if (process.env.PROTOTYPE_RECORD !== "1") expect(walked[name]).toEqual(recorded[name]);
    }, 120_000);
  }

  test("a product of 200 screens opens, and its Board becomes ready", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(largePage());
    expect(await page.evaluate(() => document.querySelectorAll("#screen-list .pv-scr").length)).toBe(200);
    await page.key("v");
    await page.until(`document.getElementById("workspace").dataset.tab === "board" && document.getElementById("board").dataset.ready === "true"`, 30_000);
    expect(await page.evaluate(() => document.querySelectorAll("#board .pv-rowh").length)).toBe(200);
    await page.close();
  }, 90_000);

  // A redraw's cost must grow with the screens, never with their square. Each key press redraws every part from the
  // state, so the test compares a product of 2,000 screens with one of 200: ten times the screens may cost about ten
  // times as much, and a screen looked up by a search of the list cost about a hundred times as much. A ratio holds on a
  // slow machine as on a fast one, where a ceiling in milliseconds failed on a shared CI runner.
  test("a redraw of 2,000 screens costs no more than 30 times one of 200", async () => {
    const medianPress = async (address: string, screens: number): Promise<number> => {
      const page = await browser.open(1440, 900);
      await page.goto(address);
      expect(await page.evaluate(() => document.querySelectorAll("#screen-list .pv-scr").length)).toBe(screens);
      const times: number[] = [];
      for (let press = 0; press < 7; press++) {
        times.push(
          await page.evaluate(() => {
            const started = performance.now();
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
            return performance.now() - started;
          }),
        );
        await page.settled();
      }
      await page.close();
      return [...times].sort((a, b) => a - b)[3] ?? Number.POSITIVE_INFINITY;
    };
    const small = await medianPress(largePage(), 200);
    const big = await medianPress(hugePage(), 2000);
    // A floor of 1 ms keeps a fast machine's near-zero redraw of 200 screens from making the ratio meaningless.
    expect({ ratio: big / Math.max(small, 1) <= 30 }).toEqual({ ratio: true });
  }, 180_000);

  // The Board makes a cell's frame only when the cell comes near the view, so a board of 2,000 screens is ready about as
  // fast as one of 200 grows by its rows alone. Every cell is still there, with its name, in the Tab order, from the start.
  test("the Board of 2,000 screens holds every cell, and a frame only for the cells near the view", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(hugePage());
    await page.key("v");
    await page.until(`document.getElementById("workspace").dataset.tab === "board" && document.getElementById("board").dataset.ready === "true"`, 60_000);
    const board = await page.evaluate(() => {
      const room = document.getElementById("scroller")!.getBoundingClientRect();
      const near = (box: DOMRect, margin: number) =>
        box.bottom > room.top - margin && box.top < room.bottom + margin && box.right > room.left - margin && box.left < room.right + margin;
      const boxes = [...document.querySelectorAll<HTMLElement>("#board .pv-thumb-frame")];
      const inView = boxes.filter((box) => near(box.getBoundingClientRect(), 0));
      return {
        rows: document.querySelectorAll("#board .pv-rowh").length,
        cells: document.querySelectorAll("#board .pv-thumb-name").length,
        named: [...document.querySelectorAll("#board .pv-thumb-name")].every((open) => open.getAttribute("aria-label")),
        inViewDrawn: inView.length > 0 && inView.every((box) => box.querySelector("iframe")?.contentDocument?.querySelector("[data-proto-screen]")),
        framesFar: boxes.filter((box) => box.querySelector("iframe") && !near(box.getBoundingClientRect(), 300)).length,
        frames: document.querySelectorAll("#board iframe").length,
      };
    });
    await page.close();
    expect({ ...board, fewFrames: board.frames < 100 }).toEqual({
      rows: 2000,
      cells: 4000,
      named: true,
      inViewDrawn: true,
      framesFar: 0,
      frames: board.frames,
      fewFrames: true,
    });
  }, 90_000);

  // The Board's time to be ready must grow no faster than its screens: ten times the screens may cost about ten times as
  // much. It made a frame for every cell, then read the place of every cell each time one loaded, and took 3.6 s on
  // 2,000 screens and 0.47 s on 200; now it makes a frame only near the view, and takes about 0.55 s and 0.13 s. A ratio
  // holds on a slow machine as on a fast one, where a ceiling in milliseconds fails on a shared CI runner.
  test("the Board of 2,000 screens is ready in no more than 10 times the time of one of 200", async () => {
    const medianReady = async (address: string, screens: number): Promise<number> => {
      const times: number[] = [];
      for (let run = 0; run < 3; run++) {
        const page = await browser.open(1440, 900);
        await page.goto(address);
        expect(await page.evaluate(() => document.querySelectorAll("#screen-list .pv-scr").length)).toBe(screens);
        const started = Date.now();
        await page.key("v");
        await page.until(`document.getElementById("workspace").dataset.tab === "board" && document.getElementById("board").dataset.ready === "true"`, 60_000);
        times.push(Date.now() - started);
        await page.close();
      }
      return [...times].sort((a, b) => a - b)[1] ?? Number.POSITIVE_INFINITY;
    };
    const small = await medianReady(largePage(), 200);
    const big = await medianReady(hugePage(), 2000);
    // A floor of 1 ms keeps a fast machine's near-zero time for 200 screens from making the ratio meaningless.
    expect({ ratio: big / Math.max(small, 1) <= 10 }).toEqual({ ratio: true });
  }, 240_000);

  for (const width of [1440, 320]) {
    test(`Tab visits the controls in the recorded order at ${width}`, async () => {
      const page = await browser.open(width, 900);
      const name = `the Tab order at ${width}`;
      walked[name] = await tabOrder(page, productPage());
      await page.close();
      if (process.env.PROTOTYPE_RECORD !== "1") expect(walked[name]).toEqual(recorded[name]);
    }, 60_000);
  }
});
