// The one walk over a design's markup. One pass gives every fact the checks, the manifests, and the page read: the
// document's head and body, the screens with their states in drawn order, links, test ids, components, lists, slots,
// ids, text, and style blocks; the structure problems; and the markup the allow-list refuses. Each is recorded with
// its line in the walked text, and the loader maps that line to its file.
import { SAFE_PAINT } from "../css/colors.ts";
import { type Counts, type RuleId, stopsPage } from "../finding.ts";
import { ATTR, CORE_STATES, KEBAB, PREFIX, PROGRAM, READ_LIMITS, SCREEN_ID, SLOTS, VOCABULARY, VOID, WORD } from "../format.ts";
import { type Attribute, type Fault, firstValues, OpenElements, readMarkup, type TagPlace } from "../html/tokenizer.ts";
import { distance, lineFinder, nearest, quoted, shown, strip } from "../text.ts";
import { attributeProblem, DOCUMENT, elementProblem, viewLink } from "./allow.ts";
import { type Facts, type Issue, Screen, sizeKey } from "./facts.ts";

type WalkOptions = {
  /** A design with flows carries flow-qualified screen ids, `<flow>:<id>`: the name rule reads the part after it. */
  qualified?: boolean;
};

const INTERACTIVE = new Set(["a", "button", "input", "select", "textarea"]);
const NAMES = ["aria-label", "aria-labelledby", "title"];
const BY_REFERENCE = NAMES.slice(0, 2);
const BUTTON_INPUTS = new Set(["button", "submit", "reset"]);
const UNCLOSED = "a browser would take the rest of the page into it";
// Elements a browser reads to their own end tag: one left open takes the rest of the page.
const SWALLOWS = new Set(["textarea", "title", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "script", "plaintext", "template"]);
// The comment forms a browser reads differently from a reader that ends a comment at the first `-->`, wherever they
// stand; `--!` is refused inside a comment alone, in the walk's end.
const COMMENT_TRICKS = /<!--->|<!-->|<!\[|<\?|<!(?!--)/gi;
const DOCTYPE = /^\s*<!doctype html>/i;
// The attributes on <html> or <body> that would hide the whole document in every frame.
const BLANKS = new Set(["hidden", "inert"]);
// The elements a document's head holds.
const HEAD_TAGS = new Set(["title", "meta", "style", "script", "link", "base", "noscript", "template"]);
const TEMPLATE_TAG = new RegExp(`<(/?)template(?!${WORD})`, "giu");
const DESIGNER_NAMES = new Set<string>([
  ...VOCABULARY.structure,
  ...VOCABULARY.content,
  ...VOCABULARY.behaviour,
  ...VOCABULARY.composition.filter((name) => !name.includes("<")),
]);
const TOOL_NAMES = new Set<string>(VOCABULARY.set_by_the_tool);
const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);
const HEADING_TAG = /^h([1-6])$/;
const ONLY_ON: Record<string, string> = {
  [ATTR.format]: "html",
  [ATTR.fixtures]: "script",
  [ATTR.tokens]: "style",
  [ATTR.item]: "template",
  [ATTR.screen]: "section",
};

// The words of each fault of nesting: what a browser does with the markup, then how to write it.
const NESTING: Record<Fault["kind"], (tag: string, other: string) => string> = {
  "closed-early": (tag, by) =>
    `${by} closes the <${tag}> before its own end tag: a browser opens a new <${tag}> after it, around what follows; close the <${tag}> first, with </${tag}>`,
  adopted: (tag, inside) => `</${tag}> while the <${inside}> inside it is open: a browser splits the two and moves what follows; close the <${inside}> first`,
  "link-in-link": () => "an <a> inside another <a>: a browser ends the first link here; close it with </a> first",
  "in-select": (tag) =>
    `a <${tag}> inside a <select>: a browser ends the select before it${tag === "select" ? " and drops the second" : ""}; close the select first, with </select>`,
  "in-table": (tag, parent) =>
    `${tag ? `a <${tag}>` : "text"} directly inside a <${parent}>, or a template of its parts: a browser moves it out of the table${tag === "table" ? ", or ends the table there" : ""}; put it in a cell, a <td>`,
  "table-part": (tag) =>
    `a <${tag}> where a table does not take it: a browser drops it, or adds the parts around it; write each part in its place, a <td> or <th> in a <tr>, a <tr> in a <table> or its <tbody>, and a list's item of rows with one kind of part`,
  "stray-end": (tag) =>
    tag === "br"
      ? "a </br>: a browser reads it as a line break, <br>; write <br>"
      : `a </${tag}> with no <${tag}> open that it can close: a browser reads it ${tag === "p" ? "as an empty paragraph" : "as the end of a part it added"}; take it out, or write the <${tag}> it closes`,
  "heading-end": (tag, open) => `</${tag}> while an <${open}> is open: a browser ends the <${open}> there; close it with </${open}>`,
  "option-end": (tag, inside) => `</${tag}> while the <${inside}> inside it is open: a browser closes both there; close the <${inside}> first`,
};

