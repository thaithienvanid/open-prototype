// The guide: how to start a design, the format's whole vocabulary with one example each, the five ways to compose,
// the review round, and the commands. Every name it lists comes from `format.ts`, so the guide and the tool agree.

import changesSchema from "../schemas/round-changes.schema.json" with { type: "json" };
import commentsSchema from "../schemas/round-comments.schema.json" with { type: "json" };
import { shippedDevices } from "./assets.ts";
import { EXIT } from "./errors.ts";
import {
  ATTR,
  BLOCKS,
  CONFIG_FILE,
  CORE_STATES,
  DESIGN_MD,
  DESIGN_MD_VERSION,
  FLOWS,
  FONT_TYPES,
  FORMAT,
  MEANING,
  META,
  PLATFORMS,
  PREFIX,
  PROGRAM,
  READ_LIMITS,
  SAFE_AREA,
  SLOTS,
  SYSTEM_NAMES,
  THEMES,
  VOCABULARY,
} from "./format.ts";
import { SETTINGS } from "./project.ts";

/** One example for each name a designer writes. */
export const NAME_EXAMPLES: Record<string, string> = {
  format: `<html lang="en" ${ATTR.format}="${FORMAT}">`,
  screen: `<section ${ATTR.screen}="inbox" ${ATTR.title}="Inbox">`,
  title: `<section ${ATTR.screen}="inbox" ${ATTR.title}="Inbox">`,
  parent: `<section ${ATTR.screen}="message" ${ATTR.parent}="inbox">`,
  initial: `<section ${ATTR.screen}="inbox" ${ATTR.initial}="loading">`,
  state: `<div ${ATTR.state}="empty" data-testid="inbox-empty">`,
  source: `<section ${ATTR.screen}="message" ${ATTR.source}="messages">`,
  device: `<div ${ATTR.device}="ios" style="width: 390px; height: 844px; overflow-y: auto">`,
  text: `<h2 ${ATTR.text}="inbox.heading"></h2>`,
  image: `<img ${ATTR.image}="avatar" alt="">`,
  fixtures: `<script type="application/json" ${ATTR.fixtures}>{ "product": "Mail" }</script>`,
  tokens: `<style ${ATTR.tokens}>:root { --color-accent: #1d4ed8; }</style>`,
  list: `<ul ${ATTR.list}="messages" ${ATTR.limit}="3"><template ${ATTR.item}><li ${ATTR.field}="subject"></li></template></ul>`,
  item: `<template ${ATTR.item}><li><button type="button" ${ATTR.go}="message" data-testid="inbox-open" ${ATTR.field}="subject"></button></li></template>`,
  field: `<span ${ATTR.field}="sender"></span>`,
  limit: `<ul ${ATTR.list}="messages" ${ATTR.limit}="3">`,
  go: `<button type="button" ${ATTR.go}="inbox/empty" data-testid="inbox-clear">Clear</button>`,
  back: `<button type="button" ${ATTR.back} data-testid="app-back"><span ${ATTR.slot}="back-label">Back</span></button>`,
  toggle: `<button type="button" ${ATTR.toggle}="filters" aria-controls="filters" aria-expanded="false" data-testid="inbox-filters">Filters</button>`,
  panel: `<div id="filters" ${ATTR.panel}="filters" hidden>`,
  component: `<article ${ATTR.component}="message-row">`,
  variant: `<button type="button" ${ATTR.component}="button" ${ATTR.variant}="primary" data-testid="inbox-send">Send</button>`,
  use: `<div ${ATTR.use}="message-row" ${ATTR.arg}subject="Lunch?"></div>`,
  "arg-<name>": `<div ${ATTR.use}="message-row" ${ATTR.arg}subject="Lunch?"></div>`,
  flow: `<div ${ATTR.flow}="inbox" ${ATTR.title}="Inbox"></div>`,
  slot: `<h1 ${ATTR.slot}="title"></h1>`,
};

type GuideData = {
  format: number;
  prefix: string;
  vocabulary: { kind: string; name: string; attribute: string; meaning: string; example: string | null }[];
  slots: string[];
  head: string[];
  platforms: string[];
  themes: string[];
  suggested_states: string[];
  blocks_folder: string;
  flows_folder: string;
  token_names: { group: string; prefix: string; suffix: string }[];
};

