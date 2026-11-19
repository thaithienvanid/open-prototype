// A finding: the rule that found it, the file and line it names when it has a place, and the words a person reads.
// Each rule has an id, `<family>.<rule>`, so a script acts on a finding by its id, never by its words. A finding is
// built here and printed here, in one form.
import { printable } from "./text.ts";

export type Level = "problem" | "note";

/**
 * Every rule the tool gives, by its id, with its level, in the order the format reference lists them. A new rule is a
 * row here, so a check names only an id this table holds, and a typo in one is a type error, not a fault at run time.
 * `RULES` in `checks/rules.ts` gives each row its check.
 */
export const RULE_LEVELS = {
  "read.file": "problem",
  "read.document": "problem",
  "read.format": "problem",
  "read.fixtures": "problem",
  "read.flow": "problem",
  "read.tokens": "problem",
  "read.use": "problem",
  "read.use-arg": "problem",
  "read.use-cycle": "problem",
  "read.use-limit": "problem",
  "read.var-limit": "problem",
  "read.slot": "problem",
  "read.tool-name": "problem",
  "unsafe.markup": "problem",
  "structure.screen-id": "problem",
  "structure.name": "problem",
  "structure.state-name": "problem",
  "structure.state-place": "problem",
  "structure.screen-unclosed": "problem",
  "structure.view-link": "problem",
  "structure.list": "problem",
  "structure.list-nested": "problem",
  "structure.vocabulary": "problem",
  "structure.work-item": "problem",
  "structure.product-name": "problem",
  "structure.state-near-core": "note",
  "integrity.label": "problem",
  "integrity.labelledby": "problem",
  "integrity.depth": "problem",
  "integrity.alt": "problem",
  "integrity.testid": "problem",
  "integrity.name": "problem",
  "integrity.id-repeat": "problem",
  "integrity.screen-repeat": "problem",
  "integrity.no-state": "problem",
  "integrity.initial": "problem",
  "integrity.no-screen": "problem",
  "integrity.parent": "problem",
  "integrity.link-screen": "problem",
  "integrity.link-state": "problem",
  "integrity.fixture-key": "problem",
  "integrity.testid-repeat": "problem",
  "integrity.unreached": "problem",
  "integrity.image": "problem",
  "integrity.font": "problem",
  "integrity.more": "problem",
  "flow.empty": "problem",
  "flow.unreached": "problem",
  "paint.raw-color": "problem",
  "paint.svg-color": "problem",
  "paint.depth": "problem",
  "paint.network": "problem",
  "copy.placeholder": "problem",
  "copy.emoji": "problem",
  "system.read": "problem",
  "system.name": "problem",
  "system.value": "problem",
  "system.reference": "problem",
  "system.empty": "note",
  "system.version": "note",
  "system.theme": "note",
  "system.override": "problem",
  "system.unknown-token": "problem",
  "system.extra-token": "note",
  "system.component": "note",
  "accessibility.lang": "problem",
  "accessibility.heading-top": "note",
  "accessibility.heading-skip": "note",
  "accessibility.main": "note",
  "accessibility.motion-reduce": "problem",
  "accessibility.motion-endless": "note",
  "accessibility.flash": "note",
  "accessibility.image-motion": "problem",
  "device.platform": "problem",
  "device.theme": "problem",
  "device.unknown": "problem",
  "device.height": "problem",
  "device.width": "problem",
  "device.size": "problem",
  "device.scroll": "problem",
  "device.picture-height": "note",
  "rounds.file": "problem",
  "rounds.key": "problem",
  "rounds.field": "problem",
  "rounds.answer": "problem",
  "rounds.limit": "note",
  "stories.missing": "problem",
  "request.usage": "problem",
  "request.no-design": "problem",
  "request.path": "problem",
  "request.file": "problem",
  "request.settings": "problem",
  "request.value": "problem",
  "request.exists": "problem",
  "request.browser": "problem",
  "tool.failed": "problem",
} as const satisfies Record<string, Level>;

/** The id of a rule: `<family>.<rule>`, one of `RULE_LEVELS`. */
export type RuleId = keyof typeof RULE_LEVELS;
/** Whether a text is the id of a rule, such as a key of the settings' `rules`. */
export function isRuleId(id: string): id is RuleId {
  return Object.hasOwn(RULE_LEVELS, id);
}

/** The id of a refused request's rule. */
export type RequestRule = Extract<RuleId, `request.${string}`>;

export type Finding = { rule: RuleId; file: string | null; line: number | null; message: string };

/** What a design holds, as the ok line counts it. */
export type Counts = { screens: number; states: number; test_ids: number };

export function finding(rule: RuleId, message: string, file: string | null = null, line: number | null = null): Finding {
  return { rule, file, line, message };
}

/** The families of rules, in the order the format reference lists them, each with what its findings mean. */
export const FAMILIES: Record<string, string> = {
  read: "the design cannot be read: the page is not written",
  unsafe: "the design holds markup that could load or run something: the page is not written",
  structure: "the design's screens, states, and names",
  compose: "the blocks a design uses",
  integrity: "links, labels, test ids, and the example data agree with the design",
  flow: "the flows a design includes agree",
  paint: "colors and depth come from the tokens",
  copy: "the words a person reads are real copy",
  system: "the project's design document, DESIGN.md, and the tokens a design reads from it: it is the one source of each value",
  accessibility: "what a design file shows of accessibility with no browser: its language, headings, landmarks, and motion",
  device: "the platforms and frames a design declares",
  rounds: "the review rounds beside a design",
  stories: "the built interface's stories cover the design's components",
  request: "the request itself was refused: the next step is in its message",
  tool: "the tool failed: a fault of the tool, or a capture that cannot start or times out",
};

export function family(rule: string): string {
  const dot = rule.indexOf(".");
  return dot < 0 ? rule : rule.slice(0, dot);
}

/** The families whose findings stop a page: the design cannot be read, or its markup is unsafe. */
export function stopsPage(rule: string): boolean {
  return family(rule) === "read" || family(rule) === "unsafe";
}

/** The one line a person reads: the place in front, when the finding has one, and the rule's id last, which turns it off. */
export function findingLine(item: Finding): string {
  // A file's name comes from the disk, and a design may give it any byte, so it prints as a value does.
  const place = item.file === null ? "" : `${printable(item.file)}${item.line === null ? "" : `:${item.line}`}: `;
  return `${place}${item.message} [${item.rule}]`;
}
