/// <reference lib="dom" />
// The probes that hold each visual and interaction rule of the viewer: a number read in the browser, never a look at a picture.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../../src/cli.ts";
import { copiedJson, LINK_COPIED } from "../../viewer/words.ts";
import { FLOW_DESIGN, flowDesign, single } from "../cases.ts";
import { tempFolder } from "../temp.ts";
import { type Rgb, ratio } from "./contrast.ts";
import { BROWSER, Browser, type Media, type Page } from "./page.ts";
import { pageWith, plainPage, productPage } from "./pages.ts";
import { barFaults, fieldFaults, groupFaults, overlapOf, paintOf } from "./probes.ts";

const id = (testid: string): string => `[data-testid="${testid}"]`;
const rgb = (color: string) => (color.match(/\d+/g) ?? []).slice(0, 3).map(Number) as unknown as Rgb;

/** Load one screenshot into Compare, as a person's file pick does: a tall grey picture, so it fills the frame's height. */
async function loadScreenshot(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 800;
    const paint = canvas.getContext("2d")!;
    paint.fillStyle = "#888";
    paint.fillRect(0, 0, 400, 800);
    const blob = await new Promise<Blob>((done) => canvas.toBlob((made) => done(made!), "image/png"));
    const files = new DataTransfer();
    files.items.add(new File([blob], "shot.png", { type: "image/png" }));
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
  });
  await page.settled();
}

