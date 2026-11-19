// The bars: the top bar (the product's name, the views, the panel buttons), the display bar over the frame (the frame,
// the theme, the zoom, Checks), the dock that holds the panel buttons on a narrow window, the shortcut sheet, the
// banners, the toast, and what is announced. Also where the side panels show: side panes on a wide window, drawers on
// a narrow one.
import type { Ctx } from "../context.ts";
import {
  DEFAULT_THEME,
  designDirection,
  designPath,
  FRAMES,
  FRAMES_OF,
  findings,
  frameOf,
  isPhone,
  NARROW_FRAME,
  OPENING_ROUND,
  PATH_SHAPE,
  productName,
  THEME_CHOICES,
  WIDE_FRAME,
  WORK_ITEM_SHAPE,
  workItem,
} from "../design.ts";
import { $, el, every, icon, medium, narrow, option } from "../dom.ts";
import { linkFor } from "../link.ts";
import { DEFAULT_FRAME, testIdOf } from "../names.ts";
import { readChoice, writeChoice } from "../store.ts";
import { holdCaption } from "../views/prototype.ts";
import * as W from "../words.ts";
import { currentITab, setInspectorTab } from "./inspector.ts";

let ctx!: Ctx;
const SWITCH = { on: W.ON, off: W.OFF };

/** What a toast keeps clear of: every control, and Compare's picture. */
const TOAST_CLEARS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), #compare-beside';

/** How much the toast in its place now covers that a person can see. What it reports on and the control with focus weigh
 * most, so a toast never hides either while a place clear of them exists; each other control counts one. */
const MUST_SEE = 100;
function toastCovers(on: Element): number {
  const toast = $.toast.getBoundingClientRect();
  const meets = (box: DOMRect) =>
    Math.min(box.right, toast.right) - Math.max(box.left, toast.left) > 0.5 && Math.min(box.bottom, toast.bottom) - Math.max(box.top, toast.top) > 0.5;
  const focused = document.activeElement;
  let count = meets(on.getBoundingClientRect()) ? MUST_SEE : 0;
  for (const control of document.querySelectorAll(TOAST_CLEARS)) {
    if (control === on) continue;
    const box = control.getBoundingClientRect();
    // A box that holds the whole toast is a surface, such as a scrolling region, not a control the toast can keep clear of.
    if (!meets(box) || (box.left <= toast.left && box.right >= toast.right && box.top <= toast.top && box.bottom >= toast.bottom)) continue;
    // A control under a drawer, or scrolled out of its panel, is not seen there, so the window's own hit test says what
    // is. The toast takes no pointer, so the test finds what lies under it.
    const x = (Math.max(box.left, toast.left) + Math.min(box.right, toast.right)) / 2;
    const y = (Math.max(box.top, toast.top) + Math.min(box.bottom, toast.bottom)) / 2;
    const seen = document.elementFromPoint(x, y);
    if (seen && (seen === control || control.contains(seen))) count += control === focused ? MUST_SEE : 1;
  }
  return count;
}

/** Every outcome shows: a toast for a few seconds, and the same words said once by the live region. */
let toastTimer = 0;
export function say(text: string, about?: Element | null): void {
  $.announce.textContent = text;
  if (ctx.ui.present) return; // full screen shows the screen alone
  // What a toast reports on is the control the caller names, as a copy names the control a person used before the
  // clipboard took the text; else the control that has focus. A key pressed with no control in focus, or from inside the
  // frame, reports on the display bar.
  const active = document.activeElement;
  const named = about?.isConnected && about.getClientRects().length ? about : null;
  const on = named ?? (active && active !== document.body && active.tagName !== "IFRAME" ? active : $.bar);
  const box = on.getBoundingClientRect();
  $.toast.textContent = text;
  // The toast takes its place when it shows, against what shows then, at the text size in use. It tries the half of the
  // window away from what it reports on first, under the display bar or else under the header at the top, then the other
  // half. It takes the first place that covers nothing it keeps clear of, or else the one that covers the least. Where no
  // place is clear, as on a phone with a drawer open or at 200% text, it still never hides what it reports on or the
  // control with focus while a place clear of them exists. It shows for four seconds and takes no pointer, so a control
  // under it stays usable.
  const tops = [$.bar, $.top].map((bar) => ({ at: "top", top: Math.round(bar.getBoundingClientRect().bottom + EDGE_GAP) }));
  const foot = { at: "bottom", top: 0 };
  const places = box.top + box.height / 2 > window.innerHeight / 2 ? [...tops, foot] : [foot, ...tops];
  const put = (place: { at: string; top: number }) => {
    $.toast.dataset.at = place.at;
    $.toast.style.setProperty("--pv-toast-top", `${place.top}px`);
  };
  let best = foot;
  let fewest = Number.POSITIVE_INFINITY;
  for (const place of places) {
    put(place);
    const covers = toastCovers(on);
    if (covers < fewest) [best, fewest] = [place, covers];
    if (!covers) break;
  }
  put(best);
  $.toast.dataset.on = "";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => delete $.toast.dataset.on, 4000);
}

