// A frame's document: built from the design's markup, filled from its fixtures, and set to show one screen in one state.
// Each frame is a same-origin document, so the design's own styles, breakpoints and colour scheme apply there and nothing
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

/** The view each frame shows, by its screen, state, and entry, so a move to another is told from the same one drawn again. */
const shownView = new WeakMap<Document, string>();
/** Each panel's `hidden` as the design writes it, read the first time the panel is shown, before a person can toggle it. */
const writtenHidden = new WeakMap<HTMLElement, HTMLElement["hidden"]>();

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
  markNavigation(doc, screen, ancestorsOf(screen, parent));
  const panels = [...doc.querySelectorAll<HTMLElement>(has(READ.panel))];
  // A move to another view shows each panel as the design writes it, as a page the product opens would: a menu opened to
  // move is closed on the screen it opened. The same view drawn again, for a theme or a frame, keeps what a person opened.
  const view = `${screen}/${state}/${pick}`;
  const moved = shownView.get(doc) !== view;
  shownView.set(doc, view);
  for (const panel of panels) {
    const own = writtenHidden.get(panel);
    if (own === undefined) writtenHidden.set(panel, panel.hidden);
    else if (moved) panel.hidden = own;
  }
  doc.querySelectorAll(has(READ.toggle)).forEach((toggle) => {
    const panel = panels.find((found) => attr(found, READ.panel) === attr(toggle, READ.toggle));
    if (panel) toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });
}

/** The screens a screen stands under, nearest first: its parent, the parent's parent, and so on, each once. */
function ancestorsOf(screen: string, parent: HTMLElement | undefined): string[] {
  const above: string[] = [];
  for (let at = parent; at; at = parentOf(at)) {
    const id = attr(at, READ.screen) ?? "";
    if (!id || id === screen || above.includes(id)) break;
    above.push(id);
  }
  return above;
}

/**
 * Mark, in each navigation, where a person is. The link to the shown screen is the current page, `aria-current="page"`,
 * and the only link so marked. A link to a screen the shown one stands under takes the format's section mark, so a
 * design styles "inside this section" with one rule. When a navigation holds no link to the shown screen, its link to
 * the nearest screen above it also takes `aria-current="true"`: WAI-ARIA has `page` for the current page within a set
 * of pages, which that link is not, and `true` for the current item within a set, which it is, so a screen reader still
 * hears where in the navigation the person stands, and never hears two current pages.
 */
function markNavigation(doc: Document, screen: string, above: readonly string[]): void {
  const links = [...doc.querySelectorAll(FIND.navigationLink)];
  const targetOf = (link: Element) => (attr(link, READ.go) ?? "").split("/")[0] ?? "";
  for (const nav of new Set(links.map((link) => link.closest(FIND.navigation)))) {
    const own = links.filter((link) => link.closest(FIND.navigation) === nav);
    const here = own.some((link) => targetOf(link) === screen);
    const nearest = here ? undefined : above.find((id) => own.some((link) => targetOf(link) === id));
    for (const link of own) {
      const target = targetOf(link);
      const current = target === screen ? "page" : target === nearest ? "true" : null;
      if (current) link.setAttribute("aria-current", current);
      else link.removeAttribute("aria-current");
      if (above.includes(target)) link.setAttribute(SET.section, "");
      else link.removeAttribute(SET.section);
    }
  }
}

/** The elements with a test id that show now. */
export function visible(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(has(READ.testid))].filter((node) => node.getClientRects().length > 0);
}
