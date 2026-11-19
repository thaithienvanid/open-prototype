// The side panel: its two tabs (Comments, and Build details), and Build details itself: what this state is, the
// components and test ids it shows, and where it goes to.
import type { Ctx } from "../context.ts";
import { attr, flowTitle, parentOf, screenEl, statesOf, titleAttr } from "../design.ts";
import { $, el, every, keepingFocus } from "../dom.ts";
import { visible } from "../frame.ts";
import { moveIn } from "../keys.ts";
import { flowOf, has, KEBAB, READ, SET, testIdOf } from "../names.ts";
import * as W from "../words.ts";
import { menuMode } from "./bars.ts";
import { copyText } from "./comments.ts";

let ctx!: Ctx;
let itabs: HTMLElement[] = [];

/** The side tab shown: comments, or screen for Build details. */
export function currentITab(): string {
  return itabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.itab ?? "comments";
}
/** The side tab is part of the view: side=build in the link opens Build details. */
export function setInspectorTab(name: string): void {
  ctx.view.side = name === "screen" ? "build" : "comments";
  itabs.forEach((tab) => {
    const on = tab.dataset.itab === name;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !on;
  });
  menuMode();
}

// A group of buttons is one tab stop: the arrow keys move inside it, and Home and End go to its ends. Chips and elements
// come in dozens, so a keyboard user would otherwise tab through all of them to leave the inspector.
function rove(box: HTMLElement): void {
  const items = () => every("button", HTMLButtonElement, box);
  const first = items()[0];
  items().forEach((button) => {
    button.tabIndex = button === first ? 0 : -1;
  });
  if (box.dataset.roving) return;
  box.dataset.roving = "on";
  box.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLButtonElement)
      items().forEach((button) => {
        button.tabIndex = button === event.target ? 0 : -1;
      });
  });
  box.addEventListener("keydown", (event) => {
    const all = items();
    const to = moveIn(event.key, "group", all.indexOf(event.target as HTMLButtonElement), all.length);
    if (to === null) return;
    event.preventDefault();
    all[to]?.focus();
  });
}

/**
 * Build details for the screen shown. Its lists are drawn again on every redraw, so a row a keyboard user is on keeps
 * the focus when the redraw draws it again, as a change of theme or frame does.
 */
export function renderInspector(current: HTMLElement | undefined): void {
  keepingFocus([$.inspectComponents, $.inspectElements, $.inspectLinks], () => drawInspector(current));
}

/** What the frame shows is read only while it shows; else the last is kept. */
function drawInspector(current: HTMLElement | undefined): void {
  const { view } = ctx;
  const doc = ctx.doc;
  if (!current) {
    $.inspectTitle.textContent = W.NO_SCREEN_YET;
    $.inspectId.textContent = "";
    $.inspectFacts.replaceChildren();
    return;
  }
  $.inspectTitle.textContent = titleAttr(current) ?? "";
  $.inspectId.textContent = view.screen + W.SLASH + view.state;
  const parent = parentOf(current);
  const flow = flowOf(view.screen);
  const facts: [string, string][] = [
    ...(flow ? [[W.FACT_FLOW, flowTitle(flow, W.FLOW_SCREENS)] as [string, string]] : []),
    [W.FACT_BACK, parent ? (titleAttr(parent) ?? "") : W.TOP_LEVEL],
    [W.FACT_FIRST, attr(current, READ.initial) || statesOf(view.screen)[0] || ""],
  ];
  $.inspectFacts.replaceChildren(...facts.flatMap(([term, value]) => [el("dt", { text: term }), el("dd", { text: value })]));
  if (!doc || view.tab !== "prototype") return; // the frame is hidden, so what it shows is unknown: keep the last
  const shown = [...doc.querySelectorAll(has(READ.component))].filter((node) => node.getClientRects().length > 0);
  const counts = new Map<string, number>();
  shown.forEach((node) => {
    const variant = attr(node, READ.variant);
    const key = (attr(node, READ.component) ?? "") + (variant ? ` / ${variant}` : "");
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  $.inspectComponents.replaceChildren(
    ...(counts.size
      ? [...counts].map(([key, n]) => {
          const [name = "", variant] = key.split(" / ");
          const row = el(
            "button",
            { type: "button" },
            el("span", { text: name }),
            el("span", { class: "pv-var", text: variant || W.DEFAULT_VARIANT }),
            el("span", { class: "pv-n", text: W.times(n) }),
          );
          row.dataset.testid = testIdOf("component", name);
          row.addEventListener("click", () => {
            ctx.setTab("system");
            const target = document.getElementById(`component-${name}`);
            if (target) $.scroller.scrollTo({ top: target.offsetTop - 16 });
          });
          return row;
        })
      : [el("p", { class: "pv-hint", text: W.NO_COMPONENT_HERE })]),
  );
  const testids = [...new Set(visible(doc).map((node) => attr(node, READ.testid) ?? ""))];
  $.inspectElements.replaceChildren(
    ...testids.map((id) => {
      const button = el("button", { type: "button", text: id });
      button.dataset.testid = testIdOf("element", id);
      const mark = (on: boolean) =>
        doc.querySelectorAll(has(READ.testid)).forEach((node) => {
          if (attr(node, READ.testid) === id && on) node.setAttribute(SET.highlight, "");
          else node.removeAttribute(SET.highlight);
        });
      button.addEventListener("mouseenter", () => mark(true));
      button.addEventListener("focus", () => mark(true));
      button.addEventListener("mouseleave", () => mark(false));
      button.addEventListener("blur", () => mark(false));
      return button;
    }),
  );
  const targets = [
    ...new Set(
      shown
        .concat(visible(doc))
        .map((node) => attr(node, READ.go))
        .filter((go): go is string => Boolean(go)),
    ),
  ];
  $.inspectLinks.replaceChildren(
    ...(targets.length
      ? targets.map((target) => {
          const to = screenEl(target.split("/")[0] ?? "");
          const button = el(
            "button",
            { type: "button" },
            el("span", { text: to ? (titleAttr(to) ?? "") : target }),
            el("span", { class: "pv-var", text: target }),
          );
          button.dataset.pvGo = target;
          button.dataset.testid = testIdOf("link", target);
          return button;
        })
      : [el("p", { class: "pv-hint", text: W.NO_LINK_OUT })]),
  );
  [$.inspectComponents, $.inspectLinks, $.inspectElements].forEach(rove);
}

export function wireInspector(c: Ctx): void {
  ctx = c;
  itabs = every("[data-itab]", HTMLElement);
  $.copyTestids.addEventListener("click", () => {
    const ids = every("button", HTMLButtonElement, $.inspectElements)
      .map((button) => button.textContent ?? "")
      .filter((id) => KEBAB.test(id));
    copyText(W.testIdsText(ctx.view.screen, ctx.view.state, ids), W.testIdsCopied(ids.length), "");
  });
  itabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      setInspectorTab(tab.dataset.itab ?? "");
      ctx.write(false);
    });
    tab.addEventListener("keydown", (event) => {
      const to = moveIn(event.key, "tabs", i, itabs.length);
      if (to === null) return;
      const next = itabs[to];
      if (!next) return;
      next.focus();
      setInspectorTab(next.dataset.itab ?? "");
      ctx.write(false);
    });
  });
}
