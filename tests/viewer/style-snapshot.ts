/// <reference lib="dom" />
// A tool for a change to the styles that must change nothing a person sees: it writes, for each layer of the viewer at
// 320 and 1440 px in both themes, every element's box and painted styles, so two runs can be compared line by line.
//   bun tests/viewer/style-snapshot.ts <folder>            write a snapshot into a new folder
//   bun tests/viewer/style-snapshot.ts <folder> <other>    write one, then print the lines that differ from another
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser, stopBrowsers } from "./page.ts";
import { productPage } from "./pages.ts";
import { LAYERS } from "./surfaces.ts";

function styles(): string[] {
  const KEYS = [
    "display",
    "position",
    "color",
    "backgroundColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderTopWidth",
    "borderLeftWidth",
    "borderTopLeftRadius",
    "borderBottomRightRadius",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginLeft",
    "opacity",
    "boxShadow",
    "outlineStyle",
    "textDecorationLine",
    "textDecorationColor",
    "fill",
    "stroke",
    "visibility",
    "cursor",
  ] as const;
  const lines: string[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("template, script, style, symbol")) continue;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const where = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.getAttribute("class") ?? "").replace(/\s+/g, ".")}`;
    lines.push(
      where +
        " @" +
        [box.x, box.y, box.width, box.height].map((n) => Math.round(n * 10) / 10).join(",") +
        " " +
        KEYS.map((key) => style[key]).join("|") +
        " ::" +
        getComputedStyle(el, "::after").backgroundColor +
        getComputedStyle(el, "::before").content,
    );
  }
  return lines;
}

const [folder, other] = process.argv.slice(2);
if (!folder) throw new Error("name a folder to write the snapshot into");
mkdirSync(folder, { recursive: true });
const browser = new Browser();
let differing = 0;
try {
  for (const width of [1440, 320]) {
    for (const dark of [false, true]) {
      for (const [layer, opens] of Object.entries(LAYERS)) {
        const steps = width < 768 ? opens.narrow : opens.wide;
        if (!steps) continue;
        const page = await browser.open(width, 900, { dark, reducedMotion: true });
        await page.goto(productPage());
        await page.evaluate(`localStorage.clear()`);
        await page.reload();
        for (const step of steps) {
          await page.click(step);
          await Bun.sleep(80);
        }
        if (layer === "the Board") await page.until(`document.getElementById("board").dataset.ready === "true"`);
        await page.settled();
        const lines = await page.evaluate(styles);
        await page.close();
        const name = `${width}-${dark ? "dark" : "light"}-${layer.replace(/\W+/g, "-")}.txt`;
        writeFileSync(join(folder, name), `${lines.join("\n")}\n`);
        if (other) {
          const before = readFileSync(join(other, name), "utf8").split("\n");
          const changed = lines.filter((line, at) => line !== before[at]);
          differing += changed.length;
          if (changed.length)
            console.log(
              `${name}: ${changed.length} of ${lines.length} lines differ, first:\n  now    ${changed[0]}\n  before ${before[lines.indexOf(changed[0]!)]}`,
            );
        }
      }
    }
  }
} finally {
  // The script runs outside the tests' preload, so it stops its Chrome and removes the profile itself.
  await browser.close();
  await stopBrowsers();
}
console.log(other ? (differing ? `${differing} lines differ` : "the two snapshots are the same") : `wrote the snapshot into ${folder}`);
process.exit(differing ? 1 : 0);
