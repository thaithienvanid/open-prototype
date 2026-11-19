// The integrity of a design: every link, parent, and first state names a thing the design has, each screen has a
// state, no test id repeats on one screen, every key the design reads is in its example data, and the first screen
// reaches every other.

import { fixtureValue, UNSAFE_KEYS } from "../contract.ts";
import type { Issue, Screen } from "../design/facts.ts";
import { type Design, fromTop, placeOf } from "../design/load.ts";
import { ATTR } from "../format.ts";
import type { Json } from "../json.ts";
import { quoted } from "../text.ts";
import { choose } from "./names.ts";

/** How a message names another line: `line 12` in the same file, or the file and line in another. */
function lineNamer(design: Design): (line: number, from: number) => string {
  return (line, from) => {
    const there = placeOf(design, line);
    return there.file === placeOf(design, from).file ? `line ${there.line}` : `${fromTop(design, there.file)}:${there.line}`;
  };
}

function entries(fixtures: Json, key: string): Json[] | null {
  const found = fixtureValue(fixtures, key);
  return Array.isArray(found) ? (found as Json[]) : null;
}

// Each key the design reads from its example data and the data lacks. A text names a key of the fixtures, from the
// top, wherever it stands. A field names a key of the current item: the entry of its list, or the chosen entry of the
// list its screen names with a source. A list's key names a list. An image reads the current item where there is one.
function fixtureKeys(design: Design, found: Issue[]): void {
  const facts = design.facts;
  // Fixtures that cannot be read have their one finding: no key is looked for in them.
  if (!facts || design.findings.some((item) => item.rule === "read.fixtures")) return;
  const lists = facts.lists.map((list) => list.key);
  const byList = new Map(facts.lists.map((list) => [list.template, entries(design.fixtures, list.key) ?? []]));
  const holds = (rows: Json[] | null | undefined, key: string) => Boolean(rows?.some((row) => fixtureValue(row, key) !== undefined));
  for (const use of facts.fixtureUses) {
    if (use.key.includes("{{")) continue;
    const named = `${use.attribute}="${quoted(use.key)}"`;
    const say = (message: string) => found.push({ rule: "integrity.fixture-key", line: use.line, message });
    // A key the viewer never reads, since it could reach an object's own parts.
    if (use.key.split(".").some((part) => UNSAFE_KEYS.has(part))) {
      say(`${named} names a key the viewer never reads, as it could reach the data's own parts: rename the key`);
      continue;
    }
    const rows = use.template ? byList.get(use.template) : use.source ? entries(design.fixtures, use.source) : null;
    const entryOf = use.template ? "any entry of its list" : `any entry of \`${quoted(use.source)}\``;
    if (use.attribute === ATTR.list) {
      if (!use.template && entries(design.fixtures, use.key) === null)
        say(`${named} names no key of the fixtures that holds a list: add it, or name a key it holds`);
    } else if (use.attribute === ATTR.field) {
      if (!use.template && !use.source)
        say(
          `${named} stands outside every list's item and every screen with ${ATTR.source}, so it has no entry to read: put it inside a list's item, or name the list on its screen with ${ATTR.source}; for a key of the fixtures, use ${ATTR.text}`,
        );
      else if (rows?.length && !holds(rows, use.key))
        say(`${named} names no key of ${entryOf}: add it to the entries, or use ${ATTR.text} for a key of the fixtures`);
    } else if (use.attribute === ATTR.image && rows) {
      if (rows.length && !holds(rows, use.key)) say(`${named} names no key of ${entryOf}: add it to the entries, or name a key they hold`);
    } else if (fixtureValue(design.fixtures, use.key) === undefined) {
      // A key that only an entry holds says how to read it: here, or on a screen that names its list.
      const field = `use ${ATTR.field}="${quoted(use.key)}"`;
      const holder = holds(rows, use.key) ? null : lists.find((key) => holds(entries(design.fixtures, key), use.key));
      const step = holds(rows, use.key)
        ? `; it is a key of ${entryOf}, so ${field}`
        : holder && !use.template && !use.source
          ? `; it is a key of the entries of \`${quoted(holder)}\`, so ${field}, and name that list on this screen with ${ATTR.source}="${quoted(holder)}"`
          : holder
            ? `; it is a key of the entries of \`${quoted(holder)}\`, so ${field} where an entry of that list is shown`
            : ": add it to the fixtures, or name a key they hold";
      say(`${named} names no key of the fixtures${step}`);
    }
  }
  for (const screen of facts.screens) {
    if (screen.source && entries(design.fixtures, screen.source) === null)
      found.push({
        rule: "integrity.fixture-key",
        line: screen.line,
        message: `${ATTR.source}="${quoted(screen.source)}" names no list of the fixtures: name the list this screen shows an item of`,
      });
  }
}

