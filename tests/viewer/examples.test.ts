/// <reference lib="dom" />
// Every example the tool ships, and the starter's first build, show every screen of theirs, in each theme they declare,
// on a narrow and a wide window: the frame shows that screen alone, in its first state, in that
// theme, and the link names no problem.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
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

/**
 * What the shown view breaks of the rules of `skills/prototyping/references/layout.md` that a number can hold, read in
 * the frame. Columns: the items of one list, or the blocks of one component under one parent, are a group; where the
 * group stacks, each part of an item (a cell of a row) starts at the same left edge in every item, and where it stands
 * in a line, each part starts at the same top (a part that stands at its end, as a time does, holds its right edge); an item whose parts stack keeps them on one left edge. Spacing: no drawn
 * box (a border or a background) touches the drawn box above it, but the rows of one list, which a rule divides. Each
 * fault names the place and the numbers, within half a pixel.
 */
function layoutFaults(): string[] {
  const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
  const state = doc.querySelector<HTMLElement>("[data-proto-screen] > [data-proto-state]");
  if (!state) return ["no state shown"];
  const where = `${state.parentElement!.getAttribute("data-proto-screen")}/${state.getAttribute("data-proto-state")}`;
  const view = doc.defaultView!;
  const shown = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width >= 2 && el.getBoundingClientRect().height >= 2;
  const parts = (el: Element): Element[] =>
    [...el.children].flatMap((child) =>
      child.tagName === "TEMPLATE" ? [] : view.getComputedStyle(child).display === "contents" ? parts(child) : shown(child) ? [child] : [],
    );
  const name = (el: Element) => el.getAttribute("data-proto-component") ?? el.getAttribute("data-testid") ?? el.tagName.toLowerCase();
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  const faults: string[] = [];
  for (const parent of [state, ...state.querySelectorAll("*")]) {
    const listed = parent.hasAttribute("data-proto-list");
    const groups = new Map<string, Element[]>();
    for (const child of parts(parent)) {
      const key = listed ? "item" : child.getAttribute("data-proto-component");
      if (key) groups.set(key, [...(groups.get(key) ?? []), child]);
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const lines: Element[][] = [];
      for (const member of members) {
        const top = member.getBoundingClientRect().top;
        const line = lines.find((found) => Math.abs(found[0]!.getBoundingClientRect().top - top) <= 0.5);
        if (line) line.push(member);
        else lines.push([member]);
      }
      const compare = (items: Element[], edge: "left" | "top") => {
        const cells = items.map(parts);
        const count = cells[0]!.length;
        if (cells.some((one) => one.length !== count)) return;
        for (let i = 0; i < count; i++) {
          // A column that stands at its end, as a time or an amount does, holds its end edge.
          const end = edge === "left" && /end|right/.test(view.getComputedStyle(cells[0]![i]!).justifySelf);
          const side = end ? "right" : edge;
          const edges = cells.map((one) => one[i]!.getBoundingClientRect()[side]);
          if (spread(edges) > 0.5)
            faults.push(`${where}: the ${side} edges of part ${i + 1} of each ${name(items[0]!)} differ: ${edges.map((e) => e.toFixed(1)).join(", ")}`);
        }
      };
      if (lines.every((line) => line.length === 1)) compare(members, "left");
      else for (const line of lines) if (line.length > 1) compare(line, "top");
      for (const member of members) {
        const cells = parts(member);
        const first = cells[0]?.getBoundingClientRect();
        const stacked = cells.filter((cell) => first && cell.getBoundingClientRect().top >= first.bottom - 0.5);
        if (first && stacked.length === cells.length - 1 && stacked.length > 0) {
          const lefts = cells.map((cell) => cell.getBoundingClientRect().left);
          if (spread(lefts) > 0.5) faults.push(`${where}: the stacked parts of a ${name(member)} start at ${lefts.map((e) => e.toFixed(1)).join(", ")}`);
        }
      }
    }
  }
  const drawn = (el: Element) => {
    const style = view.getComputedStyle(el);
    const paints = (color: string) => color !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(color);
    const border = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && paints(style.getPropertyValue(`border-${side.toLowerCase()}-color`)),
    );
    return border || paints(style.backgroundColor) || style.backgroundImage !== "none";
  };
  const boxes = [...state.querySelectorAll("*")].filter((el) => shown(el) && drawn(el));
  for (const above of boxes) {
    for (const below of boxes) {
      if (above === below || above.contains(below) || below.contains(above)) continue;
      if (above.parentElement === below.parentElement && above.parentElement?.hasAttribute("data-proto-list")) continue;
      const a = above.getBoundingClientRect();
      const b = below.getBoundingClientRect();
      const across = a.left < b.right - 0.5 && b.left < a.right - 0.5;
      if (across && b.top >= a.bottom - 0.5 && b.top - a.bottom < 0.5) faults.push(`${where}: ${name(below)} touches ${name(above)} above it`);
    }
  }
  return faults;
}