type Open = {
  tag: string;
  attrs: Map<string, string>;
  line: number;
  at: number;
  screen: Screen | null;
  state: string;
  interactive: boolean;
  named: boolean;
  // What the element inherits from its parents, kept here so each step costs the same on a deep design.
  hidden: boolean;
  /** How many elements with the hidden attribute stand around the element, itself among them: text names a control only with none between them. */
  hiddenAt: number;
  /** Whether the element is left out of what a person meets: under hidden, aria-hidden="true", or inert. */
  leftOut: boolean;
  /** The dialog the element stands in, by its place in the walked text, or "". */
  dialog: string;
  template: string;
  inLabel: boolean;
  foreign: boolean;
  svg: boolean;
  iconText: boolean;
  head: boolean;
  source: string;
  /** Whether the element is a list inside another list's item, or stands inside one: the format draws no such list. */
  nestedList: boolean;
  /** For a list: its id, and how many items it holds directly. */
  list: string;
  items: number;
  context: [screen: string, state: string];
};

class Walk {
  readonly facts: Facts = {
    screens: [],
    links: [],
    testIds: [],
    components: [],
    lists: [],
    fixtureUses: [],
    stateSizes: new Map(),
    devices: [],
    paints: [],
    idRepeats: [],
    texts: [],
    styles: [],
    imageFields: new Set(),
    slots: [],
    headings: [],
    mains: [],
    lang: { value: null, line: 1 },
    document: {
      htmlAttributes: [],
      htmlLine: 1,
      bodyAttributes: [],
      title: "",
      metas: new Map(),
      headStyles: [],
      body: null,
      fixtures: null,
      fixturesBlocks: [],
    },
    controls: { images: [], interactive: [], buttons: [], fields: [], labelTargets: new Set(), labelledby: [], ids: new Set() },
    issues: [],
    tooDeep: false,
  };
  private readonly stack = new OpenElements<Open>((fault) => this.nesting(fault));
  /** The line of the token being read, for a fault of nesting the open elements tell. */
  private line = 1;
  private readonly controls: Open[] = [];
  /** Where the token being read starts in the walked text, while the walk reads one. */
  private at: number | undefined = undefined;
  private readonly ids = new Map<string, [line: number, at: number]>();
  private readonly unsafe: Issue[] = [];
  private readonly templateTags = new Set<number>();
  private readonly seen = new Map<string, number>();
  private style: string | null = null;
  private title: string | null = null;
  private fixtures: { text: string; line: number; textLine: number; start: number } | null = null;
  /** Each state named close to a familiar one, told at the end, once the screen's every state is known. */
  private readonly nearCore: [screen: Screen, state: string, line: number][] = [];

  // A document whose <body> is written: before it, an element at the top is in the head. With none written, the one
  // finding is that the body is missing, never that each screen stands in the head.
  private readonly bodyWritten: boolean;
  private bodyImplied = false;

  constructor(
    private readonly text: string,
    private readonly options: WalkOptions,
  ) {
    this.bodyWritten = /<body(?![\p{L}\p{N}_-])/iu.test(text);
  }

  run(): Facts {
    readMarkup(this.text, {
      start: (tag, attrs, place) => this.start(tag, attrs, place),
      startEnd: (tag, attrs, place) => {
        // HTML ignores `/>` except inside SVG and MathML, where it closes the element.
        this.start(tag, attrs, place);
        if (!VOID.has(tag) && this.stack.top()?.foreign) this.end(tag, place);
      },
      end: (tag, place) => this.end(tag, place),
      data: (text, line, at) => {
        this.at = at;
        this.data(text, line);
      },
      comment: (_text, line) => {
        this.at = undefined;
        this.comment(line);
      },
      // An unclosed comment has its own finding, below.
      unfinished: (construct, line) => {
        this.at = undefined;
        if (construct === "tag") this.issue("unsafe.markup", line, `the text ends inside a tag, at line ${line}: ${UNCLOSED}; finish the tag, or take it out`);
      },
    });
    this.at = undefined;
    this.finish();
    const facts = this.facts;
    const seen = new Set<string>();
    // Each unsafe form once, at its first line: the page stops on the first. A form is the issue's identity with no
    // place, its rule and its words, as the check keeps each finding once by its rule, its place, and its words.
    for (const issue of this.unsafe) {
      const form = `${issue.rule}\u0000${issue.message}`;
      if (!seen.has(form) && seen.add(form)) facts.issues.push(issue);
    }
    facts.issues.sort((a, b) => a.line - b.line);
    return facts;
  }

