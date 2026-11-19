// Where a comment points in the frame: the elements a comment can name on the screen shown, the element each comment
// names, and one numbered pin on each. The Comments tab and the earlier rounds read them.
import type { Ctx, Target } from "../context.ts";
import { attr, rounds } from "../design.ts";
import { $, el } from "../dom.ts";
import { visible } from "../frame.ts";
import { pinSpot } from "../geometry.ts";
import { flowOf, has, READ, SET } from "../names.ts";
import { roundsBefore } from "../rounds.ts";
import * as W from "../words.ts";

let ctx!: Ctx;

/** The elements on the screen shown now, each with its place among the ones that share its test id. */
export function commentElements(): Target[] {
  const doc = ctx.doc;
  if (!doc) return [];
  const all = visible(doc);
  const total = new Map<string, number>();
  all.forEach((node) => {
    const id = attr(node, READ.testid) ?? "";
    total.set(id, (total.get(id) || 0) + 1);
  });
  const seen = new Map<string, number>();
  const flow = flowOf(ctx.view.screen);
  // What the element is, when it is a component, and the component it sits in, which is looked up from its parent.
  const named = (node: Element) => W.named(attr(node, READ.component) ?? "", attr(node, READ.variant));
  return all.map((node) => {
    const id = attr(node, READ.testid) ?? "";
    const index = seen.get(id) || 0;
    seen.set(id, index + 1);
    const inside = node.parentElement?.closest(has(READ.component));
    const where = [attr(node, READ.component) ? named(node) : "", inside ? W.inside(named(inside)) : ""].filter(Boolean).join(", ");
    const count = total.get(id) ?? 1;
    return { testid: id, index, count, node, where, flow, key: count > 1 ? `${id}#${index}` : id };
  });
}
/** The element a comment names on the screen shown, among `elements`: a caller that looks up many reads them once. */
export function commentNodeOf(it: Named, elements: readonly Target[] = commentElements()): Target | undefined {
  return ctx.doc ? elements.find((x) => x.testid === it.testid && x.index === (Number(it.index) || 0)) : undefined;
}
/** The element's box in the frame, in the frame's own CSS pixels from its top left, as it shows now. */
export function commentBox(node: Element): { x: number; y: number; width: number; height: number } {
  const r = node.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

/** What a comment names, from this round or an earlier one: its place, its element, its own link, and the theme it was made in. */
export type Named = { id: string; screen?: unknown; state?: unknown; testid?: unknown; index?: unknown; link?: unknown; shown_theme?: unknown };
/** The earlier rounds' item a comment's id names, when it is no comment of this round. */
export function earlierItem(id: string): Named | undefined {
  if (!id || ctx.comments.items.some((it) => it.id === id)) return undefined;
  return roundsBefore(rounds, ctx.view.round)
    .flatMap((round) => round.items as Named[])
    .find((it) => it.id === id);
}

// One numbered pin on each element with a comment on the screen and state shown, numbered as the list is, whether or not
// Add a comment is on; the one a person chose in the list is outlined in the frame. A scroll fires many times a frame, so
// the pins redraw once a frame.
let pinsWaiting = false;
export function commentPinsSoon(): void {
  if (pinsWaiting) return;
  pinsWaiting = true;
  requestAnimationFrame(() => {
    pinsWaiting = false;
    commentPins();
  });
}
/** Every rectangle of text the frame shows, and of each icon or picture, so a pin can keep clear of them. */
function contentRects(doc: Document): { text: DOMRect[]; icons: DOMRect[] } {
  const rects: DOMRect[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    rects.push(...range.getClientRects());
  }
  return { text: rects, icons: [...doc.querySelectorAll("svg, img")].flatMap((node) => [...node.getClientRects()]) };
}
export function commentPins(): void {
  const { comments, view } = ctx;
  const doc = ctx.doc;
  if (doc)
    doc.querySelectorAll(has(SET.comment)).forEach((node) => {
      node.removeAttribute(SET.comment);
    });
  if (!doc || view.tab !== "prototype") {
    $.pins.replaceChildren();
    return;
  }
  const width = doc.documentElement.clientWidth,
    height = doc.documentElement.clientHeight;
  const scale = Number($.device.style.getPropertyValue("--pv-scale")) || 1;
  const here = comments.items.some((it) => it.screen === view.screen && it.state === view.state);
  const rects = here ? contentRects(doc) : { text: [], icons: [] };
  // The elements a comment can name are read once for every pin: each read lays the frame out.
  const elements = here ? commentElements() : [];
  $.pins.replaceChildren(
    ...comments.items
      .map((it, i) => {
        if (it.screen !== view.screen || it.state !== view.state) return "";
        const at = commentNodeOf(it, elements);
        if (!at) return "";
        if (it.id === comments.active) at.node.setAttribute(SET.comment, "");
        const [x, y] = pinSpot(commentBox(at.node), rects, scale, width, height);
        const pin = el("span", { class: "pv-pin", text: String(i + 1) });
        pin.style.left = `${x}px`;
        pin.style.top = `${y}px`;
        if (it.id === comments.active) pin.dataset.active = "";
        return pin;
      })
      .filter((pin): pin is HTMLSpanElement => pin !== ""),
  );
  // A comment of an earlier round that a person chose is outlined too; it has no pin, as its round is closed.
  const earlier = earlierItem(comments.active);
  if (earlier && earlier.screen === view.screen && earlier.state === view.state)
    commentNodeOf(earlier, here ? elements : commentElements())?.node.setAttribute(SET.comment, "");
}

export function wirePins(c: Ctx): void {
  ctx = c;
}
