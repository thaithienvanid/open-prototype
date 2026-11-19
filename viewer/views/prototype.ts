// The Prototype view: the one frame you click through, in its device, with its caption and the line to type next; and
// full screen, the screen alone. Its frame is sandboxed without scripts, so nothing in a design runs.
import type { Ctx } from "../context.ts";
import { allStates, attr, designBody, frameOf, isPhone, productName, screenEl, titleAttr, type ViewerFrame } from "../design.ts";
import { $, el, elementOf, narrow, svgEl, trackInputKind } from "../dom.ts";
import { mount, paint, show } from "../frame.ts";
import { besideFit, fitScale, placeholderFit } from "../geometry.ts";
import { FIND, has, READ, SET, VIEWER_READY } from "../names.ts";
import { announce, drawerCovers, menuMode, openChecks, say } from "../panels/bars.ts";
import { pickFromFrame } from "../panels/comments.ts";
import { commentPinsSoon } from "../panels/pins.ts";
import { titleSlot } from "../plumbing.ts";
import * as W from "../words.ts";
import { showCompare } from "./compare.ts";

let ctx!: Ctx;
/** The frame's own element, once it is built. */
let frame: HTMLIFrameElement | null = null;

const QUIET = { "aria-hidden": "true" };
/** A window's three dots, for its title bar and its address bar. */
const dots = (): HTMLElement => el("span", { class: "pv-dots" }, el("span"), el("span"), el("span"));

/**
 * The Prototype view's panel: the device, with its window's bars, a phone's status bar, island, safe areas and home bar,
 * and the place of the frame and its pins; then the caption under it and the line to type next. A view shown beside
 * the frame, such as Compare, goes into the device, after the shell (`beside`).
 */
export function prototypePanel(): HTMLElement {
  const signal = svgEl("svg", { viewBox: "0 0 34 12" });
  [
    ["0", "7", "3", "5"],
    ["5", "5", "3", "7"],
    ["10", "2.5", "3", "9.5"],
  ].forEach(([x = "", y = "", width = "", height = ""]) => {
    signal.append(svgEl("rect", { x, y, width, height, rx: "1" }));
  });
  signal.append(
    svgEl("rect", { x: "21", y: "1", width: "12", height: "10", rx: "3", fill: "none", stroke: "currentColor" }),
    svgEl("rect", { x: "22.5", y: "2.5", width: "8", height: "7", rx: "1.5" }),
  );
  const screen = el(
    "div",
    { class: "pv-screen", id: "screen-area" },
    el("div", { class: "pv-status", ...QUIET }, el("span", { text: W.STATUS_TIME }), signal),
    el("span", { class: "pv-island", ...QUIET }),
    el("span", { class: "pv-safe pv-safe-top", ...QUIET }),
    el("span", { class: "pv-safe pv-safe-bottom", ...QUIET }),
    el("span", { class: "pv-home", ...QUIET }),
    el("div", { class: "pv-pins", id: "pins", ...QUIET }),
  );
  const shell = el(
    "div",
    { class: "pv-shell", id: "shell", "data-pv-platform": "web" },
    el("div", { class: "pv-titlebar", ...QUIET }, dots(), el("span", { class: "pv-window-title", id: "window-title" })),
    el("div", { class: "pv-browser", ...QUIET }, dots(), el("span", { class: "pv-address", id: "address" })),
    screen,
  );
  return el(
    "div",
    { class: "pv-view" },
    el("div", { class: "pv-device-slot", id: "device-slot" }, el("div", { class: "pv-device", id: "device" }, shell)),
    el("p", { class: "pv-caption", id: "caption" }, el("b", { id: "caption-size" }), el("span", { id: "caption-theme" }), el("span", { id: "caption-screen" })),
    el("p", { class: "pv-next pv-caption-next", id: "caption-next" }),
  );
}