  private issue(rule: RuleId, line: number, message: string, at: number | undefined = this.at): void {
    const issue = at === undefined ? { rule, line, message } : { rule, line, message, at };
    if (stopsPage(rule)) this.unsafe.push(issue);
    else if (!this.facts.tooDeep) this.facts.issues.push(issue);
  }

  private start(tag: string, attrs: Attribute[], place: TagPlace): void {
    this.at = place.at;
    this.line = place.line;
    const a = firstValues(attrs);
    // The elements this start tag ends, as a browser reads it: an open <p> before a <div>, an <li> before the next.
    for (const entry of this.stack.opening(tag, tag === "input" && (a.get("type") ?? "").trim().toLowerCase() === "hidden")) this.close(entry);
    const line = place.line;
    const parent = this.stack.top();
    if (tag === "template") this.templateTags.add(place.at);
    this.repeated(tag, attrs, line);
    // Before <body>, an element at the top of a document is in its head, as a browser reads it when <head> is left out.
    const top = !this.seen.has("body") && (!parent || parent.tag === "html") && !DOCUMENT.has(tag);
    // With no <body> written, the first element that is not the head's own starts the body, as a browser reads it.
    if (top && !this.bodyWritten && !HEAD_TAGS.has(tag)) this.bodyImplied = true;
    const implied = top && (this.bodyWritten || !this.bodyImplied);
    const head = Boolean(parent?.head) || tag === "head" || implied;
    if (DOCUMENT.has(tag)) this.documentElement(tag, attrs, place);
    else this.allowed(tag, attrs, line, parent, head);
    this.vocabulary(tag, attrs, line);
    const entry: Open = {
      tag,
      attrs: a,
      line,
      at: place.at,
      screen: null,
      state: "",
      interactive: false,
      named: false,
      hidden: Boolean(parent?.hidden) || a.get("aria-hidden") === "true",
      hiddenAt: (parent?.hiddenAt ?? 0) + (a.has("hidden") ? 1 : 0),
      leftOut: Boolean(parent?.leftOut) || a.has("hidden") || a.has("inert") || (a.get("aria-hidden") ?? "").trim().toLowerCase() === "true",
      dialog: tag === "dialog" || DIALOG_ROLES.has((a.get("role") ?? "").trim().toLowerCase()) ? `dialog-${place.at}` : (parent?.dialog ?? ""),
      template: parent?.template || (tag === "template" && parent?.list ? parent.list : ""),
      inLabel: Boolean(parent?.inLabel) || tag === "label",
      foreign: Boolean(parent?.foreign) || tag === "svg" || tag === "math",
      svg: Boolean(parent?.svg) || tag === "svg",
      iconText: Boolean(parent?.iconText) || (Boolean(parent?.svg) && (tag === "title" || tag === "desc")),
      head,
      source: parent?.source ?? "",
      nestedList: Boolean(parent?.nestedList) || (a.has(ATTR.list) && Boolean(parent?.template)),
      list: "",
      items: 0,
      context: ["", ""],
    };
    if (tag === "style" && !entry.foreign) this.style = "";
    if (tag === "title" && head) this.title = "";
    // The block's text starts on the line where its start tag ends, which a tag written over lines moves down.
    if (tag === "script" && a.has(ATTR.fixtures)) this.fixtures = { text: "", line, textLine: line + place.raw.split("\n").length - 1, start: place.at };
    if (tag === "meta" && head && a.has("name")) this.facts.document.metas.set((a.get("name") ?? "").toLowerCase(), { content: a.get("content") ?? "", line });
    if (!this.facts.tooDeep && this.stack.entries.length >= READ_LIMITS.depth) {
      // What was read so far is a fragment of the design: the depth is the one thing to fix.
      this.facts.tooDeep = true;
      this.facts.issues.length = 0;
      this.facts.issues.push({
        rule: "read.depth",
        line,
        message: `the design nests elements more than ${READ_LIMITS.depth} levels deep; flatten the markup, as a person reads no screen that deep`,
      });
    }
    if (!this.facts.tooDeep) this.structure(entry, parent);
    if (!VOID.has(tag)) {
      this.stack.push(entry);
      if (entry.interactive && !entry.named) this.controls.push(entry);
    }
  }

