// The viewer furnishes each frame and fills it from the design's example data: each text from the fixtures' top, each
// field from its entry, each image from a data:image URI, and each list once for each entry. Both are a pure module, so
// this test runs them on a plain tree with no browser, and fails when the viewer stops filling `data-proto-text` or
// `data-proto-field`, or a frame is furnished with no fill.
import { describe, expect, test } from "bun:test";
import { fields, fill, furnish, images, type Part, type Tree } from "../../viewer/fill.ts";

/** One selector of the few the fill asks: `[name]`, `tag[name]`, or `:scope > tag[name]` for a direct child. */
function matcher(selector: string): (node: Plain, from: Plain) => boolean {
  const found = /^(:scope > )?([a-z]*)\[([a-z-]+)\]$/.exec(selector);
  if (!found) throw new Error(`the plain tree reads no selector ${selector}`);
  const [, child, tag, name] = found;
  return (node, from) => (!child || node.parent === from) && (!tag || node.tag === tag) && node.attrs.has(name!);
}

/** A plain element: its tag, its attributes, its children, and a template's content apart, as a browser keeps it. */
class Plain implements Part {
  parent: Plain | null = null;
  children: Plain[] = [];
  text = "";
  readonly attrs: Map<string, string>;
  constructor(
    readonly tag: string,
    attrs: Record<string, string> = {},
    children: Plain[] = [],
    readonly content: Plain | null = null,
  ) {
    this.attrs = new Map(Object.entries(attrs));
    this.append(...children);
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  set textContent(value: string | null) {
    this.children = [];
    this.text = value ?? "";
  }
  get childNodes(): Plain[] {
    return [...this.children];
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  append(...nodes: unknown[]): void {
    for (const node of nodes as Plain[]) {
      // A copy of an item is a fragment: its children move in, as a browser moves them.
      for (const one of node.tag === "" ? [...node.children] : [node]) {
        one.remove();
        one.parent = this;
        this.children.push(one);
      }
    }
  }
  /** Every element below, in document order; a template's content is not below it. */
  private below(): Plain[] {
    return this.children.flatMap((child) => [child, ...child.below()]);
  }
  querySelectorAll(selector: string): Plain[] {
    const matches = matcher(selector);
    return this.below().filter((node) => matches(node, this));
  }
  querySelector(selector: string): Plain | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector: string): Plain | null {
    const matches = matcher(selector);
    for (let node: Plain | null = this; node; node = node.parent) if (matches(node, node.parent ?? node)) return node;
    return null;
  }
  copy(): Plain {
    return new Plain(
      this.tag,
      Object.fromEntries(this.attrs),
      this.children.map((child) => child.copy()),
      this.content?.copy() ?? null,
    );
  }
}

const h = (tag: string, attrs: Record<string, string> = {}, ...children: Plain[]) => new Plain(tag, attrs, children);
/** A list's item: a `<template>` whose content is apart from the tree, as a browser keeps it. */
const item = (...children: Plain[]) => new Plain("template", { "data-proto-item": "" }, [], new Plain("", {}, children));
const copy = (content: unknown): Tree => (content as Plain).copy();
const byTestId = (root: Plain, id: string) => root.querySelectorAll("[data-testid]").filter((node) => node.getAttribute("data-testid") === id);

const PNG = "data:image/png;base64,AA==";
const fixtures = {
  product: "Cases",
  welcome: "Welcome back",
  loans: [
    { title: "Dune", due: "Friday", cover: PNG },
    { title: "Emma", due: "Monday", cover: "cover.png" },
    { title: "Kim", due: "Today", cover: PNG },
  ],
};

describe("the fill, with no browser", () => {
  test("a text outside every list shows its key of the fixtures' top", () => {
    const root = h(
      "body",
      {},
      h("h1", { "data-proto-text": "welcome", "data-testid": "hello" }),
      h("p", { "data-proto-text": "nope", "data-testid": "none" }, h("span")),
    );
    fill(root, fixtures, copy);
    expect([byTestId(root, "hello")[0]?.textContent, byTestId(root, "none")[0]?.textContent]).toEqual(["Welcome back", ""]);
  });

  test("a list draws its item once for each entry, up to its limit, each field from its entry and each text from the top", () => {
    const row = h(
      "li",
      {},
      h("span", { "data-proto-field": "title", "data-testid": "title" }),
      h("span", { "data-proto-text": "product", "data-testid": "product" }),
      h("button", { "data-proto-go": "loan", "data-testid": "open" }),
    );
    const list = h("ul", { "data-proto-list": "loans", "data-proto-limit": "2" }, item(row), h("li", { "data-testid": "drawn-before" }));
    const root = h("body", {}, list);
    fill(root, fixtures, copy);
    expect({
      titles: byTestId(root, "title").map((node) => node.textContent),
      products: byTestId(root, "product").map((node) => node.textContent),
      picks: byTestId(root, "open").map((node) => node.getAttribute("data-proto-pick")),
      before: byTestId(root, "drawn-before").length,
      template: list.children[0]?.tag,
    }).toEqual({ titles: ["Dune", "Emma"], products: ["Cases", "Cases"], picks: ["0", "1"], before: 0, template: "template" });
  });

  test("an image shows a data:image URI of its entry, and nothing else", () => {
    const list = h("ul", { "data-proto-list": "loans" }, item(h("img", { "data-proto-image": "cover", "data-testid": "cover", src: "old.png" })));
    const root = h("body", {}, list);
    fill(root, fixtures, copy);
    expect(byTestId(root, "cover").map((node) => node.getAttribute("src"))).toEqual([PNG, null, PNG]);
  });

  test("a screen's own fields show its chosen entry, and a list on it keeps its own entries", () => {
    const inner = h("ul", { "data-proto-list": "loans" }, h("li", {}, h("span", { "data-proto-field": "title", "data-testid": "inner" })));
    const screen = h(
      "section",
      { "data-proto-screen": "loan", "data-proto-source": "loans" },
      h("h2", { "data-proto-field": "title", "data-testid": "own" }),
      h("img", { "data-proto-image": "cover", "data-testid": "own-cover" }),
      inner,
    );
    fields(screen, fixtures.loans[2], true);
    images(screen, fixtures.loans[2], true);
    expect([byTestId(screen, "own")[0]?.textContent, byTestId(screen, "own-cover")[0]?.getAttribute("src"), byTestId(screen, "inner")[0]?.textContent]).toEqual(
      ["Kim", PNG, ""],
    );
  });

  test("a frame is furnished with the design's attributes, the viewer's rules first, the design's styles, and its markup filled", () => {
    const head = h("head");
    const body = h("body");
    const html = h("html", {}, head, body);
    const doc = { documentElement: html, head, body, querySelectorAll: (selector: string) => html.querySelectorAll(selector) };
    const content = h(
      "div",
      {},
      h("h1", { "data-proto-text": "welcome", "data-testid": "hello" }),
      h("ul", { "data-proto-list": "loans" }, item(h("li", { "data-proto-field": "title", "data-testid": "title" }))),
    );
    const page = {
      htmlAttributes: [["lang", "en"]] as [string, string][],
      bodyAttributes: [["class", "app"]] as [string, string][],
      frameStyle: h("style", { "data-testid": "viewer-rules" }),
      headStyles: [h("style", { "data-testid": "design-style" })],
      fixtures,
    };
    furnish(doc, content, page, (node) => (node as Plain).copy());
    expect({
      root: html.getAttribute("lang"),
      body: body.getAttribute("class"),
      head: head.children.map((node) => node.getAttribute("data-testid")),
      hello: byTestId(html, "hello")[0]?.textContent,
      titles: byTestId(html, "title").map((node) => node.textContent),
      kept: content.children.length,
    }).toEqual({ root: "en", body: "app", head: ["viewer-rules", "design-style"], hello: "Welcome back", titles: ["Dune", "Emma", "Kim"], kept: 2 });
  });
});
