// The rule registry and the check. Each rule is a value: its id, the design format it arrived in, its level, and the
// check that finds it. The readings that find several rules at once run once for each design, and each rule
// takes its own findings from them. Adding a rule is one row here, and its finding in the check that finds it.

import type { PageFinding } from "../contract.ts";
import { tooLongVars } from "../css/sheet.ts";
import { placeAt, withUse } from "../design/blocks.ts";
import type { Issue } from "../design/facts.ts";
import { type Design, fromTop, placeOf, type Source } from "../design/load.ts";
import { roleNames } from "../design/system.ts";
import { Refusal } from "../errors.ts";
import { type Finding, finding, isOutcome, isRuleId, type Level, RULE_ROWS, type RuleId, ruleRow, stopsPage } from "../finding.ts";
import { ATTR, CONFIG_FILE, READ_LIMITS } from "../format.ts";
import type { Project } from "../project.ts";
import { lineStarts } from "../text.ts";
import { accessibilityChecks } from "./accessibility.ts";
import { controlIssues } from "./controls.ts";
import { deviceIssues } from "./devices.ts";
import { flowFindings, nameFindings } from "./flows.ts";
import { fontIssues, tokenFontFindings } from "./fonts.ts";
import { withImages } from "./images.ts";
import { integrityIssues } from "./integrity.ts";
import { copyIssues, fixtureCopy, lint, paintMessage, tokenColors } from "./lint.ts";
import { lostViews, readRounds } from "./rounds.ts";
import { designSheets, systemChecks } from "./system.ts";

/**
 * A row of the registry with its check. `stops` says a finding of it stops the page; `outcome` that it is an outcome of
 * a command, which no reading of a design gives, so its check finds nothing.
 */
export type Rule = { id: RuleId; since: number; level: Level; stops: boolean; outcome: boolean; check: (design: Design, project: Project) => Finding[] };

type Pass = (design: Design, project: Project) => Finding[];

/**
 * Each issue at its place in its file. A line of a part that is used several times names the first use: the same words
 * at the same line of a part are one finding, so a fault of the part is told once, and a fault one use gives is told
 * with that use. Several elements of one text that give the same words on one line are one finding that says how many.
 */
function placed(design: Design, issues: Issue[], source?: Source): Finding[] {
  const seen = new Map<string, { use: string; ats: Set<number> }>();
  const starts = source ? null : lineStarts(design.text);
  const placedOnce = issues.flatMap((issue) => {
    const line = source ? (source.lines[issue.line - 1] ?? placeOf(design, issue.line)) : placeOf(design, issue.line);
    const start = starts?.[issue.line - 1];
    // A line a host and a part share names the text the issue stands in, when the issue knows its place on that line.
    const onLine = issue.at !== undefined && start !== undefined && issue.at >= start && issue.at < (starts?.[issue.line] ?? Infinity);
    const place = onLine ? placeAt(line, (issue.at ?? 0) - start) : placeAt(line, 0);
    const key = `${issue.rule}\u0000${place.file}\u0000${place.line}\u0000${issue.message}`;
    const use = withUse("", place.use);
    const first = seen.get(key);
    // Another element of the same text on the line, told by its own place, is counted; another use of a part is not.
    if (first) {
      if (first.use === use && issue.at !== undefined && first.ats.size) first.ats.add(issue.at);
      return [];
    }
    const ats = new Set(issue.at === undefined ? [] : [issue.at]);
    seen.set(key, { use, ats });
    return [{ issue, place, ats }];
  });
  return placedOnce.map(({ issue, place, ats }) =>
    finding(
      issue.rule,
      withUse(`${issue.message}${ats.size > 1 ? ` (${ats.size} on this line)` : ""}`, place.use, (file) => fromTop(design, file)),
      place.file,
      place.line,
    ),
  );
}

// The passes, each once for each design: every rule takes its own findings from them.
const PASSES: Pass[] = [
  (design) => design.findings,
  (design) => placed(design, design.facts?.issues ?? []),
  (design) => placed(design, integrityIssues(design)),
  (design) => placed(design, controlIssues(design.facts)),
  (design) => {
    if (!design.facts) return [];
    const tokens = tokenColors(design.tokens.map((token) => `<style ${ATTR.tokens}>${token.css}</style>`).join("\n") + design.text, roleNames(design.system));
    const paints = design.facts.paints.map(
      ([line, attribute, value]): Issue => ({ rule: "paint.raw-color", line, message: paintMessage(attribute, value, tokens) }),
    );
    return [...placed(design, paints), ...placed(design, lint(design.text, tokens, designSheets(design).own))];
  },
  (design) =>
    design.facts
      ? [...placed(design, copyIssues(design.facts.texts)), ...placed(design, copyIssues(fixtureCopy(design.fixturesSource.text)), design.fixturesSource)]
      : [],
  (design, project) => (design.facts ? placed(design, deviceIssues(design.facts, project.devices.frames)) : []),
  (design) => (design.facts ? [...nameFindings(design), ...flowFindings(design)] : []),
  (design) => {
    if (!design.facts) return [];
    const file = design.files[0] ?? design.name;
    return withImages(design.fixtures, design.facts.imageFields, design.images).problems.map((message) => finding("integrity.image", message, file));
  },
  (design) => (design.facts ? placed(design, fontIssues(design)) : []),
  (design) => {
    const read = readRounds(design.rounds, design.name);
    return [...read.findings, ...(design.facts && !design.facts.tooDeep ? lostViews(read.rounds, design.name, design.facts.screens) : [])];
  },
  (design) => placed(design, systemChecks(design).issues),
  (design) => {
    const found = accessibilityChecks(design);
    return [...placed(design, found.issues), ...found.findings];
  },
];

