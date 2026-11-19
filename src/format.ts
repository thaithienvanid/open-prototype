// The design format's names and rules, each written once, so the reader, the checks, the page, and the messages agree.

/** The program's name, as every message that names a command writes it. */
export const PROGRAM = "open-prototype";

/** The settings file a project may keep in its top folder. */
export const CONFIG_FILE = "prototype.config.json";

/** The newest design format this tool reads. A design names its format on `<html>`. */
export const FORMAT = 1;
/** The version of every JSON shape the tool prints, from this one constant. */
export const OUTPUT_VERSION = "1";
/** The version of the round files a project keeps, `comments.json` and `changes.json`: apart from what the tool prints. */
export const ROUND_VERSION = "1";

/** The one prefix of every name the tool gives a meaning to in a design. */
export const PREFIX = "data-proto-";

/**
 * The vocabulary, complete, by kind. A designer writes the first four kinds; the tool sets the last inside a frame,
 * and a design that writes one of those is refused. `arg-<name>` is any name after `arg-`.
 */
export const VOCABULARY = {
  structure: ["format", "screen", "title", "parent", "initial", "state", "source", "device"],
  content: ["text", "image", "fixtures", "tokens", "list", "item", "field", "limit"],
  behaviour: ["go", "back", "toggle", "panel"],
  composition: ["component", "variant", "use", "arg-<name>", "flow", "slot"],
  set_by_the_tool: ["platform", "theme", "pick", "highlight", "comment", "commenting", "href"],
} as const;

/** What each name does, in one line, for the guide and the format reference. */
export const MEANING: Record<string, string> = {
  format: "on <html>: the design format the file is written in",
  screen: "on a <section>: a screen, by its id",
  title: "on a screen or a flow: its name, as data",
  parent: "on a screen: the screen Back returns to",
  initial: "on a screen: the state it opens in",
  state: "on a direct child of a screen: one state of it",
  source: "on a screen: the list in the fixtures whose chosen entry the screen's fields show",
  device: "a frame the design draws itself, by its id in the device table",
  text: "fills the element's text from a key of the fixtures, from the top, wherever it stands",
  image: "on an <img>: shows the image a fixtures key names",
  fixtures: 'on <script type="application/json">: the design\'s example data',
  tokens: "on a <style>: a tokens block, where colours and depth may be raw values",
  list: "on a container: repeats its item over a list in the fixtures",
  item: "on the <template> that is a list's one direct child: the item drawn for each entry",
  field: "fills the element's text from a key of the current item: its list's entry, or its screen's chosen entry",
  limit: "on a list: draws at most this many items",
  go: "opens a screen, or a screen's state, as <screen>/<state>; inside an item, for that item",
  back: "returns to the screen's parent",
  toggle: "on a button: opens and closes the panel of that name",
  panel: "a small disclosure a toggle opens and closes",
  component: "a name shared with the built interface's component",
  variant: "the component's variant",
  use: "puts the block of that name here: the file blocks/<name>.html replaces this element",
  "arg-<name>": "on a use: the value for {{name}} in the block",
  flow: "puts the flow of that name here: the file flows/<id>.html replaces this element, qualifying its screen ids as <id>:<screen>",
  slot: "where the tool puts content: title or back-label",
  platform: "set by the tool on a frame's root: the platform shown",
  theme: "set by the tool on a frame's root: the theme shown",
  pick: "set by the tool: the item a go inside a list opened",
  highlight: "set by the tool: the element a comment points to",
  comment: "set by the tool: an element with a comment",
  commenting: "set by the tool on a frame's root: comments are on",
  href: "set by the tool on a link that leaves its screen: the address the design wrote, as text, since the link's href in the page is about:blank",
};

