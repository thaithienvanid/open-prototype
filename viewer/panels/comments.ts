// The Comments tab: click an element in the prototype (by its test id), type a comment, and copy the round as JSON or as
// a prompt, or download it. The comments live in this browser's storage, per design and round, so closing the tab keeps
// them; nothing is sent anywhere. The same record holds the views seen. Earlier rounds, read beside the design, show
// below with each comment open or answered.
import { COMMENTS_FILE, commentLength, commentSound, commentStoreKey, exportJson, exportPrompt, visibleText } from "../comments.ts";
import type { Ctx, Item, Target } from "../context.ts";
import {
  allStates,
  designId,
  designPath,
  FRAMES,
  flowTitle,
  LIMITS,
  rounds,
  roundsPath,
  screenEl,
  THEME_CHOICES,
  titleAttr,
  version,
  WHERES,
  workItem,
} from "../design.ts";
import { $, el, every, medium } from "../dom.ts";
import { commits } from "../keys.ts";
import { linkFor, parseLink, type View } from "../link.ts";
import { COMMENT_CONTROL, has, isCommentType, SET, testIdOf } from "../names.ts";
import { seenKey } from "../seen.ts";
import { onOtherTab, readRecord, writeRecord } from "../store.ts";
import { markBoard } from "../views/board.ts";
import * as W from "../words.ts";
import { drawerCovers, openInspector, renderSubtitle, say, setPanels, shows } from "./bars.ts";
import { earlierRounds, wireEarlierRounds } from "./earlier-rounds.ts";
import { setInspectorTab } from "./inspector.ts";
import { commentBox, commentElements, commentNodeOf, commentPins, type Named, wirePins } from "./pins.ts";
import { markSeen, renderRail, themeNow } from "./rail.ts";

let ctx!: Ctx;
export const commentsFile = COMMENTS_FILE;
const saveCommand = W.saveCommand(commentsFile, designPath);
const design = {
  frames: Object.keys(FRAMES),
  designName: W.designName(workItem, designPath),
  commentsFile,
  saveCommand,
  roundsPath,
  shotsCommand: (folder: string) => W.shotsCommand(designPath, folder),
};

/** Whether a round is saved: the tool read its comments file beside the design, so it takes no more comments. */
export function isSaved(round: number): boolean {
  return rounds.some((one) => Number(one.round) === round);
}
/** The comments of the round open now: a saved round's are what its file holds, which the tool read beside the design; any other's, this browser's. */
export function roundItems(): Item[] {
  const round = ctx.comments.round;
  return isSaved(round) ? itemsOf(rounds.find((one) => Number(one.round) === round)?.items ?? []) : ctx.comments.items;
}
/** The round the field names: a whole number, 1 or more. */
export function currentRound(): number {
  return Math.max(1, Number($.round.value) || 1);
}

type Stored = { items?: unknown; seen?: unknown; seenVersion?: unknown; exported?: unknown; version?: unknown };
const asStored = (value: unknown): Stored | null => (value && typeof value === "object" ? (value as Stored) : null);
const itemsOf = (list: unknown[]): Item[] => list.filter((x): x is Item => Boolean(x) && typeof x === "object" && typeof (x as Item).id === "string");
/**
 * The records the browser refused to store, by key, as this tab last tried to write them. Each stands in for the stored
 * record until a write lands, so a later change, a round opened again, or a change in another tab never reads the older
 * stored record back over the comments this tab alone holds.
 */
const held = new Map<string, Stored>();
const recordOf = (key: string): unknown => held.get(key) ?? readRecord(key);

/**
 * The round's comments and the views seen, and the text last downloaded or copied: a round with comments beyond that text
 * is unsaved. Views seen on another version of the design count as not seen, and the page says so.
 */
