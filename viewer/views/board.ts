// The Board: a row for each screen, its name and its count seen, then its own states left to right in the order the
// design draws them, each a picture of the frame with its name under it, so what is left to see shows at a glance. A cell
// opens that screen and state in the Prototype view. With Every state off, each row keeps its first state. It moves like a
// design tool's canvas: drag its empty space to pan, Ctrl or Cmd with the wheel (or a pinch) to zoom, and Fit to see every
// screen at once, down to a floor where a picture stays legible.
import type { Ctx } from "../context.ts";
import { attr, flowIds, frameOf, initialOf, isPhone, linksOf, onlyScreen, screenEl, screenIds, screens, statesOf, titleAttr, WIDE_FRAME } from "../design.ts";
import { $, el, every, icon, markIcon, narrow, option, svgEl } from "../dom.ts";
import { mount, paint, show } from "../frame.ts";
import { flowOf, READ, testIdOf } from "../names.ts";
import { pressZoom } from "../panels/bars.ts";
import { boardCount, commentCounts, seenAt, whereNow } from "../panels/rail.ts";
import { stateKey } from "../seen.ts";
import * as W from "../words.ts";
import { lookNow } from "./prototype.ts";

let ctx!: Ctx;
/** The Board itself, which this module builds and keeps: its panel holds it, under the line said when it is empty. */
const board = el("div", { class: "pv-board", id: "board" });

/** The Board's panel: the line said when no cell shows, and the board. */
export function boardPanel(): HTMLElement {
  return el("div", {}, el("p", { class: "pv-board-empty", id: "board-empty", role: "status", hidden: "" }), board);
}
const SWITCH = { on: W.ON, off: W.OFF };

/**
 * The least zoom Fit sets. Below it a web frame's picture is under 96 px wide and a phone's under 75, too small to tell
 * one state from the next, so Fit stops there and the board scrolls. The names under the pictures keep their size on
 * screen down to it too (--pv-zoom-floor in chrome.css).
 */
const FIT_FLOOR = 0.75;

// A cell's frame is made and loaded when its cell scrolls near the view, so a board of many screens opens at once: a cell
// far from the view holds an empty box of the frame's size, and its name, its marks, and its place in the Tab order are
// there from the start. `data-ready="true"` on #board once the observer has answered for every cell and every cell near
// the view has loaded its fonts and painted; "false" while one loads.
let boardWatch: IntersectionObserver | null = null;
const boardLoads = new Map<Element, () => void>();
/** The cells the observer has not yet answered for: its first answer, near the view or not, comes for every cell. */
const boardUnanswered = new Set<Element>();
let boardLoading = 0;
let boardTurn = 0; // each build of the board: a cell of an earlier build that loads late counts for nothing
let builtFor = "";
let boardChecking = false;
function boardSettled(): void {
  // One check for every call in the same two frames: a board of thousands of cells calls it once for each cell that loads.
  if (boardChecking) return;
  boardChecking = true;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      boardChecking = false;
      board.dataset.ready = String(boardLoading === 0 && boardUnanswered.size === 0);
    }),
  );
}