/** Each tokens file read as a tokens block, with the design's own CSS rules, at its own file and line from the project's top. */
function tokenLint(design: Design): Finding[] {
  // The block's start tag and the file's first line share a line, so each line of the file keeps its number.
  return design.tokens
    .filter((token) => !token.generated)
    .flatMap((token) => lint(`<style ${ATTR.tokens}>${token.css}</style>`).map((issue) => finding(issue.rule, issue.message, token.file, issue.line)));
}

/**
 * A custom property whose value, each `var()` followed, grows past the limit, at its file and line: each tokens file's,
 * and the design's own. The checks follow no such value, so this finding stops the page rather than a check reading less.
 */
function varLimit(design: Design): Finding[] {
  const { own, tokens } = designSheets(design);
  const message = (name: string) =>
    `${name}, with each var() in it followed, is longer than ${READ_LIMITS.followed_value} characters, so no check can follow it: name each token fewer times`;
  return tooLongVars([...tokens, own]).flatMap(({ sheet, declaration }) => {
    const token = design.tokens[sheet];
    if (token) return [finding("read.var-limit", message(declaration.property), token.file, declaration.line)];
    return placed(design, [{ rule: "read.var-limit", line: declaration.line, message: message(declaration.property) }]).map((item) => ({
      ...item,
      file: item.file === null ? null : fromTop(design, item.file),
    }));
  });
}

// Each design's findings under each project's settings, by rule, so the device table a project gives is in the key.
const memo = new WeakMap<Design, WeakMap<Project, Map<RuleId, Finding[]>>>();

/** Every finding the passes give for a design under a project's settings, once, each naming its file from the project's top, by rule. */
function findingsOf(design: Design, project: Project): Map<RuleId, Finding[]> {
  let byProject = memo.get(design);
  if (!byProject) {
    byProject = new WeakMap();
    memo.set(design, byProject);
  }
  let byRule = byProject.get(project);
  if (!byRule) {
    const top = (item: Finding): Finding => (item.file === null ? item : { ...item, file: fromTop(design, item.file) });
    const all = [
      ...design.tokenFindings,
      ...tokenLint(design),
      ...tokenFontFindings(design),
      ...varLimit(design),
      ...systemChecks(design).findings,
      ...PASSES.flatMap((pass) => pass(design, project)).map(top),
    ];
    byRule = new Map();
    for (const item of all) {
      // A rule the registry lacks, or an outcome, would be dropped in silence, since no rule's check reads it: it is a fault of the tool.
      if (!isRuleId(item.rule)) throw new Error(`a check gave the rule ${JSON.stringify(item.rule)}, which the registry lacks: the tool's files changed`);
      if (isOutcome(item.rule)) throw new Error(`a check gave ${item.rule}, an outcome of a command and no rule: the tool's files changed`);
      const list = byRule.get(item.rule);
      if (list) list.push(item);
      else byRule.set(item.rule, [item]);
    }
    byProject.set(project, byRule);
  }
  return byRule;
}

function rule(id: RuleId, since = 1): Rule {
  const row = ruleRow(id);
  return { id, since, level: row.level, stops: row.stops, outcome: isOutcome(id), check: (design, project) => findingsOf(design, project).get(id) ?? [] };
}

/** The design format each rule arrived in, for a rule that arrived after format 1: none has yet. */
const SINCE: Partial<Record<RuleId, number>> = {};

/** Every row of the registry, its rules and its outcomes, in the order the format reference lists them, each with its check. */
export const RULES: Rule[] = (Object.keys(RULE_ROWS) as RuleId[]).map((id) => rule(id, SINCE[id]));

export function levelOf(rule: RuleId): Level {
  return ruleRow(rule).level;
}

/** A finding as data, with its level: as `--json` prints it and the page config holds it. */
export function findingData(item: Finding): PageFinding {
  return { rule: item.rule, level: levelOf(item.rule), file: item.file, line: item.line, message: item.message };
}