export function guideData(): GuideData {
  return {
    format: FORMAT,
    prefix: PREFIX,
    vocabulary: Object.entries(VOCABULARY).flatMap(([kind, names]) =>
      names.map((name) => ({ kind, name, attribute: `${PREFIX}${name}`, meaning: MEANING[name] ?? "", example: NAME_EXAMPLES[name] ?? null })),
    ),
    slots: [...SLOTS],
    head: Object.values(META),
    platforms: [...PLATFORMS],
    themes: [...THEMES],
    suggested_states: [...CORE_STATES],
    blocks_folder: BLOCKS,
    flows_folder: FLOWS,
    token_names: SYSTEM_NAMES.map((entry) => ({ ...entry })),
  };
}

/** The frames: each one of the device table, the frames a full pass takes, and what a frame's root carries. */
function frameLines(): string[] {
  const devices = shippedDevices();
  const bars = (frame: { safe_area?: { top: number; bottom: number } }) =>
    frame.safe_area ? `, system bars ${frame.safe_area.top} top and ${frame.safe_area.bottom} bottom` : "";
  const rows = Array.from(
    devices.frames,
    ([id, frame]) => `    ${id.padEnd(14)}${frame.name}, ${frame.platform}, ${frame.width} by ${frame.height}${bars(frame)}`,
  );
  const pass = Object.entries(devices.shots).map(([platform, ids]) => `${platform}: ${ids.join(", ")}`);
  return [
    "Frames",
    "  A frame is the box a design shows in, at a device's size in CSS px. Each frame of the viewer's menu, by its id,",
    "  with its name, its platform, and its size:",
    ...rows,
    `  A full pass of shots takes, for each declared platform: ${pass.join("; ")}.`,
    "  A web product's phone and desktop are its web frames, 320 and 1024. Declare ios, android, or desktop only for an",
    "  app the product ships on that platform.",
    '  The settings\' "frames" name others.',
    `  The tool sets ${PREFIX}platform and ${PREFIX}theme on the frame's <html>: the platform and the theme shown. It sets`,
    `  a phone's system bars there too, as ${SAFE_AREA.top} and ${SAFE_AREA.bottom}, in px (0px on a`,
    "  frame with none). The viewer draws the bars over the design, so leave room for them:",
    `    body { padding-top: var(${SAFE_AREA.top}); padding-bottom: var(${SAFE_AREA.bottom}); }`,
  ];
}

/** A part of a round file's schema: the keywords the guide reads. */
type Field = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  description?: string;
  required?: string[];
  properties?: Record<string, Field>;
  items?: Field;
  examples?: unknown[];
};

/** A text broken into lines of at most `width` characters, each after `indent`. */
function wrap(text: string, indent: string, width = 116): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(indent + line);
  return lines;
}

/** What a field's value may be, in words, from its schema. */
function allowed(field: Field): string {
  const or = (values: unknown[]) => (values.length > 2 ? `${values.slice(0, -1).join(", ")}, or ${String(values.at(-1))}` : values.map(String).join(" or "));
  if (field.enum) return or(field.enum);
  if ("const" in field) return JSON.stringify(field.const);
  const types = [field.type ?? []].flat();
  if (types.includes("array")) {
    const list = field.items?.properties ? "a list of objects, each below" : `a list of: ${allowed(field.items ?? {})}`;
    return field.minItems ? `${list}, not empty` : list;
  }
  if (types.includes("object")) return `an object of ${Object.keys(field.properties ?? {}).join(", ")}${types.includes("null") ? ", or null" : ""}`;
  const limits = [
    field.minimum !== undefined ? `from ${field.minimum}${field.maximum !== undefined ? ` to ${field.maximum}` : ""}` : "",
    field.minLength ? "not empty" : "",
    field.maxLength !== undefined ? `at most ${field.maxLength} characters` : "",
    field.pattern && field.pattern.length <= 30 ? `matching ${field.pattern}` : "",
  ].filter(Boolean);
  return [types.includes("integer") ? "a whole number" : "text", ...limits].join(", ");
}

