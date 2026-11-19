// The page contract's facts that the tool and the viewer both read, each written once: how a key of the fixtures is
// looked up, a comment's id, words, and keys, the limits of a round, the frame a person sees first, the ids of the page's
// blocks, the ready signal, a view's link, and the type of the page config. The viewer takes them through `viewer/names.ts`, and its bundle carries them, so the two programs cannot
// read one fact two ways. Pure: nothing here reads the disk, the clock, or the page.
import commentsSchema from "../schemas/round-comments.schema.json" with { type: "json" };
import type { CommentType, Platform, Theme } from "./format.ts";

/** A fixtures path never reads these keys, so a design cannot reach an object's prototype through one. */
export const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

type Holder = Record<string, unknown>;
const holder = (value: unknown): value is Holder => typeof value === "object" && value !== null;

/**
 * The object or list that holds a fixtures key, and the key inside it, as the viewer reads it: an exact key wins over a
 * dotted path, a part of a path may be a list's index, and an object's prototype is never reached. Null when the data
 * has no such key.
 */
export function fixtureHolder(source: unknown, key: string | undefined): [Holder, string] | null {
  if (!holder(source) || !key || UNSAFE_KEYS.has(key)) return null;
  if (Object.hasOwn(source, key)) return [source, key];
  const parts = key.split(".");
  if (parts.some((part) => UNSAFE_KEYS.has(part))) return null;
  let current: unknown = source;
  for (const part of parts.slice(0, -1)) current = holder(current) && Object.hasOwn(current, part) ? current[part] : undefined;
  const last = parts[parts.length - 1] ?? "";
  return holder(current) && Object.hasOwn(current, last) ? [current, last] : null;
}

/** A fixtures value by its key, as the viewer reads it, or undefined when the data has no such key. */
export function fixtureValue(source: unknown, key: string | undefined): unknown {
  const found = fixtureHolder(source, key);
  return found ? found[0][found[1]] : undefined;
}

/** The highest round a round's folder, a save, and a link of the viewer take: a round is 1 to 9999. */
export const LAST_ROUND = 9999;

/** A comment's id: `r<round>-<n>`, where the round is the one its file holds. */
export const COMMENT_ID = /^r([0-9]+)-[0-9]+$/;
const itemSchema = commentsSchema.properties.items.items;

/**
 * A control character a comment never holds: every C0 character but tab and line feed, DEL, and every C1 character.
 * It is the comments schema's own pattern for a comment, `^[^…]*$`, read as the one character it refuses, so an agent
 * that writes a round against the schema and the save that reads it refuse the same characters.
 */
export const COMMENT_CONTROL: RegExp = (() => {
  const refused = /^\^\[\^(.+)\]\*\$$/.exec(itemSchema.properties.comment.pattern)?.[1];
  if (!refused) throw new Error("the comments schema's pattern for a comment is no `^[^…]*$`: the tool's files changed");
  return new RegExp(`[${refused}]`);
})();
/** Every key a comment of a round file may hold, from the comments schema, in its order. */
export type CommentKey = keyof typeof itemSchema.properties;
export const COMMENT_KEYS = Object.keys(itemSchema.properties) as CommentKey[];

export type Limits = { comment_characters: number; comments_in_a_round: number; rounds_shown: number; characters_in_all_rounds: number };
/** The one table of a round's limits, from the comments schema, which the save, the build, and the viewer read. */
export const ROUND_LIMITS: Limits = (() => {
  const table: Record<string, unknown> = commentsSchema.limits;
  const number = (key: keyof Limits) => {
    const value = table[key];
    if (typeof value !== "number") throw new Error(`the comments schema has no limit ${key}: the tool's files changed`);
    return value;
  };
  return {
    comment_characters: number("comment_characters"),
    comments_in_a_round: number("comments_in_a_round"),
    rounds_shown: number("rounds_shown"),
    characters_in_all_rounds: number("characters_in_all_rounds"),
  };
})();

/** The frame a person sees first: the viewer's opening frame on a wide window, a link's default, and the shots' overview. */
export const DEFAULT_FRAME = "1024";

/** The most characters, counted in code points, the product's name may hold: the viewer shows it in its header. */
export const PRODUCT_NAME_LIMIT = 60;
/**
 * Whether a text is a product's name the header shows: one line of 1 to `PRODUCT_NAME_LIMIT` characters, counted in code
 * points, so an emoji is one, as the check, the page's cut, the schema, and the viewer all count it.
 */
