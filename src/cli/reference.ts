// The reference, written from the code itself so it cannot drift: every name of the format from `format.ts`, every rule
// from the registry, every command and flag from the command table, the settings, the exit codes, and the module rows.

import { RULES } from "../checks/rules.ts";
import { ALLOW_LIST } from "../design/allow.ts";
import { EXIT } from "../errors.ts";
import { FAMILIES, family } from "../finding.ts";
import { CONFIG_FILE, FONT_TYPES, FORMAT, MEANING, META, PLATFORMS, PREFIX, PROGRAM, READ_LIMITS, SLOTS, THEMES, VOCABULARY } from "../format.ts";
import { MODULE_ROWS } from "../modules.ts";
import { SETTINGS } from "../project.ts";
import { COMMANDS, GLOBAL } from "./arguments.ts";

/** The exit codes, as the command line gives them, each with what to do next. */
const EXIT_CODES: [code: string, means: string, next: string][] = [
  [`${EXIT.done}`, `done; notes alone are still ${EXIT.done}`, "read the notes, then go on"],
  [`${EXIT.problems}`, "the design has a problem", "fix the design in the file the finding names"],
  [
    `${EXIT.refused}`,
    "the request was refused: bad usage, the file system said no, a busy port, no Chrome found; each with the next step",
    "fix the request, as the one line on stderr says",
  ],
  [`${EXIT.failed}`, "the tool failed: a fault of the tool, or a capture that cannot start or times out", "report the command and what it printed"],
  [`${EXIT.interrupted}, ${EXIT.stopped}`, "stopped by a signal: Ctrl-C, or a stop request", "nothing: `serve` ends so when you stop it"],
];

/** A settings file that sets three of the keys, which `tests/examples.test.ts` reads clean. */
const SETTINGS_EXAMPLE = `{
  "tokens": ["design/tokens.css"],
  "frames": ["320", "1024", "1440"],
  "rules": { "copy.emoji": "off" }
}`;

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("<", "&lt;");
/** Names as code, in alphabetical order, each an element's tag when `open` is "<". */
const names = (list: readonly string[], open = "") =>
  [...list]
    .sort()
    .map((name) => `\`${open}${name}${open ? ">" : ""}\``)
    .join(", ");

