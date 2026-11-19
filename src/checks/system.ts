// The system rules over a design that reads the project's design document: a name the document lacks, a value set again
// where it always applies, the tokens a file adds, a component the document does not name, and a theme it has no
// colours for. The document is the one source of each value, so each disagreement is a finding at its line, and nothing
// wins in silence. A value set again under a theme or inside `@media` is a variant, never an override.

import { alwaysApplies, type CssDeclaration, type CssSheet, commaParts, cssSheet, followVars, spaceParts, varNames } from "../css/sheet.ts";
import type { Issue } from "../design/facts.ts";
import type { Design } from "../design/load.ts";
import { placeOf } from "../design/load.ts";
import { literal, roleNames, type System, systemNames } from "../design/system.ts";
import { type Finding, finding } from "../finding.ts";
import { SYSTEM_PREFIXES, THEMES, type Theme } from "../format.ts";
import { nearest, plural, quoted } from "../text.ts";
import { normalColor } from "./lint.ts";

const SHOWN_NAMES = 5;

const systemName = (name: string): boolean => SYSTEM_PREFIXES.some((prefix) => name.startsWith(prefix));

// The box and size properties, each of which takes a length and no bare number: a number of spacing there is dropped.
const LENGTH =
  /^(?:(?:margin|padding|inset|scroll-margin|scroll-padding)(?:-[a-z]+)*|(?:row-|column-)?gap|top|right|bottom|left|(?:min-|max-)?(?:width|height|block-size|inline-size)|border(?:-[a-z]+)*-radius|font-size)$/;
// A part of a value that is one var() and nothing else, with its name: inside calc() or another function it is no part.
const WHOLE_VAR = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[\s\S]*)?\)$/i;