/** Every attribute the tool reads in a design, by what it does. */
export const ATTR = {
  format: `${PREFIX}format`,
  screen: `${PREFIX}screen`,
  title: `${PREFIX}title`,
  parent: `${PREFIX}parent`,
  initial: `${PREFIX}initial`,
  state: `${PREFIX}state`,
  source: `${PREFIX}source`,
  device: `${PREFIX}device`,
  text: `${PREFIX}text`,
  image: `${PREFIX}image`,
  fixtures: `${PREFIX}fixtures`,
  tokens: `${PREFIX}tokens`,
  list: `${PREFIX}list`,
  item: `${PREFIX}item`,
  field: `${PREFIX}field`,
  limit: `${PREFIX}limit`,
  go: `${PREFIX}go`,
  back: `${PREFIX}back`,
  toggle: `${PREFIX}toggle`,
  panel: `${PREFIX}panel`,
  component: `${PREFIX}component`,
  variant: `${PREFIX}variant`,
  use: `${PREFIX}use`,
  arg: `${PREFIX}arg-`,
  flow: `${PREFIX}flow`,
  slot: `${PREFIX}slot`,
  testid: "data-testid",
} as const;

/** The slots: where the tool puts content. */
export const SLOTS = ["title", "back-label"] as const;

/** The plain `<meta>` names a design's head may hold, each read by the tool. */
export const META = { platforms: "platforms", themes: "themes", workItem: "work-item", tokens: "tokens", viewport: "viewport" } as const;