  /**
   * An attribute written twice on one element, which every reader of attributes passes: a browser keeps the first
   * value, and a reader that kept another would read a different element than the browser builds.
   */
  private repeated(tag: string, attrs: Attribute[], line: number): void {
    const names = new Set<string>();
    for (const [name] of attrs) {
      if (names.has(name)) {
        this.issue(
          "unsafe.markup",
          line,
          `<${quoted(tag)}> writes the attribute ${quoted(name)} twice: a browser keeps the first and drops the second; write it once`,
        );
        return;
      }
      names.add(name);
    }
  }

  /** `<html>`, `<head>`, and `<body>`: once each. */
  private documentElement(tag: string, attrs: Attribute[], place: TagPlace): void {
    const count = (this.seen.get(tag) ?? 0) + 1;
    this.seen.set(tag, count);
    const document = this.facts.document;
    if (count > 1) {
      this.issue("unsafe.markup", place.line, `a second <${tag}>: a document has one`);
      return;
    }
    if (tag === "html") {
      document.htmlAttributes = attrs;
      document.htmlLine = place.line;
      const lang = attrs.find(([name]) => name === "lang")?.[1];
      this.facts.lang = { value: lang === undefined || lang === null || !strip(lang) ? null : strip(lang), line: place.line };
    }
    if (tag === "body") {
      document.bodyAttributes = attrs;
      document.body = [place.at + place.raw.length, this.text.length];
    }
    for (const [name, value] of attrs) {
      if (name.startsWith(PREFIX)) continue;
      // A frame's root and body take the design's own attributes: one of these would blank every frame.
      if ((tag === "html" || tag === "body") && BLANKS.has(name)) {
        this.issue("read.document", place.line, `<${tag} ${name}> would blank every frame of the design: take it out, and hide a part of the design instead`);
        continue;
      }
      const problem = attributeProblem("div", name, value, "html");
      if (problem) this.issue("unsafe.markup", place.line, problem);
    }
  }

  /** The allow-list, and the forms a browser reads differently from text; `head` says whether the element is in the document's head. */
  private allowed(tag: string, attrs: Attribute[], line: number, parent: Open | undefined, head: boolean): void {
    // An svg title or desc holds text only: it names an icon, and no markup hides in it.
    if (parent?.iconText) this.issue("unsafe.markup", line, `a <${quoted(tag)}> inside an svg title or desc: an icon's name is text only`);
    for (const [name, value] of attrs) {
      if (viewLink(tag, name, value))
        this.issue("structure.view-link", line, `a link with href="${quoted(value ?? "")}": a link to another view is ${ATTR.go}="<screen>/<state>"`);
    }
    const context = parent?.svg ? "svg" : "html";
    const why = elementProblem(tag, attrs, context, { head, parent: parent?.tag ?? "" });
    if (why) this.issue("unsafe.markup", line, why);
    for (const [name, value] of attrs) {
      const problem = attributeProblem(tag, name, value, tag === "svg" ? "svg" : context);
      if (problem) this.issue("unsafe.markup", line, problem);
    }
  }

  /** The prefixed names: each is in the vocabulary, on its element, and never one the tool sets. */
  private vocabulary(tag: string, attrs: Attribute[], line: number): void {
    const hasUse = attrs.some(([name]) => name === ATTR.use);
    for (const [name] of attrs) {
      if (!name.startsWith(PREFIX)) continue;
      const word = name.slice(PREFIX.length);
      if (word.startsWith("arg-")) {
        if (!hasUse) this.issue("structure.vocabulary", line, `${name} names an argument, so it sits on an element with ${ATTR.use}`);
        continue;
      }
      if (TOOL_NAMES.has(word)) {
        this.issue("structure.tool-name", line, `${name} is a name the tool sets inside a frame: a design never writes it; take it out`);
        continue;
      }
      if (!DESIGNER_NAMES.has(word)) {
        const near = nearest(word, [...DESIGNER_NAMES]);
        this.issue(
          "structure.vocabulary",
          line,
          `${name} is no name of the format${near ? `: did you mean ${PREFIX}${near}?` : "."} \`${PROGRAM} guide\` lists every name.`,
        );
        continue;
      }
      const only = ONLY_ON[name];
      if (only && tag !== only) this.issue("structure.vocabulary", line, `${name} is read only on <${only}>: move it there`);
    }
  }

