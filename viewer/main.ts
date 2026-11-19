// open-prototype's viewer: the state, the one redraw from it, and the wiring of the modules. One view at a time, kept
// in the deep link (link.ts). Each view and each panel draws itself from the state (views/, panels/); the keys are a
// table (keys.ts), the words one file (words.ts), and the names the viewer reads in a design another (names.ts).
import type { Comments, Ctx, Ui } from "./context.ts";
import { DEFAULT_THEME, FRAMES, flowIds, initialOf, OPENING_ROUND, screenEl, screenIds, statesOf, THEME_CHOICES, titleAttr, titleOf } from "./design.ts";
import { $, elementOf, every, findAll, trackInputKind } from "./dom.ts";
import { type Action, keyAction, moveIn } from "./keys.ts";
import { LINK_KEYS, type Link, linkFor, parseLink, resolveLink, type View } from "./link.ts";
import { DEFAULT_FRAME } from "./names.ts";
import {
  announce,
  autoPanels,
  buildBeside,
  buildPanels,
  buildTabs,
  linkBase,
  linkProblem,
  menuMode,
  openChecks,
  openInspector,
  openMenu,
  openSheet,
  paintKeys,
  placeNextLine,
  placeZoom,
  renderBar,
  renderSubtitle,
  say,
  toggleInspector,
  toggleScreens,
  windowFrame,
  wireBars,
} from "./panels/bars.ts";
import { commentLoad, commentRender, commentTargets, commentToggle, currentRound, wireComments } from "./panels/comments.ts";
import { earlierRounds } from "./panels/earlier-rounds.ts";
import { renderInspector, setInspectorTab, wireInspector } from "./panels/inspector.ts";
import { commentPins } from "./panels/pins.ts";
import { buildMenu, markSeen, nextUnseen, numberStates, placeStates, renderRail, renderStates, stateOfKey, stepState, wireRail } from "./panels/rail.ts";
import { titleSlot } from "./plumbing.ts";
import { fitBoard, wireBoard, zoomBoard } from "./views/board.ts";
import { wireCompare } from "./views/compare.ts";
import { buildFrame, depth, frameSize, moveDevice, present, wirePrototype } from "./views/prototype.ts";
import { wireSystem } from "./views/system.ts";
import { BESIDE_ROWS, TAB_ROWS, VIEW_NAMES } from "./views/table.ts";
import * as W from "./words.ts";

const view: View = {
  screen: "",
  state: "",
  theme: DEFAULT_THEME,
  frame: DEFAULT_FRAME,
  round: 1,
  zoom: "fit",
  text: "100",
  dir: "",
  panels: "both",
  tab: "prototype",
  show: "all",
  flow: "all",
  safe: false,
  comments: false,
  compare: false,
  side: "comments",
};
const ui: Ui = {
  pending: "",
  everyState: true,
  flowLines: false,
  menuOpen: false,
  inspectOpen: false,
  present: false,
  boardZoom: 1,
  boardZoomed: "fit",
  panesAuto: false,
  frameNamed: false,
  linkProblem: "",
  keysOn: true,
};
const comments: Comments = {
  on: false,
  round: 0,
  items: [],
  seen: new Set(),
  exported: "",
  unsaved: new Set(),
  type: "change",
  editing: "",
  picked: false,
  stale: false,
  unreadable: 0,
  version: "",
  seenStale: false,
  seenReplace: false,
  active: "",
  options: new Map(),
  gone: null,
};
const ctx: Ctx = { view, ui, comments, doc: null, picked: 0, apply, set, go, write, setTab };

/** A link's values, checked against this design: an unknown screen opens the first, an unknown state the screen's own. */
function resolve(link: Link): View {
  return resolveLink(link, {
    tabs: VIEW_NAMES,
    screens: screenIds,
    statesOf,
    initialOf,
    frames: Object.keys(FRAMES),
    flows: flowIds,
    windowFrame: windowFrame(),
    themes: THEME_CHOICES,
    openingRound: OPENING_ROUND,
  });
}
const asLink = (from: View): Link => ({ ...from, round: String(from.round) });

/**
 * The address follows the view: a move to another screen adds a history entry, every other switch replaces it. A new
 * entry keeps the screen the move came from, so Back in the design returns by the history only to the screen it names.
 */
