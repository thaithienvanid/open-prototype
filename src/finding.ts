// A finding: the rule that found it, the file and line it names when it has a place, and the words a person reads.
// Each rule has an id, `<family>.<rule>`, so a script acts on a finding by its id, never by its words. A finding is
// built here and printed here, in one form.
import { printable } from "./text.ts";

export type Level = "problem" | "note";

/**
 * The success criteria of WCAG 2.2 a rule answers to, each with its name and its level, so the reference prints each
 * rule's criterion from the registry.
 */
export const WCAG = {
  "1.1.1": { name: "Non-text Content", level: "A" },
  "1.3.1": { name: "Info and Relationships", level: "A" },
  "2.2.2": { name: "Pause, Stop, Hide", level: "A" },
  "2.3.1": { name: "Three Flashes or Below Threshold", level: "A" },
  "2.3.3": { name: "Animation from Interactions", level: "AAA" },
  "2.4.1": { name: "Bypass Blocks", level: "A" },
  "2.4.4": { name: "Link Purpose (In Context)", level: "A" },
  "3.1.1": { name: "Language of Page", level: "A" },
  "4.1.2": { name: "Name, Role, Value", level: "A" },
} as const satisfies Record<string, { name: string; level: "A" | "AA" | "AAA" }>;

/** The number of a criterion of `WCAG`. */
type Criterion = keyof typeof WCAG;

/**
 * What ends a command an outcome comes from: a refused request (exit 2), a fault of the tool (exit 3), or the
 * findings `check` keeps past its limit, whose own levels give the exit code.
 */
export type Outcome = "refused" | "failed" | "kept";

/**
 * A row of the registry. A rule is checked on a design: its level, whether a finding of it stops the page, which only
 * a problem may, what it means, and the criteria it answers to. An outcome is no rule: a command gives it, never a
 * reading of a design, and no setting turns it off.
 */
type Row =
  | { readonly level: "problem"; readonly stops: true; readonly means: string; readonly wcag?: readonly Criterion[]; readonly outcome?: never }
  | { readonly level: Level; readonly stops: false; readonly means: string; readonly wcag?: readonly Criterion[]; readonly outcome?: never }
  | { readonly level: Level; readonly stops: false; readonly means: string; readonly wcag?: never; readonly outcome: Outcome };

/** A problem that stops the page: the design cannot be read, or the page would not be what it shows. */
const stops = (means: string) => ({ level: "problem", stops: true, means }) as const;
/** A problem: it makes the exit code 1, and the page is still written. */
const problem = <const C extends readonly Criterion[]>(means: string, wcag?: C) =>
  ({ level: "problem", stops: false, means, ...(wcag ? { wcag } : {}) }) as const;
/** A note: advice, which never makes the exit code 1. */
const note = <const C extends readonly Criterion[]>(means: string, wcag?: C) => ({ level: "note", stops: false, means, ...(wcag ? { wcag } : {}) }) as const;
/** An outcome of a command, with its level and what ends the command. */
const outcome = <const L extends Level>(level: L, ends: Outcome, means: string) => ({ level, stops: false, means, outcome: ends }) as const;

/**
 * Every rule the tool checks and every outcome of a command, by its id, in the order the format reference lists them.
 * A new rule is a row here, so a check names only an id this table holds, and a typo in one is a type error, not a
 * fault at run time. `RULES` in `checks/rules.ts` gives each row its check. A row's `means` says what is wrong when it
 * fires, in the words a person would search for.
 */