/** Said by the live region only. */
export function announce(text: string): void {
  $.announce.textContent = text;
}

/** A link that opens something other than it names says so: a banner, and a warning in the console for a script. */
export function linkProblem(...parts: W.Said): void {
  ctx.ui.linkProblem = parts.map((part) => (Array.isArray(part) ? `\`${part[0]}\`` : part)).join("");
  $.linkProblem.hidden = !ctx.ui.linkProblem;
  $.linkProblem.replaceChildren(...parts.map((part) => (Array.isArray(part) ? el("code", { text: part[0] }) : part)));
  if (ctx.ui.linkProblem) console.warn(W.CONSOLE_PREFIX + ctx.ui.linkProblem);
}

// The header is the work item, with the design's path beside it. A narrow bar shows the shortest text that tells this
// design from its siblings, in one form: the work item's id and the file's name; else the last folder and the file's name;
// else the words before the first colon, which drop their first article where they do not fit. The bar's own ellipsis
// takes the tail of a name that does not fit. Build details and the title hold the whole text.
function subtitleForms(whole: string): string[] {
  const path = workItem ? designPath : PATH_SHAPE.test(whole) ? whole : "";
  const head = whole.split(":")[0] ?? "";
  if (!path) return workItem ? [workItem] : [head, head.replace(/^The /, "")];
  const parts = path.split("/"),
    file = parts[parts.length - 1] ?? "";
  const id = workItem || parts.find((part) => WORK_ITEM_SHAPE.test(part));
  if (id) return [id + W.DOT + file, file];
  return parts.length > 1 ? [parts[parts.length - 2] + W.SLASH + file, file] : [file];
}
let subtitleShort: string[] = [];
// A form fits when it takes one line within the box. Where the bar lets text wrap, a form too long for the room takes two
// lines and stays within the box's width, so its lines are counted too.
function fitSubtitle(): void {
  const box = $.subtitleShort,
    range = document.createRange();
  for (const form of subtitleShort) {
    box.textContent = form;
    range.selectNodeContents(box);
    const lines = new Set([...range.getClientRects()].map((line) => Math.round(line.top))).size;
    if (!box.clientWidth || (lines <= 1 && range.getBoundingClientRect().width <= box.getBoundingClientRect().width + 0.05)) break;
  }
}
export function renderSubtitle(): void {
  if (workItem) $.subtitle.replaceChildren(workItem, ...(designPath ? [el("span", { class: "pv-path", text: W.DOT + designPath })] : []));
  const whole = $.subtitle.textContent ?? "";
  subtitleShort = subtitleForms(whole);
  $.subtitle.title = $.subtitleShort.title = whole;
  $.buildWhere.textContent = whole;
  fitSubtitle();
}

/** The frame this window opens in when the link names none: a phone-sized window opens a phone the design declares, since a web page at 1024 is unreadable there. */
export function windowFrame(): string {
  return narrow.matches ? NARROW_FRAME : WIDE_FRAME;
}

/** Whether a side panel shows on a wide window, as the link keeps it. */
export function shows(pane: "screens" | "inspector"): boolean {
  return ctx.view.panels === "both" || ctx.view.panels === pane;
}

/** In the middle band the comments drawer covers the artboard, unless it docks beside it. */
export function drawerCovers(): boolean {
  return ctx.ui.inspectOpen && !narrow.matches && medium.matches && $.workspace.dataset.dock !== "true";
}

