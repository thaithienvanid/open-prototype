// The accessibility rules: what a design file shows of accessibility with no browser. The page's language; in each view,
// one level-1 heading, headings that skip no level, and one main landmark; motion that stops under reduced motion; no
// animation that runs for ever unanswered, flashes more than three times a second, or an image that plays without end.
// A view is what shows at once: what stands outside every screen, one screen's own content, and one of its states.
// Each rule reads the walk's facts, the CSS text, or an image's bytes, and none needs a layout or a running animation.

import { type CssDeclaration, type CssKeyframes, type CssRule, type CssSheet, commaParts, followVars, spaceParts } from "../css/sheet.ts";
import type { Facts, Heading, Issue, Landmark } from "../design/facts.ts";
import type { Design } from "../design/load.ts";
import { placeOf } from "../design/load.ts";
import { type Finding, finding } from "../finding.ts";
import { lineFinder, quoted } from "../text.ts";
import { playsForever } from "./images.ts";
import { designSheets } from "./system.ts";

type View = { screen: string; state: string; line: number };

/** Each view of the design: each state of each screen, or the screen itself when it draws no state. */
function views(facts: Facts): View[] {
  return facts.screens.flatMap((screen) =>
    screen.states.length
      ? screen.states.map((state, index) => ({ screen: screen.id, state, line: screen.stateLines[index] ?? screen.line }))
      : [{ screen: screen.id, state: "", line: screen.line }],
  );
}

const inView = (item: { screen: string; state: string }, view: View): boolean =>
  !item.screen || (item.screen === view.screen && (!item.state || item.state === view.state));

/**
 * The items each view shows, in their order. One pass groups them by screen, so a view reads only its screen's and
 * those outside every screen, and the cost does not grow with views times items.
 */
function byView<T extends { screen: string; state: string }>(items: readonly T[]): (view: View) => T[] {
  const outside: number[] = [];
  const byScreen = new Map<string, number[]>();
  items.forEach((item, index) => {
    if (!item.screen) outside.push(index);
    else {
      const list = byScreen.get(item.screen);
      if (list) list.push(index);
      else byScreen.set(item.screen, [index]);
    }
  });
  return (view) =>
    [...outside, ...(byScreen.get(view.screen) ?? [])]
      .sort((a, b) => a - b)
      .flatMap((index) => {
        const item = items[index];
        return item && inView(item, view) ? [item] : [];
      });
}

/** Where a set of things shows, in words: on every screen when all stand outside the screens, else the view. */
function where(items: { screen: string; state: string }[], view: View): string {
  if (items.every((item) => !item.screen)) return "every screen";
  if (items.every((item) => !item.state)) return `screen \`${quoted(view.screen)}\``;
  return view.state ? `screen \`${quoted(view.screen)}\` in state \`${quoted(view.state)}\`` : `screen \`${quoted(view.screen)}\``;
}

function lines(design: Design, items: { line: number }[]): string {
  const shown = items.map((item) => placeOf(design, item.line).line);
  return shown.length <= 2 ? shown.join(" and ") : `${shown.slice(0, -1).join(", ")}, and ${shown.at(-1)}`;
}

