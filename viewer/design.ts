// The design as the tool wrote it into the page: its markup, its fixtures, and the page config (the page contract,
// in section 6 of docs/tech-spec.md). Read once when the page opens; every name it reads is a constant of names.ts.
// The page config is read by the keys of its type, `PageConfig`, and each value is checked before it is used, so a
// key the tool renames does not compile here. A retyped key compiles: change its guard here with the type.
import { designVersion } from "./comments.ts";
import {
  DEFAULT_FRAME,
  DEFAULT_PLATFORMS,
  DEFAULT_THEMES,
  FIND,
  fixtureValue,
  flowOf,
  has,
  isPlatform,
  isProductName,
  isTheme,
  PAGE,
  type PageConfig,
  type PageFinding,
  type PageFrame,
  type Platform,
  READ,
  ROUND_LIMITS,
  type Theme,
  WORK_ITEM_ID,
} from "./names.ts";
import { roundsOf } from "./rounds.ts";
import { placesOf } from "./seen.ts";
import type { DocumentShape } from "./tokens.ts";
import { FILL_FRAME, frameLabel, PRODUCT } from "./words.ts";

/** A design's attribute on an element, or undefined when it has none. */
export function attr(node: Element | null | undefined, name: string): string | undefined {
  return node?.getAttribute(name) ?? undefined;
}

const json = (id: string): unknown => JSON.parse(document.getElementById(id)?.textContent || "{}");
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : []);

/** The design's fixtures: the data its text, images and lists show. */
export const fixtures = record(json(PAGE.fixtures));
/** The page config as it arrives: each key its type names, and each value unknown until a guard below checks it. */
type Unchecked<T> = { [K in keyof T]?: unknown };
/** The page config the tool wrote (schemas/page-config.schema.json). */
const config: Unchecked<PageConfig> = record(json(PAGE.config));
const template = document.getElementById(PAGE.product);
if (!(template instanceof HTMLTemplateElement)) throw new Error(`#${PAGE.product}`);
/** The design's markup, as the tool placed it: its token files' block, its head's styles, then its body. */
const product: DocumentFragment = template.content;
/** The styles the tool placed before the body: they go into a frame's head, in their order. */
export const headStyles: HTMLStyleElement[] = [...product.children].filter((child): child is HTMLStyleElement => child instanceof HTMLStyleElement);
/**
 * A document with no window, which loads nothing and runs nothing: every copy of the design the viewer reads or builds a
 * frame from lives here, never in the viewer's own document, so no image of the design loads and no handler of it runs
 * outside a frame's sandbox.
 */
const inert = document.implementation.createHTMLDocument("");
/** The design's body, as one element the viewer reads and copies: never placed in a frame itself, only its children. */
export const designBody: HTMLElement = inert.createElement("div");
designBody.append(...[...product.childNodes].filter((node) => !headStyles.includes(node as HTMLStyleElement)).map((node) => inert.importNode(node, true)));
const styleTemplate = document.getElementById(PAGE.frameStyle);
/** The rules the viewer adds to each frame. */
export const frameStyle: Element | null = styleTemplate instanceof HTMLTemplateElement ? styleTemplate.content.firstElementChild : null;
/** The design's version: a small hash of its markup, attributes included. */
export const version = designVersion(template.innerHTML);

/** The design's own attributes of its `<html>` and its `<body>`, which a frame's root and body take. */
const attributes = (value: unknown): [string, string][] =>
  Object.entries(record(value)).filter((pair): pair is [string, string] => typeof pair[1] === "string" && /^[a-z][a-z0-9:_.-]*$/.test(pair[0]));
export const htmlAttributes = attributes(config.html);
export const bodyAttributes = attributes(config.body);
/** The design's own direction, from its `<html dir>`: right to left, or left to right when it names none. */
export const designDirection: "ltr" | "rtl" = htmlAttributes.find(([name]) => name === "dir")?.[1]?.toLowerCase() === "rtl" ? "rtl" : "ltr";

export const screens: HTMLElement[] = [...designBody.querySelectorAll<HTMLElement>(FIND.screen)];
export const screenIds: string[] = screens.map((screen) => attr(screen, READ.screen) ?? "");
export const titleAttr = (screen: Element | undefined): string | undefined => attr(screen, READ.title);
/** What the viewer reads of one screen: its element, its states in drawn order, the state it opens in, and its title. */
type ScreenFacts = { element: HTMLElement; states: readonly string[]; initial: string; title: string };
/**
 * Each screen by its id, read once when the page opens, so a redraw looks a screen up at no cost however many there
 * are. A screen's states are its direct children that name one; it opens in its initial state when it has that state,
 * else its first; its title is its title, else its id. Two screens of one id are the first, as the check refuses the second.
 */
