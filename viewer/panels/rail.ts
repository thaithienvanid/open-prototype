// The Screens panel: the round, how many views are seen and where, every screen flow by flow with its states in the order
// the design draws them, and the closing block at the end of the comments. A view is a state in a place: one platform the
// design declares, in one theme it declares. It counts as seen once the Prototype view has shown it there.
import type { Ctx } from "../context.ts";
import {
  allStates,
  attr,
  flowIds,
  flowTitle,
  frameOf,
  places,
  platformFrame,
  rounds,
  roundsPath,
  screenEl,
  screens,
  statesOf,
  titleAttr,
  WHERES,
} from "../design.ts";
import { $, el, every, icon, keepingFocus, markIcon } from "../dom.ts";
import { flowOf, READ, testIdOf } from "../names.ts";
import { earlierOpen } from "../rounds.ts";
import { nextUnseen as nextUnseenOf, seenKey, stateKey } from "../seen.ts";
import { moveDevice } from "../views/prototype.ts";
import * as W from "../words.ts";
import { autoPanels, say } from "./bars.ts";
import { commentSave, commentsFile, isSaved, roundItems } from "./comments.ts";

let ctx!: Ctx;
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

/** The product's theme as shown: under the auto theme, the system's. */
export function themeNow(): "light" | "dark" {
  return ctx.view.theme === "system" ? (darkScheme.matches ? "dark" : "light") : ctx.view.theme;
}
/** The place on screen: the frame's platform, and the theme shown. */
export function whereNow(): string {
  return `${frameOf(ctx.view.frame).platform}-${themeNow()}`;
}
export function seenAt(screen: string, state: string, where: string): boolean {
  return ctx.comments.seen.has(seenKey(screen, state, where));
}
/** How many comments this round each view holds, by `screen/state`, counted once for every row a redraw marks. */
export function commentCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const it of roundItems()) {
    const key = stateKey(it.screen ?? "", it.state ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
/** How many of the views on the Board are seen here: the states of the flow it shows, or of every flow, in this place. */
export function boardCount(here: string): string {
  const flow = flowIds.includes(ctx.view.flow) ? ctx.view.flow : "all";
  const shown = allStates().filter(([id]) => flow === "all" || flowOf(id) === flow);
  return W.boardSeen(shown.filter(([id, state]) => seenAt(id, state, here)).length, shown.length, here);
}
/** The view shown counts as seen. A fallback is not what the link asked for, so it is never seen. */
export function markSeen(): void {
  const { view, ui } = ctx;
  if (view.tab !== "prototype" || !ctx.doc || ui.linkProblem || !view.screen) return;
  const key = seenKey(view.screen, view.state, whereNow());
  if (ctx.comments.seen.has(key)) return;
  ctx.comments.seen.add(key);
  const refused = commentSave(true);
  if (refused) say(refused);
}

/** Every screen, flow by flow. A screen opens by its name and a state by its row. */
export function buildMenu(): void {
  const groups = new Map<string, HTMLElement[]>();
  screens.forEach((screen) => {
    const flow = flowOf(attr(screen, READ.screen) ?? "");
    const members = groups.get(flow) ?? [];
    members.push(screen);
    groups.set(flow, members);
  });
  $.screenList.replaceChildren(
    ...[...groups].map(([flow, members]) => {
      const headed = groups.size > 1 || Boolean(flow);
      return el(
        "li",
        { class: "pv-flow" },
        headed ? el("h3", { class: "pv-flow-h", text: flowTitle(flow, W.FLOW_SCREENS) }) : "",
        el(
          "ol",
          { class: "pv-flowlist" },
          ...members.map((screen) => {
            const id = attr(screen, READ.screen) ?? "";
            const title = titleAttr(screen) ?? "";
            const name = el("button", { type: "button" }, el("span", { text: title }), el("span", { class: "pv-frac" }));
            name.dataset.pvGo = id;
            name.dataset.testid = testIdOf("screen", id);
            const rows = statesOf(id).map((state) => {
              const row = el(
                "button",
                { type: "button", class: "option pv-srow" },
                icon("unseen", "unseen"),
                el("span", { class: "pv-name", text: W.label(state) }),
                el("span", { class: "badge badge-comment pv-count", "aria-hidden": "true", hidden: "" }),
              );
              row.dataset.pvGo = `${id}/${state}`;
              row.dataset.state = state;
              row.dataset.testid = testIdOf("screen", id, state);
              const item = el("li", {}, row);
              item.dataset.find = `${state} ${W.label(state)}`.toLowerCase();
              return item;
            });
            // A screen's heading sits under its flow's, one level down, so the outline follows the list.
            const entry = el("li", { class: "pv-scr" }, el(headed ? "h4" : "h3", { class: "pv-scr-h" }, name), el("ul", { class: "pv-slist" }, ...rows));
            entry.dataset.pvScreen = id;
            entry.dataset.find = `${title} ${id}`.toLowerCase();
            return entry;
          }),
        ),
      );
    }),
  );
  $.boardFlow.replaceChildren(
    el("option", { value: "all", text: W.ALL_FLOWS }),
    ...flowIds.map((flow) => el("option", { value: flow, text: W.flowOption(flowTitle(flow, W.FLOW_SCREENS)) })),
  );
}

/**
 * Every screen lists its states as one list of buttons, the open screen too. A row of another screen opens its screen
 * and state; a row of the open screen shows its state (`data-show`), carries its number key, and the shown one is marked
 * current. The open screen's list is named as its states.
 */
export function placeStates(): void {
  every(".pv-scr", HTMLElement, $.menu).forEach((entry) => {
    const id = entry.dataset.pvScreen ?? "";
    const here = id === ctx.view.screen;
    const list = entry.querySelector<HTMLElement>(".pv-slist");
    if (here) list?.setAttribute("aria-label", W.STATES_OF_SCREEN);
    else list?.removeAttribute("aria-label");
    every(".pv-srow", HTMLButtonElement, entry).forEach((row) => {
      const state = row.dataset.state ?? "";
      if (here) {
        row.dataset.show = state;
        delete row.dataset.pvGo;
        return;
      }
      row.dataset.pvGo = `${id}/${state}`;
      delete row.dataset.show;
      markCurrent(row, false);
      row.removeAttribute("aria-keyshortcuts");
      row.querySelector("kbd")?.remove();
    });
    const open = entry.querySelector(".pv-scr-h button");
    if (here) open?.setAttribute("aria-current", "page");
    else open?.removeAttribute("aria-current");
  });
}

/** The open screen's states, which a person can choose, in the order the design draws them. */
const stateButtons = (): HTMLButtonElement[] => every("[data-show]", HTMLButtonElement, $.screenList);
/** The shown state says so, as a screen's name does in the list and a cell does on the Board. */
const markCurrent = (button: HTMLElement, current: boolean): void => {
  if (current) button.setAttribute("aria-current", "true");
  else button.removeAttribute("aria-current");
};

/** The number keys follow the list: the screen's first state is 1, its second 2, and on to 9, so no number is skipped where a screen lacks a state. */
export function numberStates(): void {
  stateButtons().forEach((button, i) => {
    const key = i < 9 ? String(i + 1) : "";
    let kbd = button.querySelector("kbd");
    if (key && !kbd) {
      kbd = el("kbd", { "aria-hidden": "true" });
      button.append(kbd);
    }
    if (kbd) {
      kbd.textContent = key;
      kbd.hidden = !key;
    }
    if (key && ctx.ui.keysOn) button.setAttribute("aria-keyshortcuts", key);
    else button.removeAttribute("aria-keyshortcuts");
  });
}

/** The state that the number key `n` chooses, or none. */
export function stateOfKey(n: number): string | undefined {
  return stateButtons()[n - 1]?.dataset.show;
}

/** The open screen's rows, in the design's own names and its drawn order: the one shown is marked current, and each carries its key. */
export function renderStates(): void {
  // Focus on a row of the screen that was open moves to the shown state of the one open now, as J and K move on.
  const active = document.activeElement;
  const held = active instanceof HTMLElement && $.screenList.contains(active) && active.dataset.show !== undefined;
  placeStates();
  stateButtons().forEach((button) => {
    markCurrent(button, button.dataset.show === ctx.view.state);
  });
  numberStates();
  if (held && active.dataset.show === undefined)
    stateButtons()
      .find((button) => button.dataset.show === ctx.view.state)
      ?.focus();
}

/** The Screens panel's marks: each state seen here, not seen, or open now, its comments, where each was seen, and the round's totals. */
export function renderRail(): void {
  const { view } = ctx;
  const all = allStates();
  const here = whereNow();
  const views = all.length * WHERES.length;
  const looked = all.reduce((n, [id, state]) => n + WHERES.filter((where) => seenAt(id, state, where)).length, 0);
  const total = W.ofTotal(looked, views);
  $.seenCount.textContent = total;
  $.seenMeter.setAttribute("aria-valuemax", String(views));
  $.seenMeter.setAttribute("aria-valuenow", String(looked));
  $.seenMeter.setAttribute("aria-valuetext", W.viewsSeen(looked, views, W.placesText(places)));
  const bar = $.seenMeter.firstElementChild;
  if (bar instanceof HTMLElement) bar.style.width = `${views ? Math.round((looked / views) * 100) : 0}%`;
  $.seenWhere.hidden = WHERES.length < 2;
  $.seenWhere.replaceChildren(
    ...WHERES.map((where) => {
      const n = all.filter(([id, state]) => seenAt(id, state, where)).length;
      const mark = all.length && n === all.length ? "seen" : "unseen";
      const row = el("li", {}, icon(mark, mark), el("span", { class: "pv-name", text: W.placeLabel(where) }), el("span", { text: W.ofTotal(n, all.length) }));
      row.dataset.where = where;
      if (where === here) row.setAttribute("aria-current", "true");
      return row;
    }),
  );
  $.dockSeen.textContent = total;
  $.boardSeen.textContent = boardCount(here);
  $.nextLabel.textContent = W.nextLabel(views, looked);
  // The counts are of the round open now: a saved round's are its file's.
  const listed = roundItems().length;
  $.dockComments.textContent = String(listed);
  $.dockComments.hidden = listed === 0;
  $.commentsLine.textContent = W.commentsThisRound(listed);
  $.openNow.toggleAttribute("data-none", !listed);
  const open = earlierOpen(rounds, view.round);
  $.openEarlier.hidden = open.length === 0;
  $.earlierLine.textContent = W.openEarlier(open.length, [...new Set(open)]);
  const counts = commentCounts();
  every("[data-show], .pv-srow", HTMLElement, $.menu).forEach((row) => {
    const key = row.dataset.show ? stateKey(view.screen, row.dataset.show) : (row.dataset.pvGo ?? "");
    const [screen = "", state = ""] = key.split("/");
    const seen = seenAt(screen, state, here);
    markIcon(row.querySelector("svg"), key === stateKey(view.screen, view.state) ? "here" : seen ? "seen" : "unseen");
    const n = counts.get(stateKey(screen, state)) ?? 0;
    const badge = row.querySelector<HTMLElement>(".pv-count");
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    // The row's name is its state and its suffix as one text, so no space falls before the suffix's comma.
    row.setAttribute("aria-label", (row.querySelector(".pv-name")?.textContent ?? "") + W.stateRowSuffix(seen, here, n));
  });
  every(".pv-scr", HTMLElement, $.menu).forEach((entry) => {
    const id = entry.dataset.pvScreen ?? "";
    const have = statesOf(id);
    const frac = entry.querySelector(".pv-frac");
    if (frac) frac.textContent = W.ofTotal(have.filter((state) => seenAt(id, state, here)).length, have.length);
  });
  renderClosing();
}

/**
 * The closing block, at the end of the comments and under the frame on a narrower window: what is left before the round
 * ends, and the one step that ends it. Comments this round come first, then the states not seen yet, then comments an
 * earlier round left open. With none of them, every view is seen, and the person tells their agent what comes next.
 */
function renderClosing(): void {
  const all = allStates();
  const unseen = all.reduce((n, [id, state]) => n + WHERES.filter((where) => !seenAt(id, state, where)).length, 0);
  const count = ctx.comments.items.length;
  const open = earlierOpen(rounds, ctx.view.round).length;
  const closing: W.Closing = !all.length ? "empty" : isSaved(ctx.view.round) ? "saved" : count ? "comments" : unseen ? "unseen" : open ? "open" : "ready";
  const head = W.closingHead(closing, count, unseen, open);
  $.closing.dataset.closing = closing;
  $.closingHead.textContent = head;
  $.nextLine.textContent = W.closingLine(closing, count, W.placesText(places), `${roundsPath}/${ctx.view.round}/${commentsFile}`);
  $.closingNext.hidden = closing !== "unseen";
  $.commentsSend.hidden = closing !== "comments";
  $.sendLabel.textContent = W.sendLabel(count);
  // Under the frame the next step is the control itself, never words that name a control drawn elsewhere.
  const step =
    closing === "unseen"
      ? captionButton(W.NEXT_VIEW, "proto-caption-next", nextUnseen)
      : closing === "comments"
        ? captionButton(W.sendLabel(count), "proto-caption-send", () => $.commentsSend.click())
        : W.CAPTION_NO_DECISION;
  // Drawn on every redraw, so the button a keyboard user just pressed keeps the focus when it is drawn again.
  keepingFocus([$.captionNext], () => $.captionNext.replaceChildren(el("b", { text: `${head}.` }), " ", step));
}

/** A button of the line under the frame. */
function captionButton(text: string, testid: string, act: () => void): HTMLButtonElement {
  const button = el("button", { type: "button", class: "link pv-link", text });
  button.dataset.testid = testid;
  button.addEventListener("click", act);
  return button;
}

/**
 * The frame and the theme of a place, as N opens them: the platform's own frame, unless one of it is on screen. Returns
 * what to announce about the side panels.
 */
function openWhere(where: string): string {
  const [platform = "", theme = ""] = where.split("-");
  const view = ctx.view;
  let message = "";
  if (frameOf(view.frame).platform !== platform) {
    const frame = platformFrame(platform);
    message = autoPanels(frame);
    view.frame = frame;
    ctx.ui.frameNamed = true;
    moveDevice();
  }
  if (themeNow() !== theme) view.theme = theme === "dark" ? "dark" : "light";
  return message;
}
/** N: the next view not seen, here after this state, wrapping round; then in the next place that has one left. */
export function nextUnseen(): void {
  const all = allStates();
  if (!all.length) {
    say(W.NO_SCREEN_IN_DESIGN);
    return;
  }
  const here = whereNow();
  const found = nextUnseenOf(all, [ctx.view.screen, ctx.view.state], here, WHERES, ctx.comments.seen);
  if (!found) {
    say(W.everyViewSeen(W.placesText(places)));
    return;
  }
  const elsewhere = found.place !== here;
  const moved = elsewhere ? openWhere(found.place) : "";
  ctx.ui.pending = W.opened(titleAttr(screenEl(found.screen)) ?? "", found.state, found.place, elsewhere, found.left, moved);
  ctx.go(`${found.screen}/${found.state}`, found.screen !== ctx.view.screen, false);
}
/**
 * J and K, and the arrows beside the name: the next and the previous state, on into the next or the previous screen. On
 * the Board or the System view a step stays in that view, into another screen as within one; in the Prototype a step
 * into another screen is a move, which adds a history entry.
 */
export function stepState(step: number): void {
  const view = ctx.view;
  const all = allStates();
  const to = all[all.findIndex(([id, state]) => id === view.screen && state === view.state) + step];
  if (!to) return;
  if (to[0] !== view.screen && view.tab === "prototype") {
    ctx.go(`${to[0]}/${to[1]}`, true, false);
    return;
  }
  if (to[0] !== view.screen) ctx.set("screen", to[0]);
  ctx.set("state", to[1]);
}

export function wireRail(c: Ctx): void {
  ctx = c;
  $.screenFilter.addEventListener("input", () => {
    const words = $.screenFilter.value.trim().toLowerCase();
    every(".pv-scr", HTMLElement, $.menu).forEach((entry) => {
      const whole = !words || (entry.dataset.find ?? "").includes(words);
      let any = whole;
      // The open screen's rows stay whole, so its number keys and J and K keep their order.
      const open = entry.dataset.pvScreen === ctx.view.screen;
      every(".pv-slist > li", HTMLElement, entry).forEach((row) => {
        const hit = open || whole || (row.dataset.find ?? "").includes(words);
        row.hidden = !hit;
        any = any || hit;
      });
      entry.hidden = !any;
    });
    every(".pv-flow", HTMLElement, $.menu).forEach((group) => {
      group.hidden = every(".pv-scr", HTMLElement, group).every((entry) => entry.hidden);
    });
  });
  // A row of the open screen shows its state; a row of another screen is a link, which the viewer's click opens.
  $.screenList.addEventListener("click", (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-show]") : null;
    if (row) ctx.set("state", row.dataset.show ?? "");
  });
  $.nextUnseen.addEventListener("click", nextUnseen);
  $.closingNext.addEventListener("click", nextUnseen); // the same step, at the comments' end
  $.statePrev.addEventListener("click", () => stepState(-1));
  $.stateNext.addEventListener("click", () => stepState(1));
  // Under the auto theme, a change of the system's is a new place seen.
  darkScheme.addEventListener("change", () => ctx.apply());
}