// The three panel buttons are the dock on a narrow window: at the foot, and last in the page, so Tab reaches them last,
// as the eye does. On a wide window they are in the top bar, first and last.
function placeDock(drawer: boolean): void {
  if (drawer === ($.screensToggle.parentElement === $.dock)) return;
  const active = document.activeElement;
  if (drawer) $.dock.append($.screensToggle, $.inspectToggle, $.buildToggle);
  else {
    $.top.prepend($.screensToggle);
    $.topEnd.append($.inspectToggle, $.buildToggle);
  }
  if (active instanceof HTMLElement && [$.screensToggle, $.inspectToggle, $.buildToggle].includes(active as HTMLButtonElement)) active.focus();
}

/**
 * The tab row follows the bar's buttons in the page when the bar gives it a row of its own under them, and stands between
 * the name and the buttons when it shares their row, so Tab follows the eye at every width and text size.
 */
function placeTabs(): void {
  const own = getComputedStyle($.tablist).gridRowStart === "2";
  if (own === ($.tablist.previousElementSibling === $.topEnd)) return;
  const active = document.activeElement;
  if (own) $.topEnd.after($.tablist);
  else $.topEnd.before($.tablist);
  if (active instanceof HTMLElement && $.tablist.contains(active)) active.focus();
}

/** Where the side panels show, and what their buttons say. */
export function menuMode(): void {
  const { ui, view } = ctx;
  const drawer = narrow.matches;
  placeDock(drawer);
  placeTabs();
  $.workspace.dataset.menu = drawer ? "drawer" : "sidebar";
  $.workspace.dataset.tab = view.tab;
  // In the middle band the comments drawer covers the artboard, but while Add a comment is on it docks beside it, so the
  // element a person pins is never under it.
  $.workspace.dataset.dock = String(medium.matches && !drawer && ui.inspectOpen && ctx.comments.on);
  $.workspace.dataset.panels = view.panels;
  if (!drawer) ui.menuOpen = false;
  $.menu.hidden = drawer && !ui.menuOpen;
  $.screensToggle.setAttribute("aria-expanded", String(drawer ? ui.menuOpen : shows("screens") && view.tab !== "board"));
  const onBoard = !drawer && view.tab === "board";
  $.screensToggle.title = onBoard ? W.BOARD_HIDES_RAIL : W.screensTitle(ui.keysOn);
  if (onBoard) $.screensToggle.setAttribute("aria-disabled", "true");
  else $.screensToggle.removeAttribute("aria-disabled");
  if (!medium.matches) ui.inspectOpen = false;
  $.inspector.dataset.open = String(ui.inspectOpen);
  const tabNow = currentITab();
  $.inspectToggle.setAttribute(
    "aria-expanded",
    String(narrow.matches ? ui.inspectOpen && tabNow === "comments" : medium.matches ? ui.inspectOpen : shows("inspector")),
  );
  $.buildToggle.setAttribute("aria-expanded", String(ui.inspectOpen && tabNow === "screen"));
  // A drawer over a narrow window covers the artboard, so nothing under it takes focus until it closes. Full screen closes
  // the drawers, so it never leaves the artboard inert.
  $.artboard.inert = drawer && !ui.present && (ui.menuOpen || ui.inspectOpen);
  holdCaption();
}

/** [ and ]: on a wide window a panel hides, and the deep link keeps it. */
export function setPanels(screensOn: boolean, inspectorOn: boolean): void {
  ctx.ui.panesAuto = false;
  if (!screensOn && $.menu.contains(document.activeElement)) $.screensToggle.focus();
  if (!inspectorOn && $.inspector.contains(document.activeElement)) $.inspectToggle.focus();
  ctx.set("panels", screensOn && inspectorOn ? "both" : screensOn ? "screens" : inspectorOn ? "inspector" : "none");
}
export function toggleScreens(): void {
  if (narrow.matches) openMenu(!ctx.ui.menuOpen);
  else if (ctx.view.tab === "board") say(`${W.BOARD_HIDES_RAIL}.`);
  else setPanels(!shows("screens"), shows("inspector"));
}
export function toggleInspector(): void {
  if (medium.matches) openInspector(!ctx.ui.inspectOpen);
  else setPanels(shows("screens"), !shows("inspector"));
}