/** One level-1 heading and one main landmark in each view, and headings that skip no level. */
function structureIssues(design: Design, facts: Facts): Issue[] {
  const issues: Issue[] = [];
  const headingsIn = byView(facts.headings);
  const mainsIn = byView(facts.mains);
  for (const view of views(facts)) {
    const shown = headingsIn(view).sort((a, b) => a.at - b.at);
    const top = shown.filter((item) => item.level === 1 && !item.dialog);
    const said = view.state ? `screen \`${quoted(view.screen)}\` in state \`${quoted(view.state)}\`` : `screen \`${quoted(view.screen)}\``;
    if (!top.length)
      issues.push({
        rule: "accessibility.heading-top",
        line: view.line,
        message: `${said} shows no level-1 heading: make the title slot an \`<h1>\`, or add one`,
      });
    else if (top.length > 1)
      issues.push({
        rule: "accessibility.heading-top",
        line: top[1]?.line ?? view.line,
        message: `${where(top, view)} shows ${top.length} level-1 headings at once, on lines ${lines(design, top)}: keep one`,
      });
    const orders = new Map<string, Heading[]>();
    for (const item of shown) {
      const order = orders.get(item.dialog);
      if (order) order.push(item);
      else orders.set(item.dialog, [item]);
    }
    for (const order of orders.values()) {
      order.forEach((item, index) => {
        const before = order[index - 1];
        if (!before || item.level <= before.level + 1) return;
        issues.push({
          rule: "accessibility.heading-skip",
          line: item.line,
          message: `the h${before.level} on line ${placeOf(design, before.line).line} is followed by an h${item.level} on line ${placeOf(design, item.line).line} in ${where([before, item], view).replace(" in state ", ", state ")}: use an h${before.level + 1}`,
        });
      });
    }
    const mains: Landmark[] = mainsIn(view);
    if (!mains.length)
      issues.push({
        rule: "accessibility.main",
        line: view.line,
        message: `${said} shows no <main>: put the screen's content in one <main>, so a person can go straight to it`,
      });
    else if (mains.length > 1)
      issues.push({
        rule: "accessibility.main",
        line: mains[1]?.line ?? view.line,
        message: `${where(mains, view)} shows ${mains.length} main landmarks at once, on lines ${lines(design, mains)}: keep one`,
      });
  }
  return issues;
}

// What moves: a property whose change moves, resizes, or reshapes an element. A change of colour, blur, or opacity alone
// is no motion animation.
const MOVES =
  /^(?:all|transform|translate|rotate|scale|inset(?:-[a-z-]+)?|top|right|bottom|left|margin(?:-[a-z-]+)?|width|height|background-position(?:-[xy])?|offset-[a-z-]+|scroll-[a-z-]+)$/;