export function integrityIssues(design: Design): Issue[] {
  const facts = design.facts;
  if (!facts) return [];
  const nameLine = lineNamer(design);
  const found: Issue[] = [];
  for (const [line, id, first, at] of facts.idRepeats)
    found.push({
      rule: "integrity.id-repeat",
      line,
      at,
      message: `id="${quoted(id)}" repeats the id on ${nameLine(first, line)}; give each element its own id`,
    });
  // A reading stopped at the depth limit holds a fragment of the design, so its screens are not the design's.
  if (facts.tooDeep) return found;
  const byId = new Map<string, Screen>();
  for (const screen of facts.screens) {
    const first = byId.get(screen.id);
    if (first)
      found.push({
        rule: "integrity.screen-repeat",
        line: screen.line,
        message: `screen \`${quoted(screen.id)}\` repeats the screen on ${nameLine(first.line, screen.line)}; give each screen its own id`,
      });
    else byId.set(screen.id, screen);
    if (!screen.states.length) {
      found.push({
        rule: "integrity.no-state",
        line: screen.line,
        message: `screen \`${quoted(screen.id)}\` has no state; wrap its content in <div ${ATTR.state}="success"> (or empty, loading, error, ...)`,
      });
    } else if (screen.initial !== null && !screen.states.includes(screen.initial)) {
      found.push({
        rule: "integrity.initial",
        line: screen.line,
        message: `${ATTR.initial}="${quoted(screen.initial)}" names no state of \`${quoted(screen.id)}\`; ${choose(screen.initial, screen.states, "state")}`,
      });
    }
  }
  const names = [...byId.keys()];
  if (!facts.screens.length)
    found.push({
      rule: "integrity.no-screen",
      line: 1,
      message: `the design draws no screen; add <section ${ATTR.screen}="<id>" ${ATTR.title}="..."> with a state inside it`,
    });
  for (const screen of facts.screens) {
    if (screen.parent !== null && !byId.has(screen.parent)) {
      found.push({
        rule: "integrity.parent",
        line: screen.line,
        message: `${ATTR.parent}="${quoted(screen.parent)}" on screen \`${quoted(screen.id)}\` names no screen; ${choose(screen.parent, names, "screen")}`,
      });
    }
  }
  const edges = new Map<string, Set<string>>();
  for (const link of facts.links) {
    // A placeholder in a starting design, filled when the design is written.
    if (link.value.includes("{{")) continue;
    const slash = link.value.indexOf("/");
    const target = slash < 0 ? link.value : link.value.slice(0, slash);
    const state = slash < 0 ? "" : link.value.slice(slash + 1);
    const screen = byId.get(target);
    if (!screen)
      found.push({
        rule: "integrity.link-screen",
        line: link.line,
        at: link.at,
        message: `${link.attribute}="${quoted(link.value)}" names no screen; ${choose(target, names, "screen")}`,
      });
    else if (state && !screen.states.includes(state)) {
      found.push({
        rule: "integrity.link-state",
        line: link.line,
        at: link.at,
        message: `${link.attribute}="${quoted(link.value)}" names no state of \`${quoted(target)}\`; ${choose(state, screen.states, "state")}`,
      });
    } else {
      const from = edges.get(link.screen) ?? new Set<string>();
      from.add(target);
      edges.set(link.screen, from);
    }
  }
  fixtureKeys(design, found);
  found.push(...repeats(design, nameLine), ...unreached(design, edges));
  return found;
}

// A test id used twice on one screen, as a test tool sees the screen: its chrome and every state. A list's item
// template repeats once for each item, so it is left out.
function repeats(design: Design, nameLine: (line: number, from: number) => string): Issue[] {
  const facts = design.facts;
  if (!facts) return [];
  const found = new Map<string, Issue>();
  // Each screen's own test ids, and the chrome's, which every screen shows, each list in the document's order: one pass.
  type TestId = (typeof facts.testIds)[number];
  const shown = facts.testIds.filter((testId) => !testId.inTemplate);
  const order = new Map(shown.map((testId, index) => [testId, index]));
  const chrome: TestId[] = [];
  const own = new Map<string, TestId[]>();
  for (const testId of shown) {
    if (!testId.screen) chrome.push(testId);
    else {
      const list = own.get(testId.screen);
      if (list) list.push(testId);
      else own.set(testId.screen, [testId]);
    }
  }
  // A screen's test ids and the chrome's, in the document's order.
  const merged = (mine: TestId[]): TestId[] => [...chrome, ...mine].sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  for (const screen of facts.screens.length ? facts.screens : [null]) {
    const first = new Map<string, number>();
    const ids = screen ? merged(own.get(screen.id) ?? []) : shown;
    for (const testId of ids) {
      const earlier = first.get(testId.name);
      if (earlier === undefined) first.set(testId.name, testId.line);
      else {
        found.set(`${testId.line}\u0000${testId.name}`, {
          rule: "integrity.testid-repeat",
          line: testId.line,
          at: testId.at,
          message: `${ATTR.testid}="${quoted(testId.name)}" repeats the one on ${nameLine(earlier, testId.line)} on the same screen; give each element its own test id`,
        });
      }
    }
  }
  return [...found.values()];
}

// The screens no chain of links from the first screen opens. A link in the chrome, such as a tab, is on every screen.
function unreached(design: Design, edges: Map<string, Set<string>>): Issue[] {
  const screens = design.facts?.screens ?? [];
  const first = screens[0];
  if (!first || screens.length < 2) return [];
  const chrome = edges.get("") ?? new Set<string>();
  const reached = new Set([first.id]);
  const todo = [first.id];
  while (todo.length) {
    const from = todo.pop() ?? "";
    for (const next of [...(edges.get(from) ?? []), ...chrome]) {
      if (!reached.has(next)) {
        reached.add(next);
        todo.push(next);
      }
    }
  }
  return screens
    .filter((screen) => !reached.has(screen.id))
    .map((screen) => ({
      rule: "integrity.unreached",
      line: screen.line,
      message: `screen \`${quoted(screen.id)}\` is not reached from the first screen, \`${quoted(first.id)}\`, by any ${ATTR.go}; link to it from a screen or from the navigation`,
    }));
}