export function commentLoad(): void {
  const comments = ctx.comments;
  comments.round = currentRound();
  comments.items = [];
  comments.seen = new Set();
  comments.exported = "";
  comments.editing = "";
  comments.picked = false;
  comments.stale = false;
  comments.seenStale = false;
  comments.seenReplace = false;
  comments.gone = null;
  comments.version = version;
  const saved = asStored(recordOf(commentStoreKey(designId, comments.round)));
  if (saved && Array.isArray(saved.items)) {
    comments.items = itemsOf(saved.items);
    comments.exported = String(saved.exported || "");
    const valid = new Set(allStates().flatMap(([id, state]) => WHERES.map((where) => seenKey(id, state, where))));
    const stored: unknown[] = Array.isArray(saved.seen) ? saved.seen : [];
    comments.seen = new Set(stored.filter((key): key is string => typeof key === "string" && valid.has(key)));
    if (comments.items.length && typeof saved.version === "string" && saved.version !== version) {
      comments.stale = true;
      comments.version = saved.version;
    }
    // The count is of what was stored, not of what is still a state: a list of keys that all fit no state is still another version's.
    if (stored.length && saved.seenVersion !== version) {
      comments.seen = new Set();
      comments.seenStale = true;
      comments.seenReplace = true;
    }
  }
  commentWatch();
}

/** A change to the comments: one added, replaced, deleted, or put back in its place; or the text exported. */
type Change = { add: Item } | { replace: Item } | { remove: string } | { restore: Item; at: number } | { exported: string } | true;

/**
 * Every change is made on the record as it is stored, by id, so a tab never writes its own list over the comments another
 * tab added. `true` is a state newly seen. It returns what the caller says with its own outcome: the refusal of the write,
 * the first time the browser refuses one, or else nothing.
 */
export function commentSave(change: Change): string {
  const comments = ctx.comments;
  const key = commentStoreKey(designId, comments.round);
  const stored = asStored(recordOf(key));
  const usable = Boolean(stored) && Array.isArray(stored?.items);
  const storedItems: unknown[] = usable && Array.isArray(stored?.items) ? stored.items : [];
  let items = usable ? itemsOf(storedItems) : comments.items;
  const c = change === true ? null : change;
  if (c && "add" in c) {
    const next = 1 + Math.max(0, ...items.filter((x) => x.round === c.add.round).map((x) => Number(String(x.id).split("-").pop()) || 0));
    c.add.id = `r${c.add.round}-${next}`; // the next id comes from the stored comments
    items = items.concat([c.add]);
  } else if (c && "replace" in c) {
    items = items.some((x) => x.id === c.replace.id) ? items.map((x) => (x.id === c.replace.id ? c.replace : x)) : items.concat([c.replace]);
  } else if (c && "remove" in c) items = items.filter((x) => x.id !== c.remove);
  else if (c && "restore" in c && !items.some((x) => x.id === c.restore.id)) items = [...items.slice(0, c.at), c.restore, ...items.slice(c.at)];
  if (c && ("add" in c || "replace" in c)) comments.gone = null; // a new or saved comment ends the undo of a delete
  comments.items = items;
  if (!items.length) {
    comments.stale = false;
    comments.version = version;
  }
  // Comments keep the version of the design they were made on; the first comment of a round is made on this one.
  const kept =
    usable && storedItems.length > 0 && typeof stored?.version === "string" ? stored.version : items.length && comments.stale ? comments.version : version;
  const exported = c && "exported" in c ? c.exported : usable ? String(stored?.exported || "") : comments.exported;
  // The views seen join the stored ones of this version. A save never replaces the list of another version: only a load
  // does, so the tab that loads last wins and two versions never trade the record back and forth.
  let seen: unknown[] = [...comments.seen];
  let seenVersion: unknown = version;
  if (usable && Array.isArray(stored?.seen) && stored.seen.length) {
    if (stored.seenVersion === version) seen = [...new Set(stored.seen.concat(seen))];
    else if (!comments.seenReplace) {
      seen = stored.seen;
      seenVersion = stored.seenVersion;
    }
  }
  if (seenVersion === version) comments.seen = new Set(seen.filter((one): one is string => typeof one === "string"));
  comments.seenReplace = false;
  // Nothing is cut in silence: when the browser refuses the write, the record is held in memory, and the caller says once,
  // with its own outcome, that the comments live in this tab alone, so a person downloads the round before the tab closes.
  const record: Stored = { items, seen, seenVersion, exported, version: kept };
  let refused = "";
  if (writeRecord(key, record)) {
    held.delete(key);
    storageRefusedSaid = false;
  } else {
    held.set(key, record);
    if (!storageRefusedSaid && items.length) {
      storageRefusedSaid = true;
      refused = W.STORAGE_REFUSED;
    }
  }
  commentWatch();
  return refused;
}