/** The fields of one level of a round file: each with required or optional, what it may be, and what it means. */
function fieldLines(node: Field): string[] {
  return Object.entries(node.properties ?? {}).flatMap(([key, field]) => {
    const head = `    ${key.padEnd(16)}${(node.required ?? []).includes(key) ? "required" : "optional"} `;
    const [first = "", ...rest] = wrap(`${allowed(field)}. ${field.description ?? ""}`, "".padEnd(head.length));
    return [head + first.trimStart(), ...rest];
  });
}

/** The two round files a project keeps, from the schemas the tool reads them by. */
function roundLines(): string[] {
  const files: [file: string, schema: Field, list: string, says: string][] = [
    ["comments.json", commentsSchema as Field, "items", "a round's comments"],
    ["changes.json", changesSchema as Field, "changes", "what the next round changed, and the comments each change answers"],
  ];
  return [
    "Round files",
    "  Each file sits in rounds/<design name>/<N>/ beside the design. The fields come from the tool's own schema of the",
    "  file, so a file that keeps to them saves and checks clean.",
    ...files.flatMap(([file, schema, list, says]) => [
      `  ${file}: ${says}.`,
      ...fieldLines(schema),
      `  Each entry of ${list}:`,
      ...fieldLines(schema.properties?.[list]?.items ?? {}),
      "  For example:",
      `    ${JSON.stringify(schema.examples?.[0] ?? {})}`,
    ]),
  ];
}

/** The design document: where it is, what each token becomes, the two themes, what is ignored, and the command that lints it. */
function designDocumentLines(): string[] {
  const rows = SYSTEM_NAMES.map(
    (entry) =>
      `    ${entry.group.padEnd(34)}${entry.prefix}${entry.group.startsWith("components.") ? "<name>-<property, in kebab case>" : "<path>"}${entry.suffix}`,
  );
  return [
    "Design document",
    `  The project's ${DESIGN_MD}, in the format of the same name (version ${DESIGN_MD_VERSION}), is the one source of each`,
    "  value. The settings' design_md names it; the tool reads that path only, and never searches. Its front matter",
    "  and its yaml blocks hold the tokens, and every design reads them: the build puts them first in the tokens block,",
    "  then the token files, then the design's own. Each token becomes a custom property, its path's keys joined by -:",
    ...rows,
    "  A reference {colors.primary} becomes var(--color-primary), so a chain stays live. colors.light and colors.dark",
    "  join into a role: colors.light.surface and colors.dark.surface give --color-surface, which is light-dark() of the",
    "  two in a design that shows both themes. Read the role, never a member. A colour only one of the two holds joins",
    "  no role, and is a note at its line: add it to the other. --typography-<path> is a font shorthand of the token's",
    "  parts, made when it has a fontFamily and a fontSize.",
    "  A length, in rounded, a font size, or a component's padding, takes px, em, or rem, such as 16px, or a bare 0; a",
    "  duration takes ms. spacing takes a number with a CSS length unit, such as 16px, 60ch, or 100dvh, or %, or a bare",
    "  number, for a count or a ratio: where a length goes, multiply a bare number by 1px, as",
    "  calc(var(--spacing-md) * 1px), since CSS drops padding: 16.",
    "  Every other key is ignored, and so is the prose: read it yourself before you draw. A value set again to another",
    "  value in a :root rule, in a token file or in a design's own styles, is an override and a problem; the same value",
    "  set again is not, and one set under a theme or in @media is a variant. A var() of the document's prefixes that",
    "  nothing sets is a problem, with the nearest name. Never list the document's own export in tokens: the document",
    "  already gives it.",
    `  ${PROGRAM} new-design keeps in the starter's tokens block only the names ${DESIGN_MD} does not give, so the start`,
    "  passes the check, with a note that names them: move the ones designs share into the document.",
    `  ${PROGRAM} project prints each token's value in each theme as the page draws it, after the token files: a`,
    `  :root rule's in both themes, and a [${PREFIX}theme="dark"] rule's in that theme. Where a token file sets a name`,
    '  in @media or under another selector, it prints "", no value, so read that file.',
    `  The format's own command lints the prose and the sections: npx @google/design.md lint ${DESIGN_MD}. It fetches a`,
    "  package, so it is yours to run; the tool sends nothing.",
  ];
}