export function isProductName(name: string): boolean {
  return name !== "" && !/[\r\n]/.test(name) && Array.from(name).length <= PRODUCT_NAME_LIMIT;
}

/** The ids of the blocks the tool writes into a page around a design, which the viewer reads: the design, its fixtures, and the page config. */
export const PAGE_BLOCKS = { product: "product", fixtures: "fixtures", config: "page-config" } as const;

/**
 * The signal a script waits on before it takes a picture: `data-ready="true"` on the viewer's workspace, once its frame,
 * by its id, shows the view. The viewer sets it, and the capture waits on it.
 */
export const VIEWER_READY = { workspace: "workspace", attribute: "data-ready", frame: "frame" } as const;
/** The selector the capture waits on, from `VIEWER_READY`. */
export const READY_SELECTOR = `#${VIEWER_READY.workspace}[${VIEWER_READY.attribute}="true"]`;

/** The keys a view's link may hold, which the page's own query may hold too: the viewer reads each, and a shot writes some. */
export const LINK_KEYS = [
  "theme",
  "frame",
  "mode",
  "round",
  "zoom",
  "text",
  "dir",
  "panels",
  "tab",
  "show",
  "safe",
  "comments",
  "compare",
  "side",
  "flow",
] as const;
export type LinkKey = (typeof LINK_KEYS)[number];

/** A part of a link, percent-encoded with only letters, digits, and `-._~` left as they are. */
function linkPart(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * A view's link, `#<screen>/<state>?<key>=<value>&…`, each part percent-encoded and the keys in the order given: the
 * one writer of a link, for the viewer and for the shot list, so a key the viewer stops reading is a type error here.
 */
export function viewLink(screen: string, state: string, keys: Partial<Record<LinkKey, string>>): string {
  const query = new URLSearchParams(Object.entries(keys).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
  return `#${linkPart(screen)}/${linkPart(state)}${query ? `?${query}` : ""}`;
}

/** One token of the design document as the page config and `open-prototype project` print it: its value as a literal in each theme. */
export type SystemTokenShape = { path: string; name: string; line: number; light: string; dark: string };
/** The design document as the page config and `open-prototype project` print it: one shape, `$defs.design_md` of both schemas. */
export type SystemShape = {
  file: string;
  version: string;
  tokens: SystemTokenShape[];
  components: { name: string; line: number }[];
  sections: { heading: string; line: number }[];
};

/** The change that answers a comment: the round it was made in, and its summary. */
type Answer = { round: number; summary: string };
/** A comment of an earlier round, as the build reads it and the page carries it. */
export type EarlierItem = {
  id: string;
  screen: string;
  state: string;
  testid: string;
  comment: string;
  type: CommentType;
  by: string;
  done: boolean;
  /** The theme the comment was made in, or "" when the file names none. */
  shown_theme: Theme | "";
  answered_by?: Answer;
};
/** An earlier round beside a design, with each of its comments whole. */
export type EarlierRound = { round: number; items: EarlierItem[] };

/** A finding as the page config holds it, for the page's banner. */
export type PageFinding = { rule: string; level: "problem" | "note"; file: string | null; line: number | null; message: string };
/** A device frame as the page config holds it, in the menu's order: the first of each platform is its default. */
export type PageFrame = { id: string; name: string; platform: Platform; width: number; height: number; safe_area: { top: number; bottom: number } };

/**
 * The page config: the one settings block a built page carries for the viewer, as `pageConfig` writes it and the
 * viewer reads it. `schemas/page-config.schema.json` is its exact shape, and the page contract, in section 6 of
 * `docs/tech-spec.md`, says what each key means.
 */
export type PageConfig = {
  schema_version: string;
  design_id: string;
  design: string;
  product: string;
  work_item: string;
  platforms: Platform[];
  themes: Theme[];
  html: Record<string, string>;
  body: Record<string, string>;
  tokens: { file: string; css: string }[];
  design_md: SystemShape | null;
  frames: PageFrame[];
  flows: { id: string; title: string }[];
  rounds: EarlierRound[];
  rounds_path: string;
  findings: PageFinding[];
  limits: Limits;
};