const SCREENS = new Map<string, ScreenFacts>();
for (const [index, element] of screens.entries()) {
  const id = screenIds[index] ?? "";
  if (SCREENS.has(id)) continue;
  const states = [...element.children].map((child) => attr(child, READ.state)).filter((state): state is string => Boolean(state));
  const initial = attr(element, READ.initial) ?? "";
  SCREENS.set(id, { element, states, initial: states.includes(initial) ? initial : states[0] || "", title: titleAttr(element) || id || "" });
}
export function screenEl(id: string): HTMLElement | undefined {
  return SCREENS.get(id)?.element;
}
export function statesOf(id: string): readonly string[] {
  return SCREENS.get(id)?.states ?? [];
}
export function initialOf(id: string): string {
  return SCREENS.get(id)?.initial ?? "";
}
/** A screen's title, else its id. */
export function titleOf(id: string): string {
  return SCREENS.get(id)?.title ?? (id || "");
}
export function parentOf(screen: Element | undefined): HTMLElement | undefined {
  return screenEl(attr(screen, READ.parent) || "");
}
export const flowIds: string[] = [...new Set(screenIds.map(flowOf).filter(Boolean))];
/** Every state of every screen, in drawn order, built once. */
const ALL_STATES: readonly (readonly [string, string])[] = screenIds.flatMap((id) => statesOf(id).map((state) => [id, state] as const));
export function allStates(): readonly (readonly [string, string])[] {
  return ALL_STATES;
}

type Flow = PageConfig["flows"][number];
const flows: Flow[] = Array.isArray(config.flows) ? config.flows.filter((flow): flow is Flow => Boolean(flow) && typeof (flow as Flow).id === "string") : [];
export function flowTitle(id: string, none: string): string {
  const found = flows.find((flow) => flow.id === id);
  return found ? found.title : id || none;
}

// The platforms and themes the design declares, in its order: the places a review looks, each a view a person must see.
const declaredPlatforms = texts(config.platforms).filter(isPlatform);
const PLATFORMS: readonly Platform[] = declaredPlatforms.length ? declaredPlatforms : DEFAULT_PLATFORMS;
const declaredThemes = texts(config.themes).filter(isTheme);
const THEMES: readonly Theme[] = declaredThemes.length ? declaredThemes : DEFAULT_THEMES;
/** The theme choices of the display bar: "as the system" only when the design declares both, then each declared theme. */
export const THEME_CHOICES: ("system" | Theme)[] = THEMES.length > 1 ? ["system", ...THEMES] : [...THEMES];
/** The theme a page opens in, and a link leaves out. */
export const DEFAULT_THEME = THEME_CHOICES[0] ?? "light";

/** A frame as the viewer offers it: its size, its platform, the system bars it draws over the design, and its name. */
export type ViewerFrame = { w: number; h: number; platform: Platform; insets: { top: number; bottom: number }; label: string };
// The frames are the tool's device table, which it writes into the page config: the viewer holds no size of its own. A
// row with no system bars draws none, since no bar beats a wrong one. Only the declared platforms' frames are offered.
const NO_BARS = { top: 0, bottom: 0 };
/** A frame of the page config, whose system bars are checked where they are read. */
type DeviceRow = Omit<PageFrame, "safe_area"> & { safe_area?: unknown };
const deviceRows: DeviceRow[] = (Array.isArray(config.frames) ? config.frames : []).filter((row): row is DeviceRow => {
  const r = record(row);
  return (
    typeof r.id === "string" &&
    typeof r.width === "number" &&
    typeof r.height === "number" &&
    typeof r.platform === "string" &&
    isPlatform(r.platform) &&
    PLATFORMS.includes(r.platform) &&
    typeof r.name === "string"
  );
});
const insetsOf = (row: DeviceRow): PageFrame["safe_area"] => {
  const bars = record(row.safe_area);
  return typeof bars.top === "number" && typeof bars.bottom === "number" ? { top: bars.top, bottom: bars.bottom } : NO_BARS;
};
export const FRAMES: Record<string, ViewerFrame> = Object.fromEntries(
  deviceRows.map((d) => [d.id, { w: d.width, h: d.height, platform: d.platform, insets: insetsOf(d), label: frameLabel(d.name, d.width, d.height) }]),
);
// Fill, the viewer's own frame that follows the window, is a web frame.
if (PLATFORMS.includes("web")) FRAMES.fill = { w: 0, h: 0, platform: "web", insets: NO_BARS, label: FILL_FRAME };
/** The frames of each declared platform, in the order the page config lists them: the first is the platform's own frame. */
export const FRAMES_OF: [string, string[]][] = PLATFORMS.map((platform) => [
  platform,
  [...deviceRows.filter((row) => row.platform === platform).map((row) => row.id), ...(platform === "web" && FRAMES.fill ? ["fill"] : [])],
]);
const FIRST_FRAME = FRAMES_OF[0]?.[1][0] ?? "fill";
/** The frame a platform opens in: the first of its frames in the page config. */
export function platformFrame(platform: string): string {
  return FRAMES_OF.find(([one]) => one === platform)?.[1][0] ?? FIRST_FRAME;
}
/** The frame a wide window opens in: the web's usual width when the design declares the web, else its first platform's frame. */
export const WIDE_FRAME = FRAMES[DEFAULT_FRAME] ? DEFAULT_FRAME : FIRST_FRAME;
export const frameOf = (key: string): ViewerFrame =>
  FRAMES[key] ?? FRAMES[WIDE_FRAME] ?? { w: 1024, h: 768, platform: "web", insets: NO_BARS, label: FILL_FRAME };