/** Fonts: a brand font comes from files in the project, which the build writes into the page. */
function fontLines(): string[] {
  const kinds = Object.keys(FONT_TYPES);
  return [
    "Fonts",
    "  A page loads nothing from the network, so a brand font, a Google Font among them, comes from files in the project.",
    "  Download the font's files, for example from Google Fonts or Fontsource, keep them in the project, and load them",
    "  with @font-face, in a design's <style> or in a tokens file:",
    '    @font-face { font-family: "Brand"; src: url(fonts/brand.woff2) format("woff2"); }',
    '    body { font-family: "Brand", system-ui, sans-serif; }',
    "  A path in a design is read from the design's folder; a path in a tokens file is read from",
    `  that file's folder. The build writes each ${kinds.slice(0, -1).join(", ")}, or ${kinds.at(-1)} file into the page, inside the project and`,
    `  through no link, up to ${READ_LIMITS.font / 1_000_000} MB a file and ${READ_LIMITS.fonts / 1_000_000} MB a page. A fontFamily of ${DESIGN_MD} names the family;`,
    "  the @font-face that loads its files stays in a design or a tokens file.",
  ];
}

/** The guide's first commands, each with what it gives, in one column after the longest; a row with no command goes on the one above. */
function start(rows: [command: string, meaning: string][]): string[] {
  const width = Math.max(...rows.map(([command]) => `${PROGRAM} ${command}`.length)) + 4;
  return rows.map(([command, meaning]) => `  ${(command ? `${PROGRAM} ${command}` : "").padEnd(width)}${meaning}`);
}

