// Compare: screenshots of the built interface beside the design or under it, read here as data: URLs and never sent anywhere, matched
// to the view by the name `shots` gives its picture, <screen>.<state>.<frame>.<theme>, then .text-200 and .rtl when the view
// has them, the theme as the design shows it; a name with no theme matches both. One picture alone shows on every view.
// Compare is part of the view: compare=1 in the link.
import type { Ctx } from "../context.ts";
import { $, el } from "../dom.ts";
import { say } from "../panels/bars.ts";
import { themeNow } from "../panels/rail.ts";
import * as W from "../words.ts";

let ctx!: Ctx;
const images = new Map<string, string>();

/** The view's picture name with no `.png`, as `shots` writes it; with `theme` false, the same name with no theme. */
function compareKey(theme = true): string {
  const { screen, state, frame, text, dir } = ctx.view;
  return [screen.replace(/:/g, "+"), state, frame, ...(theme ? [themeNow()] : []), ...(text === "200" ? ["text-200"] : []), ...(dir === "rtl" ? ["rtl"] : [])]
    .join(".")
    .toLowerCase();
}
function compareImage(): string {
  if (images.size === 1) return [...images.values()][0] ?? "";
  return images.get(compareKey()) || images.get(compareKey(false)) || "";
}

/** The screenshot beside the frame or under it, at the frame's width and no taller than it, or the placeholder that says which is missing. */
export function showCompare(width: string, height: string): void {
  const src = ctx.view.compare ? compareImage() : "";
  const side = $.compareSide;
  side.hidden = !ctx.view.compare;
  side.classList.toggle("pv-compare-missing", !src);
  // The picture exists only once a screenshot is picked, so the page never holds an image with no source.
  let beside = document.getElementById("compare-beside");
  if (src && !beside) {
    beside = el("img", { id: "compare-beside", alt: W.BUILT_UI });
    // A picture has its size once it has loaded, so the frame fits again then, with the picture's room counted.
    beside.addEventListener("load", () => ctx.apply());
    side.prepend(beside);
  }
  if (!src && beside) beside.remove();
  if (src && beside instanceof HTMLImageElement) {
    if (beside.getAttribute("src") !== src) beside.src = src; // the same address again would load again, and fit again
    beside.style.width = width;
    beside.style.maxHeight = height;
  }
  $.compareName.replaceChildren(
    ...(!images.size
      ? [W.COMPARE_HOW, el("code", { text: W.COMPARE_PATTERN })]
      : src
        ? [W.builtShot(images.size === 1 ? W.ONE_SCREENSHOT : `${compareKey()}.png`)]
        : [W.NO_SCREENSHOT, el("code", { text: `${compareKey()}.png` })]),
  );
  $.comparePick.textContent = W.comparePick(images.size > 0);
  side.style.width = src ? width : "";
}

/** Compare's part, beside the Prototype's frame: the built UI's screenshot, its name, and the button that loads screenshots. */
export function comparePanel(): HTMLElement {
  return el(
    "figure",
    { class: "pv-compare-side", id: "compare-side", hidden: "" },
    el(
      "figcaption",
      {},
      el("span", { class: "pv-compare-name", id: "compare-name" }),
      el("button", { type: "button", class: "btn", id: "compare-pick", "data-testid": "proto-compare-pick", text: W.comparePick(false) }),
      el("input", {
        type: "file",
        id: "compare-files",
        accept: "image/png,image/jpeg,image/webp",
        multiple: "",
        hidden: "",
        "data-testid": "proto-compare-load",
      }),
    ),
  );
}

function setCompare(on: boolean): void {
  ctx.view.compare = on;
  if (on && ctx.view.tab !== "prototype") ctx.setTab("prototype");
  else {
    ctx.apply();
    ctx.write(false);
  }
  if (on && !images.size) $.comparePick.focus();
}

export function wireCompare(c: Ctx): void {
  ctx = c;
  $.compare.addEventListener("click", () => setCompare(!ctx.view.compare));
  // A button opens the file picker, so focus comes back to a plain button, never to a hidden input.
  $.comparePick.addEventListener("click", () => $.compareFiles.click());
  $.compareFiles.addEventListener("change", () => {
    const all = [...($.compareFiles.files ?? [])];
    $.compareFiles.value = "";
    const files = all.filter((file) => /^image\/(png|jpeg|webp)$/.test(file.type));
    // A pick replaces the pictures loaded before only when it holds one Compare can show: a pick of other files keeps them.
    if (files.length) images.clear();
    let left = files.length;
    let skipped = all.length - files.length;
    const kept = !files.length && skipped > 0 && images.size > 0;
    // The toast says the count once the picture has its size and the frame has fitted to it, so it takes its place
    // against the layout a person sees, never the one before the picture.
    const finish = () => {
      ctx.apply();
      const shown = document.getElementById("compare-beside");
      const sized = shown instanceof HTMLImageElement ? shown.decode().catch(() => {}) : Promise.resolve();
      sized.then(() => {
        ctx.apply();
        say(kept ? W.screenshotsKept(images.size, skipped) : W.screenshotsLoaded(images.size, skipped));
      });
    };
    if (!files.length) {
      finish();
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.addEventListener("loadend", () => {
        if (reader.readyState === FileReader.DONE && /^data:image\/(png|jpeg|webp);base64,/.test(String(reader.result)))
          images.set(file.name.replace(/\.[^.]+$/, "").toLowerCase(), String(reader.result));
        else skipped += 1;
        left -= 1;
        if (left === 0) finish();
      });
      reader.readAsDataURL(file);
    });
  });
}