/**
 * Where the title and the back control stand in the shown view, in the frame: the title's start edge and top, the back
 * control's place when it shows, and, when it does not, how far the title's top stands below the inside of its bar's
 * top (its border and padding), which is 0 when the bar keeps no empty row above the title.
 */
function chrome(): { start: string; top: string; back: string | null; band: string | null } {
  const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
  const title = doc.querySelector<HTMLElement>('[data-proto-slot="title"]');
  const back = doc.querySelector<HTMLElement>("[data-proto-back]");
  const box = title?.getClientRects().length ? title.getBoundingClientRect() : null;
  const backBox = back?.getClientRects().length ? back.getBoundingClientRect() : null;
  let band: string | null = null;
  if (box && !backBox && title?.parentElement) {
    const bar = title.parentElement;
    const style = doc.defaultView!.getComputedStyle(bar);
    const inside = bar.getBoundingClientRect().top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    band = (box.top - inside).toFixed(1);
  }
  return {
    start: box ? box.left.toFixed(1) : "none",
    top: box ? box.top.toFixed(1) : "none",
    back: backBox ? `${backBox.left.toFixed(1)},${backBox.top.toFixed(1)}` : null,
    band,
  };
}

describe.skipIf(!BROWSER)("the shipped example keeps its layout rules", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  // Each window width, in each web frame the example declares: the frame's own width sets the layout, and the window's
  // the zoom the frame is drawn at.
  for (const width of [1440, 1024, 320]) {
    test(`at ${width} px: the columns of every list hold, no block touches the block above it, the title and the back control stand still, and no empty band stands above the title`, async () => {
      const page = await browser.open(width, 900);
      await page.goto(`${examplePage()}#`);
      const views = await page.evaluate(() =>
        [...(document.getElementById("product") as HTMLTemplateElement).content.querySelectorAll("[data-proto-screen]")].flatMap((screen) =>
          [...screen.children]
            .filter((child) => child.hasAttribute("data-proto-state"))
            .map((state) => `${screen.getAttribute("data-proto-screen")}/${state.getAttribute("data-proto-state")}`),
        ),
      );
      const faults: string[] = [];
      for (const frame of ["1024", "320"]) {
        const starts = new Set<string>();
        const backs = new Set<string>();
        const tops = new Set<string>();
        for (const view of views) {
          await page.evaluate((hash: string) => {
            location.hash = hash;
          }, `#${view}?frame=${frame}`);
          await page.tasksRun();
          await page.settled();
          faults.push(...(await page.evaluate(layoutFaults)).map((fault) => `${frame}: ${fault}`));
          const placed = await page.evaluate(chrome);
          starts.add(placed.start);
          if (placed.back) backs.add(placed.back);
          else tops.add(placed.top);
          // A screen with no back control keeps no empty row for it: its title stands at the bar's own padding.
          if (placed.band !== null && Math.abs(Number(placed.band)) > 0.5)
            faults.push(`${frame}: ${view}: the title stands ${placed.band} px below its bar's padding, an empty band above it`);
        }
        if (starts.size !== 1) faults.push(`${frame}: the title starts at ${[...starts].join(" and ")}`);
        if (backs.size > 1) faults.push(`${frame}: the back control stands at ${[...backs].join(" and ")}`);
        if (tops.size > 1) faults.push(`${frame}: with no back control, the title's top stands at ${[...tops].join(" and ")}`);
        if (backs.size === 0) faults.push(`${frame}: no screen shows a back control, so its place was never read`);
      }
      expect(faults).toEqual([]);
      await page.close();
    }, 180_000);
  }
});

/**
 * What the shown view breaks of the rules of `layout.md` across widths and for comfort that a number can hold, read in a
 * phone-wide frame: the page scrolls sideways, or a box that clips its content cuts it; the title or the view's main
 * action (its primary control, or else its first control) ends below the first screenful; a target is smaller than
 * 44 by 44; the body's text, a paragraph's, or a field's is under 16 px. `text200` is whether the text is at 200%, where
 * only the scroll and the cut are held.
 */