  private structure(entry: Open, parent: Open | undefined): void {
    const { tag, attrs: a, line } = entry;
    const state = a.get(ATTR.state);
    if (state !== undefined) {
      if (parent?.screen) {
        parent.screen.states.push(state);
        parent.screen.stateLines.push(line);
        entry.state = state;
        this.stateName(parent.screen, state, line);
      } else
        this.issue(
          "structure.state-place",
          line,
          `${ATTR.state}="${quoted(state)}" is not a direct child of a screen: a state is a direct child of its <section ${ATTR.screen}>`,
        );
    }
    if (a.has(ATTR.screen) && tag === "section") {
      const id = a.get(ATTR.screen) ?? "";
      if (!SCREEN_ID.test(this.options.qualified ? id.slice(id.indexOf(":") + 1) : id))
        this.issue("structure.name", line, `a screen named ${shown(id)}: use letters, digits, hyphens, and underscores, so a link can name it`);
      else {
        entry.screen = new Screen(id, a.get(ATTR.title) || id, line, a.get(ATTR.parent) ?? null, a.get(ATTR.initial) ?? null, a.get(ATTR.source) ?? "");
        entry.source = entry.screen.source;
        this.facts.screens.push(entry.screen);
      }
    }
    const limit = a.get(ATTR.limit);
    if (limit !== undefined && !/^[1-9][0-9]{0,5}$/.test(limit))
      this.issue("structure.list", line, `${ATTR.limit}="${quoted(limit)}" is no whole number: write how many items the list draws, such as ${ATTR.limit}="3"`);
    if (tag === "template" && a.has(ATTR.item)) {
      if (!parent?.list) this.issue("structure.list", line, `a <template ${ATTR.item}> that is no direct child of a ${ATTR.list}: put it in its list`);
      else parent.items++;
    }
    for (const [key, what] of [
      [ATTR.component, "component"],
      [ATTR.variant, "variant"],
      [ATTR.testid, "test id"],
    ] as const) {
      const value = a.get(key);
      if (value !== undefined && !KEBAB.test(value))
        this.issue("structure.name", line, `a ${what} named ${shown(value)}: use lowercase words joined by hyphens, as code and its stories name it`);
    }
    entry.context = entry.screen ? [entry.screen.id, ""] : !parent ? ["", ""] : parent.screen ? [parent.screen.id, entry.state] : parent.context;
    this.record(entry);
  }

  private stateName(screen: Screen, state: string, line: number): void {
    if (!KEBAB.test(state)) {
      this.issue(
        "structure.name",
        line,
        `screen \`${quoted(screen.id)}\` names a state ${shown(state)}: use lowercase words joined by hyphens, so a deep link can name it`,
      );
      return;
    }
    this.nearCore.push([screen, state, line]);
  }

  /** A state close to a familiar name is a note, unless its screen draws that familiar state too, as online beside offline. */
  private nearCoreNotes(): void {
    for (const [screen, state, line] of this.nearCore) {
      const near = CORE_STATES.filter((core) => state !== core && distance(state, core) <= 2 && !screen.states.includes(core));
      if (near.length)
        this.issue(
          "structure.state-near-core",
          line,
          `screen \`${quoted(screen.id)}\` names a state \`${quoted(state)}\`: did you mean \`${near[0]}\`? A screen's own state is fine`,
        );
    }
  }