/** A frame's size: Fill follows the artboard, every other frame has its own. */
export function frameSize(key: string): ViewerFrame {
  const spec = frameOf(key);
  if (key !== "fill") return spec;
  const w = Math.max(320, Math.round($.scroller.clientWidth - 48));
  return { ...spec, w, h: Math.max(480, Math.round($.scroller.clientHeight - 100)), label: W.fillFrameNow(w) };
}

/** The look a frame shows the design in, from the view. */
export function lookNow(): { theme: string; text: string; dir: string; commenting: boolean } {
  return { theme: ctx.view.theme, text: ctx.view.text, dir: ctx.view.dir, commenting: ctx.comments.on };
}

// Ready, for a script that takes a screenshot: `data-ready="true"` on #workspace once the frame shows the view, its fonts
// have loaded, the device holds still, and the page has painted; "false" from each redraw until then.
let readyTurn = 0;
function readySoon(): void {
  $.workspace.setAttribute(VIEWER_READY.attribute, "false");
  const doc = ctx.doc;
  if (!doc) return;
  const turn = ++readyTurn;
  const settle = (): void => {
    if (turn !== readyTurn) return;
    if ("move" in $.device.dataset) {
      window.setTimeout(settle, 60);
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (turn === readyTurn) $.workspace.setAttribute(VIEWER_READY.attribute, "true");
      }),
    );
  };
  Promise.all([doc.fonts.ready, document.fonts.ready]).then(settle, settle);
}

/** The scale that fits the device to the artboard, and the caption that says it. */
function fit(): void {
  const spec = frameSize(ctx.view.frame);
  // Compare's placeholder is the viewer's size at any scale, so it is room taken, never a width to scale. On a narrow window
  // the panel stacks under the frame, so it takes no width.
  const side = $.compareSide;
  const stacked = narrow.matches;
  const placeholder = !stacked && !side.hidden && side.classList.contains("pv-compare-missing") ? side.getBoundingClientRect().width : 0;
  const width = $.device.offsetWidth - (placeholder ? side.offsetWidth : 0);
  const height = $.device.offsetHeight;
  const frameHeight = stacked ? $.shell.offsetHeight : height;
  // The artboard's whole box, scrollbars included: where a scrollbar takes room, its coming never shrinks the design. A
  // phone-width window always scrolls a phone fitted by its width, so there the room is inside the scrollbar.
  const artboard = $.scroller.getBoundingClientRect();
  // The line to type takes its room under the frame, the same with the comments drawer open or closed, so the drawer never
  // resizes the design it covers.
  const next = $.captionNext.offsetHeight;
  const room = ctx.ui.present
    ? { w: artboard.width - 32, h: artboard.height - 32 }
    : { w: stacked ? $.scroller.clientWidth - 16 : artboard.width - 48, h: artboard.height - 100 - (next ? next + 8 : 0) };
  // Compare's picture or its placeholder, fitted with Fit on a wide window: beside the frame or under it, with its caption's room
  // counted.
  const picture = document.getElementById("compare-beside");
  const fits = !side.hidden && !stacked && !ctx.ui.present && ctx.view.zoom === "fit" && ctx.view.frame !== "fill";
  const shell = { w: $.shell.offsetWidth, h: $.shell.offsetHeight };
  const gap = parseFloat(getComputedStyle($.device).columnGap) || 0;
  const placeholderBox = side.getBoundingClientRect();
  const beside = !fits
    ? null
    : picture && picture.offsetHeight > 0
      ? besideFit({
          room,
          shell,
          picture: { w: picture.offsetWidth, h: picture.offsetHeight },
          gap,
          // The caption's sizes divide by the scale it was drawn at, so in the window's px it is the same at any scale.
          caption: (side.offsetHeight - picture.offsetHeight) * (parseFloat($.device.style.getPropertyValue("--pv-scale")) || 1),
        })
      : placeholder
        ? placeholderFit({ room, shell, placeholder: { w: placeholderBox.width, h: placeholderBox.height }, gap })
        : null;
  const scale =
    beside?.scale ??
    fitScale({
      zoom: ctx.view.zoom,
      fill: ctx.view.frame === "fill",
      phone: isPhone(spec.platform),
      stacked,
      present: ctx.ui.present,
      room,
      placeholder,
      width,
      frameHeight,
    });
  const under = beside?.stack === true;
  $.device.toggleAttribute("data-stack", under);
  $.device.style.transform = `scale(${scale})`;
  $.device.style.setProperty("--pv-scale", String(scale));
  // Under the frame, the frame's caption and the line to type come first, right under the frame, so its size and zoom read
  // as the frame's own; the picture or the placeholder follows them, and the view keeps its room at the foot.
  $.deviceSlot.style.width = `${Math.round(beside ? beside.width : width * scale + placeholder)}px`;
  $.deviceSlot.style.height = `${Math.round(under ? scale * shell.h : beside ? beside.height : height * scale)}px`;
  $.captionSize.textContent = W.fitted(spec.label, scale);
  holdCaption();
  placeUnder(beside && under ? beside.height - scale * shell.h : 0);
}