describe.skipIf(!BROWSER)("the viewer's visual and interaction rules", () => {
  let browser: Browser;
  let earlier = "";
  beforeAll(() => {
    // A page with an earlier round, written before the browser starts.
    earlier = pageWith(productPage(), "outside-earlier", (config) => {
      config.rounds = [
        {
          round: 1,
          items: [
            {
              id: "r1-1",
              screen: "items:list",
              state: "populated",
              testid: "items-refresh",
              comment: "Make it larger.",
              type: "change",
              by: "",
              done: false,
            },
          ],
        },
      ];
    });
    browser = new Browser();
  });
  afterAll(() => browser.close());
  async function open(width: number, media: Media = {}, address = productPage()): Promise<Page> {
    const page = await browser.open(width, 900, media);
    await page.goto(address);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    return page;
  }

  test("a group has one border and one radius, and its members share one height, text size and weight (rule K9 of the skill's review checklist)", async () => {
    for (const width of [320, 1440]) {
      const page = await open(width);
      const faults = [...(await page.evaluate(groupFaults))];
      await page.click("#tab-board");
      faults.push(...(await page.evaluate(groupFaults)));
      await page.close();
      expect([width, faults]).toEqual([width, []]);
    }
  }, 60_000);

  test("one select and one field: one radius, one height, one padding, and no browser arrow", async () => {
    const page = await open(1440);
    const faults = [...(await page.evaluate(fieldFaults))];
    await page.click(id("proto-comments-toggle"));
    await page.click("[data-testid]", true);
    faults.push(...(await page.evaluate(fieldFaults)));
    await page.click("#tab-board");
    faults.push(...(await page.evaluate(fieldFaults)));
    await page.close();
    expect(faults).toEqual([]);
  }, 60_000);

  test("a select clicked with the pointer shows the quiet look, and in a group the look of the buttons beside it after a click: no ring (rules K10 and K8 of the skill's review checklist)", async () => {
    const page = await open(1440);
    await page.click("#frame-pick");
    await page.key("Escape");
    const select = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return [
        document.activeElement!.id,
        style.outlineColor === "rgba(0, 0, 0, 0)" ? "no ring" : style.outlineColor,
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
      ].join(" ");
    });
    await page.key("Tab");
    const button = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor].join(" ");
    });
    expect(select).toBe("frame-pick no ring 7px 0px");
    expect(button).toBe("solid 2px -3px rgb(37, 99, 235)"); // one thin border in from the group's edge
    await page.click("#tab-board");
    await page.evaluate(() => {
      document.getElementById("board-flow-wrap")!.hidden = false;
    });
    await page.click("#board-flow");
    await page.key("Escape");
    const alone = await page.evaluate(() => {
      const select = getComputedStyle(document.activeElement!),
        shell = getComputedStyle(document.activeElement!.parentElement!);
      const ring = getComputedStyle(document.documentElement).getPropertyValue("--ring");
      const probe = document.createElement("i");
      probe.style.color = ring;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return [
        select.outlineColor === "rgba(0, 0, 0, 0)" ? "no ring" : "ring",
        shell.borderTopColor === color ? "the field's border in the focus color" : shell.borderTopColor,
      ].join(", ");
    });
    expect(alone).toBe("no ring, the field's border in the focus color");
    await page.close();
  }, 60_000);

  test("at 320 a toast never covers what it reports on", async () => {
    const page = await open(320);
    const shown = () => page.evaluate(() => document.getElementById("toast")!.hasAttribute("data-on"));
    await page.key("t");
    expect([
      await shown(),
      await page.evaluate(overlapOf, [".pv-toast", ".pv-bar"] as [string, string]),
      await page.evaluate(overlapOf, [".pv-toast", ".pv-dock"] as [string, string]),
    ]).toEqual([true, 0, 0]);
    // A copy's toast comes when the clipboard has taken the text, which may be after the next step has begun, so each
    // probe waits for the copy's own words: an earlier toast still on is not the one it checks.
    const says = (words: string) =>
      page.until(`document.getElementById("toast").hasAttribute("data-on") && document.getElementById("toast").textContent === ${JSON.stringify(words)}`);
    await page.click(id("proto-theme-dark"));
    await page.click("#copy-link");
    await says(LINK_COPIED);
    expect(await page.evaluate(overlapOf, [".pv-toast", "#copy-link"] as [string, string])).toBe(0);
    // With a comment, Copy the JSON is live (with none it is off, as the download is), and its toast keeps off the drawer's foot.
    // At 320 the drawer covers the screen, so a person closes it to pick an element, and the pick opens it again at the
    // form. Turning comments off then closes the form, so the foot shows Copy the JSON.
    await page.click("#inspect-toggle");
    await page.click(id("proto-comments-toggle"));
    await page.click("#inspect-toggle");
    await page.calm();
    await page.click(id("items-refresh"), true);
    await page.calm();
    await page.type("Make this clearer.");
    await page.click("#comment-add");
    await page.click(id("proto-comments-toggle"));
    await page.calm();
    await page.click(id("proto-comments-copy-json"));
    await says(copiedJson(1));
    expect(await page.evaluate(overlapOf, [".pv-toast", ".pv-finish"] as [string, string])).toBe(0);
    await page.close();
  }, 60_000);

  test("at 320 the dock is last in the page, and Copy a link stays, with no sideways scroll", async () => {
    const page = await open(320);
    const found = await page.evaluate(() => {
      const controls = [...document.querySelectorAll<HTMLElement>("button, select, input, a[href]")].filter(
        (el) => el.getClientRects().length && !el.closest("#screen-menu, #inspector"),
      );
      const last = controls.slice(-3).map((el) => el.dataset.testid);
      const link = document.getElementById("copy-link")!.getBoundingClientRect();
      return {
        last,
        link: link.width >= 24 && link.height >= 24 && link.right <= innerWidth,
        scroll: document.documentElement.scrollWidth,
        name: document.getElementById("product-name")!.clientWidth >= document.getElementById("product-name")!.scrollWidth,
      };
    });
    expect(found).toEqual({ last: ["proto-screens-toggle", "proto-inspector-toggle", "proto-build-toggle"], link: true, scroll: 320, name: true });
    await page.close();
  }, 60_000);

  test("in forced colours a frame keeps a real border, and a Board thumbnail an outline", async () => {
    const page = await open(1440, { forcedColors: true });
    const shell = await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById("shell")!);
      return `${style.borderTopStyle} ${style.borderTopWidth}`;
    });
    await page.click("#tab-board");
    await page.until(`document.getElementById("board").dataset.ready === "true"`);
    const thumb = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector(".pv-thumb:not(:hover) .pv-thumb-frame")!);
      return [style.outlineStyle, parseFloat(style.outlineWidth) >= 1] as const;
    });
    await page.close();
    expect([shell, thumb]).toEqual(["solid 1px", ["solid", true]]);
  }, 60_000);

  test("saving an empty comment says so as text in the field's description", async () => {
    const page = await open(1440);
    await page.click(id("proto-comments-toggle"));
    await page.click("[data-testid]", true);
    await page.click("#comment-add");
    const state = () =>
      page.evaluate(() => {
        const field = document.getElementById("comment-text")!;
        const error = document.getElementById(field.getAttribute("aria-describedby")!.split(" ")[0]!)!;
        return {
          invalid: field.getAttribute("aria-invalid"),
          error: error.hidden ? "" : error.textContent!.trim(),
          focus: document.activeElement!.id,
          said: document.getElementById("announce")!.textContent,
          comments: document.querySelectorAll("#comments-list > li").length,
        };
      });
    expect(await state()).toEqual({
      invalid: "true",
      error: "The comment is empty. Write what to change, then save.",
      focus: "comment-text",
      said: "The comment is empty. Write what to change, then save.",
      comments: 0,
    });
    await page.type("x");
    expect(await state()).toMatchObject({ invalid: null, error: "" });
    await page.close();
  }, 60_000);

  test("focus is never dropped to the page body when its control leaves", async () => {
    const page = await open(1440);
    const focus = () =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        return active === document.body ? "the page body" : active.dataset.testid || active.id;
      });
    await page.click("#tab-board");
    await page.until(`document.getElementById("board").dataset.ready === "true"`);
    await page.key("Shift");
    await page.evaluate(() => (document.querySelector(".pv-thumb-name") as HTMLElement).focus());
    await page.key("Enter");
    await page.settled();
    expect(await focus()).toBe("proto-tab-prototype");
    await page.click(id("proto-theme-dark"));
    await page.key("v");
    expect(await focus()).toBe("proto-theme-dark"); // a control that stays keeps the focus
    await page.click(id("proto-board-unseen"));
    await page.key("v");
    expect(await focus()).toBe("proto-tab-system");
    await page.close();
  }, 60_000);

  test("hover, open and disabled each differ from rest by more than a colour", async () => {
    const page = await open(1440);
    const hover = async (selector: string) => {
      const box = await page.evaluate((on: string) => {
        const rect = document.querySelector(on)!.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }, selector);
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      await page.calm();
    };
    const away = () => page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 500 });
    for (const control of [id("proto-theme-light"), "#tab-board", id("proto-comments-copy-json"), "#compare", id("proto-screen-items-list-empty")]) {
      await away();
      await page.calm();
      const rest = await page.evaluate(paintOf, control);
      await hover(control);
      expect([control, await page.evaluate(paintOf, control)]).not.toEqual([control, rest]);
    }
    // An open panel's button never looks like a closed one under the pointer.
    await page.key("]");
    await away();
    await hover("#inspect-toggle");
    const closedHovered = await page.evaluate(paintOf, "#inspect-toggle");
    await page.key("]");
    await away();
    await page.calm();
    expect(await page.evaluate(paintOf, "#inspect-toggle")).not.toBe(closedHovered);
    // A disabled link is no link at rest: no underline.
    expect(await page.evaluate(paintOf, "#comments-download-off")).toContain("none ");
    await page.close();
  }, 60_000);

  test("with the text doubled at 1024 no control of a bar overlaps another and no label is cut", async () => {
    const page = await open(1024);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.calm();
    const faults = await page.evaluate(barFaults);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.close();
    expect([faults, scroll]).toEqual([[], 1024]);
  }, 60_000);

  test("the keys 1 to 9 choose the first nine states, and a tenth has no key", async () => {
    const page = await open(1440, {}, plainPage());
    await page.click(id("proto-screen-many"));
    await page.settled();
    const hints = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#screen-list [data-show]")]
        .filter((row) => row.getClientRects().length)
        .map((row) => `${row.querySelector("kbd:not([hidden])")?.textContent ?? ""}|${row.getAttribute("aria-keyshortcuts") ?? ""}`),
    );
    expect(hints).toEqual(["1|1", "2|2", "3|3", "4|4", "5|5", "6|6", "7|7", "8|8", "9|9", "|"]);
    await page.key("9");
    await page.settled();
    expect(await page.evaluate(() => location.hash)).toBe("#many/s9");
    await page.key("0");
    expect(await page.evaluate(() => location.hash)).toBe("#many/s9");
    await page.close();
  }, 60_000);

  test("the key D changes the frame and nothing else", async () => {
    const page = await open(1440);
    const now = () => page.evaluate(() => ({ link: location.hash.replace(/^#[^?]*/, ""), panels: document.getElementById("workspace")!.dataset.panels }));
    await page.key("d");
    await page.settled();
    const after = await now();
    await page.close();
    expect(after).toEqual({ link: "?frame=1440", panels: "both" });
  }, 30_000);

  test("at 320 the dock's three labels share one line, within 0.5 px, with the comment count hidden or shown", async () => {
    const page = await open(320);
    const lines = () => page.evaluate(() => [...document.querySelectorAll(".pv-dock .pv-dock-l2")].map((label) => label.getBoundingClientRect().top));
    const spread = (tops: number[]) => Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10;
    const hidden = await lines();
    await page.evaluate(() => {
      const count = document.getElementById("dock-comments")!;
      count.hidden = false;
      count.textContent = "3";
    });
    const shown = await lines();
    await page.close();
    expect([hidden.length, spread(hidden) <= 0.5, spread(shown) <= 0.5]).toEqual([3, true, true]);
  }, 30_000);

  test("the top bar's buttons land on whole pixels, and at 320 the screen's name is not cut", async () => {
    const faults: string[] = [];
    for (const width of [1440, 1024, 900, 800, 320]) {
      const page = await open(width);
      faults.push(
        ...(await page.evaluate((at: number) => {
          const found: string[] = [];
          for (const button of document.querySelectorAll<HTMLElement>(".pv-top button:not([role=tab])")) {
            const top = button.getBoundingClientRect().top;
            if (button.getClientRects().length && Math.abs(top - Math.round(top)) > 0.01)
              found.push(`${at}: ${button.dataset.testid ?? button.id} at y ${top}`);
          }
          const name = document.querySelector<HTMLElement>(".pv-crumb-screen");
          if (name && name.scrollWidth > name.clientWidth) found.push(`${at}: the screen's name shows ${name.clientWidth} of ${name.scrollWidth} px`);
          return found;
        }, width)),
      );
      await page.close();
    }
    expect(faults).toEqual([]);
  }, 60_000);

  // A system font wider than the design's makes every name longer, so a long name stands for it on every system.
  test("at 1024 and 900 a screen's name longer than the bar's spare room moves the bar's other controls to the next line, and is not cut", async () => {
    const faults: string[] = [];
    for (const width of [1024, 900]) {
      const page = await open(width);
      faults.push(
        ...(await page.evaluate((at: number) => {
          const name = document.querySelector<HTMLElement>(".pv-crumb-screen")!;
          name.textContent = "Items and their groups";
          return name.scrollWidth > name.clientWidth ? [`${at}: the screen's name shows ${name.clientWidth} of ${name.scrollWidth} px`] : [];
        }, width)),
      );
      await page.close();
    }
    expect(faults).toEqual([]);
  }, 60_000);

  test("roles: a toolbar answers the arrow keys, every state row has one role, no heading holds a field, and the empty download is a disabled control", async () => {
    const page = await open(1440);
    await page.click("#itab-screen");
    await page.settled();
    const faults: string[] = [];
    const toolbars = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[role=toolbar]")]
        .filter((bar) => bar.getClientRects().length && bar.querySelectorAll("button").length > 1)
        .map((bar) => bar.id || bar.getAttribute("aria-label") || ""),
    );
    for (const name of toolbars) {
      await page.evaluate((label: string) => {
        const bar = [...document.querySelectorAll<HTMLElement>("[role=toolbar]")].find((found) => (found.id || found.getAttribute("aria-label")) === label)!;
        const first = [...bar.querySelectorAll("button")].find((button) => !button.disabled && button.getClientRects().length)!;
        first.focus();
        first.dataset.probeFrom = "";
      }, name);
      await page.key(name === "inspect-elements" ? "ArrowDown" : "ArrowRight");
      if (
        await page.evaluate(() => {
          const at = document.activeElement as HTMLElement;
          const stayed = "probeFrom" in at.dataset;
          document.querySelector("[data-probe-from]")?.removeAttribute("data-probe-from");
          return stayed;
        })
      )
        faults.push(`the toolbar ${name} does not move on an arrow key`);
    }
    faults.push(
      ...(await page.evaluate(() => {
        const found: string[] = [];
        const roleOf = (node: Element) => node.getAttribute("role") ?? node.tagName.toLowerCase();
        const rows = [...document.querySelectorAll("#screen-list .pv-srow")].filter((row) => !(row as HTMLElement).hidden);
        const roles = [...new Set(rows.map(roleOf))];
        if (roles.length !== 1) found.push(`the state rows have the roles ${roles.join(", ")}`);
        if (document.querySelectorAll('#screen-list .pv-srow[aria-current="true"]').length !== 1) found.push("the shown state is not marked current once");
        for (const heading of document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
          if (heading.querySelector("input, select, textarea")) found.push(`a heading holds a field: ${heading.textContent!.trim()}`);
        const download = [...document.querySelectorAll<HTMLElement>(".pv-alt > *")].find(
          (control) => control.getClientRects().length && /Download/.test(control.textContent!),
        );
        if (!(download instanceof HTMLButtonElement && download.disabled))
          found.push(`the empty download is ${download ? download.outerHTML.slice(0, 80) : "missing"}`);
        for (const link of document.querySelectorAll("[role=link]")) if (!link.hasAttribute("href")) found.push(`a link with no address: ${link.id}`);
        return found;
      })),
    );
    await page.close();
    expect(faults).toEqual([]);
  }, 60_000);

  test("the pressed Compare button keeps its label and icon readable on its fill, at rest and under the pointer, in both themes", async () => {
    const found: string[] = [];
    for (const dark of [false, true])
      for (const width of [1440, 390]) {
        const page = await open(width, { dark });
        await page.click("#compare"); // the pointer stays on the button, as a person's does
        for (const where of ["under the pointer", "at rest"]) {
          const [label = "", icon = "", fill = ""] = await page.evaluate(() => {
            const button = document.getElementById("compare")!;
            return [
              getComputedStyle(button.querySelector(".pv-tab-label")!).color,
              getComputedStyle(button.querySelector("svg")!).stroke,
              getComputedStyle(button).backgroundColor,
            ];
          });
          const text = ratio(rgb(label), rgb(fill)),
            mark = ratio(rgb(icon), rgb(fill));
          if (text < 4.5 || mark < 3) found.push(`${width} ${dark ? "dark" : "light"} ${where}: label ${text.toFixed(2)}, icon ${mark.toFixed(2)}`);
          await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 600 });
          await page.calm();
        }
        await page.close();
      }
    expect(found).toEqual([]);
  }, 60_000);

  test("with a screenshot loaded and both panels open, the frame's caption clears Compare's caption, and the pictures are not fitted under 45%", async () => {
    const page = await open(1440);
    await page.click("#compare");
    await page.settled();
    await loadScreenshot(page);
    const found = await page.evaluate(() => ({
      panels: document.getElementById("workspace")!.dataset.panels,
      fitted: Number(/fitted to (\d+)%/.exec(document.getElementById("caption-size")!.textContent ?? "")?.[1] ?? 100),
    }));
    const overlap = await page.evaluate(overlapOf, ["#compare-side figcaption", "#caption"] as [string, string]);
    // Each caption sits by what it names: the frame's within 24 px under the frame, and Compare's under its picture, which
    // follows the frame's caption.
    const under = await page.evaluate(() => {
      const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
      const [frame, caption, picture, name] = [
        box("shell"),
        box("caption"),
        box("compare-beside"),
        document.querySelector("#compare-side figcaption")!.getBoundingClientRect(),
      ];
      return caption.top >= frame.bottom && caption.top - frame.bottom <= 24 && picture.top >= caption.bottom && name.top >= picture.bottom;
    });
    await page.close();
    expect([found.panels, overlap, under, found.fitted >= 45]).toEqual(["both", 0, true, true]);
  }, 60_000);

  test("with a screenshot loaded at 1440, the toast that says so covers neither the picture nor a control of the bar", async () => {
    const page = await open(1440);
    await page.click("#compare");
    await page.settled();
    await loadScreenshot(page);
    const found = await page.evaluate(() => {
      const toast = document.getElementById("toast")!;
      const box = toast.getBoundingClientRect();
      const hit = (other: Element) => {
        const at = other.getBoundingClientRect();
        return !(at.right <= box.left || at.left >= box.right || at.bottom <= box.top || at.top >= box.bottom);
      };
      const controls = [...document.querySelectorAll<HTMLElement>(".pv-bar button, .pv-bar select")].filter((control) => control.getClientRects().length);
      return [toast.hasAttribute("data-on"), hit(document.getElementById("compare-beside")!), controls.filter(hit).map((control) => control.dataset.testid)];
    });
    await page.close();
    expect(found).toEqual([true, false, []]);
  }, 60_000);

  test("at 390 and 320 the Checks menu opens inside the window, and the page does not scroll sideways", async () => {
    const found: string[] = [];
    for (const width of [390, 320]) {
      const page = await open(width);
      await page.click("#checks-toggle");
      const box = await page.evaluate(() => {
        const menu = document.getElementById("checks-menu")!.getBoundingClientRect();
        return { left: menu.left, right: menu.right, scroll: document.documentElement.scrollWidth };
      });
      if (box.left < 0 || box.right > width || box.scroll > width) found.push(`${width}: menu ${box.left} to ${box.right}, page ${box.scroll} wide`);
      await page.close();
    }
    expect(found).toEqual([]);
  }, 60_000);

  test("at 390 the toast after loading a screenshot covers no control", async () => {
    const page = await open(390);
    await page.click("#compare");
    await page.settled();
    await loadScreenshot(page);
    const covered = await page.evaluate(() => {
      const toast = document.getElementById("toast")!;
      const box = toast.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>("button, select, input, a[href], #crumb")]
        .filter((control) => control.getClientRects().length && !toast.contains(control))
        .filter((control) => {
          const at = control.getBoundingClientRect();
          return !(at.right <= box.left || at.left >= box.right || at.bottom <= box.top || at.top >= box.bottom);
        })
        .map((control) => control.dataset.testid || control.id);
    });
    const shown = await page.evaluate(() => document.getElementById("toast")!.hasAttribute("data-on"));
    await page.close();
    expect([shown, covered]).toEqual([true, []]);
  }, 60_000);

  test("at 390 the Screens panel's close button centres its icon, and its row centres on the heading's line", async () => {
    const page = await open(390);
    await page.click(id("proto-screens-toggle"));
    await page.calm();
    const offsets = await page.evaluate(() => {
      const button = document.querySelector(`[data-testid="proto-screens-close"]`)!;
      const box = button.getBoundingClientRect(),
        icon = button.querySelector("svg")!.getBoundingClientRect();
      const words = document.createRange();
      words.selectNodeContents(document.getElementById("round-h")!);
      const line = words.getBoundingClientRect();
      const centre = (top: number, height: number) => top + height / 2;
      return [
        Math.abs(icon.left + icon.width / 2 - (box.left + box.width / 2)),
        Math.abs(centre(icon.top, icon.height) - centre(box.top, box.height)),
        Math.abs(centre(box.top, box.height) - centre(line.top, line.height)),
      ].map((offset) => offset <= 0.5);
    });
    await page.close();
    expect(offsets).toEqual([true, true, true]);
  }, 60_000);

  test("the headings follow the outline, at 1440 and at 390 with an earlier round, and no heading holds a button", async () => {
    const found: string[] = [];
    for (const [width, address] of [
      [1440, productPage()],
      [390, earlier],
    ] as const) {
      const page = await open(width, {}, address);
      if (width === 390) await page.click(id("proto-inspector-toggle"));
      else await page.click("#itab-screen");
      await page.settled();
      found.push(
        ...(await page.evaluate((at: number) => {
          const faults: string[] = [];
          let level = 0;
          for (const heading of document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
            if (!heading.getClientRects().length) continue; // what a screen reader meets: a closed drawer holds none
            const next = Number(heading.tagName[1]);
            if (next > level + 1) faults.push(`${at}: ${heading.tagName} "${heading.textContent!.trim()}" follows an h${level}`);
            const button = heading.querySelector("button");
            // A heading may be its one button, as a screen's name is; a button beside the heading's words is not part of its name.
            if (button && button.textContent!.trim() !== heading.textContent!.trim())
              faults.push(`${at}: ${heading.tagName} "${heading.textContent!.trim()}" holds a button`);
            level = next;
          }
          const flow = document.querySelector("#screen-list .pv-flow-h");
          const screen = flow?.closest(".pv-flow")?.querySelector(".pv-scr-h");
          if (flow && screen && screen.tagName <= flow.tagName) faults.push(`${at}: a screen's ${screen.tagName} is not under its flow's ${flow.tagName}`);
          return faults;
        }, width)),
      );
      await page.close();
    }
    expect(found).toEqual([]);
  }, 60_000);

  test("each specimen frame of the System view has its own title", async () => {
    const page = await open(1440);
    await page.click("#tab-system");
    await page.settled();
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLIFrameElement>("#system iframe, .pv-specimen iframe")].map((frame) => frame.title),
    );
    await page.close();
    expect([titles.length > 3, new Set(titles).size === titles.length]).toEqual([true, true]);
  }, 60_000);

  test("the key V says the tab it shows", async () => {
    const page = await open(1440);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const said: string[] = [];
    for (const _ of [1, 2, 3]) {
      await page.key("v");
      await page.settled();
      said.push(await page.evaluate(() => document.getElementById("announce")!.textContent ?? ""));
    }
    await page.close();
    expect(said).toEqual(["Board tab", "System tab", "Prototype tab"]);
  }, 60_000);

  // A design may make an element editable, or name one a text box: a letter typed there is text, never a shortcut.
  test("a single key typed in the design's editable text or text box is text, and opens no tab", async () => {
    const page = await open(1440);
    const typed: { tab: string; text: string }[] = [];
    for (const kind of ["editable", "inside", "textbox"]) {
      await page.evaluate((how: string) => {
        document.querySelector<HTMLElement>('[role="tab"][data-tab="prototype"]')?.click();
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument as Document;
        const host = doc.createElement("p");
        host.dataset.probe = how;
        if (how === "textbox") {
          host.setAttribute("role", "textbox");
          host.tabIndex = 0;
        } else host.contentEditable = "true";
        const inner = doc.createElement("span");
        inner.textContent = "x";
        host.append(inner);
        doc.body.prepend(host);
        if (how === "inside") {
          inner.tabIndex = -1;
          inner.focus();
        } else host.focus();
      }, kind);
      await page.key("v");
      await page.settled();
      typed.push(
        await page.evaluate((how: string) => {
          const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument as Document;
          const host = doc.querySelector(`[data-probe="${how}"]`);
          const text = host?.textContent ?? "";
          host?.remove();
          return { tab: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-tab") ?? "", text };
        }, kind),
      );
    }
    await page.close();
    expect(typed).toEqual([
      { tab: "prototype", text: "vx" },
      { tab: "prototype", text: "vx" },
      { tab: "prototype", text: "x" },
    ]);
  }, 60_000);

  test("at 390 Tab meets the line to type, above the frame, before Fit and 100% under it", async () => {
    const page = await open(390);
    const order = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button, select, input")]
        .filter((control) => control.getClientRects().length && control.tabIndex >= 0)
        .map((control) => control.dataset.testid ?? "")
        .filter((name) => ["proto-caption-next", "proto-zoom-fit"].includes(name)),
    );
    await page.close();
    expect(order).toEqual(["proto-caption-next", "proto-zoom-fit"]);
  }, 60_000);

  test("at 390 every control lies in a landmark, no two landmarks share a name, and the tab list's name is not its role", async () => {
    const found: string[] = [];
    for (const width of [390, 1440]) {
      const page = await open(width);
      found.push(
        ...(await page.evaluate((at: number) => {
          const faults: string[] = [];
          const LANDMARKS = "header, nav, main, aside, footer, section[aria-label], section[aria-labelledby], [role=region]";
          for (const control of document.querySelectorAll<HTMLElement>("button, select, input, a[href]"))
            if (control.getClientRects().length && !control.closest(LANDMARKS) && !control.closest("dialog") && control.id !== "toast")
              if (!control.matches(".skip")) faults.push(`${at}: ${control.dataset.testid || control.id} lies in no landmark`);
          const nameOf = (node: Element) =>
            node.getAttribute("aria-label") ?? document.getElementById(node.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() ?? "";
          const named = [...document.querySelectorAll(LANDMARKS)].filter((node) => node.getClientRects().length && nameOf(node));
          for (const node of named)
            if (named.some((other) => other !== node && other.contains(node) && nameOf(other) === nameOf(node)))
              faults.push(`${at}: two landmarks are named ${nameOf(node)}`);
          for (const list of document.querySelectorAll("[role=tablist]"))
            if (/\btabs?\b/i.test(list.getAttribute("aria-label") ?? "")) faults.push(`${at}: a tab list is named ${list.getAttribute("aria-label")}`);
          return faults;
        }, width)),
      );
      await page.close();
    }
    expect(found).toEqual([]);
  }, 60_000);
});

