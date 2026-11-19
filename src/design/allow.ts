import { ATTR, DATA_IMAGE, META, PROGRAM } from "../format.ts";
import { firstValues } from "../html/tokenizer.ts";
import { quoted } from "../text.ts";

// The allow-list: the elements and attributes a design may hold, by context and by place. Anything outside it is
// unsafe markup, which stops the page. The page's policy and the frames' sandbox stay behind it as the second and
// third layers.

const HTML_ELEMENTS = new Set(
  `a abbr address article aside b bdi bdo blockquote br button caption cite code col colgroup datalist dd del details dfn dialog div dl dt em fieldset
  figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label legend li main mark menu meter nav ol
  optgroup option output p pre progress q s samp section select small span strong style sub summary sup table tbody td
  template textarea tfoot th thead time tr u ul var wbr`.split(/\s+/),
);
// SVG's drawing elements, and `title` and `desc`, which name an icon.
const SVG_ELEMENTS = new Set(
  `svg g defs symbol use path circle ellipse line polyline polygon rect text tspan title desc linearGradient radialGradient
  stop clipPath mask`
    .split(/\s+/)
    .map((name) => name.toLowerCase()),
);

const GLOBAL_ATTRIBUTES = new Set("class id title lang dir hidden tabindex role style slot popover inert contenteditable".split(" "));
const ELEMENT_ATTRIBUTES = new Set(
  `type name value placeholder checked disabled readonly required min max step for alt width height colspan rowspan
  scope open datetime selected multiple rows cols maxlength minlength autocomplete inputmode src href start reversed
  span headers abbr low high optimum label rel target list`.split(/\s+/),
);
const SVG_ATTRIBUTES = new Set(
  `viewbox d fill stroke width height x y x1 x2 y1 y2 cx cy r rx ry points transform opacity offset stop-color stop-opacity
  gradientunits gradienttransform fill-rule clip-rule clip-path focusable xmlns preserveaspectratio dx dy text-anchor
  dominant-baseline font-size font-weight font-family mask pathlength vector-effect fill-opacity`.split(/\s+/),
);
/** The allow-list's own lists, for the reference to print: the elements by place, and the attributes by element. */
export const ALLOW_LIST = {
  bodyElements: [...HTML_ELEMENTS],
  svgElements: [...SVG_ELEMENTS],
  everyElement: [...GLOBAL_ATTRIBUTES],
  htmlAttributes: [...ELEMENT_ATTRIBUTES],
  svgAttributes: [...SVG_ATTRIBUTES],
} as const;

// An input of these types sends or loads something of its own.
const INPUT_TYPES_REFUSED = new Set(["image", "file", "submit", "reset"]);

type Context = "html" | "svg";

/** Where an element stands: in the document's head, directly in its body, or deeper. */
/** Where an element stands: in the head or not, and its parent's tag. */
type ElementPlace = { head: boolean; parent: string };

/** The elements of a document's own frame, each once: they are checked by the walk, never here. */
export const DOCUMENT = new Set(["html", "head", "body"]);
const HEAD_NAMES = new Set<string>(Object.values(META));

/** A URL as a browser reads it: tabs and line breaks removed, and control characters and spaces cut from the start. */
export function urlAsRead(value: string): string {
  return value.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
}

/** Whether an href names another view, `#<screen>/<state>`, which the format reserves for its own link attribute. */
export function viewLink(tag: string, name: string, value: string | null): boolean {
  return tag === "a" && name === "href" && /^#[^/]*\//.test(urlAsRead(value ?? ""));
}

