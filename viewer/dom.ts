// The viewer's own elements, found once by their ids and typed, and the one helper that makes an element. A missing
// element is a fault of the viewer's markup, so it stops the page at once with its id.
import { missingElement } from "./words.ts";

type Kind<T extends Element> = { new (): T; prototype: T };

function need<T extends Element>(id: string, kind: Kind<T>): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(missingElement(id));
  return found;
}

/** A view's panel in the artboard, by the view's name, once the table of views has placed it. */
export function panelOf(name: string): HTMLElement | null {
  return document.getElementById(`panel-${name}`);
}

/** The first element a selector finds in the viewer, of its kind. */
function one<T extends Element>(selector: string, kind: Kind<T>): T {
  const found = document.querySelector(selector);
  if (!(found instanceof kind)) throw new Error(missingElement(selector));
  return found;
}

/** Every element a selector finds in the viewer, of its kind. */
export function every<T extends Element>(selector: string, kind: Kind<T>, inside: ParentNode = document): T[] {
  return [...inside.querySelectorAll(selector)].filter((found): found is T => found instanceof kind);
}

const E = HTMLElement,
  B = HTMLButtonElement;

/**
 * Each element, found the first time it is read and kept: the views build their own panels when the page starts, after
 * this module has loaded, so their elements are found once the table of views has placed them. `findAll` reads every
 * one, so a missing element still stops the page at once, with its id.
 */
function found<F extends Record<string, () => Element>>(finders: F): { readonly [K in keyof F]: ReturnType<F[K]> } {
  const out = {} as { [K in keyof F]: ReturnType<F[K]> };
  for (const [key, finder] of Object.entries(finders)) {
    let kept: Element | undefined;
    Object.defineProperty(out, key, { enumerable: true, get: () => (kept ??= finder()) });
  }
  return out;
}

/** The viewer's own elements, by their ids: in viewer.html, or in the panel a view builds. */
export const $ = found({
  workspace: () => need("workspace", E),
  menu: () => need("screen-menu", E),
  inspector: () => need("inspector", E),
  inspectToggle: () => need("inspect-toggle", B),
  buildToggle: () => need("build-toggle", B),
  framePick: () => need("frame-pick", HTMLSelectElement),
  checks: () => need("checks", E),
  checksToggle: () => need("checks-toggle", B),
  checksMenu: () => need("checks-menu", E),
  checksCount: () => need("checks-count", E),
  checksOn: () => need("checks-on", E),
  artboard: () => need("artboard", E),
  scroller: () => need("scroller", E),
  sheet: () => need("shortcuts", HTMLDialogElement),
  sheetOpen: () => need("shortcuts-open", B),
  sheetClose: () => need("shortcuts-close", B),
  keysSwitch: () => need("keys-switch", B),
  screenArea: () => need("screen-area", E),
  screenList: () => need("screen-list", E),
  screenFilter: () => need("screen-filter", HTMLInputElement),
  boardFlow: () => need("board-flow", HTMLSelectElement),
  boardFlowWrap: () => need("board-flow-wrap", E),
  boardShow: () => need("board-show", E),
  boardSeen: () => need("board-seen", E),
  boardEmpty: () => need("board-empty", E),
  board: () => need("board", E),
  boardPanel: () => need("panel-board", E),
  everyState: () => need("every-state", B),
  flowLines: () => need("flow-lines", B),
  seenCount: () => need("seen-count", E),
  seenMeter: () => need("seen-meter", E),
  seenWhere: () => need("seen-where", E),
  seenStale: () => need("seen-stale", E),
  dockSeen: () => need("dock-seen", E),
  dockComments: () => need("dock-comments", E),
  nextLabel: () => need("next-label", E),
  nextUnseen: () => need("next-unseen", B),
  commentsLine: () => need("comments-line", E),
  openNow: () => need("open-now", E),
  openEarlier: () => need("open-earlier", E),
  earlierLine: () => need("earlier-line", E),
  productName: () => need("product-name", E),
  subtitle: () => need("subtitle", E),
  subtitleShort: () => need("subtitle-short", E),
  buildWhere: () => need("build-where", E),
  closing: () => need("closing", E),
  closingHead: () => need("closing-h", E),
  closingNext: () => need("closing-next", B),
  nextLine: () => need("next-line", E),
  commentsSend: () => need("comments-send", B),
  sendLabel: () => need("send-label", E),
  caption: () => need("caption", E),
  captionSize: () => need("caption-size", E),
  captionTheme: () => need("caption-theme", E),
  captionScreen: () => need("caption-screen", E),
  captionNext: () => need("caption-next", E),
  device: () => need("device", E),
  deviceSlot: () => need("device-slot", E),
  shell: () => need("shell", E),
  address: () => need("address", E),
  windowTitle: () => need("window-title", E),
  pins: () => need("pins", E),
  present: () => need("present", B),
  presentExit: () => need("present-exit", B),
  announce: () => need("announce", E),
  toast: () => need("toast", E),
  crumb: () => need("crumb", E),
  statePrev: () => need("state-prev", B),
  stateNext: () => need("state-next", B),
  zoomGroup: () => need("zoom-group", E),
  tablist: () => one(".pv-top [role=tablist]", E),
  linkProblem: () => need("link-problem", E),
  copyLink: () => need("copy-link", B),
  inspectTitle: () => need("inspect-title", E),
  inspectId: () => need("inspect-id", E),
  inspectFacts: () => need("inspect-facts", E),
  inspectComponents: () => need("inspect-components", E),
  inspectLinks: () => need("inspect-links", E),
  inspectElements: () => need("inspect-elements", E),
  copyTestids: () => need("copy-testids", B),
  systemTokens: () => need("system-tokens", E),
  systemTokensLede: () => need("system-tokens-lede", E),
  systemComponentsLede: () => need("system-components-lede", E),
  systemComponents: () => need("system-components", E),
  round: () => need("round-number", HTMLInputElement),
  commentTarget: () => need("comment-target", HTMLSelectElement),
  commentField: () => need("comment-text", HTMLTextAreaElement),
  commentOut: () => need("comments-out", HTMLTextAreaElement),
  commentOutLabel: () => need("comments-out-label", E),
  commentAdd: () => need("comment-add", B),
  commentCancel: () => need("comment-cancel", B),
  commentForm: () => need("comment-form", E),
  commentError: () => need("comment-error", E),
  commentCount: () => need("comment-count", E),
  commentLimit: () => need("comment-limit", E),
  commentDownload: () => need("comments-download", HTMLAnchorElement),
  commentDownloadOff: () => need("comments-download-off", B),
  commentCopyJson: () => one('[data-comment-copy="json"]', B),
  composeHint: () => need("compose-hint", E),
  commentsList: () => need("comments-list", E),
  commentsEmpty: () => need("comments-empty", E),
  commentsCount: () => need("comments-count", E),
  commentsStale: () => need("comments-stale", E),
  commentToggle: () => one("[data-comment-toggle]", B),
  barComment: () => need("bar-comment", B),
  earlierRounds: () => need("earlier-rounds", E),
  earlierRoundsList: () => need("earlier-rounds-list", E),
  compare: () => need("compare", B),
  compareSide: () => need("compare-side", E),
  compareName: () => need("compare-name", E),
  comparePick: () => need("compare-pick", B),
  compareFiles: () => need("compare-files", HTMLInputElement),
  designProblems: () => need("design-problems", E),
  designProblemsHead: () => need("design-problems-h", E),
  designProblemsList: () => need("design-problems-list", E),
  screensToggle: () => one(".pv-menu-toggle", B),
  screensClose: () => one(".pv-menu-close", B),
  top: () => one(".pv-top", E),
  topEnd: () => one(".pv-end", E),
  dock: () => one(".pv-dock", E),
  bar: () => one(".pv-bar", E),
  id: () => one(".pv-id", E),
  status: () => one(".pv-status", E),
  safeTop: () => one(".pv-safe-top", E),
  safeBottom: () => one(".pv-safe-bottom", E),
});

