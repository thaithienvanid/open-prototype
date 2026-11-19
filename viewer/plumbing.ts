// What the viewer finds in a frame by the design's own vocabulary, so a design carries none of the viewer's names and the
// viewer looks for no unprefixed element of it: the slot that holds a screen's title, which is also where a new screen and
// the skip link put focus.

import { FIND } from "./names.ts";

/** The element that shows a screen's title: the one the design marks as the title slot. It can take focus. */
export function titleSlot(doc: Document): HTMLElement | null {
  const slot = doc.querySelector<HTMLElement>(FIND.title);
  if (slot && !slot.hasAttribute("tabindex")) slot.tabIndex = -1;
  return slot;
}