describe.skipIf(!BROWSER)("the panel buttons and the side panel's drawer", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  /** The name Chrome gives an element, as a screen reader hears it. */
  async function nameOf(page: Page, selector: string): Promise<string> {
    const doc = (await page.send("DOM.getDocument", { depth: 0 })) as { root: { nodeId: number } };
    const found = (await page.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector })) as { nodeId: number };
    const tree = (await page.send("Accessibility.getPartialAXTree", { nodeId: found.nodeId, fetchRelatives: false })) as {
      nodes: { name?: { value?: string } }[];
    };
    return tree.nodes[0]?.name?.value ?? "";
  }

  test("at 390 each dock button's name is its own words, with no count or label run into it", async () => {
    const page = await browser.open(390, 844);
    await page.goto(productPage());
    const names = [await nameOf(page, "#screens-toggle, .pv-menu-toggle"), await nameOf(page, "#inspect-toggle"), await nameOf(page, "#build-toggle")];
    await page.close();
    expect(names).toEqual(["Screens", "Comments and build details", "Build details"]);
  }, 30_000);

  test("at 1024 focus that leaves the side panel's drawer, where it covers the artboard, closes it", async () => {
    const page = await browser.open(1024, 800);
    await page.goto(productPage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    await page.click("#inspect-toggle");
    await page.settled();
    const open = await page.evaluate(() => document.getElementById("inspector")?.dataset.open);
    const outside = await page.evaluate(() => {
      const inspector = document.getElementById("inspector") as HTMLElement;
      const inside = [...inspector.querySelectorAll<HTMLElement>("button, select, input, textarea, a[href]")].find((node) => node.getClientRects().length);
      inside?.focus();
      const target = document.getElementById("frame") as HTMLElement;
      target.tabIndex = 0;
      target.focus();
      return document.getElementById("inspector")?.dataset.open;
    });
    await page.close();
    expect([open, outside]).toEqual(["true", "false"]);
  }, 30_000);
});

