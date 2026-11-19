/// <reference lib="dom" />
// The probes of the viewer's look and behaviour at phone width and wide: each is a number or a state read in the browser,
// never a look at a picture. Each test's name says what it holds.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../../src/cli.ts";
import { FLOW_DESIGN, flowDesign, single } from "../cases.ts";
import { tempFolder } from "../temp.ts";
import { BROWSER, Browser, type Media, type Page } from "./page.ts";
import { examplePage, pageWith, productPage, REPOSITORY } from "./pages.ts";
import { barFaults, paintOf } from "./probes.ts";

const id = (testid: string): string => `[data-testid="${testid}"]`;

/** Whether a control of the viewer shows whole in the window and is the element at its own centre, so nothing covers it. */
function inView(selector: string): { whole: boolean; onTop: boolean; box: number[] } {
  const node = document.querySelector(selector)!;
  const r = node.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return {
    whole: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.height > 0,
    onTop: Boolean(hit && (hit === node || node.contains(hit))),
    box: [r.x, r.y, r.right, r.bottom].map((n) => Math.round(n * 10) / 10),
  };
}

describe.skipIf(!BROWSER)("the viewer's look and behaviour at phone width and wide", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());
  async function open(width: number, height = 900, media: Media = {}, address = productPage()): Promise<Page> {
    const page = await browser.open(width, height, media);
    await page.goto(address);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    return page;
  }

  test("at phone width a pick opens the drawer, focuses the field, and the field and Save show whole", async () => {
    const page = await open(320, 700);
    await page.click(id("proto-inspector-toggle"));
    await page.click(id("proto-comments-toggle"));
    await page.click(id("proto-inspector-toggle"));
    await page.settled();
    expect(await page.evaluate(() => document.getElementById("inspector")!.dataset.open)).toBe("false");
    await page.click(id("items-refresh"), true);
    await page.settled();
    const after = await page.evaluate(() => ({
      drawer: document.getElementById("inspector")!.dataset.open,
      focused: document.activeElement?.id,
      target: (document.getElementById("comment-target") as HTMLSelectElement).value !== "",
    }));
    expect(after).toEqual({ drawer: "true", focused: "comment-text", target: true });
    await page.type("Make this clearer.");
    const field = await page.evaluate(inView, "#comment-text");
    const save = await page.evaluate(inView, "#comment-add");
    expect([field.whole, field.onTop, save.whole, save.onTop]).toEqual([true, true, true, true]);
    // The closing block shows only its one button while the form is open.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".pv-finish *")]
          .filter((node) => node.getClientRects().length > 0 && (node.matches("button, a, p") || node.id === "closing-h"))
          .map((node) => node.id || node.dataset.testid || node.tagName),
      ),
    ).toEqual(["closing-next"]);
    expect(await page.evaluate(() => (document.getElementById("comment-text") as HTMLTextAreaElement).value)).toBe("Make this clearer.");
    await page.close();
  }, 60_000);

  test("an answered comment shows its answer, as text, under the comment", async () => {
    const answered = pageWith(productPage(), "answered", (config) => {
      config.rounds = [
        {
          round: 1,
          items: [
            {
              id: "r1-1",
              screen: "items:list",
              state: "populated",
              testid: "items-refresh",
              comment: "Is Sync now the product's word?",
              type: "question",
              by: "",
              done: true,
              shown_theme: "light",
              answered_by: { round: 2, summary: "Yes: <b>Sync now</b> is the product's word, kept." },
            },
            {
              id: "r1-2",
              screen: "items:list",
              state: "populated",
              testid: "items-refresh",
              comment: "Make it larger.",
              type: "change",
              by: "",
              done: true,
              shown_theme: "light",
            },
          ],
        },
      ];
    });
    const page = await open(1440, 900, {}, answered);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#earlier-rounds-list li")].map((li) => ({
        id: li.querySelector(".pv-rid")?.textContent ?? "",
        answer: li.querySelector<HTMLElement>(".pv-answer")?.textContent ?? null,
        markup: li.querySelector(".pv-answer b") !== null,
        after: li.querySelector(".pv-answer")?.previousElementSibling?.tagName ?? "",
      })),
    );
    expect(rows).toEqual([
      { id: "r1-1", answer: "Answered in round 2: Yes: <b>Sync now</b> is the product's word, kept.", markup: false, after: "P" },
      { id: "r1-2", answer: null, markup: false, after: "" },
    ]);
    await page.close();
  }, 60_000);

  test("a disabled quiet button has no edge, no fill and a weaker icon than its live sibling, in both themes", async () => {
    for (const width of [320, 1440])
      for (const dark of [false, true]) {
        const page = await open(width, 900, { dark });
        const paint = await page.evaluate(() => {
          const alpha = (color: string) => {
            const parts = color.match(/[\d.]+/g) ?? [];
            return parts.length > 3 ? Number(parts[3]) : 1;
          };
          const of = (selector: string) => {
            const button = document.querySelector<HTMLButtonElement>(selector)!,
              style = getComputedStyle(button),
              icon = getComputedStyle(button.querySelector("svg")!);
            return {
              disabled: button.disabled,
              edge: alpha(style.borderTopColor) > 0 && style.borderTopWidth !== "0px",
              fill: alpha(style.backgroundColor) > 0,
              icon: icon.color,
              stroke: parseFloat(icon.strokeWidth),
            };
          };
          return { prev: of("#state-prev"), next: of("#state-next") };
        });
        await page.close();
        expect([
          width,
          dark,
          paint.prev.disabled,
          paint.next.disabled,
          paint.prev.edge,
          paint.prev.fill,
          paint.prev.icon === paint.next.icon,
          paint.prev.stroke < paint.next.stroke,
        ]).toEqual([width, dark, true, false, false, false, false, true]);
      }
  }, 60_000);

  test("a select in a group shows the keyboard ring after a key only, and after a pointer click what its sibling buttons show", async () => {
    const ring = (selector: string) => {
      const style = getComputedStyle(document.querySelector(selector)!);
      const seen = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && !/, 0\)$|^transparent$/.test(style.outlineColor);
      return { focused: document.activeElement === document.querySelector(selector), ring: seen };
    };
    for (const width of [320, 1440])
      for (const dark of [false, true]) {
        const page = await open(width, 900, { dark });
        await page.click("[data-theme-pick=dark]");
        const sibling = await page.evaluate(ring, "[data-theme-pick=dark]");
        await page.click("#frame-pick");
        await page.key("Escape");
        const pointer = await page.evaluate(ring, "#frame-pick");
        await page.key("Tab");
        await page.key("Tab", true);
        const key = await page.evaluate(ring, "#frame-pick");
        await page.close();
        expect({ width, dark, sibling, pointer, key }).toEqual({
          width,
          dark,
          sibling: { focused: true, ring: false },
          pointer: { focused: true, ring: false },
          key: { focused: true, ring: true },
        });
      }
  }, 60_000);

  test("at 320 Tab follows the eye through the top bar and the display bar", async () => {
    const page = await open(320);
    const stops: { name: string; bar: string; x: number; y: number; h: number }[] = [];
    for (let i = 0; i < 24; i++) {
      await page.key("Tab");
      const stop = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const bar = a.closest(".pv-top") ? "top" : a.closest(".pv-bar") ? "display" : "";
        const r = a.getBoundingClientRect();
        return { name: a.dataset.testid || a.id, bar, x: r.left, y: r.top, h: r.height };
      });
      if (stop.bar) stops.push(stop);
    }
    // Within each bar, each stop is on the same row as the one before and to its right, or on a lower row.
    const back = stops
      .filter((stop, i) => {
        const before = stops[i - 1];
        if (!before || before.bar !== stop.bar) return false;
        const sameRow = Math.abs(stop.y - before.y) < Math.min(stop.h, before.h) / 2;
        return sameRow ? stop.x < before.x : stop.y < before.y;
      })
      .map((stop) => stop.name);
    expect([stops.filter((stop) => stop.bar === "top").length > 3, stops.filter((stop) => stop.bar === "display").length > 3, back]).toEqual([true, true, []]);
    await page.close();
  }, 60_000);

  test("under the frame the next step is the button, and it works there", async () => {
    const page = await open(320);
    const before = await page.evaluate(() => document.getElementById("seen-count")!.textContent);
    const step = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>("#caption-next button");
      return button?.getClientRects().length ? button.textContent : null;
    });
    expect(step).toBe("Next view not seen");
    await page.click("#caption-next button");
    await page.settled();
    expect(await page.evaluate(() => document.getElementById("seen-count")!.textContent)).not.toBe(before);
    // By the keyboard the button is drawn again with each view, and it keeps the focus: a second Enter takes the next step.
    await page.evaluate(() => document.querySelector<HTMLElement>("#caption-next button")!.focus());
    const steps: string[] = [];
    for (const _ of [1, 2]) {
      await page.key("Enter");
      await page.settled();
      steps.push(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid ?? "the page body"));
    }
    expect(steps).toEqual(["proto-caption-next", "proto-caption-next"]);
    await page.close();
  }, 60_000);

  test("a row of Build details keeps the focus when a change of theme or frame draws the lists again", async () => {
    const page = await open(1440);
    await page.click(`[data-itab="screen"]`);
    await page.settled();
    const row = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>("#inspect-elements button")!;
      button.focus();
      return button.dataset.testid ?? "";
    });
    const held: string[] = [];
    for (const key of ["t", "d"]) {
      await page.key(key);
      await page.settled();
      held.push(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid ?? "the page body"));
    }
    expect([row, held]).toEqual([row, [row, row]]);
    await page.close();
  }, 60_000);

  test("Show on an earlier comment opens its own link, marks its element, and its row names the theme it was made in", async () => {
    const earlier = pageWith(productPage(), "earlier", (config) => {
      config.rounds = [
        {
          round: 1,
          items: [
            {
              id: "r1-1",
              screen: "items:list",
              state: "populated",
              testid: "items-refresh",
              comment: "Larger.",
              type: "change",
              by: "",
              done: false,
              shown_theme: "light",
              link: "#items%3Alist/populated?theme=light&frame=1024",
            },
          ],
        },
      ];
    });
    const page = await browser.open(1440, 900);
    await page.goto(`${earlier}#items%3Alist/empty?theme=dark`);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const row = await page.evaluate(() => document.querySelector("#earlier-rounds-list li")?.textContent ?? "");
    await page.click(id("proto-comments-show-r1-1"));
    await page.settled();
    const after = await page.evaluate(() => {
      const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
      return {
        theme: new URLSearchParams(location.hash.split("?")[1] ?? "").get("theme"),
        state: location.hash.split("?")[0],
        marked: [...doc.querySelectorAll("[data-proto-comment]")].map((node) => node.getAttribute("data-testid")),
      };
    });
    expect({ row: row.includes(", light"), ...after }).toEqual({
      row: true,
      theme: "light",
      state: "#items:list/populated",
      marked: ["items-refresh"],
    });
    await page.close();
  }, 60_000);

  test("Show on an earlier comment outlines the element its round file names among those that share its test id", async () => {
    const folder = tempFolder(join(tmpdir(), "prototype-viewer-earlier-index-"));
    for (const [file, text] of Object.entries(flowDesign())) {
      mkdirSync(dirname(join(folder, file)), { recursive: true });
      writeFileSync(join(folder, file), text);
    }
    const second = { id: "r1-1", screen: "items:list", state: "populated", testid: "open-item", index: 1, comment: "The second card." };
    mkdirSync(join(folder, "design/rounds/app/1"), { recursive: true });
    writeFileSync(join(folder, "design/rounds/app/1/comments.json"), JSON.stringify({ round: 1, items: [second] }));
    expect(await run(["build", FLOW_DESIGN], { out: () => {}, err: () => {} }, folder)).toBe(0);
    const page = await browser.open(1440, 900);
    await page.goto(`${pathToFileURL(join(folder, ".prototype/views", FLOW_DESIGN)).href}#items%3Alist/populated`);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    await page.click(id("proto-comments-show-r1-1"));
    await page.settled();
    const marked = await page.evaluate(() => {
      const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
      const cards = [...doc.querySelectorAll('[data-testid="open-item"]')];
      return { cards: cards.length, marked: cards.flatMap((card, at) => (card.hasAttribute("data-proto-comment") ? [at] : [])) };
    });
    expect(marked).toEqual({ cards: 2, marked: [1] });
    await page.close();
  }, 60_000);

  test("on the Board, the current cell's ring is in the text colour, so focus, hover and current differ", async () => {
    for (const dark of [false, true]) {
      const page = await open(1440, 900, { dark });
      await page.click("#tab-board");
      await page.until(`document.getElementById("board").dataset.ready === "true"`);
      await page.key("Shift"); // the last input is a key, so the focus below shows as Tab's does
      const paint = await page.evaluate(() => {
        const ring = (cell: Element) => getComputedStyle(cell.closest(".pv-thumb")!.querySelector(".pv-thumb-frame")!).outlineColor;
        const probe = document.createElement("i");
        probe.style.color = "var(--foreground)";
        document.body.append(probe);
        const text = getComputedStyle(probe).color;
        probe.remove();
        const current = document.querySelector('.pv-thumb-name[aria-current="true"]')!;
        const other = [...document.querySelectorAll(".pv-thumb-name")].find((cell) => cell !== current)!;
        const rest = ring(current);
        (other as HTMLElement).focus();
        return { current: rest, text, focus: ring(other) };
      });
      await page.close();
      expect({ dark, currentIsText: paint.current === paint.text, focusDiffers: paint.focus !== paint.current }).toEqual({
        dark,
        currentIsText: true,
        focusDiffers: true,
      });
    }
  }, 60_000);

  test("the Board is a row of each screen's own states, in drawn order: no empty cell, no name cut, and Fit stops at its floor", async () => {
    // One screen of twelve states, more than a wide window holds at full size, and one of one state, which a matrix would
    // pad with eleven empty cells.
    const folder = tempFolder(join(tmpdir(), "prototype-viewer-board-rows-"));
    const many = ["ready", "empty", "loading", "partial", "offline", "error", "suspended", "upgraded", "confirm-delete", "renaming", "sharing", "archived"];
    const states = many.map(
      (state) =>
        `  <div data-proto-state="${state}" data-testid="start-${state}"><p>Text</p><button type="button" data-proto-go="portal" data-testid="start-${state}-portal">Portal</button></div>`,
    );
    const screens = `<section data-proto-screen="start" data-proto-title="Start">\n${states.join("\n")}\n</section>\n<section data-proto-screen="portal" data-proto-title="Developer portal">\n  <div data-proto-state="ready" data-testid="portal-ready"><p>Text</p><button type="button" data-proto-go="start" data-testid="portal-start">Start</button></div>\n</section>`;
    mkdirSync(join(folder, "design"), { recursive: true });
    writeFileSync(join(folder, "design/many.html"), single({ screens }));
    expect(await run(["build", "design/many.html"], { out: () => {}, err: () => {} }, folder)).toBe(0);
    const pages = { example: examplePage(), many: pathToFileURL(join(folder, ".prototype/views/design/many.html")).href };
    const seen: Record<string, unknown>[] = [];
    for (const [name, address] of Object.entries(pages)) {
      for (const width of [1440, 1024, 390]) {
        for (const dark of [false, true]) {
          const page = await open(width, 900, { dark }, address);
          await page.click("#tab-board");
          await page.until(`document.getElementById("board").dataset.ready === "true"`);
          for (const zoom of ["fit", "actual"]) {
            await page.evaluate((how: string) => (document.querySelector(`[data-zoom="${how}"]`) as HTMLElement).click(), zoom);
            await page.frames();
            const read = await page.evaluate(() => {
              const board = document.getElementById("board")!;
              const scroller = board.closest(".pv-scroller")!;
              const product = (document.getElementById("product") as HTMLTemplateElement).content;
              const drawn = new Map(
                [...product.querySelectorAll("[data-proto-screen]")].map((screen) => [
                  screen.getAttribute("data-proto-screen") ?? "",
                  [
                    ...new Set(
                      [...screen.querySelectorAll("[data-proto-state]")]
                        .filter((state) => state.closest("[data-proto-screen]") === screen)
                        .map((state) => state.getAttribute("data-proto-state")),
                    ),
                  ],
                ]),
              );
              const rows = board.querySelector(".pv-rowh")!.parentElement!; // the rows, whatever their class
              const heads = [...rows.querySelectorAll<HTMLElement>(".pv-rowh")];
              const shown = (node: Element) => node.getClientRects().length > 0;
              const labels = [...board.querySelectorAll<HTMLElement>(".pv-thumb-name, .pv-rowh b, .pv-rowh > span, .pv-rowh > small")].filter(shown);
              return {
                others: [...rows.children].filter((child) => !child.matches(".pv-rowh, .pv-strip")).length,
                outOfOrder: heads
                  .filter((head) => {
                    const cells = [...(head.nextElementSibling?.children ?? [])].map((cell) => (cell as HTMLElement).dataset.pvState);
                    return JSON.stringify(cells) !== JSON.stringify(drawn.get(head.dataset.pvScreen ?? ""));
                  })
                  .map((head) => head.dataset.pvScreen),
                rows: heads.length === drawn.size,
                cut: labels.filter((label) => label.scrollWidth > label.clientWidth).map((label) => label.textContent),
                zoom: Number(board.style.zoom || 1),
                narrowest: Math.min(...[...board.querySelectorAll(".pv-thumb-frame")].map((frame) => Math.round(frame.getBoundingClientRect().width))),
                pans: scroller.scrollWidth > scroller.clientWidth,
                pageScrolls: document.scrollingElement!.scrollWidth > innerWidth,
              };
            });
            seen.push({ name, width, dark, how: zoom, ...read });
          }
          await page.close();
        }
      }
    }
    for (const one of seen) {
      const { name, width, dark, how } = one;
      const wide = (width as number) >= 768;
      const atFit = how === "fit" && wide;
      expect({ name, width, dark, how, others: one.others, outOfOrder: one.outOfOrder, rows: one.rows, cut: one.cut, pageScrolls: one.pageScrolls }).toEqual({
        name,
        width,
        dark,
        how,
        others: 0,
        outOfOrder: [],
        rows: true,
        cut: [],
        pageScrolls: false,
      });
      // The floor: Fit never draws a picture of a 1024 px web frame under 96 px wide (a zoom of 0.75 on its 128 px).
      if (atFit)
        expect({ name, width, how, floor: (one.zoom as number) >= 0.75 && (one.narrowest as number) >= 96 }).toEqual({ name, width, how, floor: true });
      // Twelve pictures at full size are wider than the artboard: Fit stops at the floor, and the board pans past it.
      if (atFit && name === "many") expect({ width, zoom: one.zoom, pans: one.pans }).toEqual({ width, zoom: 0.75, pans: true });
      if (!atFit) expect({ name, width, how, narrowest: one.narrowest }).toEqual({ name, width, how, narrowest: 128 });
    }
  }, 180_000);

  test("closing a drawer by its key gives focus back to its button, never to the page body", async () => {
    const page = await open(320);
    const focused = () => page.evaluate(() => (document.activeElement as HTMLElement).dataset.testid ?? document.activeElement!.tagName);
    const seen: string[] = [];
    for (const key of ["]", "]", "[", "["]) {
      await page.key(key);
      await page.settled();
      seen.push(await focused());
    }
    expect(seen).toEqual(["proto-inspect-comments", "proto-inspector-toggle", seen[2]!, "proto-screens-toggle"]);
    await page.close();
  }, 60_000);

  test("the comment's length is counted in code points, as the save counts it, and a control character turns Save off", async () => {
    const page = await open(1440);
    await page.click(id("proto-comments-toggle"));
    await page.click(id("items-refresh"), true);
    await page.type("😀".repeat(1500));
    const emoji = await page.evaluate(() => [
      document.getElementById("comment-count")!.textContent,
      (document.getElementById("comment-add") as HTMLButtonElement).disabled,
    ]);
    await page.evaluate(() => {
      const field = document.getElementById("comment-text") as HTMLTextAreaElement;
      field.value = "a\u0085b";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const control = await page.evaluate(() => [
      (document.getElementById("comment-add") as HTMLButtonElement).disabled,
      !document.getElementById("comment-limit")!.hidden,
    ]);
    expect([emoji, control]).toEqual([
      ["1500 of 2000 characters", false],
      [true, true],
    ]);
    await page.close();
  }, 60_000);

  test("a saved round never reads to send and offers no Edit or Delete; an empty round says so", async () => {
    const saved = pageWith(productPage(), "saved", (config) => {
      config.rounds = [
        {
          round: 1,
          items: [
            {
              id: "r1-1",
              screen: "items:list",
              state: "populated",
              testid: "items-refresh",
              comment: "Larger.",
              type: "change",
              by: "",
              done: false,
              shown_theme: "light",
            },
          ],
        },
      ];
    });
    const page = await browser.open(1440, 900);
    await page.goto(`${saved}#items%3Alist/populated?round=1`);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const read = () =>
      page.evaluate(() => ({
        closing: document.getElementById("closing")!.dataset.closing,
        rows: [...document.querySelectorAll("#comments-list > li")].map((li) =>
          [...li.querySelectorAll("button")].map((button) => button.textContent).join(","),
        ),
        empty: document.getElementById("comments-empty")!.hidden ? "" : document.getElementById("comments-empty")!.textContent,
      }));
    const one = await read();
    await page.goto(`${saved}#items%3Alist/populated?round=7`);
    const seven = await read();
    expect([one, seven]).toEqual([
      { closing: "saved", rows: ["Show"], empty: "" },
      { closing: "unseen", rows: [], empty: "Round 7 holds no comment yet." },
    ]);
    await page.close();
  }, 60_000);

  test("at 320 by 700 with the root text doubled, no text overlaps another or leaves the window, and the Board keeps a usable height", async () => {
    const page = await open(320, 700);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.calm();
    // The dock's labels, each inside its own button and clear of the others; and what the window shows at each one's centre.
    const dockFaults = () =>
      page.evaluate(() => {
        const faults: string[] = [];
        const labels = [...document.querySelectorAll<HTMLElement>(".pv-dock-l1, .pv-dock-l2")].filter((node) => node.getClientRects().length);
        for (const label of labels) {
          const box = label.getBoundingClientRect(),
            button = label.closest("button")!.getBoundingClientRect();
          if (box.left < button.left - 0.5 || box.right > button.right + 0.5 || box.left < -0.5 || box.right > innerWidth + 0.5)
            faults.push(`${label.className} leaves its button`);
          for (const other of labels) {
            if (other === label || label.closest("button") === other.closest("button")) continue;
            const o = other.getBoundingClientRect();
            if (Math.min(box.right, o.right) - Math.max(box.left, o.left) > 0.5 && Math.min(box.bottom, o.bottom) - Math.max(box.top, o.top) > 0.5)
              faults.push(`${label.className} overlaps another`);
          }
        }
        for (const button of document.querySelectorAll<HTMLElement>(".pv-menu-toggle, .pv-inspect-toggle, .pv-build-toggle")) {
          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          if (!hit || !button.contains(hit)) faults.push(`${button.dataset.testid ?? ""} is covered`);
        }
        return faults;
      });
    const read = async () => ({
      bars: await page.evaluate(barFaults),
      dock: await dockFaults(),
      scroll: await page.evaluate(() => document.documentElement.scrollWidth),
    });
    expect(await read()).toEqual({ bars: [], dock: [], scroll: 320 });
    await page.click("#tab-board");
    await page.settled();
    expect(await read()).toEqual({ bars: [], dock: [], scroll: 320 });
    // Scrolled to the Board, it takes at least half the window's height.
    const board = await page.evaluate(() => {
      const scroller = document.getElementById("scroller")!;
      scroller.scrollIntoView();
      return Math.round(scroller.getBoundingClientRect().height);
    });
    expect(board).toBeGreaterThanOrEqual(350);
    await page.close();
  }, 60_000);

  // A system font wider than the design's must not push the next arrow out of the window, so at this size the place needs
  // only its two arrows and the whole state, whatever the font.
  test("at 320 with the root text doubled, the state takes a row of its own under the screen's name, and the place keeps inside the window", async () => {
    const page = await open(320, 700);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.calm();
    const place = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      return { stateBelowName: box(".pv-crumb-state").top >= box(".pv-crumb-screen").bottom - 0.5, inside: box("#state-next").right <= innerWidth + 0.5 };
    });
    await page.close();
    expect(place).toEqual({ stateBelowName: true, inside: true });
  }, 30_000);

  // The letters spaced as WCAG's text spacing asks make the subtitle's first form too long for one line on every system,
  // as a system font wider than the design's does at the doubled text alone.
  test("at 320 with the root text doubled and the letters spaced, the short subtitle takes one line, or is its shortest form", async () => {
    const page = await open(320, 700);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      document.documentElement.style.letterSpacing = "0.12em";
    });
    await page.calm();
    const shown = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("subtitle-short")!);
      return { text: range.toString(), lines: new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size };
    });
    await page.close();
    expect(shown.lines === 1 || !shown.text.includes("/") ? [] : [shown]).toEqual([]);
  }, 30_000);

  test("The list of states: every screen's rows are one markup, a list of buttons, the open screen's too; the shown one is current, keys 1 to 9, J and K", async () => {
    const page = await open(1440);
    const read = () =>
      page.evaluate(() => {
        const entries = [...document.querySelectorAll<HTMLElement>("#screen-list .pv-scr")];
        const open = entries.find((entry) => entry.querySelector(".pv-scr-h [aria-current=page]"))!;
        const rows = (entry: Element) => [...entry.querySelectorAll(":scope > *")].slice(1);
        return {
          // Every screen holds its name and then one list, whose items each hold one button: nothing else stands there.
          shapes: [
            ...new Set(
              entries.map((entry) =>
                rows(entry)
                  .map(
                    (node) =>
                      node.tagName +
                      "." +
                      node.className +
                      ">" +
                      [...node.children]
                        .map((li) => `${li.tagName}>${[...li.children].map((b) => b.tagName).join()}`)
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(),
                  )
                  .join(),
              ),
            ),
          ],
          group: document.getElementById("state-group"),
          openList: [open.querySelector("ul")!.hidden, open.querySelector("ul")!.getAttribute("aria-label")],
          current: [...open.querySelectorAll('li > button[aria-current="true"]')].map((b) => (b as HTMLElement).dataset.show),
          keys: [...open.querySelectorAll("li > button")].map((b) => b.getAttribute("aria-keyshortcuts") ?? ""),
          elsewhere: entries
            .filter((entry) => entry !== open)
            .flatMap((entry) => [...entry.querySelectorAll("li > button")])
            .filter((b) => b.hasAttribute("aria-current") || b.hasAttribute("aria-keyshortcuts")).length,
        };
      });
    const first = await read();
    expect(first.shapes).toEqual(["UL.pv-slist>LI>BUTTON"]);
    expect(first.group).toBeNull();
    expect(first.openList).toEqual([false, "States of this screen"]);
    expect(first.current).toEqual(["populated"]);
    expect(first.keys).toEqual(["1", "2", "3", "4", "5"]);
    expect(first.elsewhere).toBe(0);
    await page.key("3");
    await page.settled();
    expect((await read()).current).toEqual(["offline"]);
    await page.key("j");
    await page.settled();
    expect((await read()).current).toEqual(["error"]);
    await page.key("k");
    await page.settled();
    expect((await read()).current).toEqual(["offline"]);
    await page.close();
  }, 60_000);

  test("Low findings: with no comment both exports are off; the right-to-left check reads the direction shown; the caption names the place; a primary button changes on hover", async () => {
    const page = await open(1440);
    const exports = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>(".pv-alt > button")].filter((b) => b.getClientRects().length).map((b) => [b.textContent, b.disabled]),
    );
    expect(exports).toEqual([
      ["Download comments.json", true],
      ["Copy the JSON", true],
    ]);
    // The caption names the screen and the state in words, never the raw link.
    expect(await page.evaluate(() => document.getElementById("caption-screen")!.textContent)).toBe("Items, populated");
    // A primary button under the pointer differs from rest by more than a colour (rule K11 of the skill's review checklist).
    await page.evaluate(() => {
      const b = document.getElementById("closing-next")!;
      b.hidden = false;
    });
    const rest = await page.evaluate(paintOf, "#closing-next");
    const box = await page.evaluate(() => {
      const r = document.getElementById("closing-next")!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
    await page.calm();
    expect(await page.evaluate(paintOf, "#closing-next")).not.toBe(rest);
    await page.close();
    // A design that is itself right to left: the check reads On, and pressing it shows the design left to right.
    const rtl = pageWith(productPage(), "rtl", (config) => {
      config.html = { ...(config.html as Record<string, string>), dir: "rtl" };
    });
    const other = await open(1440, 900, {}, rtl);
    const check = () =>
      other.evaluate(() => [
        document.querySelector('[data-check="dir"]')!.getAttribute("aria-pressed"),
        (document.querySelector("#screen-area iframe") as HTMLIFrameElement).contentDocument!.documentElement.dir,
        location.hash.includes("dir="),
      ]);
    expect(await check()).toEqual(["true", "rtl", false]);
    await other.click("#checks-toggle");
    await other.click('[data-check="dir"]');
    await other.settled();
    expect(await check()).toEqual(["false", "ltr", true]);
    await other.close();
  }, 60_000);

  test("Low finding: the left panel has one name, Screens, in the viewer's words, the README and the guide", () => {
    const viewer = ["viewer/viewer.html", "viewer/words.ts"].map((file) => readFileSync(join(REPOSITORY, file), "utf8")).join("\n");
    const pages = ["README.md", "src/guide.ts"].map((file) => readFileSync(join(REPOSITORY, file), "utf8")).join("\n");
    for (const other of ["review column", "Your review", "screen list", "Views seen</span>"]) expect([other, viewer.includes(other)]).toEqual([other, false]);
    expect([viewer.includes("Screens panel"), pages.includes("Screens panel")]).toEqual([true, true]);
  });

  test("Low findings: a comment's line break shows, a state row's name has no space before its comma, and a screen's count is not underlined", async () => {
    const page = await open(1440);
    await page.click(id("proto-comments-toggle"));
    await page.click(id("items-refresh"), true);
    await page.type("First line");
    await page.evaluate(() => {
      const field = document.getElementById("comment-text") as HTMLTextAreaElement;
      field.value += "\nSecond line";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#comment-add");
    const found = await page.evaluate(() => ({
      lines: Math.round(
        document.querySelector<HTMLElement>("#comments-list > li p")!.getBoundingClientRect().height /
          parseFloat(getComputedStyle(document.querySelector("#comments-list > li p")!).lineHeight),
      ),
      spaced: [...document.querySelectorAll(".pv-srow")]
        .map((row) => row.getAttribute("aria-label") ?? row.textContent ?? "")
        .filter((name) => / ,/.test(name)),
      counts: [...document.querySelectorAll(".pv-scr-h button span:last-child")]
        .map((span) => getComputedStyle(span).textDecorationLine)
        .filter((line) => line !== "none"),
    }));
    expect(found).toEqual({ lines: 2, spaced: [], counts: [] });
    await page.close();
  }, 60_000);
});