/** The platforms and themes a design may declare, and the default when it declares none. */
export const PLATFORMS = ["web", "ios", "android", "desktop"] as const;
export const THEMES = ["light", "dark"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Theme = (typeof THEMES)[number];
export const DEFAULT_PLATFORMS: readonly Platform[] = ["web"];
export const DEFAULT_THEMES: readonly Theme[] = ["light"];

/** Whether a word is one of the platforms, or one of the themes. */
export function isPlatform(word: string): word is Platform {
  return (PLATFORMS as readonly string[]).includes(word);
}
export function isTheme(word: string): word is Theme {
  return (THEMES as readonly string[]).includes(word);
}

/** The custom properties the tool sets on a frame's root: a phone's system bars, top and bottom, in CSS px (0px with none). */
export const SAFE_AREA = { top: "--safe-area-inset-top", bottom: "--safe-area-inset-bottom" } as const;

/** The folder of a design's blocks, beside the design. */
export const BLOCKS = "blocks";
/** The folder of a design's flows, beside the design. */
export const FLOWS = "flows";
/** The folder of a design's review rounds, beside the design: `rounds/<design name>/<N>/`. */
export const ROUNDS = "rounds";
/** An image written into a design as a data URI: the image types the page may carry, base64. */
export const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
/** A part's argument, written `{{name}}` in its text or an attribute's value. */
export const ARGUMENT = /\{\{([^{}]*)\}\}/g;

/** The familiar state names: a suggested list, and a name close to one of them is a note. */
export const CORE_STATES = ["empty", "loading", "partial", "error", "offline", "permission-denied", "success", "first-run"] as const;
export const COMMENT_TYPES = ["change", "remove", "add", "question"] as const;
export type CommentType = (typeof COMMENT_TYPES)[number];
export function isCommentType(word: string): word is CommentType {
  return (COMMENT_TYPES as readonly string[]).includes(word);
}

export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SCREEN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const FLOW_ID = /^[a-z][a-z0-9-]{0,39}$/;
/** A work item: any text of 1 to 64 characters with no space and no control character. */
export const WORK_ITEM_ID = /^[^\s\x00-\x1f\x7f]{1,64}$/u;

/** Limits that keep a hostile design from costing time in proportion to its size. */
export const READ_LIMITS = {
  /** Elements nested deeper than this are not read. */
  depth: 400,
  /** The most blocks one flow, or one design, may place. */
  uses: 5000,
  /** The most text the blocks may add to a whole design, in characters. */
  expansion: 2_000_000,
  /**
   * The characters a custom property's value may reach once each `var()` in it is followed. A name named many times
   * would grow without bound, ten times for each step; a real value, even a long gradient or font list, stays under a
   * thousand.
   */
  followed_value: 65_536,
  /** `check` prints this many findings, then says how many more. */
  findings: 200,
  /** The bytes one image may take, and all the images of a page. */
  image: 2_000_000,
  images: 20_000_000,
  /**
   * The bytes one font file an `@font-face` names may take, and all the font files of a page. One weight of a family
   * for the Latin script is 20 to 200 KB as woff2, and a variable font of several scripts stays under 2 MB. The page
   * carries each file as base64, a third larger, so a bigger font is subset to the scripts the design shows.
   */
  font: 2_000_000,
  fonts: 10_000_000,
  /** The bytes a round file, the viewer's comments, or a tokens file may take: a larger one is never read whole. */
  round_file: 1_000_000,
  tokens_file: 1_000_000,
  /** The bytes the project's design document may take: a larger one is not read. */
  design_md: 1_000_000,
  /**
   * The bytes one file of a design may take: a design, a flow, or a block. A
   * larger one is not read. It sits above the 6 MB read a ceiling test holds, and a read of it takes a few seconds.
   */
  design_file: 10_000_000,
  /**
   * The pixels a captured picture may run below its frame's top: a taller view is pictured to here. A picture of a
   * million pixels took Chrome 2 GB, and no screen a person reviews runs past the height of a few hundred rows.
   */
  picture_height: 16_384,
} as const;

/** The design document a project may keep, in the format of the same name: the settings' `design_md`, by default. */
export const DESIGN_MD = "DESIGN.md";
/** The one version of the design document's format this tool reads; a document that names none is read as this one. */
export const DESIGN_MD_VERSION = "alpha";

/**
 * The CSS name of each kind of token the design document holds: `<prefix><path><suffix>`, the path's segments joined
 * by "-". The first eight are the format's own Tailwind v4 export names; motion, components, and a whole typography token
 * follow the same pattern for what that export drops. In the order of the guide's table.
 */
export const SYSTEM_NAMES: readonly { group: string; prefix: string; suffix: string }[] = [
  { group: "colors.<path>", prefix: "--color-", suffix: "" },
  { group: "spacing.<path>", prefix: "--spacing-", suffix: "" },
  { group: "rounded.<path>", prefix: "--radius-", suffix: "" },
  { group: "typography.<path>.fontFamily", prefix: "--font-", suffix: "" },
  { group: "typography.<path>.fontSize", prefix: "--text-", suffix: "" },
  { group: "typography.<path>.lineHeight", prefix: "--leading-", suffix: "" },
  { group: "typography.<path>.letterSpacing", prefix: "--tracking-", suffix: "" },
  { group: "typography.<path>.fontWeight", prefix: "--font-weight-", suffix: "" },
  { group: "typography.<path>.fontFeature", prefix: "--font-feature-", suffix: "" },
  { group: "typography.<path>.fontVariation", prefix: "--font-variation-", suffix: "" },
  { group: "typography.<path>", prefix: "--typography-", suffix: "" },
  { group: "motion.<path>.duration", prefix: "--motion-", suffix: "-duration" },
  { group: "motion.<path>.delay", prefix: "--motion-", suffix: "-delay" },
  { group: "motion.<path>.timingFunction", prefix: "--motion-", suffix: "-timing-function" },
  { group: "components.<name>.<property>", prefix: "--component-", suffix: "" },
];

/** The prefixes of every name the design document gives, each once: a name with one of them is the document's to give. */
export const SYSTEM_PREFIXES: readonly string[] = [...new Set(SYSTEM_NAMES.map((entry) => entry.prefix))].filter(
  (prefix, _index, all) => !all.some((other) => other !== prefix && prefix.startsWith(other)),
);

/** The images a design's fixtures may name, by extension, with their media type. */
export const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/**
 * The font files an `@font-face` may name, by extension, with their media type. A TrueType or OpenType file starts
 * with the signature of either outline, so `.ttf` and `.otf` take both; each WOFF starts with its own.
 */
export const FONT_TYPES: Record<string, { mime: string; signatures: readonly string[] }> = {
  ".woff2": { mime: "font/woff2", signatures: ["wOF2"] },
  ".woff": { mime: "font/woff", signatures: ["wOFF"] },
  ".ttf": { mime: "font/ttf", signatures: ["\u0000\u0001\u0000\u0000", "true", "OTTO"] },
  ".otf": { mime: "font/otf", signatures: ["OTTO", "\u0000\u0001\u0000\u0000", "true"] },
};

/** Elements with no end tag, so they never open a level. */
export const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));

/** A letter, a digit, or `_`, in any script: what a word boundary in a rule is made of. */
export const WORD = "[\\p{L}\\p{N}_]";