describe.skipIf(!BROWSER)("a saved round, opened again", () => {
  let browser: Browser;
  let saved = "";
  beforeAll(() => {
    saved = pageWith(productPage(), "saved-round", (config) => {
      const item = (n: number) => ({
        id: `r1-${n}`,
        screen: "items:list",
        state: "populated",
        testid: "items-refresh",
        comment: `Saved ${n}.`,
        type: "change",
        by: "",
        done: false,
      });
      config.rounds = [{ round: 1, items: [item(1), item(2)] }];
    });
    browser = new Browser();
  });
  afterAll(() => browser.close());

  // The counts are of the comments the round lists, its file's, and a round whose file is written exports nothing, even
  // with a draft of that round still in this browser.
  test("counts its file's comments, and offers no download or copy", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${saved}#items%3Alist/populated?round=1`);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const read = () =>
      page.evaluate(() => ({
        listed: document.querySelectorAll("#comments-list > li").length,
        count: document.getElementById("comments-count")?.hidden ? "" : document.getElementById("comments-count")?.textContent,
        dock: document.getElementById("dock-comments")?.textContent,
        line: document.getElementById("comments-line")?.textContent,
        download: !(document.getElementById("comments-download") as HTMLElement).hidden,
        copy: !(document.querySelector('[data-comment-copy="json"]') as HTMLButtonElement).disabled,
      }));
    const empty = await read();
    await page.evaluate(() => {
      const config = JSON.parse(document.getElementById("page-config")?.textContent ?? "{}") as { design_id: string };
      const draft = { id: "r1-9", type: "change", screen: "items:list", state: "populated", testid: "items-refresh", index: 0, comment: "A draft." };
      localStorage.setItem(`prototype-comments:${config.design_id}:round-1`, JSON.stringify({ items: [draft] }));
    });
    await page.reload();
    const drafted = await read();
    await page.close();
    const line = empty.line ?? "";
    expect([empty, drafted.download, drafted.copy, drafted.count]).toEqual([
      { listed: 2, count: "2", dock: "2", line, download: false, copy: false },
      false,
      false,
      "2",
    ]);
    expect(line).toContain("2");
  }, 60_000);

  // Save's state and its reason follow the round and its count, with no key pressed in the field: a saved round takes no
  // comment, the open round does again, and a full round takes one more once a comment is deleted.
  test("Save is off with its reason in a saved round and on again in the open round, and a delete from a full round turns it on", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${saved}#items%3Alist/populated`);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const form = () =>
      page.evaluate(() => ({
        save: (document.getElementById("comment-add") as HTMLButtonElement).disabled,
        reason: document.getElementById("comment-limit")!.hidden ? "" : document.getElementById("comment-limit")!.textContent,
      }));
    const roundField = (value: string) =>
      page.evaluate((to: string) => {
        const field = document.getElementById("round-number") as HTMLInputElement;
        field.value = to;
        field.dispatchEvent(new Event("change"));
      }, value);
    const states: { save: boolean; reason: string | null }[] = [await form()];
    await roundField("1");
    await page.settled();
    states.push(await form());
    await roundField("2");
    await page.settled();
    states.push(await form());
    // The same by the address: a link that names the saved round, then one that names none.
    await page.evaluate(() => {
      location.hash = "#items%3Alist/populated?round=1";
    });
    await page.settled();
    states.push(await form());
    await page.evaluate(() => {
      location.hash = "#items%3Alist/populated";
    });
    await page.settled();
    states.push(await form());
    // A full open round, then one of its comments deleted.
    await page.evaluate(() => {
      const config = JSON.parse(document.getElementById("page-config")?.textContent ?? "{}") as { design_id: string; limits: { comments_in_a_round: number } };
      const items = Array.from({ length: config.limits.comments_in_a_round }, (_, i) => ({
        id: `r2-${i + 1}`,
        type: "change",
        screen: "items:list",
        state: "populated",
        testid: "items-refresh",
        index: 0,
        frame: "1024",
        theme: "system",
        comment: `Full ${i + 1}.`,
      }));
      localStorage.setItem(`prototype-comments:${config.design_id}:round-2`, JSON.stringify({ items }));
    });
    await page.reload();
    states.push(await form());
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-testid="proto-comments-remove-r2-1"]')?.click());
    await page.settled();
    states.push(await form());
    await page.close();
    const full = "This round holds 200 comments, the most a round takes. Copy them for your agent, then start the next round.";
    const closed = "Round 1 is saved, so it takes no more comments. Type 2 in Round and press Enter to comment again.";
    expect(states).toEqual([
      { save: false, reason: "" },
      { save: true, reason: closed },
      { save: false, reason: "" },
      { save: true, reason: closed },
      { save: false, reason: "" },
      { save: true, reason: full },
      { save: false, reason: "" },
    ]);
  }, 60_000);

  // The tool counts a round the page leaves out, so the review opens after it, never in a round already saved.
  test("opens in the round the page's next_round names, past the rounds it lists", async () => {
    const page = await browser.open(1440, 900);
    const after = pageWith(saved, "next-round", (config) => {
      config.next_round = 3;
    });
    await page.goto(`${after}#items%3Alist/populated`);
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const round = await page.evaluate(() => (document.getElementById("round-number") as HTMLInputElement).value);
    await page.close();
    expect(round).toBe("3");
  }, 30_000);
});

