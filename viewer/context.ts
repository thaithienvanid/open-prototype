// The viewer's state and the actions main owns, as the page modules see them. main.ts makes the one context; each
// page module reads the state from it and calls these actions, and never imports main.
import type { Comment } from "./comments.ts";
import type { View } from "./link.ts";
import type { CommentType } from "./names.ts";

/** What the page shows beside the view that the link holds. */
export type Ui = {
  /** A message waiting for the next redraw, announced once. */
  pending: string;
  everyState: boolean;
  flowLines: boolean;
  menuOpen: boolean;
  inspectOpen: boolean;
  present: boolean;
  boardZoom: number;
  boardZoomed: string;
  panesAuto: boolean;
  /** Whether the frame was named, by the link or a person, so the link writes it. */
  frameNamed: boolean;
  linkProblem: string;
  /** Whether single-key shortcuts act. */
  keysOn: boolean;
};

/** A comment as this page keeps it: whatever the stored record holds, with an id. It is checked, by `commentSound`, before it is shown whole or exported. */
export type Item = Partial<Comment> & { id: string; link?: string };

/** An element a comment can point at, on the screen shown now. */
export type Target = { testid: string; index: number; count: number; node: HTMLElement; where: string; flow: string; key: string };

/** The round's comments, the views seen, and the comment form. */
export type Comments = {
  on: boolean;
  round: number;
  items: Item[];
  seen: Set<string>;
  exported: string;
  unsaved: Set<number>;
  /** The type the comment form gives a new comment. */
  type: CommentType;
  editing: string;
  picked: boolean;
  stale: boolean;
  version: string;
  seenStale: boolean;
  seenReplace: boolean;
  active: string;
  options: Map<string, Target>;
  gone: { item: Item; at: number } | null;
};

export type Ctx = {
  view: View;
  ui: Ui;
  comments: Comments;
  /** The prototype frame's document, once it has loaded. */
  doc: Document | null;
  /** The item of a list a link last opened. */
  picked: number;
  /** Draw every part from the state. */
  apply(): void;
  /** Change one value of the view, checked against the design, then draw and write the link. */
  set<K extends keyof View>(key: K, value: View[K]): void;
  /** Open a screen, or a screen and state, named `screen/state`. */
  go(target: string, push: boolean, focus: boolean): void;
  /** Write the view into the address: a new history entry, or the same one replaced. */
  write(push: boolean): void;
  /** Show a view by its name. `write: false` leaves the address for a caller that writes it next. */
  setTab(name: string, options?: { write: boolean }): void;
};
