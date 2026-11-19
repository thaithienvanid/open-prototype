// The viewer's tokens file is the one source of its colors, and each pair the viewer draws keeps its contrast in both
// themes. The lints hold that no other style holds a color or a shadow of its own.
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { apca, hex, ratio } from "./contrast.ts";

const STYLES = resolve(import.meta.dir, "../../viewer/styles");
const read = (name: string): Promise<string> => Bun.file(join(STYLES, name)).text();
const tokens = await read("tokens.css");

/** A role's solid color in a theme: `light-dark(a, b)` gives its side, and `var(--x)` is followed. */
function role(name: string, theme: "light" | "dark"): string {
  const value = new RegExp(`^\\s*--${name}:\\s*(.+);$`, "m").exec(tokens)?.[1];
  if (!value) throw new Error(`tokens.css has no --${name}`);
  const sides = /^light-dark\((.+), (.+)\)$/.exec(value);
  const chosen = sides ? sides[theme === "light" ? 1 : 2]! : value;
  const alias = /^var\(--([\w-]+)\)$/.exec(chosen);
  return alias ? role(alias[1]!, theme) : chosen;
}

/** Each pair the viewer draws: the role on top, the surface under it, and the least ratio (4.5 for text, 3 for an edge, an icon, a focus ring or a state fill). */
const PAIRS: [string, string, number, string][] = [
  ["foreground", "background", 7, "body text on the page"],
  ["foreground", "card", 4.5, "text on a menu or a dialog"],
  ["foreground", "muted", 4.5, "text on a quiet surface"],
  ["foreground", "accent", 4.5, "text on a hovered row"],
  ["foreground", "backdrop", 4.5, "the caption on the artboard"],
  ["foreground", "warn-subtle", 4.5, "a notice's text"],
  ["foreground", "comment-subtle", 4.5, "text on a comment's tint"],
  ["muted-foreground", "background", 4.5, "secondary text on the page"],
  ["muted-foreground", "card", 4.5, "secondary text on a menu"],
  ["muted-foreground", "muted", 4.5, "secondary text on a quiet surface"],
  ["muted-foreground", "accent", 4.5, "secondary text on a hovered row"],
  ["muted-foreground", "backdrop", 4.5, "secondary text on the artboard"],
  ["primary-foreground", "primary", 4.5, "text on a chosen row or a primary button"],
  ["link", "background", 4.5, "a link on the page"],
  ["comment", "background", 4.5, "the comment button's text"],
  ["comment-foreground", "comment", 4.5, "a pin's number"],
  ["warn", "warn-subtle", 3, "a notice's icon"],
  ["input", "background", 3, "a control's edge on the page"],
  ["input", "card", 3, "a control's edge on a menu"],
  ["input", "backdrop", 3, "a control's edge on the artboard"],
  ["ring", "background", 3, "the focus ring on the page"],
  ["ring", "card", 3, "the focus ring on a menu"],
  ["ring", "backdrop", 3, "the focus ring on the artboard"],
  ["ring", "accent", 3, "the focus ring inside a hovered row"],
  ["primary", "background", 3, "a chosen row's fill on the page"],
  ["comment", "backdrop", 3, "a pin on the artboard"],
];

/** A length token in px: `var(--x)` is followed, and `calc()` of px lengths and plain numbers is worked out. */
function px(name: string): number {
  const value = new RegExp(`^\\s*--${name}:\\s*(.+);$`, "m").exec(tokens)?.[1];
  if (!value) throw new Error(`tokens.css has no --${name}`);
  const plain = value
    .replace(/var\(--([\w-]+)\)/g, (_, inner: string) => String(px(inner)))
    .replace(/^calc\((.+)\)$/, "$1")
    .replaceAll("px", "");
  if (!/^[\d.\s*+()-]+$/.test(plain)) throw new Error(`--${name} is not a length of px: ${value}`);
  return Number(new Function(`return (${plain});`)());
}