/** Under the frame, Compare's part sits below the frame's caption and the line to type, and the view keeps `room` px for it at its foot. */
function placeUnder(room: number): void {
  const view = $.deviceSlot.parentElement;
  if (!view) return;
  if (!room) {
    $.device.style.removeProperty("--pv-under");
    view.style.paddingBlockEnd = "";
    return;
  }
  const last = $.captionNext.offsetHeight ? $.captionNext : $.caption;
  const block = last.getBoundingClientRect().bottom - $.deviceSlot.getBoundingClientRect().bottom;
  $.device.style.setProperty("--pv-under", `${Math.max(0, Math.round(block))}px`);
  view.style.paddingBlockEnd = `calc(var(--spacing-4) + ${Math.round(room)}px)`;
}

/**
 * While the comments drawer covers the artboard, the caption sits in the part that shows, where it may wrap. It keeps the
 * height it has with the drawer closed, and its other rows take the room of the line to type, so the drawer never moves the design.
 */
export function holdCaption(): void {
  const caption = $.caption;
  caption.style.height = "";
  if (!drawerCovers()) return;
  const view = caption.parentElement;
  if (!view) return;
  caption.style.maxWidth = `${view.clientWidth - 2 * parseFloat(getComputedStyle(view).paddingLeft)}px`; // the width with the drawer closed
  caption.style.height = `${caption.offsetHeight}px`;
  caption.style.maxWidth = "";
}

/** The device: its size, its platform's chrome, the system bars, and the zoom that fits it. */
function sizeDevice(): void {
  const spec = frameSize(ctx.view.frame);
  $.shell.dataset.pvPlatform = spec.platform;
  // Full screen, a web page or a desktop window is the window itself, so its breakpoints answer to the screen you present on.
  const whole = ctx.ui.present && !isPhone(spec.platform);
  if (frame) {
    frame.style.width = `${whole ? $.scroller.clientWidth : spec.w}px`;
    frame.style.height = `${whole ? $.scroller.clientHeight : spec.h}px`;
  }
  // The status bar and the safe-area shading take the row's bars, so the drawn bar is the one the design clears.
  $.shell.style.setProperty("--pv-bar-top", `${spec.insets.top}px`);
  $.safeTop.style.height = `${spec.insets.top}px`;
  $.safeBottom.style.height = `${spec.insets.bottom}px`;
  $.address.textContent = `/${ctx.view.screen.replace(":", "/")}`;
  $.windowTitle.textContent = productName();
  showCompare(frame?.style.width ?? "", frame?.style.height ?? "");
  fit();
  commentPinsSoon();
}

/** The device is still when the page opens and moves only when a person changes the frame or the zoom. */
let moving = 0;
export function moveDevice(): void {
  $.device.dataset.move = "";
  clearTimeout(moving);
  moving = window.setTimeout(() => {
    delete $.device.dataset.move;
  }, 400);
}