/** The Board's cells, built again only when what they show changes. */
function buildBoard(): void {
  const { view, ui } = ctx;
  const key = [view.frame, view.theme, view.text, view.dir, ui.everyState, ctx.picked].join("|");
  if (builtFor === key) return;
  builtFor = key;
  if (boardWatch) boardWatch.disconnect();
  boardLoads.clear();
  boardUnanswered.clear();
  boardLoading = 0;
  const turn = ++boardTurn;
  board.dataset.ready = "false";
  const watch =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              boardUnanswered.delete(entry.target);
              if (!entry.isIntersecting) return;
              watch?.unobserve(entry.target);
              const load = boardLoads.get(entry.target);
              boardLoads.delete(entry.target);
              if (load) load();
            });
            boardSettled();
          },
          { root: $.scroller, rootMargin: "300px" },
        )
      : null;
  boardWatch = watch;
  const spec = frameOf(view.frame === "fill" ? WIDE_FRAME : view.frame);
  const pickedNow = ctx.picked;
  const phone = isPhone(spec.platform);
  if (!screens.length) {
    board.replaceChildren(el("p", { class: "pv-empty", text: W.NO_SCREEN_ON_BOARD }));
    // A Board with no cell to load is ready once it has painted its one line.
    boardSettled();
    return;
  }
  const width = phone ? 100 : 128;
  const scale = width / spec.w;
  const height = Math.round(spec.h * scale);
  const rows = el("div", { class: "pv-board-rows" });
  screens.forEach((screen) => {
    const id = attr(screen, READ.screen) ?? "";
    const title = titleAttr(screen) ?? "";
    const have = statesOf(id);
    // With Links between screens on, each row names the screens its arrows point to, so an arrow is never an unlabelled brace.
    const opens = [...new Set(have.flatMap((state) => linksOf(id, state)))].map((target) => titleAttr(screenEl(target)) ?? "");
    const head = el(
      "div",
      { class: "pv-rowh" },
      el("b", {}, icon("here", "here"), title),
      el("span", { class: "pv-rowseen" }),
      el("small", { class: "pv-opens", text: W.opens(opens) }),
    );
    head.dataset.pvScreen = id;
    // The row's own states only, in drawn order: a state another screen has leaves no gap here.
    const shown = ui.everyState ? have : have.filter((state) => state === initialOf(id));
    const cells = shown.map((state) => {
      const open = el("button", { type: "button", class: "pv-thumb-name" }, el("span", { class: "pv-cell-text", text: W.label(state) }));
      open.dataset.pvGo = `${id}/${state}`;
      open.dataset.testid = testIdOf("board", id, state);
      open.dataset.board = "";
      const box = el("div", { class: "pv-thumb-frame" });
      box.dataset.pvPlatform = phone ? "phone" : "web";
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      const load = () => {
        if (turn !== boardTurn) return;
        boardLoading += 1;
        board.dataset.ready = "false";
        const frame = el("iframe", { title: `${title}, ${state}`, tabindex: "-1", "aria-hidden": "true", sandbox: "allow-same-origin" });
        frame.style.width = `${spec.w}px`;
        frame.style.height = `${spec.h}px`;
        frame.style.transform = `scale(${scale})`;
        box.append(frame);
        const loaded = () => {
          if (turn !== boardTurn) return;
          boardLoading -= 1;
          boardSettled();
        };
        mount(frame, onlyScreen(id), (doc) => {
          paint(doc, spec, lookNow());
          show(doc, id, state, pickedNow);
          doc.fonts.ready.then(loaded, loaded);
        });
      };
      if (watch) {
        boardLoads.set(box, load);
        boardUnanswered.add(box);
        watch.observe(box);
      } else load();
      const thumb = el(
        "div",
        { class: "pv-thumb" },
        open,
        box,
        el("span", { class: "pv-mark-st" }, icon("unseen", "unseen")),
        el("span", { class: "badge badge-comment pv-count", "aria-hidden": "true", hidden: "" }),
      );
      thumb.dataset.pvScreen = id;
      thumb.dataset.pvState = state;
      return thumb;
    });
    rows.append(head, el("div", { class: "pv-strip" }, ...cells));
  });
  board.replaceChildren(rows);
  flowsLater();
  boardSettled();
}

/** The marks on the Board: each cell seen or not seen here, its comments, the open screen's row and cell, and the Show filter. */
export function markBoard(): void {
  const view = ctx.view;
  const here = whereNow();
  const activeFlow = flowIds.includes(view.flow) ? view.flow : "all";
  $.boardFlow.value = activeFlow;
  $.boardSeen.textContent = boardCount(here);
  const counts = commentCounts();
  every(".pv-thumb", HTMLElement, board).forEach((thumb) => {
    const id = thumb.dataset.pvScreen ?? "",
      state = thumb.dataset.pvState ?? "";
    const done = seenAt(id, state, here);
    const n = counts.get(stateKey(id, state)) ?? 0;
    markIcon(thumb.querySelector("svg"), done ? "seen" : "unseen");
    const badge = thumb.querySelector<HTMLElement>(".pv-count");
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    const open = thumb.querySelector(".pv-thumb-name");
    open?.setAttribute("aria-label", W.cellName(titleAttr(screenEl(id)) ?? "", state, done, here, n));
    if (id === view.screen && state === view.state) open?.setAttribute("aria-current", "true");
    else open?.removeAttribute("aria-current");
    const dim = (view.show === "unseen" && done) || (view.show === "commented" && n === 0);
    if (dim) thumb.dataset.dim = "";
    else delete thumb.dataset.dim;
    thumb.inert = dim;
  });
  every(".pv-rowh", HTMLElement, board).forEach((head) => {
    const id = head.dataset.pvScreen ?? "";
    const hide = activeFlow !== "all" && flowOf(id) !== activeFlow;
    head.hidden = hide;
    if (head.nextElementSibling instanceof HTMLElement) head.nextElementSibling.hidden = hide;
    if (hide) return;
    const have = statesOf(id);
    const seen = head.querySelector(".pv-rowseen");
    if (seen) seen.textContent = W.rowSeen(have.filter((state) => seenAt(id, state, here)).length, have.length);
    if (id === view.screen) head.setAttribute("aria-current", "true");
    else head.removeAttribute("aria-current");
  });
  every("[data-boardshow]", HTMLElement).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.boardshow === view.show));
  });
  const shown = every(".pv-thumb", HTMLElement, board).filter((thumb) => !thumb.closest(".pv-strip[hidden]"));
  const none = view.show !== "all" && !shown.some((thumb) => !thumb.hasAttribute("data-dim"));
  $.boardEmpty.hidden = !none;
  $.boardEmpty.textContent = W.boardEmpty(view.show, activeFlow === "all", here);
}

