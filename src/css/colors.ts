// The raw-color rule: a hex code, a color function, or a named color written outside the design's tokens block,
// where a design reads a role with `var()` instead. It reads one declaration at a time, as the CSS reader gives it.
// The keywords that are no color of their own stay allowed, with the system colors a forced-colors style needs.
import { words } from "../text.ts";

// CSS Color Module Level 4, section 6.1, "Named Colors" (https://www.w3.org/TR/css-color-4/#named-colors): its 148
// names, read 2026-11-16. CSS reads a keyword without regard to case, so each name is lowercase here.
const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue
  lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise
  mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange
  orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna
  silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet
  wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
);
/** Whether a word is one of the 148 named colours, in any case. */
export function namedColor(word: string): boolean {
  return NAMED.has(word.toLowerCase());
}

// Section 6.2, "System Colors", lowercased: a forced-colors style names them, so they are no raw color.
const SYSTEM = new Set(
  `accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext
  highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext`.split(/\s+/),
);
// The keywords that name no color of their own, in a CSS color value and in an SVG `fill` or `stroke`.
const KEYWORDS = ["transparent", "currentcolor", "inherit", "initial", "unset", "revert", "revert-layer", "none"];
export const SAFE_PAINT = new Set([...KEYWORDS, ...SYSTEM, "", "context-fill", "context-stroke"]);

// A declaration ends at `;`, `"`, or `}`; a property name is a run of lowercase letters and dashes that ends at `:`.
// A property holds a color when its name holds one of these words: `mask` and `filter` take one in a gradient or a
// `drop-shadow(`.
const DECLARATION = /[^;"}]+/g;
const PROPERTY = /(?<![a-z-])(?:[a-z-]+|--[a-z0-9-]+): */g;
const COLOR_PROPERTIES = ["color", "background", "border", "fill", "stroke", "outline", "shadow", "mask", "filter"];
const COLOR_VALUE = /#[0-9a-fA-F]{3,8}(?![\p{L}\p{N}_])|(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/gu;
// A word in a value that is no part of a longer word, a custom property's name (`--red`), a function's name
// (`tan(`), or a hex code. A URL and a string hold no color, so they are cut out first.
const WORD = /(?<![\p{L}\p{N}_#-])[a-z]+(?![\p{L}\p{N}_(-])/giu;
const QUOTED = /url\([^)]*\)|'[^']*'/gi;
const BARE = /^\s*([a-z]+)\s*(?:!important)?\s*$/i;

// A custom property has no type, so `--font: Tan` could be a font: only a value that is one color name counts there.
function namesAColor(value: string, custom: boolean): boolean {
  const text = value.replace(QUOTED, " ");
  if (custom) {
    const bare = BARE.exec(text);
    return bare !== null && NAMED.has((bare[1] ?? "").toLowerCase());
  }
  return Array.from(text.matchAll(WORD), (found) => found[0].toLowerCase()).some((word) => NAMED.has(word));
}

/** Where in the text the property of the first raw color starts, or null when it holds none. */
export function rawColor(text: string): number | null {
  for (const declaration of text.matchAll(DECLARATION)) {
    const part = declaration[0];
    for (const prop of part.matchAll(PROPERTY)) {
      const name = prop[0].replace(/[: ]+$/, "");
      if (name.startsWith("--") || COLOR_PROPERTIES.some((word) => name.includes(word))) {
        // The first color property has the longest rest of the declaration, so no later one can match when it does
        // not: one bounded search for each declaration.
        const after = prop.index + prop[0].length;
        COLOR_VALUE.lastIndex = after;
        if (COLOR_VALUE.exec(part) || namesAColor(part.slice(after), name.startsWith("--"))) return declaration.index + prop.index;
        break;
      }
    }
  }
  return null;
}

/** The declaration a raw color sits in, from its property name to its end, on one line and cut short for a message. */
export function declarationAt(text: string, start: number): string {
  const before = text.slice(0, start);
  const name = /[a-z-]*$/.exec(before)?.[0] ?? "";
  const rest = /^[^;"}]*/.exec(text.slice(start))?.[0] ?? "";
  return Array.from(words(name + rest).join(" "))
    .slice(0, 70)
    .join("");
}
