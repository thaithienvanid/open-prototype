// The table of views: each view's name (which is also its tab's or its button's, and its panel's), its label, the panel
// it builds, its render function, the element whose data-ready says it is ready, the bar's controls that belong to it,
// and what it does when it opens. A view that a tab opens has a panel of its own in the artboard; a view shown beside
// another, as Compare is beside the Prototype's frame, has a button in the top bar and its part in that view's panel. The
// table builds each view's tab or button and its panel, so adding a view adds its module and its row here, and nothing
// else.
import { flowIds } from "../design.ts";
import { $, every } from "../dom.ts";
import * as W from "../words.ts";
import { boardPanel, fitBoard, renderBoard, zoomBoard } from "./board.ts";
import { comparePanel } from "./compare.ts";
import { prototypePanel, renderPrototype } from "./prototype.ts";
import { renderSystem, systemPanel } from "./system.ts";

/** A view that a tab opens. */
type ViewRow = {
  name: string;
  /** The words of its tab. */
  label: string;
  /** Its panel, which the table places in the artboard; a view with none gets an empty one, which its render fills. */
  panel?(): HTMLElement;
  /** Where a view shown beside this one puts its part, once the panel is placed. */
  beside?(): HTMLElement;
  render(): void;
  /** The element whose `data-ready="true"` says the view is ready for a picture. */
  ready(): HTMLElement;
  /** Drawn on every redraw, shown or not: the Prototype's frame is what Build details and the comments read. */
  drawnAlways: boolean;
  /** Whether Fit and 100% apply. */
  zoom: boolean;
  /** The bar's controls that show only with this view. */
  controls(): HTMLElement[];
  /** What the view does once it has opened and drawn. */
  opened(): void;
};

/** A view shown beside another view's panel, turned on and off by its button in the top bar; the link says `<name>=1`. */
type BesideRow = {
  name: string;
  /** The words of its button. */
  label: string;
  /** Its button's title, which says what it does. */
  title: string;
  /** Its button's icon, by its name in the page's sprite. */
  icon: string;
  /** The view it shows beside. */
  within: string;
  /** Its part, which the table places where that view's `beside` says. */
  panel(): HTMLElement;
};

/** The views, in the order of their tabs and of the key V, then the views shown beside one. The first opens when a link names none. */
const VIEW_TABLE: readonly (ViewRow | BesideRow)[] = [
  {
    name: "prototype",
    label: W.PROTOTYPE_TAB,
    panel: prototypePanel,
    beside: () => $.device,
    render: renderPrototype,
    ready: () => $.workspace,
    drawnAlways: true,
    zoom: true,
    controls: () => [],
    opened: () => {},
  },
  {
    name: "board",
    label: W.BOARD_TAB,
    panel: boardPanel,
    render: renderBoard,
    ready: () => $.board,
    drawnAlways: false,
    zoom: true,
    controls: () => [...every("[data-board-option]", HTMLElement), $.boardShow, ...(flowIds.length < 2 ? [] : [$.boardFlowWrap])],
    // The Board opens fitted, with every screen and state in view.
    opened: () => zoomBoard(fitBoard(), "fit"),
  },
  {
    name: "system",
    label: W.SYSTEM_TAB,
    panel: systemPanel,
    render: renderSystem,
    ready: () => $.workspace,
    drawnAlways: false,
    zoom: false,
    controls: () => [],
    opened: () => {},
  },
  { name: "compare", label: W.COMPARE_TAB, title: W.COMPARE_TITLE, icon: "compare", within: "prototype", panel: comparePanel },
];

/** Whether a row is a view a tab opens. */
const isTab = (row: ViewRow | BesideRow): row is ViewRow => !("within" in row);
/** The views a tab opens, in the order of their tabs. */
export const TAB_ROWS: readonly ViewRow[] = VIEW_TABLE.filter(isTab);
/** The views shown beside another. */
export const BESIDE_ROWS: readonly BesideRow[] = VIEW_TABLE.filter((row): row is BesideRow => !isTab(row));
export const VIEW_NAMES: readonly string[] = TAB_ROWS.map((row) => row.name);