/** Whether the toast has said that the browser refuses to keep the comments, so it says so once until a write lands. */
let storageRefusedSaid = false;

function commentWatch(): void {
  const comments = ctx.comments;
  if (comments.items.length && JSON.stringify(comments.items) !== comments.exported) comments.unsaved.add(comments.round);
  else comments.unsaved.delete(comments.round);
}
function commentExported(): string {
  ctx.comments.exported = JSON.stringify(ctx.comments.items);
  return commentSave({ exported: ctx.comments.exported });
}

/** The element of the frame a click landed on, as the list of elements names it. */
export function pickFromFrame(hit: Element): void {
  commentTargets();
  const at = commentElements().find((x) => x.node === hit)?.key ?? "";
  if (at) {
    $.commentTarget.value = at;
    ctx.comments.picked = true;
  }
  commentMarkPicked();
  // Where the comments are a drawer that a person closed to see the screen, a pick opens it again at the form.
  if (medium.matches && !ctx.ui.inspectOpen) {
    setInspectorTab("comments");
    openInspector(true);
  }
  $.commentField.focus();
  $.commentAdd.scrollIntoView({ block: "nearest" });
}
export function commentTargets(): void {
  const keep = $.commentTarget.value;
  const all = commentElements();
  ctx.comments.options = new Map(all.map((x) => [x.key, x]));
  $.commentTarget.replaceChildren(
    el("option", { value: "", text: W.PICK_AN_ELEMENT }),
    ...all.map((x) => el("option", { value: x.key, text: W.elementOption(x.testid, x.index, x.count, x.where) })),
  );
  if (ctx.comments.options.has(keep)) $.commentTarget.value = keep;
  updateComposeHint();
}
function commentPicked(): Target | undefined {
  return ctx.doc ? commentElements().find((x) => x.key === $.commentTarget.value) : undefined;
}
function updateComposeHint(): void {
  if (!ctx.comments.on) {
    $.composeHint.textContent = W.HINT_OFF;
    return;
  }
  const at = commentPicked();
  if (!at) {
    $.composeHint.textContent = W.HINT_PICK;
    return;
  }
  const parts = [at.testid];
  if (at.where) parts.push(at.where);
  if (at.flow) parts.push(W.inFlow(flowTitle(at.flow, W.FLOW_SCREENS)));
  $.composeHint.textContent = W.target(parts);
}
function commentMarkPicked(): void {
  const doc = ctx.doc;
  if (!doc) return;
  const at = commentPicked();
  doc.querySelectorAll(has(SET.highlight)).forEach((node) => {
    node.removeAttribute(SET.highlight);
  });
  if (at && ctx.comments.on) at.node.setAttribute(SET.highlight, "");
  updateComposeHint();
}

/** In the middle band the comments drawer covers the right of the artboard: an element shown there is scrolled out from under it. */
function clearOfDrawer(node: Element): void {
  if (!drawerCovers()) return;
  const frameEl = document.getElementById("frame");
  if (!(frameEl instanceof HTMLElement)) return;
  const frame = frameEl.getBoundingClientRect();
  const scale = frame.width / (frame.width ? frameEl.offsetWidth : 1);
  const right = frame.left + (node.getBoundingClientRect().right + 36 / scale) * scale;
  const drawer = $.inspector.getBoundingClientRect().left;
  if (right > drawer) $.scroller.scrollLeft += right - drawer;
}
/**
 * Open what a comment names: its own link when it has one, so its theme and its frame come back with its screen and state;
 * else its screen and state in the theme it was made in.
 */