/** The Prototype view, from the view: the device, the frame's screen and look, and the bar's place and caption. */
export function renderPrototype(): void {
  const { view } = ctx;
  sizeDevice();
  const doc = ctx.doc;
  if (doc) {
    paint(doc, frameSize(view.frame), lookNow());
    show(doc, view.screen, view.state, ctx.picked);
    // The device's status bar takes the screen's own surface, so it follows the design's theme, not the viewer's.
    $.status.style.color = getComputedStyle(doc.body).color;
  }
  readySoon();
  const current = screenEl(view.screen);
  $.crumb.replaceChildren(
    ...(current
      ? [
          el("span", { class: "pv-crumb-screen", text: titleAttr(current) ?? "" }),
          el("span", { class: "pv-sep", "aria-hidden": "true", text: W.SLASH }),
          el("span", { class: "pv-crumb-state", text: W.label(view.state) }),
        ]
      : [el("span", { class: "pv-crumb-screen", text: W.NO_SCREEN_YET })]),
  );
  const all = allStates();
  const at = all.findIndex(([id, state]) => id === view.screen && state === view.state);
  $.statePrev.disabled = at <= 0;
  $.stateNext.disabled = at >= all.length - 1;
  $.captionTheme.textContent = W.productTheme(view.theme);
  $.captionScreen.textContent = current ? W.screenAndState(titleAttr(current) ?? "", view.state) : W.NO_SCREEN_YET;
  if (frame) frame.title = current ? W.screenAndState(titleAttr(current) ?? "", view.state) : W.PROTOTYPE_FRAME;
}