/** Why an element may not stand where it is, or "". */
export function elementProblem(tag: string, attrs: [string, string | null][], context: Context, place: ElementPlace): string {
  if (context === "svg") return SVG_ELEMENTS.has(tag) ? "" : `a <${tag}> inside <svg>: an icon draws with svg's shapes, title, and desc only`;
  if (place.head) {
    if (tag === "title" || tag === "style") return "";
    if (tag === "meta") return metaProblem(attrs);
    if (tag !== "script") return `a <${quoted(tag)}> in <head>: the head holds <title>, <meta>, <style>, and the fixtures block only`;
  }
  if (tag === "script") {
    const names = attrs
      .map(([name]) => name)
      .sort()
      .join(" ");
    const type = attrs.find(([name]) => name === "type")?.[1]?.toLowerCase();
    return names === `${ATTR.fixtures} type` && type === "application/json"
      ? ""
      : `a <script>: the one script a design holds is <script type="application/json" ${ATTR.fixtures}>, with no other attribute`;
  }
  if (tag === "svg") return "";
  if (tag === "title" || tag === "meta") return `a <${tag}> outside <head>: it names the document, so it belongs in its head`;
  if (!HTML_ELEMENTS.has(tag)) return `a <${quoted(tag)}>: no design holds one; draw it with ordinary elements, and the viewer holds the one runtime`;
  if (tag === "style" && place.parent !== "body") return "a <style> inside an element: put the styles in <head>, or directly in <body>";
  if (tag === "template" && !attrs.some(([name]) => name === ATTR.item))
    return `a <template> with no ${ATTR.item}: the one template a design holds is a list's item`;
  return "";
}

function metaProblem(attrs: [string, string | null][]): string {
  // One written twice is refused before this, by the walk.
  const a = firstValues(attrs);
  const names = [...a.keys()].sort().join(" ");
  if (names === "charset") return "";
  if (names === "content name" && HEAD_NAMES.has((a.get("name") ?? "").toLowerCase())) return "";
  if (names === "content http-equiv" && (a.get("http-equiv") ?? "").toLowerCase() === "content-security-policy") return "";
  return `a <meta> that is no charset, no policy of the design's own, and none of the names ${[...HEAD_NAMES].join(", ")}`;
}

/** Why an attribute may not stand on an element, or "". */
export function attributeProblem(tag: string, name: string, value: string | null, context: Context): string {
  if (tag === "meta" || tag === "script") return "";
  if (name.startsWith("on")) return `an event handler (${quoted(name)}): the viewer holds the one runtime, and the design is markup only`;
  if (name.startsWith("data-") || name.startsWith("aria-") || GLOBAL_ATTRIBUTES.has(name)) return "";
  if (name === "href") {
    const url = urlAsRead(value ?? "");
    if ((tag === "a" || tag === "use") && url.startsWith("#")) return "";
    // A deep link to another screen, such as #items/empty, is checked as a link of the format's own, in the structure.
    if (tag === "a" && /^https:\/\/[^\s]+$/i.test(url)) return "";
    return `a link to "${quoted(url.slice(0, 40))}" on <${tag}>: a link goes to #<id> in the same screen, or to https:// on an <a>; to open another view, use ${ATTR.go}="<screen>/<state>"`;
  }
  if (name === "src") {
    if (tag === "img" && DATA_IMAGE.test(urlAsRead(value ?? ""))) return "";
    return `a src on <${tag}>: an image comes from the fixtures through ${ATTR.image}, or as a data:image URI on an <img>`;
  }
  if (tag === "input" && name === "type" && INPUT_TYPES_REFUSED.has((value ?? "").toLowerCase())) {
    return `an <input type="${quoted(value ?? "")}">: the design sends and loads nothing; use <button type="button" ${ATTR.go}="...">`;
  }
  if (tag === "button" && name === "type" && (value ?? "").toLowerCase() !== "button") {
    return `a <button type="${quoted(value ?? "")}">: the design submits nothing; write type="button"`;
  }
  if (context === "svg" ? SVG_ATTRIBUTES.has(name) || name.startsWith("stroke") : ELEMENT_ATTRIBUTES.has(name)) return "";
  return `the attribute ${quoted(name)} on <${quoted(tag)}>: no design needs it; the reference's allow-list names the allowed ones, and \`${PROGRAM} guide --reference\` prints it`;
}