function write(push: boolean, from = ""): void {
  try {
    const url = new URL(location.href);
    LINK_KEYS.forEach((key) => {
      url.searchParams.delete(key);
    });
    url.hash = linkFor(view, linkBase(), DEFAULT_THEME, OPENING_ROUND);
    // A go to the view already shown adds no entry, so Back never returns to the same view.
    if (url.href === location.href) return;
    if (push) history.pushState({ depth: depth() + 1, from }, "", url);
    else history.replaceState(history.state, "", url);
  } catch {
    /* a file:// page may refuse; the view still applies */
  }
}

/** Draw every part from the state, in one order: the Screens panel, the bars, the views, Build details, what is said, the panels, the pins. */
function apply(): void {
  const current = screenEl(view.screen);
  renderStates();
  renderBar();
  $.round.value = String(view.round);
  if (currentRound() !== comments.round) {
    commentLoad();
    commentRender();
  }
  markSeen();
  placeStates();
  renderRail();
  TAB_ROWS.filter((row) => row.drawnAlways).forEach((row) => {
    row.render();
  });
  renderInspector(current);
  // A message waiting for this redraw (the panels closed, screenshots loaded) is the one announced, once.
  announce(ui.pending || (current ? W.screenAndState(titleAttr(current) ?? "", view.state) : W.NO_SCREEN_DRAWN));
  if (ctx.doc) ui.pending = ""; // kept until the frame is in, whose load redraws once more
  menuMode();
  if (comments.on && ctx.doc) commentTargets();
  commentPins();
  TAB_ROWS.find((row) => row.name === view.tab && !row.drawnAlways)?.render();
}

/** Change one value of the view. The device moves only when a person changes the frame or the zoom. */
function set<K extends keyof View>(key: K, value: View[K]): void {
  linkProblem();
  if (key === "frame") ui.frameNamed = true;
  if (key === "frame" || key === "zoom") moveDevice();
  Object.assign(view, resolve(asLink({ ...view, [key]: value })));
  apply();
  write(false);
}

/** Open a screen, or a screen and state: a link to a state the screen lacks opens its first, and says so. */
function go(target: string, push: boolean, focus: boolean): void {
  const [screen = "", state = ""] = String(target).split("/");
  if (!screenIds.includes(screen)) {
    linkProblem(...W.linkToNoScreen(screen));
    return;
  }
  const from = view.screen;
  view.screen = screen;
  view.state = statesOf(screen).includes(state) ? state : initialOf(screen);
  if (state && state !== view.state) linkProblem(...W.linkToNoState(target, titleOf(screen), view.state));
  else linkProblem();
  if (view.tab !== "prototype") setTab("prototype", { write: false });
  apply();
  write(push, from);
  if (focus && ctx.doc) titleSlot(ctx.doc)?.focus();
}

let tabs: HTMLButtonElement[] = [];
/** Show a view by its name, with its tab, its panel, and its bar's controls. */
function setTab(name: string, options?: { write: boolean }): void {
  const held = document.activeElement !== document.body;
  const row = TAB_ROWS.find((found) => found.name === name) ?? TAB_ROWS[0];
  if (!row) throw new Error(W.NO_TAB);
  view.tab = name;
  $.artboard.dataset.tab = name;
  tabs.forEach((tab) => {
    const on = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !on;
  });
  $.zoomGroup.hidden = !row.zoom;
  placeZoom();
  TAB_ROWS.forEach((other) => {
    other.controls().forEach((control) => {
      control.hidden = other.name !== name;
    });
  });
  VIEW_NAMES.forEach((other) => {
    const where = document.getElementById(`where-${other}`);
    if (where) where.hidden = other !== name;
  });
  apply();
  row.opened();
  if (options?.write !== false) write(false);
  $.scroller.scrollTo(0, 0);
  // A control that left with its view never drops the focus to the page body: the view's tab takes it.
  const active = document.activeElement;
  if (held && (active === document.body || !active?.getClientRects().length)) tabs.find((tab) => tab.dataset.tab === name)?.focus();
}

