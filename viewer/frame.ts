// A frame's document: built from the design's markup, filled from its fixtures, and set to show one screen in one state.
// Each frame is a same-origin document, so the design's own styles, breakpoints and color scheme apply there and nothing
// of the viewer leaks in. The frame's <html> and <body> take the design's own attributes. What the viewer does not show is
// not in the frame: it takes every screen and state it does not show out of the frame's document, and puts it back in its
// place when it is shown, so no rule of the design can show it. It sets no `hidden` on a screen or a state, and a
// design's own `hidden` stays the design's. Every name it reads or sets is a constant of names.ts.
import { attr, bodyAttributes, fixtures, frameStyle, headStyles, htmlAttributes, parentOf, titleAttr, type ViewerFrame } from "./design.ts";
import { type Furnishing, fields, furnish, images } from "./fill.ts";
import { FIND, fixtureValue, has, READ, SET } from "./names.ts";
import { titleSlot } from "./plumbing.ts";
import { backTo, screenAndState } from "./words.ts";

/** What every frame is furnished with, from the page. */
const furnishing: Furnishing = { htmlAttributes, bodyAttributes, frameStyle, headStyles, fixtures };

/** Build a frame's document from a part of the design, and call `ready` once it is in. */
export function mount(frame: HTMLIFrameElement, content: Element | null, ready: (doc: Document) => void): void {
  frame.addEventListener(
    "load",
    () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      furnish(doc, content, furnishing, (node) => doc.importNode(node as Node, true));
      doc.title = frame.title;
      ready(doc);
    },
    { once: true },
  );
  frame.srcdoc = "";
}

/** How a frame shows the design: its theme, its text size, its direction, and whether a comment is being placed. */
type Look = { theme: string; text: string; dir: string; commenting: boolean };

/** The design's own direction, as it writes it, which the right-to-left check sets aside and gives back. */
const designDir = htmlAttributes.find(([name]) => name === "dir")?.[1] ?? null;

/**
 * Set a frame's root to a frame and a look: the theme, the platform, the system bars, text at 200%, and the direction.
 * A chosen theme sets the theme's name and the standard `color-scheme`; "as the system" sets neither, so the design's own
 * `prefers-color-scheme` and `light-dark()` follow the system.
 */
export function paint(doc: Document, spec: ViewerFrame, look: Look): void {
  const html = doc.documentElement;
  if (look.theme === "light" || look.theme === "dark") {
    html.setAttribute(SET.theme, look.theme);
    html.style.colorScheme = look.theme;
  } else {
    html.removeAttribute(SET.theme);
    html.style.removeProperty("color-scheme");
  }
  html.setAttribute(SET.platform, spec.platform);
  html.style.setProperty(SET.safeTop, `${spec.insets.top}px`);
  html.style.setProperty(SET.safeBottom, `${spec.insets.bottom}px`);
  html.style.fontSize = look.text === "200" ? "200%" : "";
  if (look.dir) html.dir = look.dir;
  else if (designDir !== null) html.dir = designDir;
  else html.removeAttribute("dir");
  html.setAttribute(SET.commenting, look.commenting ? "on" : "off");
}

/** A screen or a state of a frame, with the mark that keeps its place in the document while it is out. */
type Placed = { node: Element; mark: Comment };
type PlacedScreen = Placed & { states: Placed[] };
/** Each frame's screens, each with its states, as the design draws them: found once, while every one is still in. */
const placed = new WeakMap<Document, PlacedScreen[]>();
function placedOf(doc: Document): PlacedScreen[] {
  let found = placed.get(doc);
  if (!found) {
    const place = (node: Element): Placed => {
      const mark = doc.createComment("");
      node.before(mark);
      return { node, mark };
    };
    found = [...doc.querySelectorAll(FIND.screen)].map((screen) => ({
      ...place(screen),
      states: [...screen.children].filter((child) => attr(child, READ.state)).map(place),
    }));
    placed.set(doc, found);
  }
  return found;
}
/** Put a screen or a state in its place, or take it out of the document. */
function keep(one: Placed, on: boolean): void {
  if (!on) one.node.remove();
  else if (one.mark.nextSibling !== one.node) one.mark.after(one.node);
}

/** One screen in one state, with the chrome that follows it: the title, the back control, the current tab, the panels. `pick` is the list's item a screen shows. */
export function show(doc: Document, screen: string, state: string, pick: number): void {
  const all = placedOf(doc);
  const shown = all.find((found) => attr(found.node, READ.screen) === screen);
  all.forEach((found) => {
    keep(found, found === shown);
  });
  if (!shown) return;
  shown.states.forEach((found) => {
    keep(found, attr(found.node, READ.state) === state);
  });
  const current = shown.node;
  const source = attr(current, READ.source);
  if (source) {
    const found = fixtureValue(fixtures, source);
    const list: unknown[] = Array.isArray(found) ? found : [];
    const item = list[pick] || list[0] || {};
    fields(current, item, true);
    images(current, item, true);
  }
  const named = titleAttr(current);
  const title = titleSlot(doc);
  if (title) title.textContent = named || "";
  // A screen reader names the frame, and the document, by its screen and state.
  doc.title = screenAndState(named || screen, state);
  const parent = parentOf(current);
  const back = doc.querySelector<HTMLElement>(has(READ.back));
  if (back) {
    back.hidden = !parent;
    if (parent) {
      const label = doc.querySelector(FIND.backLabel);
      if (label) label.textContent = titleAttr(parent) ?? "";
      back.setAttribute("aria-label", backTo(titleAttr(parent) ?? ""));
    }
  }
  doc.querySelectorAll(FIND.navigationLink).forEach((link) => {
    const target = (attr(link, READ.go) ?? "").split("/")[0];
    if (target === screen || (parent && target === attr(parent, READ.screen))) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const panels = [...doc.querySelectorAll<HTMLElement>(has(READ.panel))];
  doc.querySelectorAll(has(READ.toggle)).forEach((toggle) => {
    const panel = panels.find((found) => attr(found, READ.panel) === attr(toggle, READ.toggle));
    if (panel) toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });
}

/** The elements with a test id that show now. */
export function visible(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(has(READ.testid))].filter((node) => node.getClientRects().length > 0);
}