const PHONES = ["ios", "android"];
export const isPhone = (platform: string): boolean => PHONES.includes(platform);
/** The frame a phone-sized window opens in: the first declared phone's, else the first platform's. */
export const NARROW_FRAME = platformFrame(PLATFORMS.find(isPhone) ?? PLATFORMS[0] ?? "web");

/** The places the review looks: each declared platform in each declared theme. */
export const places = placesOf(PLATFORMS, THEMES);
export const WHERES = places.places;

// The header names the work item when the design has one, in the format's shape of a work item, so a text the tool would
// not write is never shown. A part of the design's path in the shape of an id names it on a narrow bar.
export const WORK_ITEM_SHAPE = /^[A-Za-z][A-Za-z0-9]*-[0-9]+$/;
export const workItem: PageConfig["work_item"] = typeof config.work_item === "string" && WORK_ITEM_ID.test(config.work_item) ? config.work_item : "";
/** The design's path as the tool gave it. */
export const PATH_SHAPE = /^[A-Za-z0-9._/-]+$/;
export const designPath = typeof config.design === "string" && PATH_SHAPE.test(config.design) ? config.design : "";
/** The folder of this design's rounds, as the tool gave it. */
export const roundsPath = typeof config.rounds_path === "string" && PATH_SHAPE.test(config.rounds_path) ? config.rounds_path : "rounds";
/** The design's id, from its place in the project, which keeps its comments apart from every other design's. */
export const designId = typeof config.design_id === "string" && /^[0-9a-f]{16,64}$/.test(config.design_id) ? config.design_id : "none";
export const rounds = roundsOf(config.rounds);
/** The round a page opens in when its link names none, and a link leaves out: the one after the last round saved beside the design. */
export const OPENING_ROUND = rounds.length ? Math.max(...rounds.map((round) => Number(round.round) || 0)) + 1 : 1;
const limits = record(config.limits);
const limit = (value: unknown, otherwise: number): number => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : otherwise);
/** The limits the save and the build hold a round to: the viewer counts against them and cuts nothing. */
export const LIMITS = {
  commentCharacters: limit(limits.comment_characters, ROUND_LIMITS.comment_characters),
  commentsInARound: limit(limits.comments_in_a_round, ROUND_LIMITS.comments_in_a_round),
};

/** The findings of the tool's check, as the page config holds them. */
export const findings: PageFinding[] = (Array.isArray(config.findings) ? config.findings : [])
  .map(record)
  .filter((one) => typeof one.rule === "string" && typeof one.message === "string")
  .map((one) => ({
    rule: String(one.rule),
    level: one.level === "note" ? "note" : "problem",
    file: typeof one.file === "string" ? one.file : null,
    line: typeof one.line === "number" ? one.line : null,
    message: String(one.message),
  }));

/** The design document as the page config holds it (schemas/page-config.schema.json, `design_md`), or null. */
export const designDocument: DocumentShape | null = (() => {
  const shape = record(config.design_md);
  if (typeof shape.file !== "string") return null;
  const list = (value: unknown) => (Array.isArray(value) ? value.map(record) : []);
  return {
    file: shape.file,
    version: typeof shape.version === "string" ? shape.version : "",
    tokens: list(shape.tokens)
      .filter((one) => typeof one.name === "string")
      .map((one) => ({
        path: String(one.path ?? ""),
        name: String(one.name),
        line: Number(one.line) || 0,
        light: String(one.light ?? ""),
        dark: String(one.dark ?? ""),
      })),
    components: list(shape.components)
      .filter((one) => typeof one.name === "string")
      .map((one) => ({ name: String(one.name), line: Number(one.line) || 0 })),
  };
})();

/** Each token file the build placed, with its text, the document's own block first when there is one. */
export const tokenFiles: { file: string; css: string }[] = (Array.isArray(config.tokens) ? config.tokens : [])
  .map(record)
  .map((one) => ({ file: typeof one.file === "string" ? one.file : "", css: typeof one.css === "string" ? one.css : "" }));
