// The raw-color rule: a hex code, a colour function, or a named colour written outside the design's tokens block,
// where a design reads a role with `var()` instead. It reads one declaration at a time, as the CSS reader gives it.
// The keywords that are no colour of their own stay allowed, with the system colours a forced-colors style needs.
import { stringEnd } from "./sheet.ts";

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

// Section 6.2, "System Colors", lowercased: a forced-colors style names them, so they are no raw colour.
const SYSTEM = new Set(
  `accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext
  highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext`.split(/\s+/),
);
// The keywords that name no colour of their own, in a CSS colour value and in an SVG `fill` or `stroke`.
const KEYWORDS = ["transparent", "currentcolor", "inherit", "initial", "unset", "revert", "revert-layer", "none"];
export const SAFE_PAINT = new Set([...KEYWORDS, ...SYSTEM, "", "context-fill", "context-stroke"]);

// A property holds a colour when its name, lowercase, holds one of these words: `mask` and `filter` take one in a
// gradient or a `drop-shadow(`, and the shorthands name their colour with no `color` in the name.
const COLOR_PROPERTIES = [
  "color",
  "background",
  "border",
  "fill",
  "stroke",
  "outline",
  "shadow",
  "mask",
  "filter",
  "text-decoration",
  "text-emphasis",
  "column-rule",
];
const COLOR_VALUE = /#[0-9a-fA-F]{3,8}(?![\p{L}\p{N}_])|(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/iu;
// A word in a value that is no part of a longer word, a custom property's name (`--red`), a function's name
// (`tan(`), or a hex code.
const WORD = /(?<![\p{L}\p{N}_#-])[a-z]+(?![\p{L}\p{N}_(-])/giu;
const BARE = /^\s*([a-z]+)\s*$/i;

/**
 * A value with each string and each `url()` cut out, each one a space: a URL names a file or an element, such as
 * `url(#fade)`, and a string is text, so neither holds a color. A `url(` inside a string is the string's.
 */
function withoutText(value: string): string {
  const parts: string[] = [];
  let pos = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    let end = -1;
    if (char === '"' || char === "'") end = stringEnd(value, index);
    else if ((char === "u" || char === "U") && !/[\p{L}\p{N}_-]/u.test(value[index - 1] ?? "") && value.slice(index, index + 4).toLowerCase() === "url(") {
      let at = index + 4;
      while (/\s/.test(value[at] ?? "")) at++;
      const quote = value[at] === '"' || value[at] === "'" ? stringEnd(value, at) : at;
      const close = value.indexOf(")", quote);
      end = close < 0 ? value.length : close;
    }
    if (end < 0) continue;
    parts.push(value.slice(pos, index), " ");
    pos = end + 1;
    index = end;
  }
  return parts.join("") + value.slice(pos);
}

/**
 * The value of a declaration that holds a raw colour, read by its property and its value as the CSS reader reads them,
 * with every string and `url()` cut out; null when it holds none. A custom property has no type, so `--font: Tan` could
 * be a font: only a value that is one colour name counts there.
 */
export function rawColor(property: string, value: string): string | null {
  const name = property.toLowerCase();
  const custom = name.startsWith("--");
  if (!custom && !COLOR_PROPERTIES.some((word) => name.includes(word))) return null;
  const text = withoutText(value);
  if (COLOR_VALUE.test(text)) return text;
  if (custom) {
    const bare = BARE.exec(text);
    return bare !== null && NAMED.has((bare[1] ?? "").toLowerCase()) ? text : null;
  }
  return Array.from(text.matchAll(WORD), (found) => found[0].toLowerCase()).some((word) => NAMED.has(word)) ? text : null;
}