/** The guide as a person reads it, with the command line's commands, which the command line names. */
export function guideText(commands: readonly string[]): string {
  const data = guideData();
  const kinds: Record<string, string> = {
    structure: "Structure",
    content: "Content",
    behaviour: "Behaviour",
    composition: "Composition",
    set_by_the_tool: "Set by the tool in a frame: never write these",
  };
  const out: string[] = [
    `The ${PROGRAM} guide, design format ${FORMAT}`,
    "",
    "A design is an ordinary HTML document. The tool reads it through one small set of attributes, each with the",
    `prefix ${PREFIX}, and adds the viewer, the page's policy, and everything else when it builds. Nothing of the`,
    "tool's lives in your file, and the tool never reads an attribute without the prefix to decide what a design is.",
    "Close each element where you mean it to end. An end tag HTML lets you leave out, such as </li> or </p>, may be",
    "left out, but close a <b>, an <a>, and their kin with their own end tag. Markup a browser builds otherwise than",
    "it reads, such as text or a <div> directly in a <table>, or a <td> with no <tr>, is structure.nesting, which says",
    "how to write it.",
    "",
    "Start",
    ...start([
      ["project", "what the project holds: an existing project, read what it prints first,"],
      ["", `then the prose under each section heading of ${DESIGN_MD} it lists`],
      ["new-design-md", `a new project: its design document, ${DESIGN_MD}, with tokens to fill in`],
      ["new-design design/cards.html", "one design file, ready to edit"],
      ["check design/cards.html", "every problem, with its file and line"],
      ["build design/cards.html", "its page, in the viewer, with every screen, state, and device"],
    ]),
    "",
    "Safety: a design file has no policy of its own. Never open a design file you did not write in a browser: it runs its",
    `scripts and loads what it names. Look at it through \`${PROGRAM} build\` or \`${PROGRAM} serve\`, whose page loads`,
    "nothing and runs only the viewer.",
    "",
    "A screen is a <section> with a screen attribute. A state is a direct child of its screen. An element inside a",
    "screen and outside every state shows with every state; an element outside every screen shows with every screen.",
    "The viewer shows one state of one screen at a time: it takes the screens and states it does not show out of the",
    "frame, and puts each back when it shows it. So the design's own hidden, display, and !important stay its own.",
    "hidden or inert on <html> or <body> is refused, because it would blank every frame.",
    "A layer over a screen, such as a sheet or a dialog, is a state of that screen, so a person can link to it,",
    "capture it, and comment on it; what stays behind it is written once, outside every state:",
    `  <section ${ATTR.screen}="inbox"><ul>...</ul><div ${ATTR.state}="list" data-testid="inbox-list"></div>`,
    `    <div ${ATTR.state}="compose" data-testid="inbox-compose"><dialog open>...</dialog></div></section>`,
    "A panel is for a small disclosure that needs no view of its own. The tool closes a panel and hides the back",
    "control with the standard hidden attribute, so a design whose styles set display on them keeps hidden working",
    "with one rule of its own: [hidden] { display: none !important; }",
    "A move to another screen or state gives each panel the hidden its markup writes, as a page the product opens",
    "would, so a menu opened to move is closed on the screen it opens.",
    `In each <nav>, the tool marks the link to the shown screen aria-current="page", and with ${PREFIX}section each`,
    `link to a screen the shown one stands under (its ${ATTR.parent}, and so on up), so one rule styles the section:`,
    `  nav [aria-current="page"] { font-weight: 600; } nav [${PREFIX}section] { color: var(--color-accent); }`,
    `A <nav> with no link to the shown screen marks its link to the nearest screen above it aria-current="true".`,
    "",
    `State names are the design's own, in the order it draws them. Familiar ones: ${data.suggested_states.join(", ")}.`,
    "",
  ];
  for (const [kind, title] of Object.entries(kinds)) {
    out.push(title);
    for (const entry of data.vocabulary.filter((item) => item.kind === kind)) {
      out.push(`  ${entry.attribute.padEnd(24)}${entry.meaning}`);
      if (entry.example) out.push(`  ${"".padEnd(24)}${entry.example}`);
    }
    out.push("");
  }
  out.push(
    "The head",
    `  <title> names the design. <meta name="..." content="...">: ${data.head.join(", ")}.`,
    `  platforms: ${data.platforms.join(", ")} (default web). themes: ${data.themes.join(", ")} (default light).`,
    `  A theme follows ${PREFIX}theme on the frame's root, or light-dark() with color-scheme: light dark.`,
    "  A prefers-color-scheme rule follows the system only, never the viewer's theme.",
    "",
    ...frameLines(),
    "",
    "Compose",
    `  flow    <div ${ATTR.flow}="projects" ${ATTR.title}="Projects"></div>: the file ${FLOWS}/projects.html beside the`,
    "          design replaces this element. Each screen id inside the flow is qualified with the flow id (so `detail`",
    "          becomes `projects:detail`), and so is a go or a parent that names a screen of the flow. One that names",
    "          a screen of the main file stays as written, and one of another flow names it, such as `settings:prefs`.",
    "          A flow's screen hides a main-file screen of the same id, so give them two names. A flow cannot include",
    "          a flow. Add a flow when a design grows to more than one flow, without leaving the HTML format.",
    `  use     <div ${ATTR.use}="project-row" ${ATTR.arg}action="Open"></div>: the file ${BLOCKS}/project-row.html beside the`,
    `          design replaces this element. Its one root element takes its place, and each {{name}} in its text and`,
    "          in its attribute values takes the argument, escaped. A block may use another; a cycle stops the read. Pass",
    "          an id or a test id as an argument when a block is used twice, because each is written once, such as",
    `          data-testid="settings-{{state}}-from" with ${ATTR.arg}state="ready". An argument no {{name}} of the`,
    "          block reads is a note: take it out, or read it.",
    `  slot    where the tool puts content: ${SLOTS.join(", ")}. What shows at once is what stands outside every screen,`,
    "          one screen's own content, and one of its states. Among it stand one title slot and one back-label slot at",
    "          most, so a back control that shows only in some states sits in each of them:",
    `          <div ${ATTR.state}="overdue" data-testid="loan-overdue"><button type="button" ${ATTR.back} data-testid="loan-back">`,
    `            <span ${ATTR.slot}="back-label">Back</span></button>...</div>`,
    `  list    ${ATTR.list}="<key>" on a container whose one direct child is <template ${ATTR.item}>. A ${ATTR.go} inside`,
    `          the item opens its screen for that entry, in the state the go names, such as ${ATTR.go}="loan/overdue";`,
    `          that screen names the list with ${ATTR.source}. Opened directly, by its link or in a picture of shots,`,
    "          that screen shows the list's first entry.",
    `          ${ATTR.field} reads a key of the current item: the entry an item draws, or, on a screen with`,
    `          ${ATTR.source}, the chosen entry. ${ATTR.text} always reads a key of the fixtures from the top, so the`,
    "          words a screen says itself stay in the fixtures, beside the list, on every screen. The tool fills each",
    "          element's text and adds no space between two elements, so inline elements side by side need a space of",
    "          their own between them, or a block each. It fills text only: a control's value, checked, and selected",
    "          stay in the markup, written to match the state.",
    `  tokens  the settings' "tokens" files, or <meta name="tokens" content="a.css b.css">, which wins: paths inside`,
    `          the project. The build puts them in a <style ${ATTR.tokens}> before the design's own styles. A tokens`,
    "          block is where colours and depth may be raw values; every other style reads them with var(). The check",
    "          reads each tokens file as a tokens block, at its own file and line.",
    "",
    ...designDocumentLines(),
    "",
    ...fontLines(),
    "",
    "Shots",
    `  ${PROGRAM} shots design/cards.html prints the list of views to capture, as JSON, each with its picture's file name.`,
    `  ${PROGRAM} shots design/cards.html --capture takes each view with headless Chrome, into .prototype/shots or the`,
    '  folder --out names. It prints the same list, with the files it wrote under "captured", and one line on stderr,',
    "  such as: captured 14 shots in .prototype/shots.",
    "  A picture's name joins its view's parts with dots: <screen>.<state>.<frame>.<theme>, then .text-200 or .rtl for a",
    "  check, then .<component>.<variant> for a variant, such as cards.empty.320.dark.png. A flow's screen items:list is",
    "  written items+list. Name each screenshot of the built interface the same way, and the viewer's Compare shows it",
    "  beside its view.",
    "  A full pass takes, for each screen, every state at each frame in each declared theme. Then it takes two checks on",
    "  the screen's fullest state (the state with the most elements), in the first theme: text at 200% at the narrowest",
    "  frame, where text most often scrolls sideways or is cut, and right to left at 1024 or else the first frame. So one",
    "  screen with three states, on the web, in light and dark, takes 3 x 2 x 2 + 2 = 14 pictures.",
    "  A view taller than its frame is pictured whole: the picture is as tall as the design's page, so nothing below the",
    "  fold is missed, and its top frame height (568 px at 320) is what a person sees before they scroll. A view that",
    `  fits is pictured at the frame's size. A picture stops ${READ_LIMITS.picture_height} px below its top, and a note names`,
    "  each view it cut.",
    "  Take fewer, sized to the change. --changed-screen <id> takes the full pass of that screen alone.",
    "  --changed-component <name> takes each screen the component shows on, each variant in each theme, then the",
    "  narrowest frame, and text at 200% at it. Repeat either for each one. --frames 320,ios takes those frames alone.",
    "  Read first each screen's first state on each platform, then every state once, then the two checks.",
    "",
    "Review",
    "  Never open a design file you did not write in a browser: it runs its scripts and loads what it names. Look at it",
    `  through \`${PROGRAM} build\` or \`${PROGRAM} serve\`. Open the page, look at every view (a state on a platform in a`,
    "  theme; the Screens panel, on the left, counts them), and pin comments. Download them, then",
    "  save them as the design's next round, in rounds/<design name>/<N>/ beside it:",
    `  ${PROGRAM} save-comments comments.json design/cards.html`,
    "  The next round's changes.json names the comments it answers; the next build shows each as Answered or Open.",
    "  Take the shots of the views a round changed into that round's folder, so they stay beside its files, outside",
    "  the output folder, with --changed-screen or --changed-component for those views:",
    `  ${PROGRAM} shots design/cards.html --capture --out design/rounds/cards/2`,
    "",
    ...roundLines(),
    "",
    "Settings",
    `  ${CONFIG_FILE} in the project's top folder may set each of these keys. The reference lists every rule's id.`,
    ...SETTINGS.flatMap((setting) => {
      const [first = "", ...rest] = wrap(`${setting.sets}; by default, ${setting.default}.`, " ".repeat(16));
      return [`    ${setting.key.padEnd(12)}${first.trimStart()}`, ...rest];
    }),
    "",
    "Commands",
    ...wrap(`${commands.join(", ")}.`, "  "),
    `  \`${PROGRAM} <command> --help\` gives each one's arguments. Exit codes: ${EXIT.done} done, ${EXIT.problems} the design has a problem, ${EXIT.refused} the`,
    `  request was refused, ${EXIT.failed} the tool failed.`,
  );
  return out.join("\n");
}