/** A value with each `var()` of the document followed, and `light-dark()` split for the theme; null when a part stays unresolved. */
function resolved(system: System, value: string, theme: Theme, depth = 0): string | null {
  let text = value.trim();
  const pair = /^light-dark\(([\s\S]*)\)$/i.exec(text);
  if (pair) {
    const [light = "", dark = ""] = commaParts(pair[1] ?? "");
    text = theme === "dark" ? dark : light;
  }
  // A name's value is the document's, itself resolved for the theme; a `var()`'s own fallback never stands in.
  const out = followVars(
    text,
    (name) => {
      const found = depth < 20 ? literal(system, name, theme) : "";
      return found ? (resolved(system, found, theme, depth + 1) ?? undefined) : undefined;
    },
    { fallbacks: false, keep: false },
  );
  return out === null || /var\(/i.test(out) ? null : normalColor(out);
}

/** The document's value of a name, as a message shows it: one value, or each theme's. */
function shownValue(system: System, name: string): string {
  const light = literal(system, name, "light");
  const dark = literal(system, name, "dark");
  return light === dark ? light : `${light} in light and ${dark} in dark`;
}

function lineOfName(system: System, name: string): number {
  return system.tokens.find((token) => token.name === name)?.line ?? system.roles.find((role) => role.name === name)?.line ?? 1;
}

/** The design's own sheet, and each placed token block's, in the order of `design.tokens`, read once for each design. */
const SHEETS = new WeakMap<Design, { own: CssSheet; tokens: CssSheet[] }>();
export function designSheets(design: Design): { own: CssSheet; tokens: CssSheet[] } {
  let read = SHEETS.get(design);
  if (!read) {
    read = { own: cssSheet(design.text), tokens: design.tokens.map((token) => cssSheet(token.css, { sheet: true })) };
    SHEETS.set(design, read);
  }
  return read;
}

/** Each token file's sheet, by its file from the project's top: the document's own block is the tool's, and is not read. */
function tokenSheets(design: Design): { file: string; sheet: CssSheet }[] {
  const sheets = designSheets(design).tokens;
  return design.tokens.flatMap((token, index) => (token.generated ? [] : [{ file: token.file, sheet: sheets[index] ?? cssSheet(token.css, { sheet: true }) }]));
}

/** A list of names as a message writes it: "a", "a and b", or "a, b, and c". */
function listed(names: string[]): string {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** The note on a set of names a file adds beside the document's. */
function extraMessage(file: string, names: string[], document: string): string {
  return `${file} sets ${plural(names.length, "token")} ${document} lacks, such as ${listed(names.slice(0, SHOWN_NAMES))}: add the ones designs share to ${document}`;
}

/**
 * The system rules for a design: `issues` at lines of the walked design, and `findings` named from the project's top, in
 * the document or a token file.
 */
export function systemChecks(design: Design): { issues: Issue[]; findings: Finding[] } {
  const done = memo.get(design);
  if (done) return done;
  const result = checked(design);
  memo.set(design, result);
  return result;
}

const memo = new WeakMap<Design, { issues: Issue[]; findings: Finding[] }>();

function checked(design: Design): { issues: Issue[]; findings: Finding[] } {
  const issues: Issue[] = [];
  const findings: Finding[] = [];
  const system = design.system;
  if (!system || !design.facts) return { issues, findings };
  const document = system.file;
  const shows = (theme: Theme) => design.themes.includes(theme);
  const missing =
    shows("dark") && system.groups.light && !system.groups.dark ? "dark" : shows("light") && system.groups.dark && !system.groups.light ? "light" : "";
  if (missing) {
    const other = missing === "dark" ? "light" : "dark";
    findings.push(
      finding(
        "system.theme",
        `the design shows the ${missing} theme, and ${document} has no colors.${missing}, so its roles show the ${other} values: add colors.${missing}`,
        document,
        system.colorsLine,
      ),
    );
  }
  if (system.hasComponents) {
    const keys = system.components.map((item) => item.name);
    for (const use of design.facts.components) {
      const holds = keys.some((key) => key === use.name || key.startsWith(`${use.name}-`));
      const variant = use.variant === "default" || keys.some((key) => key === `${use.name}-${use.variant}` || key.startsWith(`${use.name}-${use.variant}-`));
      if (!holds)
        issues.push({
          rule: "system.component",
          line: use.line,
          message: `component \`${quoted(use.name)}\` is in no key of ${document}'s components: add it there, or use the name the document gives`,
        });
      else if (!variant)
        issues.push({
          rule: "system.component",
          line: use.line,
          message: `component \`${quoted(use.name)}\` in variant \`${quoted(use.variant)}\` is in no key of ${document}'s components, such as \`${quoted(use.name)}-${quoted(use.variant)}\`: add it there, or use a variant the document gives`,
        });
    }
  }
  if (!system.tokens.length) return { issues, findings };

  const given = systemNames(system);
  const own = designSheets(design).own;
  const files = tokenSheets(design);
  const known = new Set(given);
  // A suggestion names a role or a token, never a member of a role, which the guide says never to read: the nearest
  // member gives its role, and one with no role gives none.
  const members = roleNames(system);
  for (const sheet of [own, ...files.map((item) => item.sheet)])
    for (const rule of sheet.rules) for (const item of rule.declarations) if (item.property.startsWith("--")) known.add(item.property);

  // A name with the document's prefixes that nothing sets: the fallback of a var() hides it, so it counts too.
  for (const rule of own.rules) {
    for (const item of rule.declarations) {
      for (const name of varNames(item.value)) {
        if (!systemName(name) || known.has(name)) continue;
        const lone = system.lone.find((member) => member.name === name);
        const nearName = nearest(name, given);
        const near = nearName === null ? null : (members.get(nearName) ?? nearName) || null;
        issues.push({
          rule: "system.unknown-token",
          line: item.line,
          message: lone
            ? `var(${name}) names no token: ${document} has ${quoted(lone.path)} and no colors.${lone.missing} twin, so it is no role: add colors.${lone.missing}.${quoted(lone.path.split(".").slice(2).join("."))} to ${document}`
            : near
              ? `var(${name}) names no token: ${document} has ${near}`
              : `var(${name}) names no token: add it to ${document}, or read a name ${document} gives`,
        });
      }
    }
  }

  // A number of spacing read whole where a length goes: CSS drops the declaration, as `gap: 16` is no length. The format
  // takes a bare number in spacing, for a column count or a ratio, so it is a note; a name the design sets itself is its own.
  const numbers = new Set(system.tokens.filter((token) => token.form === "number" && token.path.startsWith("spacing.")).map((token) => token.name));
  for (const sheet of [own, ...files.map((item) => item.sheet)])
    for (const rule of sheet.rules) for (const item of rule.declarations) if (item.property.startsWith("--")) numbers.delete(item.property);
  if (numbers.size)
    for (const rule of own.rules)
      for (const item of rule.declarations) {
        if (!LENGTH.test(item.property.toLowerCase())) continue;
        const name = spaceParts(item.value)
          .map((part) => WHOLE_VAR.exec(part.trim())?.[1])
          .find((found) => found !== undefined && numbers.has(found));
        if (name)
          issues.push({
            rule: "system.unitless",
            line: item.line,
            message: `${item.property} reads var(${name}), which ${document} gives as the bare number ${quoted(literal(system, name, "light"))}, so the declaration is no length and CSS drops it: write the unit in ${document}, such as ${quoted(literal(system, name, "light"))}px, or multiply by 1px, as calc(var(${name}) * 1px)`,
          });
      }

  // A value the document gives, set again in a rule that always applies, to a value that is provably another.
  const themes = THEMES.filter(shows);
  const differs = (item: CssDeclaration): boolean => {
    if (!given.has(item.property)) return false;
    return themes.some((theme) => {
      const mine = resolved(system, item.value, theme);
      const theirs = resolved(system, literal(system, item.property, theme), theme);
      return mine !== null && theirs !== null && mine !== theirs;
    });
  };
  const override = (item: CssDeclaration) =>
    `${item.property} is ${quoted(item.value)} here and ${quoted(shownValue(system, item.property))} in ${document} (line ${lineOfName(system, item.property)}), the one source: take it out here, or change ${document}`;
  const extras = (rules: CssSheet["rules"]): CssDeclaration[] =>
    rules
      .filter((rule) => alwaysApplies(rule))
      .flatMap((rule) => rule.declarations)
      .filter((item) => systemName(item.property) && !given.has(item.property));
  for (const { file, sheet } of files) {
    for (const rule of sheet.rules.filter(alwaysApplies))
      for (const item of rule.declarations) if (differs(item)) findings.push(finding("system.override", override(item), file, item.line));
    const extra = extras(sheet.rules);
    const first = extra[0];
    if (first) findings.push(finding("system.extra-token", extraMessage(file, [...new Set(extra.map((item) => item.property))], document), file, first.line));
  }
  for (const rule of own.rules.filter(alwaysApplies))
    for (const item of rule.declarations) if (differs(item)) issues.push({ rule: "system.override", line: item.line, message: override(item) });
  // The design's own tokens blocks: one note for each of its files.
  const byFile = new Map<string, CssDeclaration[]>();
  for (const item of extras(own.rules.filter((rule) => rule.tokens))) {
    const file = placeOf(design, item.line).file;
    const list = byFile.get(file);
    if (list) list.push(item);
    else byFile.set(file, [item]);
  }
  for (const [file, extra] of byFile) {
    const first = extra[0];
    if (first)
      issues.push({
        rule: "system.extra-token",
        line: first.line,
        message: extraMessage(design.folder ? `${design.folder}/${file}` : file, [...new Set(extra.map((item) => item.property))], document),
      });
  }
  return { issues, findings };
}