function openItem(it: Named): void {
  const link = parseLink(typeof it.link === "string" ? it.link : "", "");
  const theme = [link.theme, it.shown_theme].find((one): one is View["theme"] => typeof one === "string" && (THEME_CHOICES as string[]).includes(one));
  if (theme) ctx.view.theme = theme;
  if (Object.hasOwn(FRAMES, link.frame) && link.frame !== ctx.view.frame) {
    ctx.view.frame = link.frame;
    ctx.ui.frameNamed = true;
  }
  ctx.go(`${String(it.screen ?? "")}/${String(it.state ?? "")}`, false, false);
}
/** Choose a comment in the list: what it names opens, and its element is outlined and scrolled to. */
function commentShow(it: Named): void {
  const comments = ctx.comments;
  comments.active = comments.active === it.id ? "" : it.id;
  if (comments.active) openItem(it);
  commentPins();
  const at = comments.active ? commentNodeOf(it) : undefined;
  if (at) {
    at.node.scrollIntoView({ block: "nearest", inline: "nearest" });
    clearOfDrawer(at.node);
  }
  every(".pv-comment-btn", HTMLElement).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.testid === testIdOf("comments-item", comments.active)));
  });
  every("#comments-list > li", HTMLElement).forEach((li) => {
    if (li.dataset.comment === comments.active) li.dataset.active = "";
    else delete li.dataset.active;
  });
  say(comments.active ? (at ? W.showingElement(it.id) : W.noElement(it.id)) : W.OUTLINE_OFF);
}
function commentStartEdit(it: Item): void {
  const comments = ctx.comments;
  if (!comments.on) commentToggle(true);
  if (it.screen !== ctx.view.screen || it.state !== ctx.view.state) ctx.go(`${it.screen}/${it.state}`, false, false);
  comments.editing = it.id;
  $.commentField.value = it.comment ?? "";
  pickType(it.type);
  comments.picked = false; // the comment keeps its element until a person picks another
  commentTargets();
  const at = commentNodeOf(it);
  $.commentTarget.value = at ? at.key : ""; // an element not shown now leaves the placeholder, never another element
  commentMarkPicked();
  commentForm();
  commentLimits();
  $.commentField.focus();
}
function commentStopEdit(): void {
  ctx.comments.editing = "";
  ctx.comments.picked = false;
  $.commentField.value = "";
  commentForm();
  commentLimits();
}
function commentForm(): void {
  $.commentCancel.hidden = !ctx.comments.editing;
  $.commentForm.hidden = !ctx.comments.on && !ctx.comments.editing;
}
function commentWhere(it: Item): string {
  const view = ctx.view;
  const screen = screenEl(it.screen ?? "");
  const elsewhere =
    it.screen === view.screen && it.state === view.state ? "" : W.onScreen(screen ? (titleAttr(screen) ?? "") : (it.screen ?? ""), String(it.state || ""));
  return W.commentWhere(it.testid, it.index, it.count, elsewhere) + W.madeIn(it.shown_theme);
}
const linkButton = (text: string, aria: string, testid: string): HTMLButtonElement => {
  const button = el("button", { type: "button", class: "link link-quiet pv-link", text, "aria-label": aria });
  button.dataset.testid = testid;
  return button;
};
export function commentRender(): void {
  const comments = ctx.comments;
  // A saved round lists what its file holds, which the tool read beside the design; any other, this browser's comments.
  const saved = isSaved(comments.round);
  const listed = roundItems();
  const rows = listed.map((it, i) => {
    const show = el("button", {
      type: "button",
      class: "link link-quiet pv-link pv-comment-btn",
      "aria-pressed": String(it.id === comments.active),
      text: W.SHOW,
      "aria-label": W.showComment(it.id),
    });
    show.dataset.testid = testIdOf("comments-item", it.id);
    show.addEventListener("click", () => commentShow(it));
    const edit = linkButton(W.EDIT, W.editComment(it.id), testIdOf("comments-edit", it.id));
    edit.addEventListener("click", () => commentStartEdit(it));
    const remove = linkButton(W.DELETE, W.deleteComment(it.id), testIdOf("comments-remove", it.id));
    remove.addEventListener("click", () => commentDelete(it, i));
    const where = el("span", { class: "pv-on", text: `${W.DOT}${commentWhere(it)} ` });
    where.title = String(it.testid || "");
    const item = el(
      "li",
      { class: "pv-comment" },
      el("span", { class: "pv-num", "aria-hidden": "true", text: String(i + 1) }),
      el("span", {}, el("span", { class: "pv-type-tag", text: W.label(it.type || "change") }), where, el("span", { class: "pv-rid", text: it.id })),
      el("p", { text: visibleText(it.comment ?? "") }),
      el("span", { class: "pv-acts" }, show, ...(saved ? [] : [edit, remove])),
    );
    item.dataset.comment = it.id;
    if (it.id === comments.active) item.dataset.active = "";
    return item;
  });
  // The comment deleted last keeps its place, with Undo, until the next comment is added or saved.
  if (comments.gone) {
    const undo = el("button", {
      type: "button",
      class: "link link-quiet pv-link",
      id: "comments-undo",
      text: W.UNDO,
      "aria-label": W.undoDelete(comments.gone.item.id),
    });
    undo.dataset.testid = "proto-comments-undo";
    undo.addEventListener("click", commentUndo);
    rows.splice(
      Math.min(comments.gone.at, rows.length),
      0,
      el("li", { class: "pv-comment pv-gone" }, el("span", { text: W.deleted(comments.gone.item.id) }), undo),
    );
  }
  // An empty round says so, and a saved round offers no Edit or Delete: its file is written.
  $.commentsEmpty.hidden = rows.length > 0;
  $.commentsEmpty.textContent = W.roundEmpty(comments.round);
  $.commentsList.replaceChildren(...rows);
  // The count is of the comments listed: a saved round's are its file's.
  $.commentsCount.textContent = String(listed.length);
  $.commentsCount.hidden = listed.length === 0;
  $.commentsStale.hidden = !comments.stale;
  $.seenStale.hidden = !comments.seenStale;
  // A data: link, which the page's policy allows: it names the file's text, so no address is fetched or sent. With
  // nothing to download, or a saved round, whose file is written, a disabled button takes its place.
  const exportable = !saved && comments.items.length > 0;
  $.commentDownload.hidden = !exportable;
  $.commentDownloadOff.hidden = exportable;
  // Copy the JSON is off when the download is: with nothing to export, both say so the same way.
  $.commentCopyJson.disabled = !exportable;
  if (exportable) $.commentDownload.setAttribute("href", `data:application/json;charset=utf-8,${encodeURIComponent(exportText("json"))}`);
  else $.commentDownload.removeAttribute("href");
  earlierRounds();
  renderSubtitle();
  renderRail();
  if (ctx.view.tab === "board") markBoard();
  commentPins();
}
/** Delete keeps an Undo in the comment's place, where the focus goes, so a slip costs one press. */
function commentDelete(it: Item, at: number): void {
  const comments = ctx.comments;
  if (comments.editing === it.id) commentStopEdit();
  if (comments.active === it.id) comments.active = "";
  const refused = commentSave({ remove: it.id });
  comments.gone = { item: it, at };
  commentRender();
  document.getElementById("comments-undo")?.focus();
  say(W.withAlso(W.commentDeleted(at + 1), refused, ". "));
}
function commentUndo(): void {
  const comments = ctx.comments;
  const gone = comments.gone;
  if (!gone) return;
  comments.gone = null;
  const refused = commentSave({ restore: gone.item, at: gone.at });
  commentRender();
  const back = comments.items.findIndex((x) => x.id === gone.item.id);
  document.querySelector<HTMLElement>(`[data-testid="${testIdOf("comments-item", gone.item.id)}"]`)?.focus();
  say(W.withAlso(W.commentBack(back + 1), refused, ". "));
}
/** Add a comment, on or off. The Comments tab lives in the side panel, so turning it on opens the panel where it is hidden. */
export function commentToggle(on: boolean): void {
  const comments = ctx.comments;
  comments.on = on;
  ctx.view.comments = on;
  document.documentElement.dataset.pvCommenting = on ? "on" : "off";
  $.commentToggle.setAttribute("aria-pressed", String(on));
  $.barComment.setAttribute("aria-pressed", String(on));
  updateComposeHint();
  if (!on && comments.editing) commentStopEdit();
  commentForm();
  if (on && !medium.matches && !shows("inspector")) setPanels(shows("screens"), true);
  if (on) {
    setInspectorTab("comments");
    if (medium.matches) openInspector(true);
  }
  ctx.apply();
  ctx.write(false);
  if (on) commentRender();
  else commentMarkPicked();
}
function pickType(type: string | undefined): void {
  ctx.comments.type = type !== undefined && isCommentType(type) ? type : "change";
  every("[data-type]", HTMLElement).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.type === ctx.comments.type));
  });
}
/** Where a comment is anchored: the screen, state and element picked, and the view it is seen in. */
function commentAnchor(picked: Target): Partial<Item> {
  const view = ctx.view;
  const shown = themeNow();
  return {
    screen: view.screen,
    state: view.state,
    testid: picked.testid,
    index: picked.index,
    count: picked.count,
    box: commentBox(picked.node),
    frame: view.frame,
    theme: view.theme,
    shown_theme: shown,
    link: linkFor({ ...view, theme: shown, panels: "both", tab: "prototype", comments: false, compare: false, side: "comments" }, "", ""),
  };
}
/** A field's error is text in its description, and the field says it is invalid. Typing clears it. */
function commentError(text: string): void {
  $.commentError.hidden = !text;
  const line = $.commentError.querySelector("span");
  if (line) line.textContent = text;
  if (text) {
    $.commentField.setAttribute("aria-invalid", "true");
    $.commentField.focus();
    say(text, $.commentField);
  } else $.commentField.removeAttribute("aria-invalid");
}
/**
 * The count under the field, and Save off with the reason as text when the comment is over its limit or the round is
 * full: a comment is never cut, and a round the save would refuse is never made, as the save refuses one and cuts nothing.
 */