/** A side panel's width as the CSS computes it now, read off a hidden probe, so the script restates no size; 0 when it reads as no number. */
function panelWidth(name: string): number {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = `var(${name})`;
  document.body.append(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(px) ? px : 0;
}

/**
 * A web or desktop frame too wide for the artboard between the panels closes them, and a frame that fits again opens them,
 * unless a person moved them since. It fits when it shows at 55% or more between the panels. Returns what to announce.
 */
export function autoPanels(key: string): string {
  const { ui, view } = ctx;
  const spec = frameOf(key);
  const nav = panelWidth("--pv-nav-column"),
    side = panelWidth("--pv-inspector-column");
  const sides = narrow.matches ? 0 : medium.matches ? nav : nav + side;
  const fits = isPhone(spec.platform) || key === "fill" || spec.w * 0.55 + 48 <= $.workspace.clientWidth - sides;
  if (!fits && view.panels === "both" && !narrow.matches) {
    if ($.menu.contains(document.activeElement)) $.screensToggle.focus();
    if ($.inspector.contains(document.activeElement)) $.inspectToggle.focus();
    ui.panesAuto = true;
    view.panels = "none";
    return W.PANELS_CLOSED;
  }
  if (fits && ui.panesAuto) {
    ui.panesAuto = false;
    view.panels = "both";
    return W.PANELS_OPENED;
  }
  return "";
}

function pickFrame(key: string): void {
  const message = autoPanels(key);
  ctx.set("frame", key);
  if (message) say(message);
}

export function openMenu(open: boolean): void {
  ctx.ui.menuOpen = open;
  if (open) ctx.ui.inspectOpen = false; // one drawer at a time
  menuMode();
  if (open) ($.menu.querySelector<HTMLElement>('[aria-current="page"]') || $.menu.querySelector<HTMLElement>("button, input"))?.focus();
  else $.screensToggle.focus();
}
export function openInspector(open: boolean): void {
  ctx.ui.inspectOpen = open;
  if (open) ctx.ui.menuOpen = false;
  menuMode();
  if (open) ($.inspector.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') || $.inspector.querySelector<HTMLElement>("button"))?.focus();
  // Closed, by a key or by its button, the drawer gives focus back to the button that opens it, never to the page body.
  else if (document.activeElement === document.body || $.inspector.contains(document.activeElement))
    (narrow.matches && currentITab() === "screen" ? $.buildToggle : $.inspectToggle).focus();
}

/** Checks: a menu that stays open while you toggle, and closes on Escape, a click outside, or focus that leaves it. */
export function openChecks(open: boolean): void {
  $.checksMenu.hidden = !open;
  $.checksToggle.setAttribute("aria-expanded", String(open));
  if (open) keepInWindow($.checksMenu);
}

/** The gap a layer keeps from the window's edge, in CSS px: the viewer's --spacing-2. */
const EDGE_GAP = 8;
/** A layer opens inside the window: one that would cross its left or right edge moves back in, so the page never scrolls sideways. */
function keepInWindow(layer: HTMLElement): void {
  layer.style.translate = "";
  const box = layer.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const shift = box.right > width - EDGE_GAP ? width - EDGE_GAP - box.right : box.left < EDGE_GAP ? EDGE_GAP - box.left : 0;
  if (shift) layer.style.translate = `${Math.round(shift)}px 0`;
}

/** Fit and 100% say which one holds: the frame's zoom, or on the Board the board's, which a pinch or the wheel leaves at neither. */
export function pressZoom(): void {
  const now = ctx.view.tab === "board" ? ctx.ui.boardZoomed : ctx.view.zoom;
  every("[data-zoom]", HTMLElement).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.zoom === now));
  });
}
/** Fit and 100% sit in the caption, beside the frame's size, so the bar keeps one row. The Board has no caption, so there they sit in the bar. */
export function placeZoom(): void {
  const zoom = $.zoomGroup;
  if (ctx.view.tab === "board") {
    if (zoom.parentElement?.id !== "checks") $.checks.before(zoom);
  } else if (zoom.parentElement?.id !== "caption") $.captionSize.after(zoom);
}

/**
 * The line to type stands where it is drawn, so Tab meets it in the order a person sees: above the frame on a phone-width
 * window, where the artboard scrolls, and under the caption on a wider one.
 */
