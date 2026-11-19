// Storybook's static index against the component contract: each component variant has a story.
import { Refusal } from "./errors.ts";
import { PROGRAM } from "./format.ts";
import { isObject, type Json } from "./json.ts";
import type { Contract } from "./manifest.ts";
import { slug } from "./text.ts";

/**
 * Each story in Storybook's `index.json` (version 4 and later hold `entries`; version 3 holds `stories`) as its component
 * and variant: the last part of its title and its name, in kebab case. A story with no title or name falls back to its
 * id, `<title>--<name>`. An index of another shape is a refused request, `request.file`.
 */
export function storiesOf(index: Json): Set<string> {
  const unread = (why: string) =>
    new Refusal(
      `the stories index ${why}, so it is no index Storybook writes: run \`storybook build\`, then name its index.json to \`${PROGRAM} stories\``,
      "request.file",
    );
  if (!isObject(index)) throw unread("holds no JSON object");
  const entries = Object.hasOwn(index, "entries") ? index.entries : Object.hasOwn(index, "stories") ? index.stories : {};
  if (!isObject(entries)) throw unread("holds entries that are no JSON object");
  const found = new Set<string>();
  for (const [key, entry] of Object.entries(entries)) {
    if (!isObject(entry) || (Object.hasOwn(entry, "type") ? entry.type : "story") !== "story") continue;
    const text = (value: Json | undefined) => (typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value));
    const id = Object.hasOwn(entry, "id") ? text(entry.id) : key;
    const split = id.indexOf("--");
    const title = split < 0 ? id : id.slice(0, split);
    const name = split < 0 ? "" : id.slice(split + 2);
    const component = slug((text(entry.title) || title).split("/").at(-1) ?? "");
    found.add(storyKey(component, slug(text(entry.name) || name)));
  }
  return found;
}

function storyKey(component: string, variant: string): string {
  return `${component}\u0000${variant}`;
}

/** Each component variant with no story of its own, with the words that say what to add. */
export function missingStories(contract: Contract, stories: Set<string>): { component: string; variant: string; message: string }[] {
  return contract.components.flatMap((component) =>
    component.variants
      .filter((variant) => !stories.has(storyKey(component.name, variant)))
      .map((variant) => ({
        component: component.name,
        variant,
        message: `component \`${component.name}\` has no story for its \`${variant}\` variant: add one titled \`.../${component.name}\` (or set the CSF \`title\` so it ends so) and named \`${variant}\``,
      })),
  );
}