/** The Board, from the view: its cells, then its marks. */
export function renderBoard(): void {
  buildBoard();
  markBoard();
}

/** Where an element sits inside one of its ancestors. */
function offsetIn(node: HTMLElement, ancestor: Element): { x: number; y: number; w: number; h: number } {
  let x = 0,
    y = 0;
  for (let n: Element | null = node; n instanceof HTMLElement && n !== ancestor; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}
/**
 * The flow map: an arrow from each screen to every screen a link in any of its states opens, from the design itself, drawn
 * in the margin beside the rows.
 */
function drawFlows(): void {
  const heads = new Map(every(".pv-rowh", HTMLElement, board).map((head) => [head.dataset.pvScreen ?? "", head]));
  // Each row's place, read once: a screen is the end of many arrows on a board of thousands.
  const places = new Map<HTMLElement, ReturnType<typeof offsetIn>>();
  const placeOf = (head: HTMLElement) => {
    const known = places.get(head);
    if (known) return known;
    const place = offsetIn(head, board);
    places.set(head, place);
    return place;
  };
  const svg = svgEl("svg", { class: "pv-flowmap", "aria-hidden": "true", width: String(board.scrollWidth), height: String(board.scrollHeight) });
  const marker = svgEl("marker", {
    id: "pv-arrow",
    viewBox: "0 0 8 8",
    refX: "7",
    refY: "4",
    markerWidth: "10",
    markerHeight: "10",
    markerUnits: "userSpaceOnUse",
    orient: "auto-start-reverse",
  });
  marker.append(svgEl("path", { class: "pv-head", d: "M0 0L8 4L0 8z" }));
  // A dot where an arrow starts, so it reads from one screen to another.
  const tail = svgEl("marker", { id: "pv-tail", viewBox: "0 0 8 8", refX: "4", refY: "4", markerWidth: "7", markerHeight: "7", markerUnits: "userSpaceOnUse" });
  tail.append(svgEl("circle", { class: "pv-tail", cx: "4", cy: "4", r: "4" }));
  const defs = svgEl("defs");
  defs.append(marker, tail);
  svg.append(defs);
  screenIds.forEach((id) => {
    [...new Set(statesOf(id).flatMap((state) => linksOf(id, state)))].forEach((target) => {
      const from = heads.get(id),
        to = heads.get(target);
      if (!from || !to || from.hidden || to.hidden) return;
      const a = placeOf(from),
        b = placeOf(to);
      const x = a.x - 8,
        sy = a.y + 10,
        ey = b.y + 10,
        reach = 20 + Math.min(40, Math.abs(ey - sy) / 16);
      const path = svgEl("path", {
        class: "pv-edge",
        "marker-start": "url(#pv-tail)",
        "marker-end": "url(#pv-arrow)",
        d: `M${x} ${sy} C${x - reach} ${sy} ${x - reach} ${ey} ${x} ${ey}`,
      });
      path.dataset.from = id;
      path.dataset.to = target;
      svg.append(path);
    });
  });
  board.querySelector(".pv-flowmap")?.remove();
  board.prepend(svg);
  board.dataset.flows = ctx.ui.flowLines ? "on" : "off";
}
/** The arrows drawn again once the next frame has laid the board out: once, however many builds and zooms ask first. */
let flowsAsked = false;
function flowsLater(): void {
  if (flowsAsked) return;
  flowsAsked = true;
  requestAnimationFrame(() => {
    flowsAsked = false;
    drawFlows();
  });
}
/** A screen's own arrows stand out while the pointer or the keyboard is on one of its cells. */
function markFlows(thumb: Element | null, on: boolean): void {
  if (!(thumb instanceof HTMLElement)) return;
  every(".pv-edge", SVGElement, board).forEach((path) => {
    if (on && path.dataset.from === thumb.dataset.pvScreen) path.dataset.active = "";
    else delete path.dataset.active;
  });
}

/**
 * The Board's own zoom. Its own text keeps its size on screen: it divides by the zoom it is drawn at (--pv-zoom), and a
 * name under a picture by that zoom down to the floor. A row's height follows its text, so the arrows are drawn again.
 */
export function zoomBoard(z: number, how: string): void {
  ctx.ui.boardZoom = Math.min(2, Math.max(0.2, z));
  ctx.ui.boardZoomed = how;
  board.style.zoom = String(ctx.ui.boardZoom);
  board.style.setProperty("--pv-zoom", String(ctx.ui.boardZoom));
  pressZoom();
  if (screens.length) flowsLater();
}
/**
 * Fit shows the whole width, down to the floor, past which the board scrolls; and grows a board that leaves room, up to
 * twice its size, while every row still shows.
 */
export function fitBoard(): number {
  board.style.zoom = "1";
  board.style.setProperty("--pv-zoom", "1");
  if (narrow.matches) return 1;
  // The board is at least as wide as the artboard, so its size is its rows' and its own padding. The column of the
  // screens' names keeps its width on screen at every zoom, so only the rest shrinks.
  const pad = getComputedStyle(board),
    rows = board.querySelector<HTMLElement>(".pv-board-rows");
  const wide = rows ? rows.offsetWidth + parseFloat(pad.paddingLeft) + parseFloat(pad.paddingRight) : board.scrollWidth;
  const tall = rows ? rows.offsetHeight + parseFloat(pad.paddingTop) + parseFloat(pad.paddingBottom) : board.scrollHeight;
  const names = rows ? parseFloat(getComputedStyle(rows).gridTemplateColumns) || 0 : 0;
  const across = ($.scroller.clientWidth - 16 - names) / Math.max(1, wide - names);
  return across < 1 ? Math.max(FIT_FLOOR, across) : Math.max(1, Math.min(2, across, ($.scroller.clientHeight - 16) / Math.max(1, tall)));
}

export function wireBoard(c: Ctx): void {
  ctx = c;
  board.style.setProperty("--pv-zoom-floor", String(FIT_FLOOR));
  $.everyState.addEventListener("click", () => {
    ctx.ui.everyState = !ctx.ui.everyState;
    option($.everyState, ctx.ui.everyState, SWITCH);
    buildBoard();
    markBoard();
    zoomBoard(fitBoard(), "fit");
  });
  $.flowLines.addEventListener("click", () => {
    ctx.ui.flowLines = !ctx.ui.flowLines;
    option($.flowLines, ctx.ui.flowLines, SWITCH);
    board.dataset.flows = ctx.ui.flowLines ? "on" : "off";
  });
  every("[data-boardshow]", HTMLElement).forEach((button) => {
    button.addEventListener("click", () => {
      ctx.view.show = (button.dataset.boardshow ?? "all") as Ctx["view"]["show"];
      markBoard();
      ctx.write(false);
    });
  });
  $.boardFlow.addEventListener("change", () => {
    ctx.view.flow = flowIds.includes($.boardFlow.value) ? $.boardFlow.value : "all";
    markBoard();
    drawFlows();
    zoomBoard(fitBoard(), "fit");
    ctx.write(false);
  });
  // A focused cell scrolls into view whole, its picture and its ring with it, not only its name under the picture.
  board.addEventListener("focusin", (event) => {
    if (event.target instanceof Element) event.target.closest(".pv-thumb")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  (["mouseover", "focusin"] as const).forEach((type) => {
    board.addEventListener(type, (event) => markFlows(event.target instanceof Element ? event.target.closest(".pv-thumb") : null, true));
  });
  (["mouseout", "focusout"] as const).forEach((type) => {
    board.addEventListener(type, (event) => markFlows(event.target instanceof Element ? event.target.closest(".pv-thumb") : null, false));
  });
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  const panel = $.boardPanel;
  panel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    drag = { x: event.clientX, y: event.clientY, left: $.scroller.scrollLeft, top: $.scroller.scrollTop };
    panel.setPointerCapture(event.pointerId);
    panel.classList.add("pv-panning");
  });
  panel.addEventListener("pointermove", (event) => {
    if (!drag) return;
    $.scroller.scrollLeft = drag.left - (event.clientX - drag.x);
    $.scroller.scrollTop = drag.top - (event.clientY - drag.y);
  });
  const endDrag = () => {
    drag = null;
    panel.classList.remove("pv-panning");
  };
  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);
  $.scroller.addEventListener(
    "wheel",
    (event) => {
      if (ctx.view.tab !== "board" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomBoard(ctx.ui.boardZoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), "");
    },
    { passive: false },
  );
}