/** What a view shows, in words: its screen and state, or nothing when the design draws no screen. */
function shownOf(of: View): string {
  return of.screen ? `${titleOf(of.screen)}, ${W.label(of.state)}` : W.SHOWN_NOTHING;
}
/** What a link names that this design lacks, measured against the view it opened. */
function problemsOf(link: Link, of: View): W.Said {
  const parts: W.Said = [];
  const add = (more: W.Said) => {
    if (parts.length) parts.push(W.PROBLEMS_JOIN);
    parts.push(...more);
  };
  if (link.screen && !screenIds.includes(link.screen)) add(W.noScreen(link.screen, shownOf(of)));
  else if (link.state && !statesOf(of.screen).includes(link.state)) add(W.noState(titleOf(of.screen), link.state, of.state));
  if (link.frame && !Object.hasOwn(FRAMES, link.frame)) add(W.noFrame(link.frame, FRAMES[of.frame]?.label ?? ""));
  if (link.theme && !(THEME_CHOICES as string[]).includes(link.theme)) add(W.noTheme(link.theme, W.themeName(DEFAULT_THEME)));
  if (link.tab && !VIEW_NAMES.includes(link.tab)) add(W.noTab(link.tab));
  return parts;
}

/** Back and forward, and a link typed into the address, restore the view it names. A fragment that names no screen (such as #main) leaves the view as it is. */
function restore(): void {
  if (location.hash === linkFor(view, linkBase(), DEFAULT_THEME, OPENING_ROUND)) return; // the address this view wrote: the hashchange after popstate
  const link = parseLink(location.hash, location.search);
  // A plain fragment, such as the skip link's #artboard, names a place in the page; one with a / or a ? names a view.
  if (!screenIds.includes(link.screen) && !/[/?]/.test(location.hash)) {
    write(false);
    return;
  }
  if (!screenIds.includes(link.screen)) {
    linkProblem(...W.noScreenStill(link.screen, shownOf(view)));
    write(false);
    return;
  }
  // The tab shown stays until setTab shows the one the link names: the view's tab is the tab on the page.
  const next = resolve(link);
  Object.assign(view, { ...next, tab: view.tab });
  linkProblem(...problemsOf(link, view));
  ui.frameNamed = Object.hasOwn(FRAMES, link.frame);
  const message = link.panels ? "" : autoPanels(view.frame);
  if (view.tab !== next.tab) setTab(next.tab);
  if (comments.on !== view.comments) commentToggle(view.comments);
  if (!view.comments) setInspectorTab(view.side === "build" ? "screen" : "comments");
  apply();
  write(false);
  if (message) say(message);
}

/** What each key's action does. The key table (keys.ts) says which action a key press means. */
const KEY_ACTIONS: Record<Exclude<Action, { state: number }>, () => void> = {
  "close-sheet": () => $.sheet.close(),
  "close-checks": () => {
    openChecks(false);
    $.checksToggle.focus();
  },
  "leave-full-screen": () => present(false),
  "leave-comment-form": () => {
    commentToggle(false);
    $.commentToggle.focus();
  },
  "close-screens": () => openMenu(false),
  "close-inspector": () => {
    openInspector(false);
    $.inspectToggle.focus();
  },
  "toggle-screens": () => toggleScreens(),
  "toggle-inspector": () => toggleInspector(),
  "full-screen": () => present(!ui.present),
  "next-unseen": () => nextUnseen(),
  "next-state": () => stepState(1),
  "previous-state": () => stepState(-1),
  comment: () => {
    if (ui.present) present(false);
    commentToggle(!comments.on);
    if (comments.on) $.commentTarget.focus();
  },
  // The key changes the tab away from the focus, so the live region says which tab shows now.
  "next-view": () => {
    setTab(VIEW_NAMES[(VIEW_NAMES.indexOf(view.tab) + 1) % VIEW_NAMES.length] ?? "prototype");
    announce(W.tabSaid(TAB_ROWS.find((row) => row.name === view.tab)?.label ?? view.tab));
  },
  "next-theme": () => {
    set("theme", THEME_CHOICES[(THEME_CHOICES.indexOf(view.theme) + 1) % THEME_CHOICES.length] ?? DEFAULT_THEME);
    say(W.themeSaid(view.theme));
  },
  // D changes the frame and nothing else: the side panels stay as they are, where the frame's own pick may close them.
  "next-frame": () => {
    const keys = [...$.framePick.options].map((frame) => frame.value);
    set("frame", keys[(keys.indexOf(view.frame) + 1) % keys.length] ?? windowFrame());
    say(W.frameSaid(frameSize(view.frame).label));
  },
  "open-sheet": () => openSheet(),
};
/**
 * Whether a key press types text: in a field, in an element the design makes editable or inside one, or in one it names a
 * text box. The element may be the frame's, of another window, so its own flag is read, never its class.
 */