describe.skipIf(!BROWSER)("the System view's specimens", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("are painted again when the text is doubled or the direction turns", async () => {
    const page = await browser.open(1440, 900);
    const address = `${productPage()}#items%3Alist/populated?tab=system`;
    await page.goto(address);
    const look = async () => {
      await page.until(`[...document.querySelectorAll("#system-components iframe")].some((frame) => frame.contentDocument?.body)`);
      return page.evaluate(() => {
        const doc = document.querySelector<HTMLIFrameElement>("#system-components iframe")?.contentDocument;
        return `${doc?.documentElement.style.fontSize}|${doc?.documentElement.dir}`;
      });
    };
    const before = await look();
    await page.evaluate((to: string) => {
      location.hash = to;
    }, "#items%3Alist/populated?tab=system&text=200&dir=rtl");
    await page.settled();
    const after = await look();
    await page.close();
    expect([before.startsWith("|"), after]).toEqual([true, "200%|rtl"]);
  }, 30_000);
});

describe.skipIf(!BROWSER)("Back in the design", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  // Back is labelled with the design's parent screen, so it goes there, whatever screen the history holds before.
  test("goes to the parent it names after a move through another screen, and by the history when it came from the parent", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(productPage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    const screen = () => page.evaluate(() => decodeURIComponent(location.hash.slice(1).split("?")[0] ?? "").split("/")[0]);
    await page.click('#screen-list [data-pv-go="settings:prefs"]');
    await page.click('#screen-list [data-pv-go="items:detail"]');
    const label = await page.evaluate(() =>
      (document.getElementById("frame") as HTMLIFrameElement).contentDocument?.querySelector("[data-proto-back]")?.getAttribute("aria-label"),
    );
    await page.click("[data-proto-back]", true);
    await page.settled();
    const afterDetour = await screen();
    // From the parent itself, Back goes by the history, which adds no entry.
    await page.click('#screen-list [data-pv-go="items:detail"]');
    const before = await page.evaluate(() => history.length);
    await page.click("[data-proto-back]", true);
    await page.settled();
    const added = (await page.evaluate(() => history.length)) - before;
    const afterParent = await screen();
    await page.close();
    expect([label, afterDetour, afterParent, added]).toEqual(["Back to Items", "items:list", "items:list", 0]);
  }, 60_000);
});

