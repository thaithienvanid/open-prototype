// A round's comments as data: which stored items are sound, how a comment's words show, and the two texts a round is
// exported as. Pure.
import { linkFor } from "./link.ts";
import { COMMENT_CONTROL, COMMENT_ID, type CommentKey, type CommentType, isCommentType, KEBAB, LAST_ROUND } from "./names.ts";
import { roundPrompt } from "./words.ts";

const SCREEN_NAME = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,127}$/;

/**
 * A comment as the browser stores it. A stored record is read through `commentsOf`, which keeps an item only when every
 * field it holds has its type and its shape, and `commentSound` checks it against the design before it is exported.
 */
export type Comment = {
  id: string;
  type?: string;
  screen: string;
  state: string;
  testid: string;
  index?: number;
  count?: number;
  box?: unknown;
  comment: string;
  frame: string;
  theme: string;
  shown_theme?: string;
  round?: number;
};
/** A comment as the page keeps it, read from a record: its id, and each other field it holds of its type and shape. */
export type Kept = Partial<Comment> & { id: string; link?: string };

const whole = (value: unknown, least: number): boolean => Number.isInteger(value) && (value as number) >= least;
/** A box as the viewer writes one: four whole pixels, with no width or height below 0. */
const boxRead = (box: unknown): boolean => {
  if (box === null) return true;
  if (!box || typeof box !== "object" || Array.isArray(box)) return false;
  const { x, y, width, height } = box as Record<string, unknown>;
  return Number.isInteger(x) && Number.isInteger(y) && whole(width, 0) && whole(height, 0);
};
const optional = (value: unknown, read: (value: unknown) => boolean): boolean => value === undefined || read(value);
const text = (value: unknown): boolean => typeof value === "string";

/** Whether a stored item reads as a comment: each field it holds of its type and its shape, as the comments schema takes it. */
function commentRead(it: unknown, limit: number): it is Kept {
  if (!it || typeof it !== "object" || Array.isArray(it)) return false;
  const c = it as Record<string, unknown>;
  const words = c.comment;
  return (
    typeof c.id === "string" &&
    COMMENT_ID.test(c.id) &&
    optional(c.type, (type) => typeof type === "string" && isCommentType(type)) &&
    typeof c.screen === "string" &&
    c.screen !== "" &&
    typeof c.state === "string" &&
    c.state !== "" &&
    typeof words === "string" &&
    words !== "" &&
    commentLength(words) <= limit &&
    !COMMENT_CONTROL.test(words) &&
    optional(c.testid, text) &&
    optional(c.frame, text) &&
    optional(c.theme, (theme) => theme === "system" || theme === "light" || theme === "dark") &&
    optional(c.shown_theme, (theme) => theme === "light" || theme === "dark") &&
    optional(c.index, (index) => whole(index, 0)) &&
    optional(c.count, (count) => whole(count, 1)) &&
    optional(c.round, (round) => whole(round, 1) && (round as number) <= LAST_ROUND) &&
    optional(c.box, boxRead) &&
    optional(c.link, text)
  );
}

/**
 * A stored record's comments, as the page keeps them: each item that reads as a comment, the first of each id, and the
 * count of the items left out. A record is untrusted, since another page opened from a file can write it, so an item
 * that does not read whole is never shown or exported, and the page says how many were left out.
 */
export function commentsOf(list: unknown, limit: number): { items: Kept[]; unreadable: number } {
  const all: unknown[] = Array.isArray(list) ? list : [];
  const ids = new Set<string>();
  const items = all.filter((it): it is Kept => {
    if (!commentRead(it, limit) || ids.has(it.id)) return false;
    ids.add(it.id);
    return true;
  });
  return { items, unreadable: all.length - items.length };
}

/** A shape whose every key is a key of the comments schema (`CommentKey`), so a key the save has no place for does not compile. */
type SchemaKeys<T extends Partial<Record<CommentKey, unknown>> & Record<Exclude<keyof T, CommentKey>, never>> = T;
/** A comment as the file holds it. */
type Exported = SchemaKeys<{
  id: string;
  type: CommentType;
  screen: string;
  state: string;
  testid: string;
  index: number;
  box: { x: number; y: number; width: number; height: number } | null;
  comment: string;
  frame: string;
  theme: string;
  shown_theme: "light" | "dark";
  link: string;
}>;
/** What an export needs to know of the design: its frames, the names for the prompt, the command that saves a round, and its folder of rounds. */
type Design = {
  frames: readonly string[];
  designName: string;
  commentsFile: string;
  saveCommand: string;
  roundsPath: string;
  shotsCommand: (folder: string) => string;
};
/** The file a round's comments are downloaded as. */
export const COMMENTS_FILE = "comments.json";

