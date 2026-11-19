// What a message says about a name that matches nothing: the nearest option, when one is near, and the options.
import { nearest, quoted } from "../text.ts";

/** A message lists this many options, then says how many more. */
const LIST_LIMIT = 10;
/** Past this many options, the nearest-name search is skipped, because it costs time for each one. */
const SUGGEST_LIMIT = 300;

export function choose(name: string, options: string[], noun: string): string {
  if (!options.length) return `this design draws no ${noun} to name`;
  const near = options.length <= SUGGEST_LIMIT ? nearest(name, options) : null;
  let listed = options.slice(0, LIST_LIMIT).map(quoted).join(", ");
  if (options.length > LIST_LIMIT) listed += `, and ${options.length - LIST_LIMIT} more`;
  return near !== null ? `did you mean \`${quoted(near)}\`? Name one of ${listed}` : `name one of ${listed}`;
}
