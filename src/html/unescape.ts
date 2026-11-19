// Character references, as HTML5 reads them. The table is the standard's list of named references
// (https://html.spec.whatwg.org/multipage/named-characters.html), each name with and without its `;` where the
// standard allows both.
import entityTable from "./entities.json" with { type: "json" };

const ENTITIES: Record<string, string> = entityTable;

// The numeric references the standard maps to another character, from section 13.2.5.80.
// biome-ignore-start lint/complexity/useSimpleNumberKeys: each key is the code point in hexadecimal, as the standard's table writes it.
const REMAPPED: Record<number, string> = {
  0x00: "�",
  0x0d: "\r",
  0x80: "€",
  0x81: "\x81",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8d: "\x8d",
  0x8e: "Ž",
  0x8f: "\x8f",
  0x90: "\x90",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9d: "\x9d",
  0x9e: "ž",
  0x9f: "Ÿ",
};
// biome-ignore-end lint/complexity/useSimpleNumberKeys: the table ends here.

const REFERENCE = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/gu;

function replaced(reference: string): string {
  if (reference.startsWith("#")) {
    const hex = reference[1] === "x" || reference[1] === "X";
    const digits = reference.slice(hex ? 2 : 1).replace(/;$/, "");
    const code = parseInt(digits, hex ? 16 : 10);
    const remapped = REMAPPED[code];
    if (remapped !== undefined) return remapped;
    if ((code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff || !Number.isFinite(code)) return "�";
    // A control character or a noncharacter is a parse error the standard reads past: the code point is kept.
    return String.fromCodePoint(code);
  }
  const whole = ENTITIES[reference];
  if (whole !== undefined) return whole;
  // The longest name the standard knows wins, and the rest stays text.
  for (let end = reference.length - 1; end > 1; end--) {
    const named = ENTITIES[reference.slice(0, end)];
    if (named !== undefined) return named + reference.slice(end);
  }
  return `&${reference}`;
}

/** Text with every character reference replaced, as in a text node. */
export function unescapeText(text: string): string {
  return text.includes("&") ? text.replace(REFERENCE, (_whole, reference: string) => replaced(reference)) : text;
}

const ATTRIBUTE_REFERENCE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*)[;=]?/g;

/** An attribute's value with its references replaced: a named one only when it is exact and not followed by `=`. */
export function unescapeAttribute(text: string): string {
  return text.replace(ATTRIBUTE_REFERENCE, (whole: string) => {
    if (whole.startsWith("&#")) return unescapeText(whole);
    if (!whole.endsWith("=") && ENTITIES[whole.slice(1)] !== undefined) return unescapeText(whole);
    return whole;
  });
}