function typesText(target: Element | null): boolean {
  return Boolean(target?.closest('input, textarea, select, [role="textbox"]') || (target as HTMLElement | null)?.isContentEditable);
}
function onKey(event: KeyboardEvent): void {
  const target = elementOf(event.target);
  const press = {
    key: event.key,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    altGraph: typeof event.getModifierState === "function" && event.getModifierState("AltGraph"),
    inField: typesText(target),
    inCommentForm: $.commentForm.contains(target),
  };
  const action = keyAction(press, {
    sheet: $.sheet.open,
    keysOn: ui.keysOn,
    checks: !$.checksMenu.hidden,
    present: ui.present,
    commenting: comments.on,
    screensDrawer: ui.menuOpen,
    inspectorDrawer: ui.inspectOpen,
  });
  if (!action) return;
  if (typeof action === "object") {
    const state = stateOfKey(action.state);
    if (state) set("state", state);
    return;
  }
  KEY_ACTIONS[action]();
}

/** One listener moves between screens from the viewer: the Screens panel, the Board, Build details, the System view, and the skip link. */
function onViewerClick(event: MouseEvent): void {
  const target = elementOf(event.target);
  if (ui.menuOpen && !$.menu.contains(target) && !$.screensToggle.contains(target)) {
    ui.menuOpen = false;
    menuMode();
  }
  if (!target) return;
  // The skip link moves to the screen's title, the slot the design marks; a design with no title slot gets the artboard.
  if (target.closest(".skip")) {
    event.preventDefault();
    setTab("prototype");
    const title = ctx.doc ? titleSlot(ctx.doc) : null;
    if (title) title.focus();
    else $.scroller.focus();
    return;
  }
  const link = target.closest<HTMLElement>("[data-pv-go]");
  if (!link) return;
  event.preventDefault();
  const fromMenu = $.menu.contains(link);
  go(link.dataset.pvGo ?? "", true, !fromMenu && !link.hasAttribute("data-board"));
  if (fromMenu && $.workspace.dataset.menu === "drawer") openMenu(false);
}

// The wiring: each module's listeners, the tabs, the keys, the clicks, and the address.
tabs = buildTabs(TAB_ROWS);
buildPanels(TAB_ROWS);
buildBeside(BESIDE_ROWS, TAB_ROWS);
findAll();
wireBars(ctx, numberStates);
wirePrototype(ctx);
wireRail(ctx);
wireInspector(ctx);
wireComments(ctx);
wireBoard(ctx);
wireSystem(ctx);
wireCompare(ctx);
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => setTab(tab.dataset.tab ?? ""));
  tab.addEventListener("keydown", (event) => {
    const to = moveIn(event.key, "tabs", i, tabs.length);
    const next = to === null ? undefined : tabs[to];
    if (!next) return;
    next.focus();
    setTab(next.dataset.tab ?? "");
  });
});
// Fit and 100%: the frame's zoom, or on the Board the board's.
every("[data-zoom]", HTMLElement).forEach((button) => {
  button.addEventListener("click", () => {
    const zoom = button.dataset.zoom === "actual" ? "actual" : "fit";
    if (view.tab === "board") zoomBoard(zoom === "fit" ? fitBoard() : 1, button.dataset.zoom ?? "");
    else set("zoom", zoom);
  });
});
trackInputKind(document);
document.addEventListener("click", onViewerClick);
document.addEventListener("keydown", onKey);
window.addEventListener("popstate", restore);
window.addEventListener("hashchange", restore);

// The first view: the one the link names, on the round after the last one beside the design unless the link names a round
// (resolve reads a link that names none as the opening round).
renderSubtitle();
paintKeys();
placeZoom();
placeNextLine();
buildMenu();
buildFrame(onKey);
const opened = parseLink(location.hash, location.search);
// The page opens on Prototype, and setTab below shows the tab the link names.
const first = resolve(opened);
Object.assign(view, { ...first, tab: "prototype" });
linkProblem(...problemsOf(opened, view));
ui.frameNamed = Object.hasOwn(FRAMES, opened.frame);
earlierRounds();
ui.pending = opened.panels ? "" : autoPanels(view.frame);
apply();
if (first.tab !== "prototype") setTab(first.tab);
if (view.comments) commentToggle(true);
else if (view.side === "build") setInspectorTab("screen");
write(false);