export const RULE_ROWS = {
  "read.file": stops("a file of the design, a flow, or a block cannot be read, or has a name the tool does not read"),
  "read.document": stops("the design has no <body>, or its <html> or <body> holds an attribute that would blank every frame"),
  "read.format": stops("the design names a version of the format this tool does not read"),
  "read.fixtures": stops("the example data, the fixtures block, is not JSON, holds no object, or is written twice or outside the main file"),
  "read.depth": stops("the design nests elements deeper than the tool reads, so what it read is a fragment of the design"),
  "read.var-limit": stops("a custom property, with each var() in it followed, is too long for any check to follow"),
  "unsafe.markup": stops("the design holds markup outside the allow-list, or markup that could load or run something"),
  "structure.name": problem("a screen's id, a state's name, or a component's or a variant's name is not in the form a link or code can name"),
  "structure.state-place": problem("a state is not a direct child of its screen"),
  "structure.screen-unclosed": problem("a screen has no </section>, so the next screen would be drawn inside it"),
  "structure.view-link": problem("a link goes to another view by an href, where the format links views by screen and state"),
  "structure.slot": stops("a slot is no slot of the format, or two of one slot show at once"),
  "structure.tool-name": stops("the design writes a name that only the tool sets inside a frame"),
  "structure.list": problem("a list, its item, or its limit is written wrong, or a list stands inside another list's item"),
  "structure.nesting": problem("markup a browser nests otherwise than it is written, such as a <b> closed by </p>"),
  "structure.vocabulary": problem("a name with the format's prefix is no name of the format, or stands where it does not belong"),
  "structure.no-screen": problem("the design draws no screen"),
  "structure.no-state": problem("a screen has no state"),
  "structure.work-item": problem("the work item the head names is no work item: 1 to 64 characters with no space"),
  "structure.product-name": problem("the product's name in the example data is more than one short line"),
  "structure.state-near-core": note("a state's name is near a usual one, such as sucess for success; a screen's own state is fine"),
  "compose.use": stops("a block the design uses is missing or misnamed, or its use holds what the block would drop"),
  "compose.arg": stops("a block reads an argument its use does not give, or an argument's name is malformed"),
  "compose.cycle": stops("a block uses itself, at once or through another block"),
  "compose.limit": stops("the blocks are used too many times, or add too much text, for the tool to read"),
  "compose.unused-arg": note("a use gives an argument the block never reads; the page is as it would be"),
  "integrity.labelledby": problem("aria-labelledby names an id the design lacks"),
  "integrity.testid": problem("a control has no test id"),
  "integrity.id-repeat": problem("two elements share an id"),
  "integrity.screen-repeat": problem("two screens share an id, or their ids differ only by case, so they would share one picture"),
  "integrity.initial": problem("a screen's first state names no state of it"),
  "integrity.parent": problem("a screen's parent names no screen"),
  "integrity.link": problem("a link names a screen, or a state of a screen, that the design lacks"),
  "integrity.fixture-key": problem("the design reads a key the example data lacks, or one whose value cannot be shown"),
  "integrity.testid-repeat": problem("two elements of one screen share a test id"),
  "integrity.unreached": problem("no link reaches a screen from the first screen"),
  "integrity.image": problem("an image the example data names cannot be carried into the page"),
  "integrity.font": problem("a font file a style names cannot be carried into the page"),
  "integrity.load": problem("a style loads a file or from the network, which the page's policy blocks: an image loads only as a data: URI"),
  "integrity.more": outcome("note", "kept", "from check: the last line past the findings limit, which counts the problems and the notes the limit cut"),
  "flow.include": stops("a flow the design includes is missing, misnamed, or holds what a flow may not"),
  "flow.empty": problem("a flow holds no screen"),
  "flow.unreached": problem("no screen or navigation reaches a flow"),
  "paint.raw-color": problem("a colour is written raw, in a style or an svg's attribute, where it should read a token"),
  "paint.depth": problem("a shadow or a layer's depth is written outside the tokens block, where it should read a token"),
  "copy.placeholder": problem("the copy holds placeholder text, such as lorem ipsum, TODO, or a {{name}} left unfilled"),
  "copy.emoji": problem("the copy draws an icon as an emoji"),
  "system.tokens-file": stops("a tokens file the settings name cannot be read, or holds what a tokens file may not"),
  "system.read": problem("the design document's front matter is not YAML, holds no map, or is nested too deep"),
  "system.name": problem("a key of the design document is a name the tool never reads, or one a CSS name cannot take"),
  "system.value": problem("a value of the design document is not of the kind its key takes"),
  "system.reference": problem("a reference in the design document names no token, a token of another kind, or a loop"),
  "system.empty": note("the design document holds no tokens"),
  "system.version": note("the design document is written for another version of DESIGN.md, so the tool reads the keys it knows"),
  "system.theme": note("the design shows a theme the design document has no colours for, or a colour has no twin in the other theme"),
  "system.override": problem("a design or a tokens file sets a token of the design document to another value"),
  "system.unknown-token": problem("the design reads a token the design document does not give"),
  "system.extra-token": note("a design or a tokens file adds a token the design document does not give"),
  "system.unitless": note("the design reads a bare number where CSS needs a length, so CSS drops the declaration"),
  "system.component": note("a component or a variant the design names is in no key of the design document's components"),
  "accessibility.lang": problem("the page names no language, or no well-formed language tag", ["3.1.1"]),
  "accessibility.label": problem("a form field has no label", ["4.1.2"]),
  "accessibility.name": problem("a button or a link has no name a screen reader can say", ["4.1.2", "2.4.4"]),
  "accessibility.alt": problem("an image has no alternative text", ["1.1.1"]),
  "accessibility.headings": note(
    "a view shows no level-1 heading or more than one, or skips a heading level; a note, since the criterion asks for no single h1 and a design may skip on purpose",
    ["1.3.1"],
  ),
  "accessibility.main": note("a view shows no <main> landmark, or more than one", ["1.3.1", "2.4.1"]),
  "accessibility.motion-reduce": problem(
    "an animation or a transition still moves, resizes, or reshapes under reduced motion; a problem though the criterion is AAA, since the file shows it for sure and one reduce rule fixes it",
    ["2.3.3"],
  ),
  "accessibility.motion-endless": note("an animation plays for ever, and reduced motion does not stop it", ["2.2.2"]),
  "accessibility.flash": note(
    "an animation changes light or colour more than three times a second; a note, since a file shows how often a value changes, and not the flash's size or brightness, which the criterion's threshold reads",
    ["2.3.1"],
  ),
  "accessibility.image-motion": problem("an animated image plays for ever", ["2.2.2"]),
  "device.declared": problem("the head declares a platform or a theme the format does not have"),
  "device.frame": problem("a drawn device frame names no frame of the device table"),
  "device.frame-style": problem("a drawn device frame lacks the table's width or height, or does not scroll inside"),
  "device.picture-height": note("from shots --capture: a view is taller than a picture takes, so its picture stops there"),
  "rounds.file": problem("a round's file is not a JSON object, so it is left out"),
  "rounds.field": problem("a round's file lacks a field, writes one wrong, or holds a key it has no place for"),
  "rounds.answer": problem("a change answers a comment no earlier round holds"),
  "rounds.limit": note("a round is left out of the page, which shows the rounds while they fit"),
  "rounds.view": note("a comment names a view the design no longer has"),
  "stories.missing": problem("from stories: a component or a variant of the design has no story in the built interface"),
  "request.usage": outcome("problem", "refused", "the command line is not one the tool reads: an unknown command or flag, or a flag the command does not take"),
  "request.path": outcome("problem", "refused", "a path is outside the project, or the file system refused it"),
  "request.file": outcome("problem", "refused", "a file the command names cannot be read"),
  "request.settings": outcome("problem", "refused", "the settings file is not one the tool reads, or turns off a rule that stays on"),
  "request.value": outcome("problem", "refused", "a flag's value is malformed, or names what the design or the device table lacks"),
  "request.exists": outcome("problem", "refused", "a file the command would write is there, and the tool writes over no file of yours"),
  "request.browser": outcome("problem", "refused", "no Chrome was found to capture with, or the capture was refused"),
  "tool.failed": outcome("problem", "failed", "the tool failed: a fault of its own, or a capture that cannot start or times out"),
} as const satisfies Record<string, Row>;