describe.skipIf(!BROWSER)("a stored record another page wrote", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  // Any page opened from a file can write this page's storage: an item that does not read whole is left out, the page
  // starts and lists the rest, says how many it left out, and exports only what the schema takes.
  test("starts, lists the comments that read whole, and says how many it left out", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(productPage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    await page.evaluate(() => {
      const config = JSON.parse(document.getElementById("page-config")?.textContent ?? "{}") as { design_id: string };
      const [screen = "", state = ""] = decodeURIComponent(location.hash.slice(1).split("?")[0] ?? "").split("/");
      const frame = document.getElementById("frame") as HTMLIFrameElement;
      const testid = frame.contentDocument?.querySelector("[data-testid]")?.getAttribute("data-testid") ?? "";
      const base = { type: "change", screen, state, testid, index: 0, frame: "1024", theme: "system" };
      const items = [
        { ...base, id: "r1-1", comment: "Readable." },
        { ...base, id: "r1-2", comment: 5 },
        { ...base, id: "r1-3", comment: "A box of fractions.", box: { x: 0.5, y: 1, width: 2, height: 3 } },
        { ...base, id: "r1-1", comment: "The same id." },
      ];
      localStorage.setItem(`prototype-comments:${config.design_id}:round-1`, JSON.stringify({ items }));
    });
    await page.reload();
    const shown = await page.evaluate(() => ({
      ready: Boolean((document.getElementById("frame") as HTMLIFrameElement).contentDocument?.body),
      listed: [...document.querySelectorAll("#comments-list > li p")].map((p) => p.textContent),
      said: document.getElementById("comments-unreadable")?.hidden ? "" : document.getElementById("comments-unreadable")?.textContent,
      exported: (
        JSON.parse(decodeURIComponent(document.getElementById("comments-download")?.getAttribute("href")?.split(",").slice(1).join(",") ?? "{}")) as {
          items?: { id: string }[];
        }
      ).items?.map((it) => it.id),
    }));
    await page.close();
    expect(shown).toEqual({
      ready: true,
      listed: ["Readable."],
      said: "3 comments kept in this browser for this round could not be read, so they are left out: not shown, and not exported.",
      exported: ["r1-1"],
    });
  }, 60_000);
});

