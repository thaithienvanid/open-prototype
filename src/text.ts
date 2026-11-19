// Text helpers that every message and every name rule share. Lengths and cuts count code points, not UTF-16 units,
// so a limit such as "80 characters" means what a person counts, and an emoji is one character.

// Control characters and direction marks: a value from a design never prints one, so it cannot erase a line of the
// terminal, reorder a message, or print a false "ok".
const UNSAFE = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const QUOTE_LIMIT = 80;

function codePoints(text: string): string[] {
  return Array.from(text);
}

export function length(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

export function cut(text: string, limit: number): string {
  return length(text) <= limit ? text : codePoints(text).slice(0, limit).join("");
}

/** A text with no control character and no direction mark, whole: a path a message prints, such as a file's. */
export function printable(text: string): string {
  return text.replace(UNSAFE, "");
}

/** A value from the design as a message prints it: no control character, and 80 characters at most. */
export function quoted(value: string): string {
  const clean = value.replace(UNSAFE, "");
  return length(clean) <= QUOTE_LIMIT
    ? clean
    : `${codePoints(clean)
        .slice(0, QUOTE_LIMIT - 1)
        .join("")}…`;
}

// The characters the format's rules treat as white space: the Unicode white space set, so a name padded with a
// no-break space reads the same as one padded with a space.
const SPACE = "\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const LEADING = new RegExp(`^[${SPACE}]+`, "u");
const TRAILING = new RegExp(`[${SPACE}]+$`, "u");
const RUNS = new RegExp(`[${SPACE}]+`, "u");

export function strip(text: string): string {
  return text.replace(LEADING, "").replace(TRAILING, "");
}

export function words(text: string): string[] {
  return strip(text)
    .split(RUNS)
    .filter((part) => part !== "");
}

export function isSpace(char: string): boolean {
  return char !== "" && strip(char) === "";
}

export function plural(count: number, noun: string): string {
  return count === 1 ? `${count} ${noun}` : `${count} ${noun}s`;
}

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
}

/** A camel-case name in lowercase, a hyphen before each word: `backgroundColor` is `background-color`. */
export function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** A name in lowercase words joined by hyphens: `ItemCard` and `Item card` are `item-card`. */
export function slug(text: string): string {
  return (
    kebabCase(text)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** A value from a design or a file as a message names it: as JSON writes it, 80 characters at most. */
export function shown(value: unknown): string {
  return quoted(JSON.stringify(value) ?? "null");
}

/** The edit distance of two names, in code points, for "did you mean". */
export function distance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j] ?? 0;
      row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = above;
    }
  }
  return row[right.length] ?? 0;
}

/** Where each line of a text starts, by offset: the first line at 0. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** The line of each offset of a text, by a search over its line starts. */
export function lineFinder(text: string): (at: number) => number {
  const starts = lineStarts(text);
  return (at) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((starts[middle] ?? 0) <= at) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

/** The nearest of the names, when one is near enough to be meant. */
export function nearest(name: string, options: Iterable<string>): string | null {
  let best: string | null = null;
  for (const option of options) {
    const d = distance(name, option);
    if (d <= Math.max(1, Math.floor(option.length / 3)) && (best === null || d < distance(name, best))) best = option;
  }
  return best;
}
