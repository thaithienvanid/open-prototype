// Every name the viewer reads from a design, or writes into a design's frame, each taken from the format's own table
// (src/format.ts), so the viewer and the tool cannot name a part of a design differently. The page modules use these
// constants and never the names themselves. The facts of the page contract the tool reads too come from the tool's own
// modules, src/format.ts and src/contract.ts, through here alone. Pure: nothing here touches the page.
import { PAGE_BLOCKS } from "../src/contract.ts";
import { ATTR, PREFIX, SAFE_AREA, SLOTS, type VOCABULARY } from "../src/format.ts";

export {
  COMMENT_CONTROL,
  COMMENT_ID,
  type CommentKey,
  DEFAULT_FRAME,
  fixtureValue,
  isProductName,
  LAST_ROUND,
  LINK_KEYS,
  type LinkKey,
  type PageConfig,
  type PageFinding,
  type PageFrame,
  ROUND_LIMITS,
  VIEWER_READY,
  viewLink,
} from "../src/contract.ts";
/**
 * From the format: the tool's own name, a comment's types, the image URI the page carries, the shape of a state's name
 * and of a test id (`KEBAB`), the platforms and themes with their defaults, and a work item's shape.
 */
export {
  COMMENT_TYPES,
  type CommentType,
  DATA_IMAGE,
  DEFAULT_PLATFORMS,
  DEFAULT_THEMES,
  isCommentType,
  isPlatform,
  isTheme,
  KEBAB,
  PLATFORMS,
  type Platform,
  PROGRAM,
  THEMES,
  type Theme,
  WORK_ITEM_ID,
} from "../src/format.ts";

/** The attributes a design writes, which the viewer reads. */
export const READ = {
  screen: ATTR.screen,
  /** On a direct child of a screen: the state's name. */
  state: ATTR.state,
  title: ATTR.title,
  parent: ATTR.parent,
  initial: ATTR.initial,
  /** On a screen: the list in the fixtures whose chosen item the screen shows. */
  source: ATTR.source,
  text: ATTR.text,
  image: ATTR.image,
  list: ATTR.list,
  /** On the `<template>` that is a list's one direct child: the item drawn for each entry. */
  item: ATTR.item,
  limit: ATTR.limit,
  field: ATTR.field,
  go: ATTR.go,
  back: ATTR.back,
  toggle: ATTR.toggle,
  panel: ATTR.panel,
  component: ATTR.component,
  variant: ATTR.variant,
  slot: ATTR.slot,
  tokens: ATTR.tokens,
  /** The web's own convention, which the viewer's own controls carry too. */
  testid: ATTR.testid,
} as const;

/** A name the tool sets in a frame, from the format's own list of them. */
const set = (name: (typeof VOCABULARY.set_by_the_tool)[number]): string => PREFIX + name;

/** The attributes the viewer sets in a frame: on its root, and on the design's elements. */
export const SET = {
  theme: set("theme"),
  platform: set("platform"),
  commenting: set("commenting"),
  /** On a go inside a list's item: which entry it opens. */
  pick: set("pick"),
  highlight: set("highlight"),
  comment: set("comment"),
  /** On a design's link that leaves its screen: the address the design wrote, which the build set as text in place of its href. */
  href: set("href"),
  /** On a navigation's link to a screen the shown one stands under: the section a person is in. */
  section: set("section"),
  /** The custom properties of the system bars a frame draws. */
  safeTop: SAFE_AREA.top,
  safeBottom: SAFE_AREA.bottom,
} as const;

/** The slots, by the format's own names. */
const [TITLE_SLOT, BACK_LABEL_SLOT] = SLOTS;

/** The ids of what the tool writes into the page around a design. */
export const PAGE = {
  ...PAGE_BLOCKS,
  frameStyle: "frame-style",
} as const;

/** An attribute as a selector: `[data-proto-go]`. */
export const has = (name: string): string => `[${name}]`;
const slot = (name: string): string => `[${READ.slot}="${name}"]`;

/** The selectors the viewer finds a design's parts by. */
export const FIND = {
  screen: has(READ.screen),
  /** A list's item: the one `<template>` directly inside it. */
  item: `:scope > template${has(READ.item)}`,
  image: `img${has(READ.image)}`,
  title: slot(TITLE_SLOT),
  backLabel: slot(BACK_LABEL_SLOT),
  navigation: "nav",
  navigationLink: `nav ${has(READ.go)}`,
  tokens: `style${has(READ.tokens)}`,
  /** A link of the design, which never navigates a frame. */
  link: "a[href]",
} as const;

/** The theme a style rule names, and a rule for the system's own theme alone, which the tokens reader leaves out. */
export const THEME_RULE = new RegExp(`${SET.theme}="([\\w-]+)"`);
export const SYSTEM_THEME_RULE = new RegExp(`:not\\(\\[${SET.theme}\\]\\)`);

/**
 * The rules the viewer adds to each frame, as the first style of its head: the comment cursor and the outlines, with no
 * colour of their own, and a phone's overlay scrollbar. None of them hides or shows a screen or a state: what the viewer
 * does not show is not in the frame (frame.ts), so the viewer needs no rule for `hidden` and no style layer.
 */
export function frameRules(): string {
  const commenting = `:root[${SET.commenting}="on"] ${has(READ.testid)}`;
  const phone = `:root:is([${SET.platform}="ios"], [${SET.platform}="android"])`;
  return [
    `${commenting} { cursor: crosshair; }`,
    `${commenting}:hover, ${has(SET.highlight)} { outline: 2px dashed Highlight !important; outline-offset: 2px; }`,
    `${has(SET.comment)} { outline: 3px solid Highlight !important; outline-offset: 2px; }`,
    `${phone} { scrollbar-width: none; }`,
    `${phone}::-webkit-scrollbar, ${phone} *::-webkit-scrollbar { display: none; }`,
  ].join("\n");
}

/** A viewer test id made from a design's names, with one escaping for every one: a flow's `start:home` is `start-home`. */
export function testIdOf(...parts: unknown[]): string {
  return `proto-${parts.map((part) => String(part).replace(/[^a-z0-9-]+/gi, "-")).join("-")}`;
}

/** The flow a screen's id names: `items:detail` is in `items`; a screen outside every flow is in none. */
export function flowOf(screen: string): string {
  const cut = screen.indexOf(":");
  return cut < 0 ? "" : screen.slice(0, cut);
}