/** Reads every element of `$`, once the views have built their panels: a missing one stops the page with its id. */
export function findAll(): void {
  Object.values($);
}

/**
 * The last kind of input, on the viewer's root as `data-pv-input`: `pointer` after a press of the pointer, `key` after a
 * key, in the viewer or in a frame. A control the browser marks as focused after a click, such as a select in a group,
 * shows the keyboard ring only after a key, as its sibling buttons do. Escape closes what a pointer opened, so it changes
 * nothing.
 */
export function trackInputKind(doc: Document): void {
  const root = document.documentElement;
  doc.addEventListener(
    "pointerdown",
    () => {
      root.dataset.pvInput = "pointer";
    },
    true,
  );
  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") root.dataset.pvInput = "key";
    },
    true,
  );
}

/** The window's widths where the layout changes: the side panels become drawers, and the comments a drawer. */
export const narrow = window.matchMedia("(width < 48rem)");
export const medium = window.matchMedia("(width < 80rem)");

/** Props of an element: its attributes by name, and `text` for its text. */
type Props = Record<string, string>;

/** An element of the viewer: its attributes, its text, and its children, in that order. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  });
  node.append(...children);
  return node;
}

const SVG = "http://www.w3.org/2000/svg";

/** An element of an inline drawing, with its attributes. */
export function svgEl(tag: string, attrs: Props = {}): SVGElement {
  const node = document.createElementNS(SVG, tag) as SVGElement;
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

/** One icon from the page's sprite. A status icon says seen, not seen, or here, in shape and color. */
export function icon(name: string, status?: string): SVGElement {
  const svg = svgEl("svg", { class: status ? "icon pv-st" : "icon", "aria-hidden": "true" });
  if (status) svg.dataset.st = status;
  svg.append(svgEl("use", { href: `#pv-${name}` }));
  return svg;
}

/** A status icon's mark: seen, not seen, or here. */
export function markIcon(svg: Element | null, mark: string): void {
  if (!(svg instanceof SVGElement)) return;
  svg.dataset.st = mark;
  svg.querySelector("use")?.setAttribute("href", `#pv-${mark}`);
}

/** The toggle a pane's switch shows as On or Off. */
export function option(button: HTMLElement, on: boolean, words: { on: string; off: string }): void {
  button.setAttribute("aria-pressed", String(on));
  const state = button.querySelector(".pv-onoff");
  if (state) state.textContent = on ? words.on : words.off;
}

/** An event's target as an element, in the viewer or in a frame: a frame's element belongs to the frame's window, so `instanceof` cannot tell. */
export function elementOf(target: EventTarget | null): Element | null {
  return target && (target as Node).nodeType === 1 ? (target as Element) : null;
}