/** Why no setting turns off each kind of outcome: its findings never pass through `rulesOff`. */
const OUTCOME_STAYS = {
  kept: "it counts the findings the limit cut, so it stays on: turn off the rules it counts",
  refused: "it is a refused request, which no setting changes: fix the command, or the settings",
  failed: "it is a fault of the tool, which no setting hides: report it",
} as const;

/**
 * Why a rule no setting reaches stays on, or null for a rule a project may turn off. Its findings never pass through
 * `rulesOff`, so one accepted as off would still print.
 */
function unreachable(id: RuleId): string | null {
  const ends = ruleRow(id).outcome;
  if (ends) return OUTCOME_STAYS[ends];
  if (id === "stories.missing") return "it is the one finding of `stories`, which runs only when asked: to skip it, run no `stories`";
  return null;
}

/** The rules a project turns off, each a rule of the registry that does not stop the page, and one whose findings a setting reaches. */
export function rulesOff(project: Project): Set<RuleId> {
  const off = new Set<RuleId>();
  for (const [id, setting] of Object.entries(project.rules)) {
    if (!isRuleId(id))
      throw new Refusal(
        `${CONFIG_FILE}: \`rules\` names ${JSON.stringify(id)}, which is no rule: the format reference lists each rule's id`,
        "request.settings",
      );
    if (setting !== "off")
      throw new Refusal(`${CONFIG_FILE}: \`rules\` sets ${id} to ${JSON.stringify(setting)}: the one setting is "off"`, "request.settings");
    if (stopsPage(id))
      throw new Refusal(`${CONFIG_FILE}: \`rules\` turns off ${id}, a rule that keeps the page safe or readable: it stays on`, "request.settings");
    const why = unreachable(id);
    if (why) throw new Refusal(`${CONFIG_FILE}: \`rules\` turns off ${id}, which no setting reaches: ${why}`, "request.settings");
    off.add(id);
  }
  return off;
}

// A finding of the design's own files sorts in their reading order; one of another file, the design document, a tokens
// file, or a round file, after them, by the file's name, so the findings of one file stay together.
function sortKey(design: Design): (item: Finding) => [number, string, number] {
  const order = new Map(design.files.map((file, index) => [fromTop(design, file), index]));
  return (item) => {
    const index = item.file === null ? -1 : order.get(item.file);
    return [index ?? order.size, index === undefined ? (item.file ?? "") : "", item.line ?? 0];
  };
}

/** Every finding of a design, each once, in the order of its files and lines, at most the limit and a last line. */
export function check(design: Design, project: Project): Finding[] {
  const off = rulesOff(project);
  findingsOf(design, project);
  const seen = new Set<string>();
  const all = RULES.filter((item) => item.since <= design.format && !off.has(item.id))
    .flatMap((item) => item.check(design, project))
    .filter((item) => {
      const key = `${item.rule}\u0000${item.file}\u0000${item.line}\u0000${item.message}`;
      return !seen.has(key) && Boolean(seen.add(key));
    });
  const key = sortKey(design);
  const sorted = all
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => a.key[0] - b.key[0] || (a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0) || a.key[2] - b.key[2] || a.index - b.index)
    .map((entry) => entry.item);
  if (sorted.length <= READ_LIMITS.findings) return sorted;
  // A finding that stops the page is never cut, so the page's rule reads every one of them. Problems fill the limit
  // before notes, so a design with a problem always prints one and fails, and a design of notes alone passes.
  const keep = new Set(sorted.filter((item) => stopsPage(item.rule)));
  for (const level of ["problem", "note"] as const)
    for (const item of sorted) if (keep.size < READ_LIMITS.findings && levelOf(item.rule) === level) keep.add(item);
  const kept = sorted.filter((item) => keep.has(item));
  // Findings that stop the page may alone pass the limit: then none is cut, and no last line counts nothing.
  if (kept.length === sorted.length) return sorted;
  const cut = (level: Level, word: string) => {
    const count = sorted.filter((item) => !keep.has(item) && levelOf(item.rule) === level).length;
    return count === 0 ? [] : [`${count} more ${word}${count === 1 ? "" : "s"}`];
  };
  const words = [...cut("problem", "problem"), ...cut("note", "note")].join(" and ");
  return [...kept, finding("integrity.more", `and ${words}; fix these, then check again`, design.design)];
}

/** The findings that make a design's exit code 1: every finding but a note. */
export function problemsOf(findings: Finding[]): Finding[] {
  return findings.filter((item) => levelOf(item.rule) === "problem");
}

/** Whether the page stops: a finding of a rule whose row says it stops the page. */
export function pageStops(findings: Finding[]): boolean {
  return findings.some((item) => stopsPage(item.rule));
}
