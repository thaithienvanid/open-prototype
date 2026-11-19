// The one walk over a design's markup. One pass gives every fact the checks, the manifests, and the page read: the
// document's head and body, the screens with their states in drawn order, links, test ids, components, lists, slots,
// ids, text, and style blocks; the structure problems; and the markup the allow-list refuses. Each is recorded with
// its line in the walked text, and the loader maps that line to its file.
import { SAFE_PAINT } from "../css/colors.ts";
import { type Counts, type RuleId, stopsPage } from "../finding.ts";
import { ATTR, CORE_STATES, KEBAB, PREFIX, PROGRAM, READ_LIMITS, SCREEN_ID, SLOTS, VOCABULARY, VOID, WORD } from "../format.ts";
import { type Attribute, firstValues, OpenElements, readMarkup, type TagPlace } from "../html/tokenizer.ts";
import { distance, lineFinder, nearest, quoted, shown, strip } from "../text.ts";
import { attributeProblem, DOCUMENT, elementProblem, viewLink } from "./allow.ts";
import { type Facts, type Issue, Screen, sizeKey } from "./facts.ts";

type WalkOptions = {
  /** The text is a whole document, with its head and body; else a fragment of a body. */
  document?: boolean;
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
const COMMENT_TRICKS = /--!>|<!--->|<!-->|--!|<!\[|<\?|<!(?!--)/gi;
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
    document: null,
    controls: { images: [], interactive: [], buttons: [], fields: [], labelTargets: new Set(), labelledby: [], ids: new Set() },
    issues: [],
    tooDeep: false,
  };
  private readonly stack = new OpenElements<Open>();
  private readonly controls: Open[] = [];
  /** Where the token being read starts in the walked text, while the walk reads one. */
  private at: number | undefined = undefined;
  private readonly ids = new Map<string, number>();
  private readonly unsafe: Issue[] = [];
  private readonly templateTags = new Set<number>();
  private readonly seen = new Map<string, number>();
  private style: string | null = null;
  private title: string | null = null;
  private fixtures: { text: string; line: number; start: number } | null = null;
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
    this.bodyWritten = Boolean(options.document) && /<body(?![\p{L}\p{N}_-])/iu.test(text);
    if (options.document) {
      this.facts.document = {
        htmlAttributes: [],
        bodyAttributes: [],
        title: "",
        metas: new Map(),
        headStyles: [],
        body: null,
        fixtures: null,
        fixturesBlocks: 0,
      };
    }
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
    const a = firstValues(attrs);
    const line = place.line;
    const parent = this.stack.top();
    if (tag === "template") this.templateTags.add(place.at);
    this.repeated(tag, attrs, line);
    // Before <body>, an element at the top of a document is in its head, as a browser reads it when <head> is left out.
    const top = Boolean(this.options.document) && !this.seen.has("body") && (!parent || parent.tag === "html") && !DOCUMENT.has(tag);
    // With no <body> written, the first element that is not the head's own starts the body, as a browser reads it.
    if (top && !this.bodyWritten && !HEAD_TAGS.has(tag)) this.bodyImplied = true;
    const implied = top && (this.bodyWritten || !this.bodyImplied);
    const head = Boolean(parent?.head) || (tag === "head" && Boolean(this.options.document)) || implied;
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
    if (tag === "script" && a.has(ATTR.fixtures)) this.fixtures = { text: "", line, start: place.at };
    if (tag === "meta" && head && a.has("name")) this.facts.document?.metas.set((a.get("name") ?? "").toLowerCase(), { content: a.get("content") ?? "", line });
    if (!this.facts.tooDeep && this.stack.entries.length >= READ_LIMITS.depth) {
      // What was read so far is a fragment of the design: the depth is the one thing to fix.
      this.facts.tooDeep = true;
      this.facts.issues.length = 0;
      this.facts.issues.push({
        rule: "integrity.depth",
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

  /** `<html>`, `<head>`, and `<body>`: once each, and only in a whole document. */
  private documentElement(tag: string, attrs: Attribute[], place: TagPlace): void {
    const count = (this.seen.get(tag) ?? 0) + 1;
    this.seen.set(tag, count);
    const document = this.facts.document;
    if (!document) {
      this.issue("unsafe.markup", place.line, `a <${tag}> in a part of a design: a flow or a part is a fragment of a body`);
      return;
    }
    if (count > 1) {
      this.issue("unsafe.markup", place.line, `a second <${tag}>: a document has one`);
      return;
    }
    if (tag === "html") {
      document.htmlAttributes = attrs;
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
    const why = elementProblem(tag, attrs, context, { head, parent: parent?.tag ?? (this.options.document ? "" : "body") });
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
        this.issue("read.tool-name", line, `${name} is a name the tool sets inside a frame: a design never writes it; take it out`);
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
        this.issue("structure.screen-id", line, `a screen named ${shown(id)}: use letters, digits, hyphens, and underscores, so a link can name it`);
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
        "structure.state-name",
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
          "structure.list-nested",
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
    if (id && !id.includes("{{")) {
      const first = this.ids.get(id);
      if (first !== undefined) facts.idRepeats.push([line, id, first, entry.at]);
      else {
        this.ids.set(id, line);
        facts.controls.ids.add(id);
      }
    }
    const labelledby = strip(a.get("aria-labelledby") ?? "");
    if (labelledby) facts.controls.labelledby.push({ line, value: labelledby });
    if (entry.svg) {
      for (const attr of ["fill", "stroke"]) {
        const value = strip(a.get(attr) ?? "");
        const lower = value.toLowerCase();
        if (value && !SAFE_PAINT.has(lower) && !lower.startsWith("var(") && !lower.startsWith("url(") && !value.includes("{{"))
          facts.paints.push([line, attr, value]);
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
      this.nameOpenControls(entry);
    }
    if (!entry.interactive) return;
    const byAttribute =
      NAMES.some((key) => strip(a.get(key) ?? "")) ||
      (tag === "input" && BUTTON_INPUTS.has((a.get("type") ?? "").toLowerCase()) && Boolean(strip(a.get("value") ?? "")));
    if (tag === "button" || tag === "a") entry.named = entry.named || byAttribute;
    else controls.fields.push({ tag, line, id: a.get("id") ?? "", named: byAttribute || entry.inLabel });
    controls.interactive.push({ tag, line, at, testid: strip(a.get(ATTR.testid) ?? "") });
  }

  /** Mark every open button and link named: text, a runtime fill, or an image with its alt sits inside it. */
  private nameOpenControls(entry: Open | null): void {
    for (const control of this.controls) control.named = true;
    this.controls.length = 0;
    if (entry?.interactive) entry.named = true;
  }

  private end(tag: string, place: TagPlace): void {
    this.at = place.at;
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
      if (document && open?.head) document.headStyles.push([open.at, place.at + place.raw.length]);
    }
    if (tag === "title" && this.title !== null && document) {
      document.title = strip(this.title);
      this.title = null;
    }
    if (tag === "script" && this.fixtures && document) {
      document.fixturesBlocks++;
      if (!document.fixtures) document.fixtures = { ...this.fixtures, end: place.at + place.raw.length };
      this.fixtures = null;
    } else if (tag === "script" && this.fixtures) {
      this.issue("read.fixtures", this.fixtures.line, "a fixtures block in a flow or a block: a design keeps its one fixtures block in its main HTML file");
      this.fixtures = null;
    }
    if (tag === "body" && document?.body) document.body = [document.body[0], place.at];
    for (const entry of this.stack.close(tag)) this.close(entry);
  }

  private data(text: string, line: number): void {
    if (this.style !== null) this.style += text;
    if (this.title !== null) this.title += text;
    if (this.fixtures) this.fixtures.text += text;
    const top = this.stack.top();
    if (!strip(text) || top?.tag === "style" || top?.tag === "script") return;
    if (!this.facts.tooDeep) this.facts.texts.push([line, text, this.at]);
    if (!top?.hidden && !this.facts.tooDeep) this.nameOpenControls(null);
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
    const doctype = this.options.document ? DOCTYPE.exec(this.text) : null;
    for (const trick of this.text.matchAll(COMMENT_TRICKS)) {
      if (doctype && trick.index < doctype[0].length) continue;
      this.issue(
        "unsafe.markup",
        lineAt(trick.index),
        `the form \`${quoted(trick[0])}\`: a browser reads it differently; write comments as <!-- ... -->, and <!doctype html> only first`,
      );
      break;
    }
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
    for (let start = 0; ; ) {
      const opened = this.text.indexOf("<!--", start);
      if (opened < 0) break;
      start = this.text.indexOf("-->", opened + 4);
      if (start < 0) {
        this.issue("unsafe.markup", lineAt(opened), `an unclosed comment: ${UNCLOSED}`);
        break;
      }
    }
    this.slotRules();
    this.nearCoreNotes();
    const document = this.facts.document;
    if (document && !document.body) this.issue("read.document", 1, "the design has no <body>: write <body> after the head, and put the screens in it");
    if (document && document.fixturesBlocks > 1) this.issue("read.fixtures", 1, `the design holds ${document.fixturesBlocks} fixtures blocks: keep one`);
  }

  /** The slot names, and each slot where it may stand once. */
  private slotRules(): void {
    const slots = this.facts.slots;
    for (const slot of slots) {
      if (!(SLOTS as readonly string[]).includes(slot.name))
        this.issue("read.slot", slot.line, `${ATTR.slot}="${quoted(slot.name)}" is no slot: a slot is ${SLOTS.join(", ")}`);
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
          "read.slot",
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