/** Whether a stored item is a whole comment of this round and design: its id names the round, its names have the design's shapes, and its frame exists. */
export function commentSound(it: Partial<Comment>, design: Pick<Design, "frames">, round?: number): it is Comment {
  const id = typeof it.id === "string" ? COMMENT_ID.exec(it.id) : null;
  return (
    Boolean(id) &&
    (round === undefined || Number(id?.[1]) === round) &&
    typeof it.screen === "string" &&
    SCREEN_NAME.test(it.screen) &&
    typeof it.state === "string" &&
    KEBAB.test(it.state) &&
    typeof it.testid === "string" &&
    KEBAB.test(it.testid) &&
    design.frames.includes(String(it.frame)) &&
    ["system", "light", "dark"].includes(String(it.theme)) &&
    (it.shown_theme === undefined || it.shown_theme === "light" || it.shown_theme === "dark") &&
    isCommentType(it.type || "change") &&
    typeof it.comment === "string" &&
    (it.index === undefined || (Number.isInteger(it.index) && it.index >= 0)) &&
    (it.count === undefined || (Number.isInteger(it.count) && it.count >= 1))
  );
}

/** The theme a comment's view showed: the one it recorded, else its setting, with the system's own read as light. */
function shownThemeOf(it: Pick<Comment, "theme" | "shown_theme">): "light" | "dark" {
  return it.shown_theme === "dark" || (it.shown_theme === undefined && it.theme === "dark") ? "dark" : "light";
}

/** The element's box as four numbers, or nothing: a stored box is never copied as it is. */
export function commentBoxOf(box: unknown): Exported["box"] {
  const { x, y, width, height } = (box ?? {}) as Record<string, unknown>;
  const finite = (value: unknown): value is number => Number.isFinite(value);
  return finite(x) && finite(y) && finite(width) && finite(height) ? { x, y, width, height } : null;
}

/** A comment's link, made again from its checked screen and state, never copied from the stored text. It names the frame and the theme the reviewer saw. */
function commentLinkOf(it: Comment, round: number): string {
  return linkFor(
    {
      screen: it.screen,
      state: it.state,
      theme: shownThemeOf(it),
      frame: it.frame,
      round: it.round !== undefined && Number.isInteger(it.round) ? it.round : round,
      zoom: "fit",
      text: "100",
      dir: "",
      panels: "both",
      tab: "prototype",
      safe: false,
      comments: false,
    },
    "",
    "",
  );
}

/** The direction controls, which reorder what a reader sees: each shows as a visible mark instead, so a comment cannot hide what it says. */
const DIRECTION = /[\u202A-\u202E\u2066-\u2069]/g;

/** A comment's length as the save counts it: in code points, so an emoji is one character. */
export function commentLength(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}
/** A comment's words as the viewer shows them: every direction control as its code point, so no text reads in another order than it was written. */
export function visibleText(text: string): string {
  return text.replace(DIRECTION, (mark) => `[U+${mark.charCodeAt(0).toString(16).toUpperCase()}]`);
}

/** One comment as a line of the prompt. */
export function commentLine(it: {
  id: string;
  type?: string;
  screen: string;
  state: string;
  testid: string;
  index?: number;
  count?: number;
  frame: string;
  shown_theme: string;
  comment: string;
}): string {
  const which = Number(it.count) > 1 ? ` (${(Number(it.index) || 0) + 1} of ${it.count})` : Number(it.index) > 0 ? ` (${Number(it.index) + 1})` : "";
  return (
    "[" +
    it.id +
    "] " +
    (it.type || "change") +
    ": " +
    (it.screen ? `${it.screen}/` : "") +
    it.state +
    " " +
    it.testid +
    which +
    " (" +
    it.frame +
    ", " +
    it.shown_theme +
    "): " +
    visibleText(it.comment)
  );
}

/** The sound comments of a round, as the file holds them. */
function exportItems(items: readonly Partial<Comment>[], round: number, design: Pick<Design, "frames">): Exported[] {
  return items
    .filter((it): it is Comment => commentSound(it, design, round))
    .map((it) => ({
      id: it.id,
      type: isCommentType(it.type ?? "") ? (it.type as CommentType) : "change",
      screen: it.screen,
      state: it.state,
      testid: it.testid,
      index: Number(it.index) || 0,
      box: commentBoxOf(it.box),
      comment: it.comment,
      frame: it.frame,
      theme: it.theme,
      shown_theme: shownThemeOf(it),
      link: commentLinkOf(it, round),
    }));
}

/** A round's comments as the JSON a person downloads, in the shape `save-comments` reads (schemas/round-comments.schema.json). */
export function exportJson(items: readonly Partial<Comment>[], round: number, design: Pick<Design, "frames">): string {
  return JSON.stringify({ schema_version: "1", round, items: exportItems(items, round, design) }, null, 2);
}

/** A round's comments as one prompt for an agent: what the names are, where to save, what to do next, each comment as a line, then the JSON. */
export function exportPrompt(items: readonly Partial<Comment>[], round: number, design: Design): string {
  return roundPrompt(round, design, exportItems(items, round, design).map(commentLine).join("\n"), exportJson(items, round, design));
}

/** The key the browser keeps a round's record under: by the design's id, so two designs never share one. */
export function commentStoreKey(designId: string, round: number): string {
  return `prototype-comments:${designId}:round-${round}`;
}

/** A design's version: a small hash of its text, its markup and its fixtures. The browser's record of a round keeps the version its comments and views seen were made on. */
export function designVersion(markup: string): string {
  let hash = 5381;
  for (let i = 0; i < markup.length; i++) hash = ((hash * 33) ^ markup.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
