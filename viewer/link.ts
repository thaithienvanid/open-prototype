// The deep link, in and out: #<screen>/<state>?theme=dark&frame=ios&round=2, and tab, show, flow, zoom, text, dir,
// panels, safe, comments, compare, and side. Pure: each function reads only its arguments.

import { DEFAULT_FRAME, LAST_ROUND, LINK_KEYS, type LinkKey, viewLink } from "./names.ts";

/** The tab a link opens when it names none, and leaves out. The other tabs are the table of views' own. */
const FIRST_TAB = "prototype";
const SHOWS = ["all", "unseen", "commented"] as const;
const PANELS = ["both", "screens", "inspector", "none"] as const;

/** The keys a link may hold, which the page's own query may hold too: the page contract's, in `src/contract.ts`. */
export { LINK_KEYS };

/** One view of the design: what the page shows, and what its address says. */
export type View = {
  screen: string;
  state: string;
  theme: "system" | "light" | "dark";
  frame: string;
  round: number;
  zoom: "fit" | "actual";
  text: "100" | "200";
  /** The direction the frame shows: the design's own (""), or one the right-to-left check chose. */
  dir: "" | "ltr" | "rtl";
  panels: (typeof PANELS)[number];
  /** The tab shown: Prototype, Board, or System. */
  tab: string;
  show: (typeof SHOWS)[number];
  flow: string;
  safe: boolean;
  comments: boolean;
  compare: boolean;
  side: "comments" | "build";
};

/** A link as its text gives it, before it is checked against the design. */
export type Link = {
  screen: string;
  state: string;
  theme: string;
  frame: string;
  round: string;
  zoom: string;
  text: string;
  dir: string;
  panels: string;
  tab: string;
  show: string;
  flow: string;
  safe: boolean;
  comments: boolean;
  compare: boolean;
  side: string;
};

/** What a link is checked against: the views, the design's screens, states and flows, the frames, the frame this window opens in, and the theme choices the design declares (the first is the one a link leaves out). */
export type Known = {
  tabs: readonly string[];
  screens: readonly string[];
  statesOf: (screen: string) => readonly string[];
  initialOf: (screen: string) => string;
  frames: readonly string[];
  flows: readonly string[];
  windowFrame: string;
  themes?: readonly View["theme"][];
};

/** Read a link. A key the fragment lacks falls back to the page's own query, so ?theme=dark still works; the fragment wins. */
export function parseLink(hash: string, search: string): Link {
  const raw = String(hash || "").replace(/^#/, "");
  const cut = raw.indexOf("?");
  const params = new URLSearchParams(search || "");
  new URLSearchParams(cut < 0 ? "" : raw.slice(cut + 1)).forEach((value, key) => {
    params.set(key, value);
  });
  const [screen = "", state = ""] = (cut < 0 ? raw : raw.slice(0, cut)).split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return "";
    }
  });
  const text = (key: LinkKey) => params.get(key) || "";
  return {
    screen,
    state,
    theme: text("theme"),
    frame: text("frame"),
    round: text("round"),
    zoom: text("zoom"),
    text: text("text"),
    dir: text("dir"),
    panels: text("panels"),
    tab: text("tab"),
    show: text("show"),
    flow: text("flow"),
    safe: text("safe") === "1",
    comments: text("comments") === "1",
    compare: text("compare") === "1",
    side: text("side"),
  };
}

/**
 * A view's link. `base` is the frame the link leaves out: the default, or the one this window opens in when the link names
 * none. `theme` is the theme it leaves out: "as the system", or a design's one declared theme; "" writes every theme.
 * `round` is the round it leaves out.
 */
export function linkFor(view: Pick<View, "screen" | "state"> & Partial<View>, base: string = DEFAULT_FRAME, theme: string = "system", round = 1): string {
  const keys: Partial<Record<LinkKey, string>> = {};
  if ((view.theme === "light" || view.theme === "dark") && view.theme !== theme) keys.theme = view.theme;
  if (view.frame && view.frame !== base) keys.frame = view.frame;
  // The round a page opens in on its own is left out: round 1, or the one after the last saved round.
  if (view.round !== undefined && Number(view.round) !== round) keys.round = String(view.round);
  if (view.zoom === "actual") keys.zoom = "actual";
  if (view.text === "200") keys.text = "200";
  if (view.dir) keys.dir = view.dir;
  if (view.panels && view.panels !== "both") keys.panels = view.panels;
  if (view.tab && view.tab !== FIRST_TAB) keys.tab = view.tab;
  if (view.tab === "board" && (view.show === "unseen" || view.show === "commented")) keys.show = view.show;
  if (view.tab === "board" && view.flow && view.flow !== "all") keys.flow = view.flow;
  if (view.safe) keys.safe = "1";
  if (view.comments) keys.comments = "1";
  if (view.compare) keys.compare = "1";
  if (view.side === "build") keys.side = "build";
  return viewLink(view.screen, view.state, keys);
}

const among = <T extends string>(list: readonly T[], value: string, otherwise: T): T =>
  (list as readonly string[]).includes(value) ? (value as T) : otherwise;

/** A link's values, checked against the design: an unknown screen opens the first, an unknown state the screen's own. */
export function resolveLink(link: Link, known: Known): View {
  const screen = known.screens.includes(link.screen) ? link.screen : (known.screens[0] ?? "");
  return {
    screen,
    state: known.statesOf(screen).includes(link.state) ? link.state : known.initialOf(screen),
    theme: among(known.themes ?? ["system", "light", "dark"], link.theme, known.themes?.[0] ?? "system"),
    frame: known.frames.includes(link.frame) ? link.frame : known.windowFrame,
    round: Math.min(LAST_ROUND, Math.max(1, parseInt(link.round, 10) || 1)),
    zoom: link.zoom === "actual" ? "actual" : "fit",
    text: link.text === "200" ? "200" : "100",
    dir: link.dir === "rtl" || link.dir === "ltr" ? link.dir : "",
    panels: among(PANELS, link.panels, "both"),
    tab: known.tabs.includes(link.tab) ? link.tab : FIRST_TAB,
    show: among(SHOWS, link.show, "all"),
    flow: known.flows.includes(link.flow) ? link.flow : "all",
    safe: link.safe === true,
    comments: link.comments === true,
    compare: link.compare === true,
    side: link.side === "build" ? "build" : "comments",
  };
}