function commentLimits(): void {
  const comments = ctx.comments;
  const length = commentLength($.commentField.value);
  const control = COMMENT_CONTROL.test($.commentField.value);
  const over = length > LIMITS.commentCharacters;
  const full = !comments.editing && comments.items.length >= LIMITS.commentsInARound;
  $.commentCount.textContent = W.characters(length, LIMITS.commentCharacters);
  $.commentCount.toggleAttribute("data-over", over);
  const reason =
    isSaved(comments.round) && !comments.editing
      ? W.roundSaved(comments.round)
      : over
        ? W.tooLong(length, LIMITS.commentCharacters)
        : control
          ? W.CONTROL_IN_COMMENT
          : full
            ? W.roundFull(LIMITS.commentsInARound)
            : "";
  $.commentLimit.hidden = !reason;
  $.commentLimit.textContent = reason;
  $.commentAdd.disabled = Boolean(reason);
}
function commentAddOrSave(): void {
  const comments = ctx.comments;
  if ($.commentAdd.disabled) return;
  // A removal needs no words; every other type says what to do.
  const text = $.commentField.value.trim() || (comments.type === "remove" ? W.REMOVE_THIS : "");
  const picked = commentPicked();
  const found = comments.items.find((x) => x.id === comments.editing);
  if (!found && !picked) {
    say(W.PICK_FIRST);
    $.commentTarget.focus();
    return;
  }
  if (!text) {
    commentError(W.EMPTY_COMMENT);
    return;
  }
  commentError("");
  const round = currentRound();
  let change: { add: Item } | { replace: Item };
  // The id comes last, from the stored comments, when the change is saved.
  if (!found) change = { add: { round, type: comments.type, comment: text, ...(picked ? commentAnchor(picked) : {}) } as Item };
  else {
    // An edit changes the words and the type. The comment moves only when a person picked an element after starting the
    // edit, and then to the view it was picked in.
    Object.assign(found, { type: comments.type, comment: text });
    if (comments.picked && picked) Object.assign(found, commentAnchor(picked));
    change = { replace: found };
  }
  comments.editing = "";
  comments.picked = false;
  $.commentField.value = "";
  commentForm();
  const refused = commentSave(change);
  commentRender();
  commentLimits();
  const id = found ? found.id : "add" in change ? change.add.id : "";
  say(W.withAlso(W.commentKept(comments.items.findIndex((x) => x.id === id) + 1, Boolean(found)), refused, ". "));
}
function exportText(format: string): string {
  return format === "json" ? exportJson(ctx.comments.items, currentRound(), design) : exportPrompt(ctx.comments.items, currentRound(), design);
}
/** A copy says what it copied. The text to select by hand shows only when the clipboard refuses it, selected, with the focus. `also` is said with the outcome. */
export function copyText(text: string, done: string, also: string): void {
  // The control a person used, kept before the clipboard takes the text, which may be late: the toast reports on it.
  const used = document.activeElement;
  $.commentOut.value = text;
  $.commentOutLabel.hidden = true;
  if (also) say(also);
  const blocked = () => {
    $.commentOutLabel.hidden = false;
    $.commentOut.focus();
    $.commentOut.select();
    say(W.withAlso(W.CLIPBOARD_BLOCKED, also, " "));
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function")
    navigator.clipboard.writeText(text).then(() => say(W.withAlso(done, also, ". "), used), blocked);
  else blocked();
}
/** The round changes only on a whole number and Enter, or when the field is left; anything else puts the round back. */
function openRound(): void {
  const view = ctx.view;
  if (!/^[0-9]{1,4}$/.test($.round.value.trim()) || Number($.round.value) < 1) {
    $.round.value = String(view.round);
    say(W.ROUND_NUMBER);
    return;
  }
  if (Number($.round.value) === view.round) return;
  view.round = currentRound();
  commentLoad();
  markSeen();
  commentForm();
  ctx.write(false);
  commentRender();
}

export function wireComments(c: Ctx): void {
  ctx = c;
  wirePins(c);
  wireEarlierRounds(c, commentShow);
  $.commentDownload.setAttribute("download", commentsFile);
  $.commentDownload.textContent = $.commentDownloadOff.textContent = W.download(commentsFile);
  // The same comments open in two tabs: a change in one is read by the other. This is no load of a new design, so what
  // this tab has seen stays as it is.
  onOtherTab((key) => {
    const comments = ctx.comments;
    if (key !== commentStoreKey(designId, comments.round) || comments.editing) return;
    const keep = comments.seen,
      stale = comments.seenStale;
    commentLoad();
    comments.seen = keep;
    comments.seenStale = stale;
    comments.seenReplace = false;
    commentRender();
  });
  window.addEventListener("beforeunload", (event) => {
    if (ctx.comments.unsaved.size) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  every("[data-type]", HTMLElement).forEach((button) => {
    button.addEventListener("click", () => pickType(button.dataset.type));
  });
  $.commentTarget.addEventListener("change", () => {
    ctx.comments.picked = $.commentTarget.value !== "";
    commentMarkPicked();
  });
  $.commentCancel.addEventListener("click", commentStopEdit);
  $.commentField.addEventListener("input", () => {
    commentError("");
    commentLimits();
  });
  $.commentAdd.addEventListener("click", commentAddOrSave);
  every("[data-comment-copy]", HTMLElement).forEach((button) => {
    button.addEventListener("click", () => {
      const comments = ctx.comments;
      if (!comments.items.length) {
        say(W.NOTHING_TO_COPY);
        return;
      }
      const sound = comments.items.filter((it) => commentSound(it, design)).length;
      const format = button.dataset.commentCopy ?? "";
      const refused = commentExported();
      const also = [W.leftOut(comments.items.length - sound), refused].filter(Boolean).join(" ");
      copyText(exportText(format), format === "prompt" ? W.copiedPrompt(sound) : W.copiedJson(sound), also);
    });
  });
  $.commentDownload.addEventListener("click", () => {
    const refused = commentExported();
    say(W.withAlso(W.downloading(commentsFile, currentRound(), saveCommand, roundsPath), refused, ". "));
  });
  $.commentToggle.addEventListener("click", () => commentToggle(!ctx.comments.on));
  $.barComment.addEventListener("click", () => commentToggle(!ctx.comments.on));
  commentLimits();
  $.round.addEventListener("change", openRound);
  $.round.addEventListener("keydown", (event) => {
    if (commits(event.key)) {
      event.preventDefault();
      openRound();
    }
  });
}