function comfortFaults(text200: boolean): string[] {
  const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
  const view = doc.defaultView!;
  const state = doc.querySelector<HTMLElement>("[data-proto-screen] > [data-proto-state]");
  if (!state) return ["no state shown"];
  const where = `${state.parentElement!.getAttribute("data-proto-screen")}/${state.getAttribute("data-proto-state")}`;
  const shown = (el: Element) => el.getClientRects().length > 0 && el.getBoundingClientRect().width >= 2 && el.getBoundingClientRect().height >= 2;
  const name = (el: Element) => el.getAttribute("data-testid") ?? el.getAttribute("data-proto-component") ?? el.className ?? el.tagName.toLowerCase();
  const faults: string[] = [];
  const root = doc.scrollingElement!;
  if (root.scrollWidth > root.clientWidth + 0.5) faults.push(`${where}: the page scrolls sideways, ${root.scrollWidth} px in ${root.clientWidth}`);
  // A field's value scrolls inside the field by design, so a field is no box that cuts.
  for (const el of doc.body.querySelectorAll("*")) {
    if (!shown(el) || el.matches("input, select, textarea")) continue;
    const style = view.getComputedStyle(el);
    if (style.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1)
      faults.push(`${where}: ${name(el)} cuts its content, ${el.scrollWidth} px in ${el.clientWidth}`);
  }
  if (text200) return faults;
  const screenful = view.innerHeight;
  const title = doc.querySelector('[data-proto-slot="title"]');
  if (!title || title.getBoundingClientRect().bottom > screenful + 0.5) faults.push(`${where}: the title ends below the first ${screenful} px`);
  const controls = [...state.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")].filter(shown);
  const main = controls.find((control) => control.getAttribute("data-proto-variant") === "primary") ?? controls[0];
  if (main && main.getBoundingClientRect().bottom > screenful + 0.5)
    faults.push(`${where}: the main action ${name(main)} ends at ${main.getBoundingClientRect().bottom.toFixed(1)}, below the first ${screenful} px`);
  for (const target of [...doc.body.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], summary")].filter(shown)) {
    const box = target.getBoundingClientRect();
    if (box.width < 43.5 || box.height < 43.5) faults.push(`${where}: ${name(target)} is ${box.width.toFixed(1)} by ${box.height.toFixed(1)}`);
  }
  const size = (el: Element) => parseFloat(view.getComputedStyle(el).fontSize);
  if (size(doc.body) < 16) faults.push(`${where}: the body's text is ${size(doc.body)} px`);
  for (const text of [...doc.body.querySelectorAll("p, input, select, textarea")].filter(shown))
    if (size(text) < 16) faults.push(`${where}: ${name(text)}'s text is ${size(text)} px`);
  return faults;
}

describe.skipIf(!BROWSER)("the shipped example is drawn mobile first", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("its styles add each wider layout by a min-width query, and write each breakpoint once", () => {
    const sources = [
      "assets/examples/app.html",
      ...["flows", "blocks"].flatMap((dir) => readdirSync(join(REPOSITORY, "assets/examples", dir)).map((file) => `assets/examples/${dir}/${file}`)),
    ];
    const queries = sources.flatMap((file) =>
      [...readFileSync(join(REPOSITORY, file), "utf8").matchAll(/@(media|container)\s+([^{]+)\{/g)].map((found) => `${found[1]} ${found[2]!.trim()}`),
    );
    const widths = queries.filter((query) => /width/.test(query));
    expect(widths.filter((query) => /max-width|width\s*<|<\s*width/.test(query))).toEqual([]);
    expect(widths.filter((query, at) => widths.indexOf(query) !== at)).toEqual([]);
    expect(widths.length).toBeGreaterThan(0);
  });

  test("at 320: no state scrolls sideways or cuts its text, at 100% and 200%; the title and the main action stand in the first screenful; every target is 44 by 44; and the body's, a paragraph's, and a field's text is 16 px", async () => {
    const page = await browser.open(320, 900);
    await page.goto(`${examplePage()}#`);
    const views = await page.evaluate(() =>
      [...(document.getElementById("product") as HTMLTemplateElement).content.querySelectorAll("[data-proto-screen]")].flatMap((screen) =>
        [...screen.children]
          .filter((child) => child.hasAttribute("data-proto-state"))
          .map((state) => `${screen.getAttribute("data-proto-screen")}/${state.getAttribute("data-proto-state")}`),
      ),
    );
    const faults: string[] = [];
    for (const theme of shippedThemes()) {
      for (const text of ["100", "200"]) {
        for (const view of views) {
          await page.evaluate((hash: string) => {
            location.hash = hash;
          }, `#${view}?theme=${theme}&frame=320&text=${text}`);
          await page.tasksRun();
          await page.settled();
          faults.push(...(await page.evaluate(comfortFaults, text === "200")).map((fault) => `${theme} ${text}%: ${fault}`));
        }
      }
    }
    expect(faults).toEqual([]);
    await page.close();
  }, 240_000);
});
