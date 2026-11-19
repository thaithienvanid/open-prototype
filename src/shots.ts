// The shot list: the views a review captures, sized to the change. A new screen or a whole design takes the full
// matrix of its screens; a changed component takes a short pass where it shows. It never lists nothing: a component, a
// screen, or a frame the design lacks is a problem that names the ones it has.
import type { Frame } from "./assets.ts";
import { DEFAULT_FRAME, type LinkKey, viewLink } from "./contract.ts";
import { type Facts, sizeKey } from "./design/facts.ts";
import { ATTR, type Theme } from "./format.ts";
import { shown } from "./text.ts";

/** Why a shot is in the list: a view of the full pass, a check on a screen's fullest state, or a part of a component's pass. */
type Purpose = "matrix" | "text-200" | "rtl" | "overview" | "states" | "narrow";

export type Shot = {
  screen: string;
  state: string;
  frame: string;
  theme: Theme;
  /** The text size, in percent of the frame's own. */
  text: "100" | "200";
  dir: "ltr" | "rtl";
  purpose: Purpose;
  component?: string;
  variant?: string;
  link: string;
  file: string;
};

type ShotOptions = { text?: Shot["text"]; direction?: Shot["dir"]; part?: [component: string, variant: string] };

function shot(screen: string, state: string, frame: string, theme: Theme, purpose: Purpose, options: ShotOptions = {}): Shot {
  const text = options.text ?? "100";
  const direction = options.direction ?? "ltr";
  const keys: Partial<Record<LinkKey, string>> = { theme, frame, zoom: "actual" };
  if (text === "200") keys.text = text;
  if (direction === "rtl") keys.dir = direction;
  // A flow's screen `<flow>:<screen>` names its picture `<flow>-<screen>`, since a colon is no part of a file name on Windows.
  let name = [screen.replaceAll(":", "-"), state, frame, theme, ...(text === "200" ? ["text-200"] : []), ...(direction === "rtl" ? ["rtl"] : [])].join("-");
  const part = options.part ? { component: options.part[0], variant: options.part[1] } : {};
  if (options.part) name += `-${options.part[0]}-${options.part[1]}`;
  return { screen, state, frame, theme, text, dir: direction, purpose, ...part, link: viewLink(screen, state, keys), file: `${name}.png` };
}

// The screen's state with the most elements, the first such: where 200% text and right to left are likeliest to break.
function fullest(design: Facts, screen: { id: string; states: string[] }): string {
  let best = screen.states[0] ?? "";
  let size = -1;
  for (const state of screen.states) {
    const count = design.stateSizes.get(sizeKey(screen.id, state)) ?? 0;
    if (count > size) [best, size] = [state, count];
  }
  return best;
}

function overview(frames: string[]): string {
  return frames.includes(DEFAULT_FRAME) ? DEFAULT_FRAME : (frames[0] ?? DEFAULT_FRAME);
}

/** The narrowest frame named, the first of equal ones: where text at 200% is likeliest to scroll sideways or be cut. */
function narrowest(frames: string[], widths: Map<string, number>): string {
  let found = frames[0] ?? DEFAULT_FRAME;
  for (const frame of frames) if ((widths.get(frame) ?? 0) < (widths.get(found) ?? 0)) found = frame;
  return found;
}

/** The full pass of these screens: every state at each frame in both themes, then 200% text at the narrowest frame and right to left. */
function matrix(design: Facts, screenIds: string[], frames: string[], themes: readonly Theme[], widths: Map<string, number>): Shot[] {
  const out: Shot[] = [];
  for (const screen of design.screens.filter((item) => screenIds.includes(item.id) && item.states.length)) {
    for (const state of screen.states) for (const frame of frames) for (const theme of themes) out.push(shot(screen.id, state, frame, theme, "matrix"));
    const most = fullest(design, screen);
    out.push(shot(screen.id, most, narrowest(frames, widths), themes[0] ?? "light", "text-200", { text: "200" }));
    out.push(shot(screen.id, most, overview(frames), themes[0] ?? "light", "rtl", { direction: "rtl" }));
  }
  return out;
}