const FLASHES = new Set(["opacity", "visibility", "color", "background-color", "background", "background-image", "fill", "stroke", "filter"]);
const COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color|color-mix)a?\(|\b(?:white|black|red|green|blue|yellow|transparent|currentcolor)\b|var\(/i;
const TIME = /^(-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))(ms|s)$/i;
const EASING = /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$|^(?:cubic-bezier|steps|linear)\(/i;
const ANIMATION_WORDS = new Set(
  "none normal reverse alternate alternate-reverse forwards backwards both running paused infinite initial inherit unset".split(" "),
);
const ZERO_MS = 0.01;
const LIMIT = 3;

type Values = Map<string, string>;

/** A value with each `var()` followed through the tokens, a fallback standing in, or null when one names no token. */
function follow(value: string, tokens: Values): string | null {
  return followVars(value, (name) => tokens.get(name), { fallbacks: true, keep: false });
}

/** A time in milliseconds, or null when the text is none. */
function milliseconds(text: string): number | null {
  const found = TIME.exec(text.trim());
  return found ? Number(found[1]) * ((found[2] ?? "").toLowerCase() === "s" ? 1000 : 1) : null;
}

const isReduce = (prelude: string) => /prefers-reduced-motion\s*:\s*reduce|\(\s*prefers-reduced-motion\s*\)/i.test(prelude);
const isNoPreference = (prelude: string) => /prefers-reduced-motion\s*:\s*no-preference/i.test(prelude);
const normalSelector = (selector: string) => selector.replace(/\s+/g, " ").trim();
const everyElement = (selector: string) => commaParts(selector).some((part) => /^(?:\*|html \*|:root \*)(?:$|::?[a-z-]+$)/i.test(normalSelector(part)));

/** One transition or animation a rule sets: its kind, what it names, its duration, its count, and the token it reads. */
type Motion = {
  kind: "transition" | "animation";
  rule: CssRule;
  line: number;
  names: string[];
  duration: number | null;
  token: string;
  count: number;
  direction: string;
};

/**
 * The parts of each item of a `transition` or an `animation` shorthand, each `var()` followed: its words, its duration
 * (the first time; null when a `var()` names no token and no time is written, so it cannot be told), and the token the
 * duration reads, or "".
 */
function items(value: string, tokens: Values): { words: string[]; time: string | null; token: string }[] {
  return commaParts(value).map((item) => {
    let unknown = false;
    let token = "";
    const words = spaceParts(item).flatMap((part) => {
      const name = /^var\(\s*(--[A-Za-z0-9_-]+)/.exec(part)?.[1];
      if (!name) return [part];
      const value = follow(part, tokens);
      if (value === null) {
        unknown = true;
        token ||= name;
        return [];
      }
      const inner = spaceParts(value);
      if (!token && inner.some((word) => milliseconds(word) !== null)) token = name;
      return inner;
    });
    const time = words.find((word) => milliseconds(word) !== null) ?? (unknown ? null : "0s");
    return { words, time, token };
  });
}

/** Every transition and animation the design's rules set, outside a reduce block. */
function motions(sheet: CssSheet, tokens: Values): Motion[] {
  const out: Motion[] = [];
  for (const rule of sheet.rules) {
    if (rule.at.some(isReduce)) continue;
    const get = (property: string) => rule.declarations.filter((item) => item.property === property).at(-1);
    for (const item of rule.declarations) {
      if (item.property === "transition") {
        for (const part of items(item.value, tokens)) {
          if (part.words.length === 1 && part.words[0]?.toLowerCase() === "none") continue;
          const name = part.words.find((word) => milliseconds(word) === null && !EASING.test(word)) ?? "all";
          out.push({
            kind: "transition",
            rule,
            line: item.line,
            names: [name.toLowerCase()],
            duration: part.time === null ? null : milliseconds(part.time),
            token: part.token,
            count: 1,
            direction: "normal",
          });
        }
      } else if (item.property === "transition-property") {
        const durations = get("transition-duration");
        if (!durations) continue;
        const token = /var\(\s*(--[A-Za-z0-9_-]+)/.exec(durations.value)?.[1] ?? "";
        const time = follow(commaParts(durations.value)[0] ?? "", tokens);
        out.push({
          kind: "transition",
          rule,
          line: item.line,
          names: commaParts(item.value).map((name) => name.toLowerCase()),
          duration: time === null ? null : milliseconds(time),
          token,
          count: 1,
          direction: "normal",
        });
      } else if (item.property === "animation") {
        for (const part of items(item.value, tokens)) {
          const names = part.words.filter(
            (word) => milliseconds(word) === null && !EASING.test(word) && !ANIMATION_WORDS.has(word.toLowerCase()) && !/^[0-9.]+$/.test(word),
          );
          if (!names.length) continue;
          const count = part.words.some((word) => word.toLowerCase() === "infinite")
            ? Infinity
            : Number(part.words.find((word) => /^[0-9.]+$/.test(word)) ?? 1);
          const direction = part.words.find((word) => /^(?:alternate|alternate-reverse|reverse|normal)$/i.test(word))?.toLowerCase() ?? "normal";
          out.push({
            kind: "animation",
            rule,
            line: item.line,
            names,
            duration: part.time === null ? null : milliseconds(part.time),
            token: part.token,
            count,
            direction,
          });
        }
      } else if (item.property === "animation-name") {
        const names = commaParts(item.value).filter((name) => name.toLowerCase() !== "none");
        if (!names.length) continue;
        const durations = get("animation-duration");
        const token = durations ? (/var\(\s*(--[A-Za-z0-9_-]+)/.exec(durations.value)?.[1] ?? "") : "";
        const time = durations ? follow(commaParts(durations.value)[0] ?? "", tokens) : "0s";
        const counts = (get("animation-iteration-count")?.value ?? "1").toLowerCase();
        out.push({
          kind: "animation",
          rule,
          line: item.line,
          names,
          duration: time === null ? null : milliseconds(time),
          token,
          count: counts.includes("infinite") ? Infinity : Number(commaParts(counts)[0] ?? 1) || 1,
          direction: (get("animation-direction")?.value ?? "normal").toLowerCase(),
        });
      }
    }
  }
  return out;
}

/** Whether a reduce block turns a transition or an animation off: `none`, or a duration of zero. */
function turnsOff(declarations: CssDeclaration[], kind: Motion["kind"], tokens: Values): boolean {
  return declarations.some((item) => {
    if (item.property === kind)
      return (
        item.value.trim().toLowerCase() === "none" || items(item.value, tokens).every((part) => part.time !== null && (milliseconds(part.time) ?? 1) <= ZERO_MS)
      );
    if (item.property === `${kind}-duration`) return commaParts(follow(item.value, tokens) ?? "1s").every((part) => (milliseconds(part) ?? 1) <= ZERO_MS);
    if (kind === "animation" && item.property === "animation-name") return item.value.trim().toLowerCase() === "none";
    return false;
  });
}

/** Whether reduced motion answers a motion: its rule stands under no-preference, its token is zeroed, or a reduce rule turns it off. */
function answered(motion: Motion, reduce: CssRule[], tokens: Values): boolean {
  if (motion.rule.at.some(isNoPreference)) return true;
  if (
    motion.token &&
    reduce.some((rule) =>
      rule.declarations.some((item) => item.property === motion.token && (milliseconds(follow(item.value, tokens) ?? "1s") ?? 1) <= ZERO_MS),
    )
  )
    return true;
  const selector = normalSelector(motion.rule.selector);
  return reduce.some((rule) =>
    (rule.selector && normalSelector(rule.selector) === selector) || everyElement(rule.selector) ? turnsOff(rule.declarations, motion.kind, tokens) : false,
  );
}

/** How often an animation's keyframes change light or colour in its first second, and the property that changes. */
function flashRate(keyframes: CssKeyframes, motion: Motion): { rate: number; property: string } {
  const stops = new Map<number, Map<string, string>>();
  for (const stop of keyframes.stops) {
    for (const part of commaParts(stop.selector)) {
      const at = part.toLowerCase() === "from" ? 0 : part.toLowerCase() === "to" ? 100 : Number.parseFloat(part);
      if (!Number.isFinite(at)) continue;
      const values = stops.get(at) ?? new Map<string, string>();
      for (const item of stop.declarations) {
        if (!FLASHES.has(item.property)) continue;
        if ((item.property === "background" || item.property === "background-image") && !COLOUR.test(item.value)) continue;
        values.set(item.property, item.value.trim().toLowerCase());
      }
      stops.set(at, values);
    }
  }
  if (!stops.has(0)) stops.set(0, new Map());
  if (!stops.has(100)) stops.set(100, new Map());
  const ordered = [...stops.entries()].sort((a, b) => a[0] - b[0]).map(([, values]) => values);
  const properties = [...new Set(ordered.flatMap((values) => [...values.keys()]))];
  if (!properties.length || motion.duration === null || motion.duration <= ZERO_MS) return { rate: 0, property: "" };
  // A property a stop leaves out keeps the value it had; the first and last stops a design leaves out show the element's own.
  const carried: Map<string, string>[] = [];
  ordered.forEach((values, index) => {
    const before = carried[index - 1];
    carried.push(
      new Map(
        properties.map((property) => [property, values.get(property) ?? (index === 0 || index === ordered.length - 1 ? "" : (before?.get(property) ?? ""))]),
      ),
    );
  });
  let changes = 0;
  let changed = "";
  const differ = (a: Map<string, string> | undefined, b: Map<string, string> | undefined) =>
    properties.find((property) => (a?.get(property) ?? "") !== (b?.get(property) ?? ""));
  for (let index = 1; index < carried.length; index++) {
    const property = differ(carried[index - 1], carried[index]);
    if (property) {
      changes++;
      changed ||= property;
    }
  }
  if (!motion.direction.startsWith("alternate") && differ(carried.at(-1), carried[0])) changes++;
  const rate = Math.min(changes / 2 / (motion.duration / 1000), (changes / 2) * motion.count);
  return { rate, property: changed };
}

/** The motion rules over the design's CSS, its token files, and the document's tokens. */
function motionIssues(design: Design): Issue[] {
  const { own, tokens: files } = designSheets(design);
  const tokens: Values = new Map();
  for (const sheet of [...files, own])
    for (const rule of sheet.rules)
      if (!rule.inline && !rule.at.length) for (const item of rule.declarations) if (item.property.startsWith("--")) tokens.set(item.property, item.value);
  const reduce = [...files, own].flatMap((sheet) => sheet.rules.filter((rule) => rule.at.some(isReduce)));
  const keyframes = new Map(own.keyframes.map((block) => [block.name, block]));
  const issues: Issue[] = [];
  const at = (line: number) => placeOf(design, line).line;
  for (const motion of motions(own, tokens)) {
    const playing = motion.duration === null || motion.duration > ZERO_MS;
    const held = motion.names.map((name) => keyframes.get(name)).filter((block): block is CssKeyframes => block !== undefined);
    const moves =
      motion.kind === "transition"
        ? motion.names.some((name) => MOVES.test(name))
        : held.some((block) => block.stops.some((stop) => stop.declarations.some((item) => MOVES.test(item.property) && item.property !== "all")));
    const done = answered(motion, reduce, tokens);
    if (moves && playing && !done) {
      issues.push(
        motion.kind === "transition"
          ? {
              rule: "accessibility.motion-reduce",
              line: motion.line,
              message: `the transition of ${motion.names.filter((name) => MOVES.test(name)).join(", ")} on line ${at(motion.line)} still moves under reduced motion: zero its duration token in \`@media (prefers-reduced-motion: reduce)\`, or set \`transition: none\` there for this selector`,
            }
          : {
              rule: "accessibility.motion-reduce",
              line: motion.line,
              message: `the animation \`${quoted(motion.names.join(", "))}\` on line ${at(motion.line)} still moves under reduced motion: set \`animation: none\` for this selector in a reduce block, or zero its duration token`,
            },
      );
    }
    if (motion.kind !== "animation") continue;
    if (motion.count === Infinity && playing && !done) {
      issues.push({
        rule: "accessibility.motion-endless",
        line: motion.line,
        message: `the animation \`${quoted(motion.names.join(", "))}\` on line ${at(motion.line)} plays for ever, and reduced motion does not stop it: set \`animation: none\` for this selector in \`@media (prefers-reduced-motion: reduce)\`, or give it a count of plays`,
      });
    }
    for (const block of held) {
      const { rate, property } = flashRate(block, motion);
      if (rate > LIMIT) {
        const shown = Number.isFinite(rate) ? String(Math.round(rate * 10) / 10) : "many";
        issues.push({
          rule: "accessibility.flash",
          line: motion.line,
          message: `the animation \`${quoted(block.name)}\` on line ${at(motion.line)} changes ${property} ${shown} times a second: slow it to ${LIMIT} a second or fewer`,
        });
      }
    }
  }
  return issues;
}

const DATA_URI = /data:image\/(?:gif|png|webp|avif|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})/g;
const FOREVER = "plays for ever: give it a fixed count of plays, or a still image";

function decoded(base64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

/** Every image of the design that plays for ever: a data URI in its text, or a file its fixtures name. */
function imageIssues(design: Design): { issues: Issue[]; findings: Finding[] } {
  const issues: Issue[] = [];
  const lineAt = lineFinder(design.text);
  for (const found of design.text.matchAll(DATA_URI))
    if (playsForever(decoded(found[1] ?? "")))
      issues.push({ rule: "accessibility.image-motion", line: lineAt(found.index), message: `the image here ${FOREVER}` });
  const findings: Finding[] = [];
  const file = design.files[0] ?? design.name;
  for (const [name, image] of [...design.images].sort(([a], [b]) => (a < b ? -1 : 1)))
    if ("bytes" in image && playsForever(image.bytes)) findings.push(finding("accessibility.image-motion", `the image \`${quoted(name)}\` ${FOREVER}`, file));
  return { issues, findings };
}

/** The accessibility rules of a design: `issues` at lines of the walked design, and `findings` at a file of its folder. */
export function accessibilityChecks(design: Design): { issues: Issue[]; findings: Finding[] } {
  const facts = design.facts;
  if (!facts) return { issues: [], findings: [] };
  const issues: Issue[] = [];
  if (facts.document && facts.lang.value === null)
    issues.push({
      rule: "accessibility.lang",
      line: facts.lang.line,
      message: '<html> names no language: write the language of its words, such as <html lang="en">, so a screen reader speaks them right',
    });
  issues.push(...structureIssues(design, facts), ...motionIssues(design));
  const images = imageIssues(design);
  return { issues: [...issues, ...images.issues], findings: images.findings };
}