/** The id of a rule or an outcome: `<family>.<rule>`, one of `RULE_ROWS`. */
export type RuleId = keyof typeof RULE_ROWS;
/** Whether a text is the id of a row of the registry, such as a key of the settings' `rules`. */
export function isRuleId(id: string): id is RuleId {
  return Object.hasOwn(RULE_ROWS, id);
}

/** The registry's row of an id. */
export function ruleRow(id: RuleId): Row {
  return RULE_ROWS[id];
}

/** Whether an id is an outcome of a command, not a rule a design is checked by. */
export function isOutcome(id: RuleId): boolean {
  return ruleRow(id).outcome !== undefined;
}

/** The id of a refused request's rule. */
export type RequestRule = Extract<RuleId, `request.${string}`>;

export type Finding = { rule: RuleId; file: string | null; line: number | null; message: string };

/** What a design holds, as the ok line counts it. */
export type Counts = { screens: number; states: number; test_ids: number };

export function finding(rule: RuleId, message: string, file: string | null = null, line: number | null = null): Finding {
  return { rule, file, line, message };
}

/** The families, each a topic, in the order the format reference lists them, each with what its rules read. */
export const FAMILIES: Record<string, string> = {
  read: "the design's files, its document, its format, and its example data can be read, within the reader's limits",
  unsafe: "the design holds no markup that could load or run something",
  structure: "the design's screens, states, slots, lists, and names",
  compose: "the blocks a design uses, and their arguments",
  integrity: "links, ids, test ids, the example data, and the files a page loads agree with the design",
  flow: "the flows a design includes",
  paint: "colours and depth come from the tokens",
  copy: "the words a person reads are real copy",
  system: "the project's design document, DESIGN.md, and the tokens files and tokens a design reads: it is the one source of each value",
  accessibility: "what a design file shows of accessibility with no browser: its language, labels, names, alternatives, headings, landmarks, and motion",
  device: "the platforms, themes, and frames a design declares",
  rounds: "the review rounds beside a design",
  stories: "the built interface's stories cover the design's components",
  request: "outcomes: the request itself was refused, and the next step is in its message",
  tool: "outcomes: the tool failed, a fault of the tool, or a capture that cannot start or times out",
};

export function family(rule: string): string {
  const dot = rule.indexOf(".");
  return dot < 0 ? rule : rule.slice(0, dot);
}

/** Whether a finding of a rule stops the page, as the rule's row says: a project cannot turn such a rule off. */
export function stopsPage(rule: RuleId): boolean {
  return ruleRow(rule).stops;
}

/** The one line a person reads: the place in front, when the finding has one, and the rule's id last, which turns it off. */
export function findingLine(item: Finding): string {
  // A file's name comes from the disk, and a design may give it any byte, so it prints as a value does.
  const place = item.file === null ? "" : `${printable(item.file)}${item.line === null ? "" : `:${item.line}`}: `;
  return `${place}${item.message} [${item.rule}]`;
}