/** The design's own tokens blocks, as one text: the block the build placed first, which holds the token files, is not the design's. */
const builtBlock = tokenFiles.length ? product.firstElementChild : null;
export const ownTokenCss: string = [...product.querySelectorAll(FIND.tokens)]
  .filter((style) => style !== builtBlock)
  .map((style) => style.textContent ?? "")
  .join("\n");

/** The product's name: the page config's one short line, else the design's work item, else its path. */
export function productName(): string {
  const name = config.product;
  return typeof name === "string" && isProductName(name) ? name : workItem || designPath || PRODUCT;
}

/** A list's item: the one `<template>` directly inside it. */
function itemOf(list: Element): HTMLTemplateElement | null {
  return list.querySelector<HTMLTemplateElement>(FIND.item);
}

/** The screens a link in a state opens (a go, and a go inside a list's item), other than its own. Shared navigation sits outside the screens, so it opens none. */
export function linksOf(id: string, state: string): string[] {
  const section = screenEl(id);
  if (!section) return [];
  const inState = (node: Element) => {
    const part = [...section.children].find((child) => child.contains(node));
    const named = attr(part, READ.state);
    return !part || !named || named === state;
  };
  const goes = [...section.querySelectorAll(has(READ.go))].filter(inState).map((node) => attr(node, READ.go) ?? "");
  const items = [...section.querySelectorAll(has(READ.list))]
    .filter(inState)
    .flatMap((list) => [...(itemOf(list)?.content.querySelectorAll(has(READ.go)) ?? [])].map((node) => attr(node, READ.go) ?? ""));
  return [...new Set(goes.concat(items).map((go) => go.split("/")[0] ?? ""))].filter((target) => target !== id && SCREENS.has(target));
}

/** A component the screens name, with its variants, the screens that use it, and the list it repeats in. */
type Part = { name: string; variants: Map<string, Element>; used: Set<string>; list: string };
export function catalog(defaultVariant: string): Part[] {
  const found = new Map<string, Part>();
  const add = (node: Element, at: string, list: string) => {
    const name = attr(node, READ.component) ?? "";
    const entry = found.get(name) || { name, variants: new Map<string, Element>(), used: new Set<string>(), list };
    const named = attr(node, READ.variant) || defaultVariant;
    if (!entry.variants.has(named)) entry.variants.set(named, node);
    entry.used.add(at);
    found.set(name, entry);
  };
  const screenOf = (node: Element) => attr(node.closest(FIND.screen), READ.screen) ?? "";
  designBody.querySelectorAll(has(READ.component)).forEach((node) => {
    add(node, screenOf(node), "");
  });
  designBody.querySelectorAll(has(READ.list)).forEach((list) => {
    itemOf(list)
      ?.content.querySelectorAll(has(READ.component))
      .forEach((node) => {
        add(node, screenOf(list), attr(list, READ.list) ?? "");
      });
  });
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The example data a specimen shows: the first item of its list, else of its screen's own list, else of the first list in the fixtures. */
export function sampleOf(node: Element, list: string): unknown {
  const first = (name: string | undefined): object | null => {
    const found = name ? fixtureValue(fixtures, name) : null;
    return Array.isArray(found) && found[0] && typeof found[0] === "object" ? (found[0] as object) : null;
  };
  const section = node.closest(FIND.screen);
  return (
    (list && first(list)) ||
    (section && attr(section, READ.source) && first(attr(section, READ.source))) ||
    first(Object.keys(fixtures).find((name) => first(name))) ||
    {}
  );
}

/**
 * What a component's specimen frame holds: the component, inside a copy of each of the design's elements around it with
 * none of their other children, so the design's own rules still reach it and nothing else of the design is there.
 */
export function specimenOf(node: Element): Element {
  let copy = node.cloneNode(true) as Element;
  for (let up = node.parentElement; up && up !== designBody; up = up.parentElement) {
    const around = up.cloneNode(false) as Element;
    around.append(copy);
    copy = around;
  }
  const holder = designBody.ownerDocument.createElement("div");
  holder.append(copy);
  return holder;
}

/** The chrome and one screen: built once for each screen, for a thumbnail. */
const screenBodies = new Map<string, Element>();
export function onlyScreen(id: string): Element {
  let body = screenBodies.get(id);
  if (!body) {
    const copy = designBody.cloneNode(true) as Element;
    copy.querySelectorAll(FIND.screen).forEach((screen) => {
      if (attr(screen, READ.screen) !== id) screen.remove();
    });
    body = copy;
    screenBodies.set(id, body);
  }
  return body;
}