/** The reference as Markdown. */
export function referenceText(version: string): string {
  const out: string[] = [
    `# The ${PROGRAM} reference`,
    "",
    `Version ${version}, design format ${FORMAT}. \`${PROGRAM} guide --reference\` writes this page from the code; never edit it by hand.`,
    "",
    "## The vocabulary",
    "",
    `Every name the tool reads in a design starts with \`${PREFIX}\`. A design never writes a name the tool sets.`,
    "",
    "| Attribute | Kind | Meaning |",
    "| --- | --- | --- |",
  ];
  for (const [kind, names] of Object.entries(VOCABULARY))
    for (const name of names) out.push(`| \`${PREFIX}${name}\` | ${kind.replaceAll("_", " ")} | ${cell(MEANING[name] ?? "")} |`);
  out.push(
    "",
    `Slots: ${SLOTS.map((name) => `\`${name}\``).join(", ")}. Head \`<meta>\` names: ${Object.values(META)
      .map((name) => `\`${name}\``)
      .join(", ")}. Platforms: ${PLATFORMS.join(", ")}. Themes: ${THEMES.join(", ")}.`,
    "",
    "## The allow-list",
    "",
    "A design holds these elements and attributes, and nothing else: anything outside the list is `unsafe.markup`, and the page is not written.",
    "",
    `- **The head:** \`<title>\`, \`<style>\`, a \`<meta>\` with a charset, a policy, or one of the names above, and the fixtures block, \`<script type="application/json" ${PREFIX}fixtures>\`.`,
    `- **The body:** ${names(ALLOW_LIST.bodyElements, "<")}, and \`<svg>\`. A \`<style>\` stands directly in the body, and a \`<template>\` is a list's item.`,
    `- **Inside \`<svg>\`:** ${names(ALLOW_LIST.svgElements, "<")}.`,
    `- **On every element:** ${names(ALLOW_LIST.everyElement)}, and every \`data-\` and \`aria-\` attribute. No \`on\` attribute, which is an event handler.`,
    `- **On an HTML element:** ${names(ALLOW_LIST.htmlAttributes)}. An \`href\` on an \`<a>\` or a \`<use>\` goes to \`#<id>\`, and on an \`<a>\` to \`https://\` too; a \`src\` is a \`data:image\` URI on an \`<img>\`; a \`<button>\` is \`type="button"\`; and an \`<input>\` is of no type that sends or loads: \`image\`, \`file\`, \`submit\`, or \`reset\`.`,
    `- **On an element inside \`<svg>\`:** ${names(ALLOW_LIST.svgAttributes)}, and every \`stroke\` attribute.`,
    `- **In a style:** a \`url()\` of an \`@font-face\` names a font file inside the project, through no link: ${names(Object.keys(FONT_TYPES))}, up to ${READ_LIMITS.font / 1_000_000} MB a file and ${READ_LIMITS.fonts / 1_000_000} MB a page. A path in a design's \`<style>\` is read from the design's folder. A path in a tokens file is read from that file's folder. The build writes each file into the page as a \`data:\` URL, and a file it cannot carry is \`integrity.font\`. A font loaded from the network is \`paint.network\`.`,
    "",
    "## Rules",
    "",
    "A finding is a problem or a note: a problem must be fixed, and a note is advice. Each finding names its rule's id in brackets at the end of its line, such as `[paint.raw-color]`.",
    "",
    'A rule is on for a design whose format is at least its `since`. The settings file turns one off with `"rules": {"<id>": "off"}`; a `read` or `unsafe` rule stays on, and a setting that names one is refused.',
    "",
    "The rules read the design file and draw nothing. So none checks contrast, target size, reflow, or focus, and none runs an accessibility scan: those need a person, or a review in a browser.",
    "",
    "| Family | Means |",
    "| --- | --- |",
    ...Object.entries(FAMILIES).map(([name, means]) => `| \`${name}\` | ${cell(means)} |`),
    "",
    "| Rule | Family | Level | Since |",
    "| --- | --- | --- | --- |",
    ...RULES.map((rule) => `| \`${rule.id}\` | ${family(rule.id)} | ${rule.level} | ${rule.since} |`),
    "",
    "## Commands",
    "",
    "| Command | Arguments | Flags | Does |",
    "| --- | --- | --- | --- |",
  );
  for (const [name, spec] of Object.entries(COMMANDS)) {
    const args = spec.positionals.map((item) => (item.optional ? `[${item.name}]` : `<${item.name}>`)).join(" ");
    const flags = [...Object.keys(spec.flags).map((flag) => `--${flag}`), ...(spec.json ? ["--json"] : [])].join(", ");
    out.push(`| \`${name}\` | ${cell(args)} | ${flags} | ${cell(spec.help)} |`);
  }
  out.push(
    "",
    `Every command also takes ${Object.entries(GLOBAL)
      .filter(([flag]) => flag !== "json")
      .map(([flag, spec]) => `\`--${flag} ${spec.value ?? ""}\`, ${spec.help}`)
      .join(", and ")}, anywhere on the line, and \`--version\` prints the version. \`${PROGRAM} <command> --help\` says what each flag of a command means.`,
    "",
    `No command writes over a design, a design document, or a saved round. The one exception is \`example\`, which writes its own files in \`<out-dir>/example/\` again each time, so keep no edits there.`,
    "",
    "## Settings",
    "",
    `A project may keep \`${CONFIG_FILE}\` in its top folder. The tool reads it strictly, so a key it does not know is refused. The flag \`--out-dir\` wins over the file. For example:`,
    "",
    "```json",
    SETTINGS_EXAMPLE,
    "```",
    "",
    "The keys, in alphabetical order:",
    "",
    "| Key | Sets | Default |",
    "| --- | --- | --- |",
    ...SETTINGS.map((setting) => `| \`${setting.key}\` | ${setting.sets} | ${setting.default} |`),
  );
  out.push(
    "",
    "## Exit codes",
    "",
    "| Code | Means | Do this |",
    "| --- | --- | --- |",
    ...EXIT_CODES.map(([code, means, next]) => `| ${code} | ${cell(means)} | ${cell(next)} |`),
  );
  out.push("", "## Modules", "", "Each file of `src/` sits in one row; a file imports only from rows above it, or from files before it in its own row.", "");
  MODULE_ROWS.forEach((row, index) => {
    out.push(`${index}. ${row.row}: ${row.files.map((file) => `\`${file}\``).join(", ")}`);
  });
  return `${out.join("\n")}\n`;
}