describe.skipIf(!BROWSER)("the viewer's cost with many comments on one view", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(() => browser.close());

  // A count, not a time: each read of the frame's elements lays the frame out, so the pins read them once for every
  // comment on the view, never once for each.
  test("the pins read the frame's elements once, however many comments the view holds", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(productPage());
    await page.evaluate(`localStorage.clear()`);
    await page.reload();
    await page.evaluate(() => {
      const config = JSON.parse(document.getElementById("page-config")?.textContent ?? "{}") as { design_id: string };
      const [screen = "", state = ""] = decodeURIComponent(location.hash.slice(1).split("?")[0] ?? "").split("/");
      const frame = document.getElementById("frame") as HTMLIFrameElement;
      const testid = frame.contentDocument?.querySelector("[data-testid]")?.getAttribute("data-testid") ?? "";
      const items = Array.from({ length: 40 }, (_, i) => ({ id: `r1-${i + 1}`, type: "change", screen, state, testid, index: 0, comment: `c${i}` }));
      localStorage.setItem(`prototype-comments:${config.design_id}:round-1`, JSON.stringify({ items }));
    });
    await page.reload();
    const reads = await page.evaluate(async () => {
      const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument as Document;
      let count = 0;
      const own = doc.querySelectorAll.bind(doc);
      doc.querySelectorAll = ((selector: string) => {
        if (selector.includes("data-testid")) count++;
        return own(selector);
      }) as typeof doc.querySelectorAll;
      doc.dispatchEvent(new Event("scroll"));
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return { count, pins: document.querySelectorAll("#pins .pv-pin").length };
    });
    await page.close();
    expect(reads).toEqual({ count: 1, pins: 40 });
  }, 60_000);
});

// Small things of the viewer, each held by a state read in the browser.
describe.skipIf(!BROWSER)("small things of the viewer", () => {
  const folder = tempFolder(join(tmpdir(), "prototype-viewer-small-"));
  let browser: Browser;
  let picks = "";
  let empty = "";
  beforeAll(async () => {
    // The product design, with a plain go to the item's screen from another screen; and a design that draws no screen.
    const files = flowDesign();
    files["design/flows/settings.html"] = (files["design/flows/settings.html"] ?? "").replace(
      "</section>",
      '  <button type="button" data-proto-go="items:detail" data-testid="prefs-open-detail">Open an item</button>\n</section>',
    );
    files["design/empty.html"] = single({ screens: "<p>No screen yet.</p>" });
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, file)), { recursive: true });
      writeFileSync(join(folder, file), text);
    }
    for (const design of [FLOW_DESIGN, "design/empty.html"]) await run(["build", design], { out: () => {}, err: () => {} }, folder);
    picks = pathToFileURL(join(folder, ".prototype/views", FLOW_DESIGN)).href;
    empty = pathToFileURL(join(folder, ".prototype/views/design/empty.html")).href;
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("the Board of a design with no screen says it is ready", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${empty}#?tab=board`);
    await page.until(`document.getElementById("board").dataset.ready === "true"`);
    expect(await page.evaluate(() => document.getElementById("workspace")!.dataset.tab)).toBe("board");
    await page.close();
  }, 60_000);

  test("Copy link writes a frame a person named, even the default one a phone would not open", async () => {
    const page = await browser.open(390, 844);
    await page.goto(`${picks}#items:list/populated?frame=1024`);
    const copied = await page.evaluate(async () => {
      let text = "";
      const writeText = async (written: string) => {
        text = written;
      };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      document.getElementById("copy-link")!.click();
      await new Promise((done) => setTimeout(done, 0));
      return text.split("#")[1] ?? "";
    });
    await page.close();
    expect(copied).toBe("items:list/populated?frame=1024");
  }, 60_000);

  test("a pick of files Compare cannot show keeps the screenshots loaded before", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${picks}#items:list/populated?compare=1`);
    await loadScreenshot(page);
    const said = await page.evaluate(async () => {
      const files = new DataTransfer();
      files.items.add(new File(["not a picture"], "notes.txt", { type: "text/plain" }));
      const input = document.getElementById("compare-files") as HTMLInputElement;
      input.files = files.files;
      const announce = document.getElementById("announce")!;
      const heard = new Promise<string>((done) => {
        const watch = new MutationObserver(() => {
          if (/skipped/.test(announce.textContent ?? "")) {
            watch.disconnect();
            done(announce.textContent ?? "");
          }
        });
        watch.observe(announce, { childList: true, characterData: true, subtree: true });
      });
      input.dispatchEvent(new Event("change"));
      return heard;
    });
    await page.settled();
    const shown = await page.evaluate(() => document.querySelectorAll("#compare-beside").length);
    await page.close();
    expect([said, shown]).toEqual(["1 skipped: a PNG, JPEG, or WebP file only; the 1 screenshot loaded before is kept", 1]);
  }, 60_000);

  test("a go to the view already shown adds no history entry", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${picks}#items:list/populated`);
    const before = await page.evaluate(() => history.length);
    await page.click(`[data-pv-screen="items:list"] [data-pv-go="items:list"]`);
    await page.settled();
    const after = await page.evaluate(() => [history.length, location.hash] as const);
    await page.close();
    expect(after).toEqual([before, "#items:list/populated"]);
  }, 60_000);

  test("a plain go to a screen of a list's entry opens its first entry, and a go from an item its own", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${picks}#items:list/populated`);
    const press = async (testid: string, at = 0) => {
      await page.evaluate(
        ({ testid, at }: { testid: string; at: number }) => {
          const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
          doc.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)[at]!.click();
        },
        { testid, at },
      );
      await page.settled();
      return page.evaluate(() => (document.getElementById("frame") as HTMLIFrameElement).contentDocument!.querySelector("h2")?.textContent ?? "");
    };
    const fromItem = await press("open-item", 1);
    await page.evaluate(() => {
      location.hash = "#settings:prefs/ready";
    });
    await page.settled();
    const plain = await press("prefs-open-detail");
    await page.close();
    expect([fromItem, plain]).toEqual(["Second item", "First item"]);
  }, 60_000);

  test("on the Board, J into the next screen stays on the Board, as it does within a screen", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${picks}#items:list/populated?tab=board`);
    const steps: string[] = [];
    for (let step = 0; step < 8; step++) {
      await page.key("j");
      await page.settled();
      const [screen, tab] = await page.evaluate(() => [
        decodeURIComponent(location.hash.slice(1).split("/")[0] ?? ""),
        document.getElementById("workspace")!.dataset.tab ?? "",
      ]);
      steps.push(`${screen} ${tab}`);
      if (screen !== "items:list") break;
    }
    await page.close();
    expect(steps.at(-1)).toBe("items:detail board");
    expect(steps.every((step) => step.endsWith(" board"))).toBe(true);
  }, 60_000);
});