export function placeNextLine(): void {
  const line = $.captionNext;
  if (narrow.matches) {
    if (line.nextElementSibling !== $.deviceSlot) $.deviceSlot.before(line);
  } else if (line.previousElementSibling !== $.caption) $.caption.after(line);
}

/** The display bar's controls, from the view. */
export function renderBar(): void {
  const { view } = ctx;
  const platform = frameOf(view.frame).platform;
  $.framePick.value = view.frame;
  if ($.framePick.parentElement) $.framePick.parentElement.dataset.pvPlatform = isPhone(platform) ? "phone" : platform;
  every("[data-theme-pick]", HTMLElement).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themePick === view.theme));
  });
  pressZoom();
  $.compare.setAttribute("aria-pressed", String(view.compare));
  const checksOn: Record<string, boolean> = { text: view.text === "200", dir: (view.dir || designDirection) === "rtl", safe: view.safe };
  every("[data-check]", HTMLElement).forEach((button) => {
    option(button, checksOn[button.dataset.check ?? ""] ?? false, SWITCH);
  });
  const onCount = Object.values(checksOn).filter(Boolean).length;
  $.checksCount.hidden = onCount === 0;
  $.checksCount.textContent = String(onCount);
  $.checksOn.hidden = onCount === 0;
  $.shell.dataset.safe = view.safe ? "on" : "off";
}

// Single-key shortcuts can be switched off (WCAG 2.1.4), and the choice is kept in this browser. What names a key is
// aria-keyshortcuts, and a hint such as "(F)" at the end of a title or a label: off, none of them is said or shown,
// because no key acts; on, each comes back as written. The states' numbers follow the screen shown, so rail.ts writes theirs.
const KEYS_CHOICE = "prototype-viewer:single-key-shortcuts";
const KEY_HINT = / \(\S\)$/;
type Keyed = { node: Element; keys: string | null; title: string | null; label: string | null };
let keyed: Keyed[] = [];
let afterKeys: () => void = () => {};
export function paintKeys(): void {
  const on = ctx.ui.keysOn;
  $.keysSwitch.setAttribute("aria-checked", String(on));
  const state = $.keysSwitch.querySelector(".pv-onoff");
  if (state) state.textContent = W.onOff(on);
  $.workspace.dataset.keys = on ? "on" : "off";
  keyed.forEach((k) => {
    const put = (name: string, value: string | null) => {
      if (value !== null) k.node.setAttribute(name, on ? value : value.replace(KEY_HINT, ""));
    };
    if (k.keys !== null) {
      if (on) k.node.setAttribute("aria-keyshortcuts", k.keys);
      else k.node.removeAttribute("aria-keyshortcuts");
    }
    put("title", k.title);
    put("aria-label", k.label);
  });
  afterKeys();
  menuMode();
}

/** The shortcut sheet: a native modal dialog, so the page behind it is inert and its own keys close it. */
export function openSheet(): void {
  openChecks(false);
  if (typeof $.sheet.showModal === "function") $.sheet.showModal();
}

/** The design's own findings, as the tool's check found them when it wrote this page: each in its one printed form. */
function renderProblems(): void {
  $.designProblems.hidden = findings.length === 0;
  $.designProblemsHead.textContent = W.findingsHead(
    findings.filter((one) => one.level === "problem").length,
    findings.filter((one) => one.level === "note").length,
  );
  $.designProblemsList.replaceChildren(...findings.map((one) => el("li", { text: W.findingLine(one.file, one.line, one.message) })));
}

/** The frame menu: each declared platform's frames, in the page config's order. */
function buildFrames(): void {
  $.framePick.replaceChildren(
    ...FRAMES_OF.map(([platform, keys]) =>
      el(
        "optgroup",
        { label: W.platformGroup(platform) },
        ...keys.map((key) => {
          const frame = FRAMES[key];
          const twin = keys.filter((other) => FRAMES[other]?.label.split(",")[0] === frame?.label.split(",")[0]).length > 1;
          return el("option", {
            value: key,
            "data-testid": testIdOf("frame", key),
            text: key === "fill" ? W.FILL_FRAME : W.frameOption(frame?.label ?? key, frame?.w ?? 0, twin),
          });
        }),
      ),
    ),
  );
}