  private record(entry: Open): void {
    const { tag, attrs: a, line, at } = entry;
    const [screen, state] = entry.context;
    const facts = this.facts;
    const go = a.get(ATTR.go);
    if (go !== undefined) facts.links.push({ attribute: ATTR.go, value: go, line, screen, at });
    const device = a.get(ATTR.device);
    if (device !== undefined) facts.devices.push([line, device, a.get("style") ?? ""]);
    const testId = strip(a.get(ATTR.testid) ?? "");
    if (testId) facts.testIds.push({ name: testId, line, screen, state, inTemplate: Boolean(entry.template), at });
    const component = a.get(ATTR.component);
    if (component)
      facts.components.push({
        name: component,
        variant: a.get(ATTR.variant) || "default",
        screen,
        state,
        template: entry.template,
        testid: a.get(ATTR.testid) ?? "",
        line,
      });
    const slot = a.get(ATTR.slot);
    if (slot !== undefined) facts.slots.push({ name: slot, line, screen, state });
    const list = a.get(ATTR.list);
    if (list !== undefined) {
      entry.list = `list-${facts.lists.length + 1}`;
      facts.lists.push({ key: list, template: entry.list, screen, state, line });
      if (entry.template)
        this.issue(
          "structure.list",
          line,
          `${ATTR.list}="${quoted(list)}" stands inside another list's item, and the format draws no list inside a list: write the inner entries as text in the item, or move them to a list at the fixtures' top and draw it outside the item`,
          at,
        );
    }
    // A list inside a list's item has its one finding: no key inside it is looked for.
    for (const attribute of entry.nestedList ? [] : [ATTR.text, ATTR.image, ATTR.list, ATTR.field]) {
      const key = a.get(attribute);
      if (key) facts.fixtureUses.push({ attribute, key, line, template: entry.template, source: entry.source });
    }
    const image = a.get(ATTR.image);
    if (image) facts.imageFields.add(image);
    if (state) facts.stateSizes.set(sizeKey(screen, state), (facts.stateSizes.get(sizeKey(screen, state)) ?? 0) + 1);
    if (!entry.leftOut && !entry.foreign && !entry.head) {
      const role = (a.get("role") ?? "").trim().toLowerCase();
      const level =
        HEADING_TAG.exec(tag)?.[1] ??
        (role === "heading" ? (/^[1-9][0-9]?$/.test(strip(a.get("aria-level") ?? "")) ? strip(a.get("aria-level") ?? "") : "2") : "");
      if (level) facts.headings.push({ level: Number(level), line, at, screen, state, dialog: entry.dialog });
      if (tag === "main" || role === "main") facts.mains.push({ line, screen, state });
    }
    const labelFor = a.get("for");
    if (tag === "label" && labelFor) facts.controls.labelTargets.add(labelFor);
    const id = a.get("id") ?? "";
    if (id) {
      const first = this.ids.get(id);
      if (first !== undefined) facts.idRepeats.push([line, id, first[0], entry.at, first[1]]);
      else {
        this.ids.set(id, [line, entry.at]);
        facts.controls.ids.add(id);
      }
    }
    const labelledby = strip(a.get("aria-labelledby") ?? "");
    if (labelledby) facts.controls.labelledby.push({ line, value: labelledby });
    if (entry.svg) {
      for (const attr of ["fill", "stroke"]) {
        const value = strip(a.get(attr) ?? "");
        const lower = value.toLowerCase();
        if (value && !SAFE_PAINT.has(lower) && !lower.startsWith("var(") && !lower.startsWith("url(")) facts.paints.push([line, attr, value]);
      }
    }
    this.control(entry);
  }

  private control(entry: Open): void {
    const { tag, attrs: a, line, at } = entry;
    const controls = this.facts.controls;
    if (tag === "img") controls.images.push({ line, at, alt: a.has("alt"), role: a.get("role") ?? "" });
    entry.interactive = INTERACTIVE.has(tag) && !(tag === "input" && (a.get("type") ?? "").toLowerCase() === "hidden");
    if (
      !entry.hidden &&
      (a.has(ATTR.text) || a.has(ATTR.field) || a.has(ATTR.use) || strip(a.get("alt") ?? "") || BY_REFERENCE.some((key) => strip(a.get(key) ?? "")))
    ) {
      this.nameOpenControls(entry, entry.hiddenAt);
    }
    if (!entry.interactive) return;
    const byAttribute =
      NAMES.some((key) => strip(a.get(key) ?? "")) ||
      (tag === "input" && BUTTON_INPUTS.has((a.get("type") ?? "").toLowerCase()) && Boolean(strip(a.get("value") ?? "")));
    if (tag === "button" || tag === "a") entry.named = entry.named || byAttribute;
    else controls.fields.push({ tag, line, id: a.get("id") ?? "", named: byAttribute || entry.inLabel });
    controls.interactive.push({ tag, line, at, testid: strip(a.get(ATTR.testid) ?? "") });
  }

  /**
   * Mark each open button and link named that text, a runtime fill, or an image with its alt names: those with no
   * element with the hidden attribute between them and it, since a browser names a control by no hidden text. The open
   * controls stand in the order they opened, and an inner one stands under every hidden element an outer one does, so
   * those it names are the innermost, each taken off the list once.
   */
  private nameOpenControls(entry: Open | null, hiddenAt: number): void {
    for (let last = this.controls.at(-1); last && last.hiddenAt === hiddenAt; last = this.controls.at(-1)) {
      last.named = true;
      this.controls.pop();
    }
    if (entry?.interactive) entry.named = true;
  }