describe("the viewer's tokens", () => {
  // The inside ring of a group's member sits beside the group's edge, and the ring against that edge is under 3:1 in both
  // themes. So the ring stands out only with a gap of the page colour between them: it starts at least one thin border in.
  test("the inside ring keeps a gap of the page colour from its group's edge, which it does not contrast with", () => {
    const below = (["light", "dark"] as const).filter((theme) => ratio(hex(role("ring", theme)), hex(role("input", theme))) < 3);
    const gap = -px("focus-inside-offset") - px("focus-width");
    expect([below, gap >= px("border-width-thin"), px("focus-inside-gap") >= -px("focus-inside-offset")]).toEqual([["light", "dark"], true, true]);
  });
  for (const theme of ["light", "dark"] as const) {
    test.each(PAIRS)(`${theme}: %s on %s keeps %d:1 (%s)`, (top, under, least) => {
      expect(ratio(hex(role(top, theme)), hex(role(under, theme)))).toBeGreaterThanOrEqual(least);
    });
    test(`${theme}: body text, secondary text and the large fill sit in their comfort bands`, () => {
      const page = hex(role("background", theme));
      const body = apca(hex(role("foreground", theme)), page);
      const secondary = apca(hex(role("muted-foreground", theme)), page);
      const [low, high] = theme === "light" ? [90, 102] : [82, 90];
      expect(body).toBeGreaterThanOrEqual(low);
      expect(body).toBeLessThanOrEqual(high);
      expect(secondary).toBeGreaterThanOrEqual(60);
      expect(body - secondary).toBeGreaterThanOrEqual(15);
      expect(apca(hex(role("primary", theme)), page)).toBeLessThanOrEqual(90); // a fill bigger than an icon is calmer than body text
    });
  }
  test("each color role is stated once, and the focus color is no other role's", () => {
    const names = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((found) => found[1]);
    expect(names.length).toBe(new Set(names).size);
    const solid = [...tokens.matchAll(/^\s*--([\w-]+):\s*light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);$/gm)];
    expect(solid.filter((found) => found[1] !== "ring" && (found[2] === role("ring", "light") || found[3] === role("ring", "dark")))).toEqual([]);
  });
});

describe("the viewer's styles read the tokens", () => {
  test("no color outside the tokens and the marked device drawing", async () => {
    for (const name of ["components.css", "chrome.css"]) {
      const css = (await read(name)).replace(/\/\*[\s\S]*?\*\//g, "");
      expect([name, css.match(/#[0-9a-f]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(|\boklch\(/gi) ?? []]).toEqual([name, []]);
    }
  });
  test("the shadow is worn only by the floating layers: the toast, the dialog, and the menu", async () => {
    const worn: string[] = [];
    for (const name of ["components.css", "chrome.css", "devices.css"]) {
      for (const rule of (await read(name)).matchAll(/^([^{}@\n]+)\{[^{}]*var\(--shadow-raised\)/gm)) worn.push(rule[1]!.trim());
    }
    expect(worn.sort()).toEqual([".dialog", ".pv-pop", ".toast"]);
  });
  // A control's size is a width, a height or a column of under 4 rem or em: a row, a mark, a key, a field. The System
  // view's samples draw a token's own value, and a layout's widths and gutters are not controls.
  const SAMPLES = new Set([".pv-swatch", ".pv-radius", ".pv-bar-sample"]);
  test("every control size, every duration and every layer comes from a token", async () => {
    const faults: string[] = [];
    for (const name of ["components.css", "chrome.css", "devices.css"]) {
      const css = (await read(name)).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = rule[1]!.trim();
        for (const declaration of rule[2]!.split(";")) {
          const [property = "", value = ""] = declaration.split(/:(.*)/s).map((part) => part.trim());
          if (property === "z-index" && !/^var\(--layer-[a-z-]+\)$/.test(value)) faults.push(`${name} ${selector} { ${property}: ${value} }`);
          if (/^(transition|animation)/.test(property) && /(?<![\w-])(?!0m?s\b)[0-9.]+m?s\b/.test(value))
            faults.push(`${name} ${selector} { ${property}: ${value} }`);
          if (SAMPLES.has(selector) || !/^((min|max)-)?(width|height)$|^grid-template-columns$/.test(property)) continue;
          if ([...value.matchAll(/(?<![\w.-])([0-9.]+)(rem|em)\b/g)].some((length) => Number(length[1]) < 4))
            faults.push(`${name} ${selector} { ${property}: ${value} }`);
        }
      }
    }
    expect(faults).toEqual([]);
  });
});