/**
 * A change to one component: each screen it shows on, then each variant in both themes, then the narrowest frame, and
 * 200% text at it, where it first shows. A component in the chrome is seen on the first screen; one in a list's item template,
 * on the screens whose lists repeat it.
 */
function componentPass(design: Facts, name: string, frames: string[], themes: readonly Theme[], widths: Map<string, number>): Shot[] {
  const opening = new Map<string, string | null>();
  for (const screen of design.screens) if (screen.states.length) opening.set(screen.id, screen.opensIn());
  const first = opening.keys().next().value ?? "";
  const places = new Map<string, [state: string, variant: string]>();
  const variants = new Map<string, [screen: string, state: string]>();
  for (const use of design.components) {
    if (use.name !== name) continue;
    const lists = use.template ? design.lists.filter((list) => list.template === use.template) : [];
    const spots = lists.length ? lists.map((list) => [list.screen, list.state]) : [[use.screen, use.state]];
    for (const [screen = "", state = ""] of spots) {
      const where = screen || first;
      if (!opening.has(where)) continue;
      const place: [string, string] = [where, state || opening.get(where) || ""];
      if (!places.has(where)) places.set(where, [place[1], use.variant]);
      if (!variants.has(use.variant)) variants.set(use.variant, place);
    }
  }
  const view = overview(frames);
  const theme = themes[0] ?? "light";
  const out = Array.from(places, ([screen, [state]]) => shot(screen, state, view, theme, "overview"));
  for (const [variant, [screen, state]] of variants)
    for (const theme of themes) out.push(shot(screen, state, view, theme, "states", { part: [name, variant] }));
  const firstPlace = places.entries().next().value;
  if (firstPlace) {
    const [screen, [state]] = firstPlace;
    const narrow = narrowest(frames, widths);
    if (narrow !== view) out.push(shot(screen, state, narrow, theme, "narrow"));
    out.push(shot(screen, state, narrow, theme, "text-200", { text: "200" }));
  }
  return out;
}

export type ShotRequest = { components: string[]; screens: string[]; frames: string[]; themes: readonly Theme[] };

/** The views a pass takes; or the problems of the request, which the command refuses; or the design's one problem: no view to take. */
export function shotList(design: Facts, table: Map<string, Frame>, request: ShotRequest): { shots: Shot[]; problems: string[]; refused: boolean } {
  const knownScreens = design.screens.map((screen) => screen.id);
  const knownComponents = [...new Set(design.components.map((use) => use.name))].sort();
  const problems = [
    ...request.frames
      .filter((frame) => !table.has(frame))
      .map((frame) => `the frame ${shown(frame)} is not in the device table: name one of ${[...table.keys()].join(", ")}`),
    ...request.screens
      .filter((screen) => !knownScreens.includes(screen))
      .map((screen) => `the design has no screen ${shown(screen)}: name one of ${knownScreens.join(", ") || "none"}`),
    ...request.components
      .filter((name) => !knownComponents.includes(name))
      .map((name) => `no screen shows the component ${shown(name)}: name one of ${knownComponents.join(", ") || "none"}`),
  ];
  if (problems.length || !request.frames.length) return { shots: [], problems: problems.length ? problems : ["name at least one frame"], refused: true };
  const widths = new Map(Array.from(table, ([id, frame]) => [id, frame.width]));
  const found = matrix(
    design,
    request.screens.length ? request.screens : request.components.length ? [] : knownScreens,
    request.frames,
    request.themes,
    widths,
  );
  for (const name of request.components) found.push(...componentPass(design, name, request.frames, request.themes, widths));
  const unique = new Map<string, Shot>();
  for (const item of found) unique.set(item.file, item);
  const shots = [...unique.values()];
  return { shots, problems: shots.length ? [] : [`the design has no state to capture: give each screen a ${ATTR.state}`], refused: false };
}