describe.skipIf(!BROWSER)("where a person is, in the design's navigation", () => {
  const folder = tempFolder(join(tmpdir(), "prototype-viewer-current-"));
  let browser: Browser;
  let address = "";
  beforeAll(async () => {
    // Three linked screens, one of them under another, and two under that one with no link of their own.
    const screen = (id: string, parent = "") =>
      `<section data-proto-screen="${id}" data-proto-title="${id}"${parent ? ` data-proto-parent="${parent}"` : ""}><div data-proto-state="ready" data-testid="${id}-ready"><p>${id}</p></div></section>`;
    const link = (id: string) => `<button type="button" data-proto-go="${id}" data-testid="nav-${id}">${id}</button>`;
    const design = single({
      chrome: `<nav aria-label="Main">${["home", "team", "audit"].map(link).join("")}</nav>\n`,
      screens: [screen("home"), screen("team"), screen("audit", "team"), screen("member", "team"), screen("grant", "member")].join("\n"),
    });
    mkdirSync(join(folder, "design"), { recursive: true });
    writeFileSync(join(folder, "design/current.html"), design);
    await run(["build", "design/current.html"], { out: () => {}, err: () => {} }, folder);
    address = pathToFileURL(join(folder, ".prototype/views/design/current.html")).href;
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("one link is the current page, and a link to a screen the shown one stands under is its section", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${address}#home`);
    const marks: Record<string, string[]> = {};
    for (const shown of ["home", "team", "audit", "member", "grant"]) {
      await page.evaluate((hash: string) => {
        location.hash = hash;
      }, `#${shown}`);
      await page.tasksRun();
      await page.settled();
      marks[shown] = await page.evaluate(() =>
        [...(document.getElementById("frame") as HTMLIFrameElement).contentDocument!.querySelectorAll("nav [data-proto-go]")]
          .filter((link) => link.hasAttribute("aria-current") || link.hasAttribute("data-proto-section"))
          .map(
            (link) =>
              `${link.getAttribute("data-proto-go")}:${link.getAttribute("aria-current") ?? "-"}${link.hasAttribute("data-proto-section") ? ":section" : ""}`,
          ),
      );
    }
    await page.close();
    expect(marks).toEqual({
      // A top-level screen: its own link alone, and no section mark.
      home: ["home:page"],
      team: ["team:page"],
      // A child screen with its own link: that link is the one current page, and its parent's link is the section.
      audit: ["team:-:section", "audit:page"],
      // A child screen with no link of its own, and one under it: the nearest linked screen above is the current item.
      member: ["team:true:section"],
      grant: ["team:true:section"],
    });
  }, 60_000);
});

describe.skipIf(!BROWSER)("a panel of the design, on a move", () => {
  const folder = tempFolder(join(tmpdir(), "prototype-viewer-panels-"));
  let browser: Browser;
  let address = "";
  beforeAll(async () => {
    // A menu folded behind its toggle, outside every screen, and a panel written open inside a state.
    const screen = (id: string) =>
      `<section data-proto-screen="${id}" data-proto-title="${id}"><div data-proto-state="ready" data-testid="${id}-ready"><button type="button" data-proto-toggle="${id}-more" aria-controls="${id}-more" aria-expanded="true" data-testid="${id}-more-toggle">More</button><div id="${id}-more" data-proto-panel="${id}-more"><p>${id}</p></div></div></section>`;
    const design = single({
      chrome: `<button type="button" data-proto-toggle="menu" aria-controls="menu" aria-expanded="false" data-testid="menu-toggle">Menu</button><div id="menu" data-proto-panel="menu" hidden><nav aria-label="Main"><button type="button" data-proto-go="home" data-testid="nav-home">Home</button><button type="button" data-proto-go="team" data-testid="nav-team">Team</button></nav></div>\n`,
      screens: [screen("home"), screen("team")].join("\n"),
    });
    mkdirSync(join(folder, "design"), { recursive: true });
    writeFileSync(join(folder, "design/panels.html"), design);
    await run(["build", "design/panels.html"], { out: () => {}, err: () => {} }, folder);
    address = pathToFileURL(join(folder, ".prototype/views/design/panels.html")).href;
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("takes the design's own hidden again when another screen shows, so a menu opened to move is closed on the screen it opened", async () => {
    const page = await browser.open(1440, 900);
    await page.goto(`${address}#home`);
    await page.settled();
    const panels = () =>
      page.evaluate(() => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement).contentDocument!;
        return [...doc.querySelectorAll("[data-proto-toggle]")].map((toggle) => {
          const panel = doc.querySelector(`[data-proto-panel="${toggle.getAttribute("data-proto-toggle")}"]`) as HTMLElement;
          return `${toggle.getAttribute("data-proto-toggle")}:${panel.hidden ? "closed" : "open"}:${toggle.getAttribute("aria-expanded")}`;
        });
      });
    const seen = [await panels()];
    await page.click(id("menu-toggle"), true);
    await page.click(id("home-more-toggle"), true);
    await page.settled();
    seen.push(await panels());
    await page.click(id("nav-team"), true);
    await page.tasksRun();
    await page.settled();
    seen.push(await panels());
    // The same view drawn again, as a change of theme draws it, keeps what a person opened.
    await page.click(id("menu-toggle"), true);
    await page.click(id("proto-theme-dark"));
    await page.settled();
    seen.push(await panels());
    await page.close();
    expect(seen).toEqual([
      ["menu:closed:false", "home-more:open:true"],
      ["menu:open:true", "home-more:closed:false"],
      ["menu:closed:false", "team-more:open:true"],
      ["menu:open:true", "team-more:open:true"],
    ]);
  }, 60_000);
});