/**
 * Each view's panel, one for each row of the table of views, from the panel the view builds (an empty one when it builds
 * none, which its render fills): the table gives each its place in the artboard, its tab panel's role and its label. So
 * adding a view adds its module and its row, and no markup.
 */
export function buildPanels(views: readonly { name: string; panel?(): HTMLElement }[]): void {
  views.forEach((view, i) => {
    const panel = view.panel?.() ?? el("div");
    panel.id = `panel-${view.name}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `tab-${view.name}`);
    panel.hidden = i !== 0;
    $.scroller.append(panel);
  });
}

/**
 * Each view shown beside another: its button, first in the top bar's end in the table's order, with its row's icon,
 * label and title, pressed while it shows; and its part, where the view it shows beside says.
 */
export function buildBeside(
  views: readonly { name: string; label: string; title: string; icon: string; within: string; panel(): HTMLElement }[],
  hosts: readonly { name: string; beside?(): HTMLElement }[],
): void {
  const buttons = views.map((view) => {
    const button = el(
      "button",
      { type: "button", class: "btn btn-quiet", id: view.name, "aria-pressed": "false", title: view.title, "data-testid": `proto-${view.name}` },
      icon(view.icon),
      el("span", { class: "pv-tab-label", text: view.label }),
    );
    hosts
      .find((host) => host.name === view.within)
      ?.beside?.()
      .append(view.panel());
    return button;
  });
  $.topEnd.prepend(...buttons);
}

/** The tabs, one for each row of the table of views, each with its row's label: the markup holds none of them. */
export function buildTabs(views: readonly { name: string; label: string }[]): HTMLButtonElement[] {
  const tabs = views.map((view, i) => {
    const tab = el("button", {
      type: "button",
      role: "tab",
      id: `tab-${view.name}`,
      "aria-controls": `panel-${view.name}`,
      "aria-selected": String(i === 0),
      ...(i ? { tabindex: "-1" } : {}),
      "data-testid": `proto-tab-${view.name}`,
      text: view.label,
    });
    tab.dataset.tab = view.name;
    return tab;
  });
  $.tablist.replaceChildren(...tabs);
  return tabs;
}

/** The bars' listeners, and what they show before the first redraw. `numberStates` writes the states' keys after a change of the shortcuts. */
export function wireBars(c: Ctx, numberStates: () => void): void {
  ctx = c;
  afterKeys = numberStates;
  wireLayout();
  wirePanelButtons();
  wireKeys();
  wireDisplay();
  wireChecks();
  $.copyLink.addEventListener("click", () => {
    const link = location.href.split("#")[0] + linkFor(ctx.view, DEFAULT_FRAME, DEFAULT_THEME, OPENING_ROUND);
    const fallback = () => say(W.LINK_BLOCKED, $.copyLink);
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => say(W.LINK_COPIED, $.copyLink), fallback);
    else fallback();
  });
  ctx.ui.keysOn = readChoice(KEYS_CHOICE) !== "off";
  renderProblems();
  $.productName.textContent = productName();
}

/** The bars follow the window: the tabs and the subtitle fit their room, and the panels and the frame follow its width. */
function wireLayout(): void {
  // The box is as wide as its text, so the room is watched too: a window that widens gives a longer form back.
  new ResizeObserver(placeTabs).observe($.top);
  const subtitleResize = new ResizeObserver(fitSubtitle);
  subtitleResize.observe($.subtitleShort);
  subtitleResize.observe($.id);
  window.addEventListener("resize", () => {
    const message = autoPanels(ctx.view.frame);
    if (message) {
      ctx.apply();
      ctx.write(false);
      say(message);
    }
  });
  // Across the phone width the frame this window opens in follows, unless one was named, and the link follows with it.
  narrow.addEventListener("change", () => {
    placeNextLine();
    if (!ctx.ui.frameNamed) ctx.view.frame = windowFrame();
    ctx.apply();
    ctx.write(false);
  });
  medium.addEventListener("change", menuMode);
}

/** The buttons that open and close the Screens panel and the side panel, and the drawer that closes when the focus leaves it. */
function wirePanelButtons(): void {
  $.screensToggle.addEventListener("click", toggleScreens);
  $.screensClose.addEventListener("click", () => openMenu(false));
  $.inspectToggle.addEventListener("click", () => {
    if (narrow.matches) dockTab("comments");
    else toggleInspector();
  });
  $.buildToggle.addEventListener("click", () => dockTab("screen"));
  // Focus that leaves the open drawer closes it, so a keyboard user never tabs on behind it.
  $.menu.addEventListener("focusout", (event) => {
    const to = event.relatedTarget;
    if (ctx.ui.menuOpen && $.workspace.dataset.menu === "drawer" && to instanceof Node && !$.menu.contains(to) && to !== $.screensToggle) {
      ctx.ui.menuOpen = false;
      menuMode();
    }
  });
  // So does focus that leaves the side panel where it covers the artboard, in the middle band.
  $.inspector.addEventListener("focusout", (event) => {
    const to = event.relatedTarget;
    if (drawerCovers() && to instanceof Node && !$.inspector.contains(to) && to !== $.inspectToggle && to !== $.buildToggle) {
      ctx.ui.inspectOpen = false;
      menuMode();
    }
  });
}

/** The controls that name a key, the switch of the single-key shortcuts, and the sheet that lists them. */
function wireKeys(): void {
  keyed = [...document.querySelectorAll("[aria-keyshortcuts], [title], [aria-label]")]
    .filter((node) => !node.matches("[data-show]"))
    .map((node) => ({ node, keys: node.getAttribute("aria-keyshortcuts"), title: node.getAttribute("title"), label: node.getAttribute("aria-label") }))
    .filter((k) => k.keys !== null || KEY_HINT.test(k.title || "") || KEY_HINT.test(k.label || ""));
  $.keysSwitch.addEventListener("click", () => {
    ctx.ui.keysOn = !ctx.ui.keysOn;
    writeChoice(KEYS_CHOICE, ctx.ui.keysOn ? "on" : "off");
    paintKeys();
    say(W.keysSaid(ctx.ui.keysOn));
  });
  $.sheetOpen.addEventListener("click", openSheet);
  $.sheetClose.addEventListener("click", () => $.sheet.close());
  $.sheet.addEventListener("click", (event) => {
    if (event.target === $.sheet) $.sheet.close();
  });
}

/** The display bar's frame and theme choices. */
function wireDisplay(): void {
  $.framePick.addEventListener("change", () => pickFrame($.framePick.value));
  // The theme group offers the themes the design declares, and "as the system" only when it declares both.
  every("[data-theme-pick]", HTMLElement).forEach((button) => {
    const theme = THEME_CHOICES.find((one) => one === button.dataset.themePick);
    button.hidden = !theme;
    if (theme) button.addEventListener("click", () => ctx.set("theme", theme));
  });
  buildFrames();
}

/** The Checks menu: it opens and closes, and each check turns its view on or off. */
function wireChecks(): void {
  $.checksToggle.addEventListener("click", () => openChecks($.checksMenu.hidden === true));
  document.addEventListener("pointerdown", (event) => {
    if (!$.checksMenu.hidden && !(event.target instanceof Element && event.target.closest("#checks"))) openChecks(false);
  });
  $.checks.addEventListener("focusout", () =>
    requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now && now !== document.body && !$.checks.contains(now)) openChecks(false);
    }),
  );
  every("[data-check]", HTMLElement).forEach((button) => {
    button.addEventListener("click", () => {
      const { view } = ctx;
      if (button.dataset.check === "text") ctx.set("text", view.text === "200" ? "100" : "200");
      // The check turns the direction shown over; the design's own direction is written as none, so its link stays plain.
      else if (button.dataset.check === "dir") {
        const next = (view.dir || designDirection) === "rtl" ? "ltr" : "rtl";
        ctx.set("dir", next === designDirection ? "" : next);
      } else {
        view.safe = !view.safe;
        ctx.apply();
        ctx.write(false);
      }
    });
  });
}

/** On a narrow window the Comments and Build buttons are the tab bar: each opens the panel on its own tab, and a second press closes it. */
function dockTab(name: string): void {
  if (ctx.ui.inspectOpen && currentITab() === name) {
    openInspector(false);
    return;
  }
  setInspectorTab(name);
  openInspector(true);
  ctx.write(false);
}
