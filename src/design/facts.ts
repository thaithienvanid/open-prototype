// The facts the one walk over a design's markup gives, as types: the screens with their states, the links, test ids,
// components, lists, slots, headings, the document's parts, the controls, and the walk's issues. `walk` in
// `design/read.ts` makes them; the checks, the manifests, and the page read them.
import type { RuleId } from "../finding.ts";
import type { Attribute } from "../html/tokenizer.ts";

/**
 * Something the walk finds: the rule, the line in the walked text, and the words; `at`, where the walk knows it, is the
 * place in the walked text, so a line that a host and a block share names the one it stands in.
 */
export type Issue = { rule: RuleId; line: number; message: string; at?: number | undefined };

export class Screen {
  readonly states: string[] = [];
  /** The line of each state, in the order of `states`. */
  readonly stateLines: number[] = [];
  constructor(
    readonly id: string,
    readonly title: string,
    readonly line: number,
    readonly parent: string | null,
    readonly initial: string | null,
    /** The list whose chosen item this screen shows, or "". */
    readonly source: string,
  ) {}

  /** The state the viewer opens first: the declared one when the screen has it, else its first state. */
  opensIn(): string | null {
    if (this.initial !== null && this.states.includes(this.initial)) return this.initial;
    return this.states[0] ?? null;
  }
}

type Link = { attribute: string; value: string; line: number; screen: string; at: number };
type TestId = { name: string; line: number; screen: string; state: string; inTemplate: boolean; at: number };
/** A component as the design draws it: "" for the chrome or for no state, and the list whose item it sits in, if any. */
type ComponentUse = { name: string; variant: string; screen: string; state: string; template: string; testid: string; line: number };
/** A list that repeats an item, and where it sits: `template` names the list, for the parts of its item. */
type ListUse = { key: string; template: string; screen: string; state: string; line: number };
/** A value the design reads from its example data: the attribute, the key, its line, the list it sits in, the screen's source. */
type FixtureUse = { attribute: string; key: string; line: number; template: string; source: string };
/**
 * A heading as a person meets it: its level, its line and place, the screen and state it shows in ("" for the chrome or
 * for no state), and the dialog it stands in, which starts a heading order of its own ("" for none).
 */
export type Heading = { level: number; line: number; at: number; screen: string; state: string; dialog: string };
/** A main landmark, where it shows. */
export type Landmark = { line: number; screen: string; state: string };

/** What a whole document holds beside its markup: its head, where its body is, and its fixtures block. */
export type DocumentParts = {
  htmlAttributes: Attribute[];
  bodyAttributes: Attribute[];
  title: string;
  /** Each `<meta name>` the head holds, by name, with its content and line. */
  metas: Map<string, { content: string; line: number }>;
  /** Where each `<style>` of the head stands in the walked text. */
  headStyles: [start: number, end: number][];
  /** Where the body's markup stands: after `<body ...>`, before `</body>`. */
  body: [start: number, end: number] | null;
  fixtures: { text: string; line: number; start: number; end: number } | null;
  fixturesBlocks: number;
};

export type Facts = {
  screens: Screen[];
  links: Link[];
  testIds: TestId[];
  components: ComponentUse[];
  lists: ListUse[];
  fixtureUses: FixtureUse[];
  stateSizes: Map<string, number>;
  devices: [line: number, frame: string, style: string][];
  /** Each SVG fill or stroke that holds a raw color: its line, the attribute, and the value. */
  paints: [line: number, attribute: string, value: string][];
  /** Each id written twice: the line, the id, and the line that holds it first. */
  idRepeats: [line: number, id: string, first: number, at: number][];
  /** The text a person reads, with its line: no style, and no attribute. */
  texts: [line: number, text: string, at?: number | undefined][];
  /** The text of each `<style>` element outside SVG and MathML, as the tokenizer reads it. */
  styles: string[];
  /** The fixtures keys the design's images read. */
  imageFields: Set<string>;
  /** Each slot, with its line, the screen it sits on ("" for the chrome), and its state ("" outside every state). */
  slots: { name: string; line: number; screen: string; state: string }[];
  /** Each heading and each main landmark a person meets: none under hidden, aria-hidden, or inert. */
  headings: Heading[];
  mains: Landmark[];
  /** The `lang` of the document's `<html>`, or null when it names none, and the line of `<html>` (1 when there is none). */
  lang: { value: string | null; line: number };
  document: DocumentParts | null;
  /** What the control rules of `checks/controls.ts` judge. */
  controls: Controls;
  /** The problems the walk finds, and the markup the allow-list refuses. */
  issues: Issue[];
  tooDeep: boolean;
};

/** The controls a design draws, as facts: each in the order the walk meets it, with its line and where it starts. */
export type Controls = {
  /** Each `<img>`: whether it has an alt, and its role. */
  images: { line: number; at: number; alt: boolean; role: string }[];
  /** Each control a person works, and its test id ("" for none). */
  interactive: { tag: string; line: number; at: number; testid: string }[];
  /** Each button and link, in the order each closes, and whether it has a name. */
  buttons: { tag: string; line: number; at: number; named: boolean }[];
  /** Each other field, its id, and whether it has a name by an attribute or stands in a label. */
  fields: { tag: string; line: number; id: string; named: boolean }[];
  /** Each id a `<label for>` names. */
  labelTargets: Set<string>;
  /** Each `aria-labelledby`, as written. */
  labelledby: { line: number; value: string }[];
  /** Each id the design gives an element, but one a block's argument fills. */
  ids: Set<string>;
};

export function sizeKey(screen: string, state: string): string {
  return `${screen}\u0000${state}`;
}
