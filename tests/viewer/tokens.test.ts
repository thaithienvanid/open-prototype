// The viewer's tokens file is the one source of its colours, and each pair the viewer draws keeps its contrast in both
// themes. The lints hold that no other style holds a colour or a shadow of its own.
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { paintOf, readTokens } from "../../viewer/tokens.ts";
import { apca, hex, ratio } from "./contrast.ts";

const STYLES = resolve(import.meta.dir, "../../viewer/styles");
const read = (name: string): Promise<string> => Bun.file(join(STYLES, name)).text();
const tokens = await read("tokens.css");

/** A role's solid colour in a theme: `light-dark(a, b)` gives its side, and `var(--x)` is followed. */
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
  test("each colour role is stated once, and the focus colour is no other role's", () => {
    const names = [...tokens.matchAll(/^\s*(--[\w-]+):/gm)].map((found) => found[1]);
    expect(names.length).toBe(new Set(names).size);
    const solid = [...tokens.matchAll(/^\s*--([\w-]+):\s*light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);$/gm)];
    expect(solid.filter((found) => found[1] !== "ring" && (found[2] === role("ring", "light") || found[3] === role("ring", "dark")))).toEqual([]);
  });
});

describe("the viewer's styles read the tokens", () => {
  test("no colour outside the tokens and the marked device drawing", async () => {
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

// A design's tokens, as the System view reads them from a tokens block's text (viewer/tokens.ts), and the value it
// paints for each side of a swatch.
describe("a design's tokens, read for the System view", () => {
  test("a value under the system's dark setting alone is the dark value, and the theme's own rule wins over it", () => {
    const css = `:root { --color-text: #111; --color-edge: #222; }
      @media (prefers-color-scheme: dark) { :root { --color-text: #eee; --color-edge: #ddd; } }
      :root[data-proto-theme="dark"] { --color-edge: #ccc; }`;
    expect(readTokens(css)).toEqual([
      { name: "--color-text", themes: { light: "#111", dark: "#eee" }, light: "#111", dark: "#eee" },
      { name: "--color-edge", themes: { light: "#222", dark: "#ccc" }, light: "#222", dark: "#ccc" },
    ]);
  });
  test("a ; inside a url() and a } or a ; inside a string do not end a value, and a comment's text is no token", () => {
    const css = `:root {
      --image-hero: url("data:image/svg+xml;utf8,<svg/>");
      --image-dot: url(data:image/png;base64,AAAA);
      --font-quote: "a } b; c";
      /* --color-gone: red; */
      --color-after: #123456;
    }`;
    expect(readTokens(css).map((token) => [token.name, token.light])).toEqual([
      ["--image-hero", 'url("data:image/svg+xml;utf8,<svg/>")'],
      ["--image-dot", "url(data:image/png;base64,AAAA)"],
      ["--font-quote", '"a } b; c"'],
      ["--color-after", "#123456"],
    ]);
  });
  test("the declarations before a nested block are read, and the block's own selector is its context", () => {
    const css = `:root { --space-1: 4px; @media (prefers-reduced-motion: reduce) { --duration-fast: 0ms; } --space-2: 8px; }`;
    expect(readTokens(css).map((token) => [token.name, token.light])).toEqual([
      ["--space-1", "4px"],
      ["--space-2", "8px"],
    ]);
  });
  const byName = (css: string) => new Map(readTokens(css).map((token) => [token.name, token]));
  test("light-dark() paints its light colour on the light side and its dark colour on the dark side", () => {
    const tokens = byName(`:root { --color-surface: light-dark(#fafafb, #111317); --color-card: light-dark(var(--color-surface), rgb(1, 2, 3)); }`);
    const paint = (name: string) => (["light", "dark"] as const).map((side) => paintOf(tokens.get(name)!, side, tokens));
    expect([paint("--color-surface"), paint("--color-card")]).toEqual([
      ["#fafafb", "#111317"],
      ["#fafafb", "rgb(1, 2, 3)"],
    ]);
  });
  test("an alias resolves against the design's tokens in each theme, takes its fallback, and else paints nothing", () => {
    const tokens = byName(`:root { --radius-lg: 12px; --radius-card: var(--radius-lg); --color-a: #111; --color-b: var(--color-a);
      --radius-inner: calc(var(--radius-lg) - 2px); --radius-soft: var(--radius-missing, 6px); --radius-viewer: var(--radius-sm);
      --loop-a: var(--loop-b); --loop-b: var(--loop-a); }
      :root[data-proto-theme="dark"] { --color-a: #eee; }`);
    const light = (name: string) => paintOf(tokens.get(name)!, "light", tokens);
    expect([
      light("--radius-card"),
      light("--radius-inner"),
      light("--radius-soft"),
      light("--radius-viewer"),
      light("--loop-a"),
      paintOf(tokens.get("--color-b")!, "dark", tokens),
    ]).toEqual(["12px", "calc(12px - 2px)", "6px", "", "", "#eee"]);
  });
});
