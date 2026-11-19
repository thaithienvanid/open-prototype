// The keyboard map: which action a key press means, given what is open. Pure: the page does the action.

export type Press = { key: string; alt: boolean; ctrl: boolean; meta: boolean; altGraph: boolean; inField: boolean; inCommentForm: boolean };
export type Open = {
  sheet: boolean;
  keysOn: boolean;
  checks: boolean;
  present: boolean;
  commenting: boolean;
  screensDrawer: boolean;
  inspectorDrawer: boolean;
};
export type Action =
  | "close-sheet"
  | "close-checks"
  | "leave-full-screen"
  | "leave-comment-form"
  | "close-screens"
  | "close-inspector"
  | "toggle-screens"
  | "toggle-inspector"
  | "full-screen"
  | "next-unseen"
  | "next-state"
  | "previous-state"
  | "comment"
  | "next-view"
  | "next-theme"
  | "next-frame"
  | "open-sheet"
  | { state: number };

/** The action of a key press, or null when it does nothing. Escape always acts; a single key acts only when the shortcuts are on, outside a field, with no modifier. */
export function keyAction(press: Press, open: Open): Action | null {
  if (open.sheet) return press.key === "?" && open.keysOn ? "close-sheet" : null; // the open sheet takes its own keys
  if (press.key === "Escape") {
    if (open.checks) return "close-checks";
    if (open.present) return "leave-full-screen";
    if (open.commenting && press.inCommentForm) return "leave-comment-form";
    if (open.screensDrawer) return "close-screens";
    if (open.inspectorDrawer) return "close-inspector";
    return null;
  }
  if (!open.keysOn) return null;
  // On a layout that types [ and ] with AltGr, the browser reports Ctrl and Alt too, so AltGr counts as no modifier.
  if ((press.altGraph || (!press.ctrl && !press.meta)) && !press.inField) {
    if (press.key === "[") return "toggle-screens";
    if (press.key === "]") return "toggle-inspector";
  }
  if (press.alt || press.ctrl || press.meta || press.inField) return null;
  const key = press.key.toLowerCase();
  if (key === "f") return "full-screen";
  if (key === "n") return "next-unseen";
  if (key === "j") return "next-state";
  if (key === "k") return "previous-state";
  if (key === "c") return "comment";
  if (key === "v") return open.present ? null : "next-view";
  if (key === "t") return "next-theme";
  if (key === "d") return "next-frame";
  if (press.key === "?") return "open-sheet";
  return /^[1-9]$/.test(press.key) ? { state: Number(press.key) } : null;
}

/**
 * Where a key moves the focus inside a group of controls, as the index it lands on, or null when the key does not move.
 * Tabs move along their row only; a group (the rows of Build details) also moves down and up, and to its ends.
 */
export function moveIn(key: string, kind: "tabs" | "group", at: number, count: number): number | null {
  const step = { ArrowRight: 1, ArrowLeft: -1, ...(kind === "group" ? { ArrowDown: 1, ArrowUp: -1 } : {}) }[key];
  if (at < 0 || !count) return null;
  if (step !== undefined) return (at + step + count) % count;
  if (kind === "group" && key === "Home") return 0;
  if (kind === "group" && key === "End") return count - 1;
  return null;
}

/** Whether a key press commits a field or a link: Enter. */
export function commits(key: string): boolean {
  return key === "Enter";
}
