// The checks that measure a design against the device table, which they are given: a link names a frame of the table, and a frame a
// design draws itself has that frame's width and height, a fixed height, and scrolls inside.

import type { Devices, Frame } from "../assets.ts";
import { inlineDeclarations } from "../css/sheet.ts";
import type { Facts, Issue } from "../design/facts.ts";
import type { RuleId } from "../finding.ts";
import { ATTR, type Platform } from "../format.ts";
import { quoted, words } from "../text.ts";
import { choose } from "./names.ts";

/** The frames a full pass takes for the platforms a design declares, in the table's order for each platform. */
export function shotFrames(platforms: readonly Platform[], devices: Devices): string[] {
  const out: string[] = [];
  for (const platform of platforms) for (const id of devices.shots[platform] ?? []) if (devices.frames.has(id) && !out.includes(id)) out.push(id);
  return out;
}

function frameChoices(frames: Map<string, Frame>): string {
  return Array.from(frames, ([id, frame]) => `\`${id}\` (${frame.width} by ${frame.height})`).join(", ");
}

/** An inline style as property and value, lower case, in the order of each property's last declaration, which wins, as the one CSS reader reads it. */
function styleDeclarations(style: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const declaration of inlineDeclarations(style)) {
    out.delete(declaration.property);
    out.set(declaration.property, declaration.value.toLowerCase());
  }
  return out;
}

/** How the element scrolls up and down: the later of `overflow-y` and the `overflow` shorthand, whose last value is y. */
function overflowY(css: Map<string, string>): string {
  let found = "";
  for (const [name, value] of css) {
    if (name === "overflow-y") found = value;
    else if (name === "overflow" && words(value).length) found = words(value).at(-1) ?? "";
  }
  return found;
}

const PIXELS = /^([0-9]+(?:\.[0-9]+)?)px$/;

/** The frames a design draws itself, each measured against the device table. */
export function deviceIssues(facts: Facts, frames: Map<string, Frame>): Issue[] {
  const found: Issue[] = [];
  const push = (line: number, rule: RuleId, message: string) => found.push({ rule, line, message });
  for (const [line, id, style] of facts.devices) {
    const frame = frames.get(id);
    if (!frame) {
      push(
        line,
        "device.unknown",
        `${ATTR.device}="${quoted(id)}" is no frame of the device table; ${choose(id, [...frames.keys()], "frame")}. Name one: ${frameChoices(frames)}`,
      );
      continue;
    }
    const css = styleDeclarations(style);
    const what = `the frame \`${id}\` (${frame.name}, ${frame.width} by ${frame.height})`;
    const height = PIXELS.exec(css.get("height") ?? "");
    const width = PIXELS.exec(css.get("width") ?? "");
    if (!height)
      push(line, "device.height", `${what} has no fixed height, so it grows with its content; add height: ${frame.height}px; overflow-y: auto to its style`);
    if (!width) push(line, "device.width", `${what} has no width in px; add width: ${frame.width}px to its style`);
    if (width && height) {
      const drawn = [Number(width[1] ?? ""), Number(height[1] ?? "")];
      if (drawn[0] !== frame.width || drawn[1] !== frame.height) {
        push(
          line,
          "device.size",
          `${what} is drawn ${drawn[0]} by ${drawn[1]} px, a size the device table lacks; set width: ${frame.width}px; height: ${frame.height}px in its style`,
        );
      }
    }
    if (height && !["auto", "scroll"].includes(overflowY(css))) {
      push(line, "device.scroll", `${what} does not scroll inside, so a long design is cut off or spills out; add overflow-y: auto to its style`);
    }
  }
  return found;
}