/** Full screen: the screen alone, with the browser's full screen where it allows it. Leaving the browser's full screen leaves this mode too. */
export function present(on: boolean): void {
  const ui = ctx.ui;
  ui.present = on;
  if (on) {
    openChecks(false);
    ui.menuOpen = false;
    ui.inspectOpen = false;
  }
  $.workspace.dataset.present = String(on);
  menuMode();
  $.present.setAttribute("aria-pressed", String(on));
  if (on && ctx.view.tab !== "prototype") ctx.setTab("prototype");
  try {
    if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch {
    /* the browser refused: the panes still hide */
  }
  sizeDevice();
  wake();
  announce(on ? W.FULL_SCREEN_ON : W.FULL_SCREEN_OFF);
  if (on && ctx.doc) titleSlot(ctx.doc)?.focus();
  else if (!on) $.present.focus();
}
/** The exit wakes on a pointer move, over the viewer or inside the frame, and sleeps after a few idle seconds. */
let sleeping = 0;
function wake(): void {
  if (!ctx.ui.present) return;
  $.presentExit.classList.add("pv-awake");
  clearTimeout(sleeping);
  sleeping = window.setTimeout(() => $.presentExit.classList.remove("pv-awake"), 2500);
}

/**
 * A link of the design never navigates its frame, since the frame would leave the design and the viewer would lose it: a
 * link to a place in the same screen scrolls to it, and any other is cancelled and says the address the design wrote. Returns whether the click was a link's.
 */
function onDesignLink(doc: Document, event: MouseEvent, target: Element): boolean {
  const link = target.closest(FIND.link);
  if (!link) return false;
  event.preventDefault();
  const href = link.getAttribute("href") ?? "";
  if (href.startsWith("#")) {
    let name = href.slice(1);
    try {
      name = decodeURIComponent(name);
    } catch {
      /* the name as written */
    }
    const place = name ? doc.getElementById(name) : null;
    if (place) place.scrollIntoView({ block: "start", inline: "nearest" });
    else say(W.noPlace(href));
    return true;
  }
  // The build made the address inert and kept the one the design wrote as text, so the note says that one.
  say(W.linkNotFollowed(link.getAttribute(SET.href) ?? href));
  return true;
}

/** A click in the frame: a comment's element while Add a comment is on; else a disclosure, the back control, a go, or a link. */
function onFrameClick(event: MouseEvent): void {
  const doc = ctx.doc;
  const target = elementOf(event.target);
  if (!doc || !target) return;
  if (ctx.comments.on) {
    const hit = target.closest(has(READ.testid));
    if (!hit) {
      if (target.closest(FIND.link)) event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pickFromFrame(hit);
    return;
  }
  const disclosure = target.closest(has(READ.toggle));
  if (disclosure) {
    const panel = [...doc.querySelectorAll<HTMLElement>(has(READ.panel))].find((found) => attr(found, READ.panel) === attr(disclosure, READ.toggle));
    if (panel) {
      event.preventDefault();
      panel.hidden = !panel.hidden;
      disclosure.setAttribute("aria-expanded", String(!panel.hidden));
      commentPinsSoon();
      return;
    }
  }
  if (target.closest(has(READ.back))) {
    event.preventDefault();
    // Back names the design's parent screen, so it goes there: by the history when the history came from it, which keeps
    // the state the parent was left in, and else by a move to it.
    const parent = attr(screenEl(ctx.view.screen), READ.parent);
    if (depth() > 0 && (!parent || cameFrom() === parent)) history.back();
    else if (parent) ctx.go(parent, true, true);
    return;
  }
  const link = target.closest(has(READ.go));
  if (!link) {
    onDesignLink(doc, event, target);
    return;
  }
  event.preventDefault();
  const pick = attr(link, SET.pick);
  if (pick) ctx.picked = Number(pick) || 0;
  ctx.go(attr(link, READ.go) ?? "", true, true);
}

/** How deep in this page's own history the view is: Back returns to the design's parent screen at none. */
export function depth(): number {
  const state: unknown = history.state;
  return (state && typeof state === "object" ? Number((state as { depth?: unknown }).depth) : 0) || 0;
}

/** The screen the move to this history entry came from, or "" when the entry names none. */
function cameFrom(): string {
  const state: unknown = history.state;
  const from = state && typeof state === "object" ? (state as { from?: unknown }).from : "";
  return typeof from === "string" ? from : "";
}

/** The prototype frame, built once. It calls `onKey` for a key pressed inside it, and redraws when it is in. */
export function buildFrame(onKey: (event: KeyboardEvent) => void): void {
  frame = el("iframe", { id: VIEWER_READY.frame, title: W.PROTOTYPE_FRAME, sandbox: "allow-same-origin" });
  mount(frame, designBody, (doc) => {
    ctx.doc = doc;
    doc.addEventListener("click", onFrameClick, true);
    trackInputKind(doc);
    // A middle click or a modified click opens no window either.
    doc.addEventListener(
      "auxclick",
      (event) => {
        const target = elementOf(event.target);
        if (target?.closest(FIND.link)) event.preventDefault();
      },
      true,
    );
    doc.addEventListener("pointerdown", () => openChecks(false));
    doc.addEventListener("submit", (event) => event.preventDefault());
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("mousemove", () => wake());
    doc.addEventListener("scroll", () => commentPinsSoon(), true);
    ctx.apply();
  });
  $.screenArea.append(frame);
}

/** The Prototype view's listeners. The frame itself is built by `buildFrame`. */
export function wirePrototype(c: Ctx): void {
  ctx = c;
  // The frame refits when the artboard changes size, and when the line to type changes its words and so its height.
  const refit = new ResizeObserver(() => {
    if (ctx.view.tab === "prototype") sizeDevice();
  });
  refit.observe($.scroller);
  refit.observe($.captionNext);
  document.addEventListener("mousemove", wake);
  $.present.addEventListener("click", () => present(!ctx.ui.present));
  $.presentExit.addEventListener("click", () => present(false));
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && ctx.ui.present) present(false);
  });
}
