// What a design holds, as data an agent or a test reads instead of the HTML: its screens in drawn order, and its
// component contract. Both come from the walk's facts, so the same design always gives the same bytes.
import type { Facts } from "./design/facts.ts";
import { OUTPUT_VERSION } from "./format.ts";

export type ScreenData = { id: string; title: string; parent: string | null; initial: string | null; states: string[] };
type Component = { name: string; variants: string[]; screens: string[]; testids: string[] };
export type Contract = { schema_version: string; components: Component[] };

/** The screens as data, in the order the design draws them. */
export function screensOf(facts: Facts): ScreenData[] {
  return facts.screens.map((screen) => ({ id: screen.id, title: screen.title, parent: screen.parent, initial: screen.opensIn(), states: screen.states }));
}

/**
 * The component contract: each component with its variants, its screens, and its test ids, sorted. A component in a
 * list's item template is on the screens whose lists repeat it; one on no screen sits in the chrome.
 */
export function componentContract(facts: Facts): Contract {
  const found = new Map<string, { variants: Set<string>; screens: Set<string>; testids: Set<string> }>();
  for (const part of facts.components) {
    const entry = found.get(part.name) ?? { variants: new Set(), screens: new Set(), testids: new Set() };
    found.set(part.name, entry);
    entry.variants.add(part.variant);
    const listed = part.template ? facts.lists.filter((list) => list.template === part.template && list.screen !== "").map((list) => list.screen) : [];
    for (const screen of listed.length ? listed : [part.screen]) if (screen) entry.screens.add(screen);
    if (part.testid) entry.testids.add(part.testid);
  }
  const sorted = (values: Set<string>) => [...values].sort();
  return {
    schema_version: OUTPUT_VERSION,
    components: [...found.keys()].sort().map((name) => {
      const entry = found.get(name) ?? { variants: new Set<string>(), screens: new Set<string>(), testids: new Set<string>() };
      return { name, variants: sorted(entry.variants), screens: sorted(entry.screens), testids: sorted(entry.testids) };
    }),
  };
}