  private end(tag: string, place: TagPlace): void {
    this.at = place.at;
    this.line = place.line;
    const document = this.facts.document;
    if (tag === "template") {
      this.templateTags.add(place.at);
      if (!this.stack.has("template"))
        this.issue("unsafe.markup", place.line, "a </template> with no <template> before it: it would end the page's design part");
    }
    if (tag === "style" && this.style !== null) {
      this.facts.styles.push(this.style);
      this.style = null;
      const open = this.stack.innermost("style");
      if (open?.head) document.headStyles.push([open.at, place.at + place.raw.length]);
    }
    if (tag === "title" && this.title !== null) {
      document.title = strip(this.title);
      this.title = null;
    }
    // Every fixtures block, in order: the loader keeps the main file's first, and names each other at its own file.
    if (tag === "script" && this.fixtures) {
      document.fixturesBlocks.push({ ...this.fixtures, end: place.at + place.raw.length });
      this.fixtures = null;
    }
    if (tag === "body" && document.body) document.body = [document.body[0], place.at];
    for (const entry of this.stack.close(tag)) this.close(entry);
  }

  private data(text: string, line: number): void {
    this.line = line;
    this.stack.text(text);
    if (this.style !== null) this.style += text;
    if (this.title !== null) this.title += text;
    if (this.fixtures) this.fixtures.text += text;
    const top = this.stack.top();
    if (!strip(text) || top?.tag === "style" || top?.tag === "script") return;
    if (!this.facts.tooDeep) this.facts.texts.push([line, text, this.at]);
    if (!top?.hidden && !this.facts.tooDeep) this.nameOpenControls(null, top?.hiddenAt ?? 0);
  }

  /**
   * Where a browser builds the elements otherwise than the reader can read them: said, with how to write the markup,
   * so every design the walk reads with no such finding nests as in a browser.
   */
  private nesting({ kind, tag, other }: Fault): void {
    const message = NESTING[kind](tag, other);
    this.issue("structure.nesting", this.line, message);
  }

  private comment(line: number): void {
    const top = this.stack.top();
    if (top?.iconText) this.issue("unsafe.markup", line, "a comment inside an svg title or desc: an icon's name is text only");
  }

  private close(entry: Open): void {
    if (this.controls[this.controls.length - 1] === entry) this.controls.pop();
    if (entry.interactive && (entry.tag === "button" || entry.tag === "a"))
      this.facts.controls.buttons.push({ tag: entry.tag, line: entry.line, at: entry.at, named: entry.named });
    if (entry.list && entry.items !== 1) {
      this.issue(
        "structure.list",
        entry.line,
        `${ATTR.list}="${quoted(entry.attrs.get(ATTR.list) ?? "")}" holds ${entry.items} <template ${ATTR.item}>: a list holds one, as its direct child`,
        entry.at,
      );
    }
  }

