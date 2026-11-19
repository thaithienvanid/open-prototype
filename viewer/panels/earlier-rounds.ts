// The earlier rounds' comments, read beside the design: each open or answered, with what answered it, and a button that
// shows what it names. The Comments tab shows them below this round's comments.

import { visibleText } from "../comments.ts";
import type { Ctx } from "../context.ts";
import { rounds, screenEl, screenIds, titleAttr } from "../design.ts";
import { $, el } from "../dom.ts";
import { isCommentType, testIdOf } from "../names.ts";
import { roundsBefore } from "../rounds.ts";
import * as W from "../words.ts";
import type { Named } from "./pins.ts";

let ctx!: Ctx;
/** Show what a comment names: the Comments tab's own, which it gives when it wires this module. */
let show: (it: Named) => void = () => {};

/** The earlier rounds' comments the tool read beside the design, each done once a later round's changes.json answers it. */
export function earlierRounds(): void {
  const before = roundsBefore(rounds, ctx.view.round);
  $.earlierRounds.hidden = before.length === 0;
  type Earlier = {
    id?: unknown;
    done?: unknown;
    screen?: unknown;
    state?: unknown;
    type?: unknown;
    by?: unknown;
    testid?: unknown;
    comment?: unknown;
    answered_by?: unknown;
    shown_theme?: unknown;
    link?: unknown;
    index?: unknown;
  };
  // The answer a later round's changes give, when the page config holds it: its round and its summary, shown as text.
  const answerOf = (it: Earlier): HTMLElement | "" => {
    const by = it.answered_by && typeof it.answered_by === "object" ? (it.answered_by as { round?: unknown; summary?: unknown }) : null;
    if (!by || typeof by.summary !== "string" || !by.summary.trim()) return "";
    const round = typeof by.round === "number" && Number.isInteger(by.round) && by.round > 0 ? by.round : null;
    const answer = el("p", { class: "pv-answer", text: W.answeredIn(round, visibleText(by.summary)) });
    answer.dataset.testid = testIdOf("comments-answer", it.id);
    return answer;
  };
  const row = (it: Earlier) => {
    const tag = el("span", { class: "pv-status-tag", text: W.doneTag(Boolean(it.done)) });
    tag.dataset.done = String(Boolean(it.done));
    const showIt = el("button", { type: "button", class: "link link-quiet pv-link", text: W.SHOW, "aria-label": W.showComment(String(it.id)) });
    showIt.addEventListener("click", () => show({ ...it, id: String(it.id) } as Named));
    showIt.dataset.testid = testIdOf("comments-show", it.id);
    const screen = screenEl(String(it.screen));
    const name = (screen ? (titleAttr(screen) ?? "") : String(it.screen || "")) + (it.state ? `, ${W.label(String(it.state))}` : "");
    // The writer the file names, as text: a label, never proof. A person's item names none, so it shows none. Each part
    // between slashes stays whole where a line fits it, so a writer's name breaks at its slash first.
    const agent = typeof it.by === "string" && it.by.startsWith("agent:");
    const writer = typeof it.by === "string" ? (agent ? it.by.slice(6) : it.by) : "";
    const by = writer
      ? el(
          "span",
          { class: "pv-on", "data-testid": testIdOf("comments-by", it.id) },
          W.DOT + (agent ? W.AGENT : ""),
          ...writer.split(/(?<=\/)/).map((part) => el("span", { class: "pv-by-part", text: part })),
        )
      : "";
    const type = typeof it.type === "string" && isCommentType(it.type) ? it.type : "change";
    return el(
      "li",
      { class: "pv-comment" },
      tag,
      el(
        "span",
        {},
        el("span", { class: "pv-type-tag", text: W.label(type) }),
        by,
        el("span", { class: "pv-on", text: `${W.DOT}${name}${it.testid ? `, ${W.humanize(it.testid)}` : ""}${W.madeIn(it.shown_theme)} ` }),
        el("span", { class: "pv-rid", text: String(it.id) }),
      ),
      el("p", { text: visibleText(typeof it.comment === "string" ? it.comment : it.comment ? String(it.comment) : "") }),
      answerOf(it),
      screenIds.includes(String(it.screen)) ? el("span", { class: "pv-acts" }, showIt) : "",
    );
  };
  $.earlierRoundsList.replaceChildren(
    ...before.map((round) => {
      const items = round.items as Earlier[];
      const open = items.filter((it) => !it.done);
      const done = items.filter((it) => it.done);
      return el(
        "div",
        {},
        el("h2", {}, W.fromRound(round.round), el("span", { text: W.roundCounts(open.length, done.length) })),
        el("ol", { class: "pv-comments" }, ...open.map(row)),
        done.length
          ? el("details", { class: "pv-done" }, el("summary", { text: W.answered(done.length) }), el("ol", { class: "pv-comments" }, ...done.map(row)))
          : "",
      );
    }),
  );
}

export function wireEarlierRounds(c: Ctx, showComment: (it: Named) => void): void {
  ctx = c;
  show = showComment;
}
