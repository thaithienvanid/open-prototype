// Furnishing a frame's document, and filling a part of the design from its example data: each text, each field, each
// image, and each list's entries. It reads only its arguments. A part is any tree with the few methods below: a frame's document has them, and so does a
// plain tree in a test that runs with no browser.
import { DATA_IMAGE, FIND, fixtureValue, has, READ, SET } from "./names.ts";

/** A tree that can be searched: a frame's document, an element of it, or a list's item copied for one entry. */
export type Tree = { querySelectorAll(selector: string): Iterable<Part> };
/** One element of a part: what filling reads and writes on it. */
export type Part = Tree & {
  textContent: string | null;
  readonly childNodes: Iterable<{ remove(): void }>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  closest(selector: string): unknown;
  querySelector(selector: string): unknown;
  append(...nodes: unknown[]): void;
};
/** A copy of a list's item, the content of its `<template>`, made in the frame's own document. */
type Copy = (content: unknown) => Tree;

/** A fixture as text: nothing shows as no text. */
const fixtureText = (source: unknown, key: string | undefined): string => {
  const value = fixtureValue(source, key);
  return value === undefined || value === null ? "" : String(value);
};

const named = (node: Part, name: string): string | undefined => node.getAttribute(name) ?? undefined;

/** The elements of a part that match, leaving out each one inside a list when `own` is set: a list's item reads its own entry. */
function within(root: Tree, selector: string, own: boolean): Part[] {
  const found = [...root.querySelectorAll(selector)];
  return own ? found.filter((node) => !node.closest(has(READ.list))) : found;
}

/** Each image field inside a part, from the data it shows: only an image its fixture names, which the tool wrote in as a data:image URI. */
export function images(root: Tree, data: unknown, own = false): void {
  within(root, FIND.image, own).forEach((img) => {
    const value = fixtureValue(data, named(img, READ.image));
    if (typeof value === "string" && DATA_IMAGE.test(value)) img.setAttribute("src", value);
    else img.removeAttribute("src");
  });
}

/** Each field inside a part, from the item it shows. */
export function fields(root: Tree, item: unknown, own = false): void {
  within(root, has(READ.field), own).forEach((field) => {
    field.textContent = fixtureText(item, named(field, READ.field));
  });
}

/** Each text inside a part, from the fixtures' top: a text names the same key wherever it stands. */
function texts(root: Tree, fixtures: unknown): void {
  for (const node of root.querySelectorAll(has(READ.text))) node.textContent = fixtureText(fixtures, named(node, READ.text));
}

/**
 * Each list of a part, from the fixtures: its item is drawn once for each entry, up to its limit, after the item's own
 * `<template>`, which stays. A go inside an entry opens its screen for that entry, so the viewer sets the entry's index.
 */
function drawLists(root: Tree, fixtures: unknown, copy: Copy): void {
  for (const list of root.querySelectorAll(has(READ.list))) {
    // The item is the list's own `<template>`, and its content is what each entry copies.
    const item = list.querySelector(FIND.item);
    if (!item) continue;
    const content = (item as { content: unknown }).content;
    const found = fixtureValue(fixtures, named(list, READ.list));
    const all: unknown[] = Array.isArray(found) ? found : [];
    const drawn = all.slice(0, Number(named(list, READ.limit)) || all.length).map((data, i) => {
      const node = copy(content);
      texts(node, fixtures);
      fields(node, data);
      images(node, data);
      for (const go of node.querySelectorAll(has(READ.go))) go.setAttribute(SET.pick, String(i));
      return node;
    });
    [...list.childNodes]
      .filter((node) => node !== item)
      .forEach((node) => {
        node.remove();
      });
    list.append(...drawn);
  }
}

/** The text, images and lists of a part, from the fixtures. */
export function fill(root: Tree, fixtures: unknown, copy: Copy): void {
  texts(root, fixtures);
  images(root, fixtures);
  drawLists(root, fixtures, copy);
}

/** What a frame's document is furnished with: the design's own attributes, the viewer's rules, the design's styles, and its fixtures. */
export type Furnishing = {
  htmlAttributes: [string, string][];
  bodyAttributes: [string, string][];
  frameStyle: unknown;
  headStyles: unknown[];
  fixtures: unknown;
};
/** A part of a frame's document that takes attributes and children: its root, its head, its body. */
type Holder = { setAttribute(name: string, value: string): void; append(...nodes: unknown[]): void };
/** A frame's document, as furnishing it reads and writes it. */
type FrameDocument = Tree & { documentElement: Holder; head: Holder; body: Holder };

/**
 * A frame's document: the viewer's rules first, so its layer is named before any style of the design; then the design's
 * styles; then the markup, filled in. The root and the body take the design's own attributes, `lang` and `dir` included.
 * `copy` makes a node of the design into one of the frame's own document.
 */
export function furnish(doc: FrameDocument, content: { childNodes: Iterable<unknown> } | null, page: Furnishing, copy: (node: unknown) => unknown): void {
  for (const [name, value] of page.htmlAttributes) doc.documentElement.setAttribute(name, value);
  for (const [name, value] of page.bodyAttributes) doc.body.setAttribute(name, value);
  if (page.frameStyle) doc.head.append(copy(page.frameStyle));
  for (const style of page.headStyles) doc.head.append(copy(style));
  if (content) doc.body.append(...[...content.childNodes].map(copy));
  fill(doc, page.fixtures, (item) => copy(item) as Tree);
}