  private finish(): void {
    const lineAt = lineFinder(this.text);
    for (const entry of this.stack.entries) {
      if (SWALLOWS.has(entry.tag) && !entry.foreign) this.issue("unsafe.markup", entry.line, `an unclosed <${entry.tag}>: ${UNCLOSED}`, entry.at);
      if (entry.screen)
        this.issue(
          "structure.screen-unclosed",
          entry.line,
          `screen \`${quoted(entry.screen.id)}\` has no </section>: close it, so the next screen is not drawn inside it`,
          entry.at,
        );
    }
    for (const entry of this.stack.closeAll()) this.close(entry);
    const doctype = DOCTYPE.exec(this.text);
    let trick: { index: number; form: string } | null = null;
    for (const found of this.text.matchAll(COMMENT_TRICKS)) {
      if (doctype && found.index < doctype[0].length) continue;
      trick = { index: found.index, form: found[0] };
      break;
    }
    // Inside a comment, `--!>` ends it in a browser, so `--!` is refused there and a comment ends only at `-->`. Each
    // comment is read here as a reader that ends one at the first `-->` reads it, from every `<!--` in the text, in an
    // attribute's value or a style too. Each comment a browser reads stands inside one of these, since the forms that
    // end a comment sooner are refused above, so a `--!` in none of them is text a browser ends nothing by, such as
    // "Wait--!". The next `--!` is kept, and searched for again only past a comment's start, so the text is read once.
    let unclosed = -1;
    let bang = this.text.indexOf("--!");
    for (let start = 0; ; ) {
      const opened = this.text.indexOf("<!--", start);
      if (opened < 0) break;
      const closing = this.text.indexOf("-->", opened + 4);
      if (bang >= 0 && bang < opened) bang = this.text.indexOf("--!", opened);
      if (bang >= opened && (closing < 0 || bang < closing) && (!trick || bang < trick.index))
        trick = { index: bang, form: this.text.startsWith("--!>", bang) ? "--!>" : "--!" };
      if (closing < 0) {
        unclosed = opened;
        break;
      }
      start = closing;
    }
    if (trick)
      this.issue(
        "unsafe.markup",
        lineAt(trick.index),
        `the form \`${quoted(trick.form)}\`: a browser reads it differently; write comments as <!-- ... -->, and <!doctype html> only first`,
      );
    // The same count as `staysInTemplate` in src/page.ts, here as findings at their lines. Both stay: the page's guard
    // holds alone, even if this walk were wrong (section 6 of the technical specification).
    let depth = 0;
    for (const tag of this.text.matchAll(TEMPLATE_TAG)) {
      if (!this.templateTags.has(tag.index)) {
        this.issue(
          "unsafe.markup",
          lineAt(tag.index),
          "a `<template` or `</template` outside a real tag, in a comment or an attribute: write it only as a tag",
        );
        break;
      }
      depth += tag[1] ? -1 : 1;
      if (depth < 0) {
        this.issue("unsafe.markup", lineAt(tag.index), "a </template> with no <template> before it: it would end the page's design part");
        break;
      }
    }
    if (unclosed >= 0) this.issue("unsafe.markup", lineAt(unclosed), `an unclosed comment: ${UNCLOSED}`);
    this.slotRules();
    this.nearCoreNotes();
    const document = this.facts.document;
    if (!document.body) this.issue("read.document", 1, "the design has no <body>: write <body> after the head, and put the screens in it");
  }

  /** The slot names, and each slot where it may stand once. */
  private slotRules(): void {
    const slots = this.facts.slots;
    for (const slot of slots) {
      if (!(SLOTS as readonly string[]).includes(slot.name))
        this.issue("structure.slot", slot.line, `${ATTR.slot}="${quoted(slot.name)}" is no slot: a slot is ${SLOTS.join(", ")}`);
    }
    // What shows at once is the chrome, one screen's own content, and one of its states: among it, one of each slot.
    const where = (slot: Facts["slots"][number]) =>
      !slot.screen
        ? "one outside every screen"
        : !slot.state
          ? `one on screen \`${quoted(slot.screen)}\` outside its states`
          : `one in the state \`${quoted(slot.state)}\` of screen \`${quoted(slot.screen)}\``;
    const told = new Set<string>();
    for (const name of ["title", "back-label"]) {
      const named = slots.filter((slot) => slot.name === name);
      const views = ["\n", ...new Set(named.map((slot) => `${slot.screen}\n${slot.state}`))].map((key) => key.split("\n"));
      // Grouped by screen once, so a view reads only its screen's slots and those outside every screen.
      const order = new Map(named.map((slot, index) => [slot, index]));
      const outside = named.filter((slot) => !slot.screen);
      const byScreen = new Map<string, typeof named>();
      for (const slot of named) {
        if (!slot.screen) continue;
        const list = byScreen.get(slot.screen);
        if (list) list.push(slot);
        else byScreen.set(slot.screen, [slot]);
      }
      for (const [screen = "", state] of views) {
        const found = [...outside, ...(screen ? (byScreen.get(screen) ?? []) : []).filter((slot) => !slot.state || slot.state === state)].sort(
          (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
        );
        const [first, second] = found;
        if (!first || !second || told.has(`${first.line} ${second.line}`)) continue;
        told.add(`${first.line} ${second.line}`);
        this.issue(
          "structure.slot",
          second.line,
          `two ${name} slots show at once: ${where(first)}, and ${where(second)}. Keep one, or move each into its own state, so the screen and any one of its states show one`,
        );
      }
    }
  }
}

/** Walk a design's markup once. */
export function walk(markup: string, options: WalkOptions = {}): Facts {
  return new Walk(markup, options).run();
}

/** The screens and states a design draws, and its test ids, as the ok line counts them. */
export function countsOf(facts: Facts): Counts {
  return {
    screens: facts.screens.length,
    states: facts.screens.reduce((sum, screen) => sum + screen.states.length, 0),
    test_ids: new Set(facts.testIds.map((testId) => testId.name)).size,
  };
}
