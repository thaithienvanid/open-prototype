// The viewer's layers, held by a test: a pure module reads only its arguments, a page module touches the page, and main
// wires them. Each file of viewer/ is in one row of the table, and an import may only point down it. Every text a person
// reads lives in words.ts, and every name the viewer reads from or writes into a design lives in names.ts, which takes each
// from the format's one table in the tool (src/format.ts), and each other fact of the page contract from src/contract.ts,
// and is the one module that may import either.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import { ATTR, PREFIX, VOCABULARY } from "../../src/format.ts";
import { PAGE, READ, SET } from "../../viewer/names.ts";
import { field, isReference, list, type Node, namedModules, nodes, parsed, parsedOne, type SourceFile, SyntaxKind, textOf } from "../source.ts";

const VIEWER = resolve(import.meta.dir, "../../viewer");
type Kind = "pure" | "page" | "main";
/**
 * Every module of the viewer, and its kind. A new file must be added here, in the row that is true for it; a view is a
 * page module by its folder, so a new view is its own file and its row in the table of views alone.
 */
const MODULES: Record<string, Kind> = {
  "comments.ts": "pure",
  "fill.ts": "pure",
  "geometry.ts": "pure",
  "keys.ts": "pure",
  "link.ts": "pure",
  "names.ts": "pure",
  "rounds.ts": "pure",
  "seen.ts": "pure",
  "tokens.ts": "pure",
  "words.ts": "pure",
  "context.ts": "page",
  "design.ts": "page",
  "dom.ts": "page",
  "frame.ts": "page",
  "plumbing.ts": "page",
  "store.ts": "page",
  "panels/bars.ts": "page",
  "panels/comments.ts": "page",
  "panels/earlier-rounds.ts": "page",
  "panels/inspector.ts": "page",
  "panels/pins.ts": "page",
  "panels/rail.ts": "page",
  ...Object.fromEntries(
    readdirSync(join(VIEWER, "views"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => [`views/${file}`, "page" as const]),
  ),
  "main.ts": "main",
};
/**
 * The files outside viewer/ a module may import, and the one module that may import them: the format's table of names,
 * and the other facts of the page contract.
 */
const TOOL = ["../src/contract.ts", "../src/format.ts"];
const TOOL_READER = "names.ts";
/**
 * What a pure module never names: the page, the window and what hangs on it (by name or through `globalThis`), the
 * browser's storage, the network, the clock, the runtime, or an element's type.
 */
const PAGE_NAMES =
  /\b(document|window|globalThis|self|location|history|localStorage|sessionStorage|navigator|fetch|XMLHttpRequest|WebSocket|matchMedia|getComputedStyle|requestAnimationFrame|setTimeout|setInterval|Date|performance|Bun|process|HTML\w*Element|SVG\w*Element|Element|Document|DocumentFragment|Node|Event)\b/;

function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(folder, entry.name)) : entry.name.endsWith(".ts") ? [relative(VIEWER, join(folder, entry.name)).split(sep).join("/")] : [],
  );
}
/** Every module of the viewer, parsed once by the TypeScript compiler (`tests/source.ts`). */
const SOURCES = await parsed(Object.fromEntries(files(VIEWER).map((file) => [file, readFileSync(join(VIEWER, file), "utf8")])));
const sourceOf = (file: string): SourceFile => {
  const found = SOURCES.get(file);
  if (!found) throw new Error(`${file} was not parsed`);
  return found;
};

/**
 * What a module imports, by its path in the table: every import and export from a module, an import for its effect, and
 * every import(...), as the compiler reads them, with or without an extension. A path that names no file of the table,
 * such as one with no extension or a module of the runtime, stays as written, so no row holds it; so does an import(...)
 * of anything but one literal, which no test can follow.
 */
const specifiersOf = (file: SourceFile): string[] => {
  const named = namedModules(file);
  return typeof named === "string" ? [named] : named.map((item) => item.spec);
};
const imports = (file: string): string[] => specifiersOf(sourceOf(file)).map((path) => (/^\.\.?\//.test(path) ? posix.join(posix.dirname(file), path) : path));

/** The identifiers of the page a module names, by name, in its code: never a word in a comment, a string, or after a dot. */
const pageNames = (file: SourceFile): string[] =>
  nodes(file)
    .filter(({ node, parent }) => isReference(node, parent) && PAGE_NAMES.test(textOf(node)))
    .map(({ node }) => textOf(node));

/** The kinds of node whose body runs only when it is called, never when the module loads. */
const DEFERRED = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.Constructor,
]);
const TYPES = new Set([SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration]);
/** Each name of the page a module reads when it loads: outside every function, so the module's load runs it. */
function pageAtLoad(file: SourceFile): string[] {
  const found: string[] = [];
  const visit = (parent: Node) => (node: Node) => {
    // A function's body runs when it is called; a type is erased, so it runs never.
    if (DEFERRED.has(node.kind) || TYPES.has(node.kind) || (node.kind >= SyntaxKind.FirstTypeNode && node.kind <= SyntaxKind.LastTypeNode)) return;
    if (isReference(node, parent) && PAGE_NAMES.test(textOf(node))) found.push(textOf(node));
    node.forEachChild(visit(node));
  };
  file.forEachChild(visit(file));
  return found;
}
/**
 * What a page module may read of the page when it loads, in its order. design.ts reads the design the tool wrote into
 * the page; dom.ts takes the two element types its finder checks against and the two media queries the bars follow; and
 * the Screens panel takes the media query of the system's theme. No module writes the page when it loads, so the order
 * the bundle runs them in cannot change what each reads. main.ts wires the page, so it is not held.
 */
const AT_LOAD: Record<string, string[]> = {
  "design.ts": ["document", "document", "HTMLTemplateElement", "document", "document", "HTMLTemplateElement"],
  "dom.ts": ["HTMLElement", "HTMLButtonElement", "window", "window"],
  "panels/rail.ts": ["window"],
};

/** The calls whose first argument is a selector or an id, which no person reads. */
const SELECTOR_CALLS = new Set(["querySelector", "querySelectorAll", "closest", "matches", "getElementById", "every", "one"]);
const calleeName = (call: Node): string => {
  const callee = field(call, "expression");
  return callee?.kind === SyntaxKind.Identifier ? textOf(callee) : textOf(callee ? field(callee, "name") : undefined);
};
const isText = (node: Node): boolean =>
  node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral || node.kind === SyntaxKind.TemplateExpression;

/**
 * Each text a module writes, as the language reads it. A template reads as its pieces joined by `between` where each
 * ${...} stands, and texts joined by + read as one. The modules it imports are left out; for the words a person reads,
 * so are a selector or an id a call takes first, and a class list, the value of a `class` or `className`.
 */
function texts(file: SourceFile, between: string, read: "words" | "names"): string[] {
  const all = nodes(file);
  const skipped = new Set<Node>();
  const skip = (root: Node | undefined) => {
    if (!root) return;
    skipped.add(root);
    for (const { node } of nodes(root)) skipped.add(node);
  };
  for (const { node } of all) {
    if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) skip(field(node, "moduleSpecifier"));
    if (read === "names") continue;
    if (node.kind === SyntaxKind.CallExpression && SELECTOR_CALLS.has(calleeName(node))) skip(list(node, "arguments")[0]);
    if (node.kind === SyntaxKind.PropertyAssignment && ["class", "className"].includes(textOf(field(node, "name")))) skip(field(node, "initializer"));
    if (
      node.kind === SyntaxKind.BinaryExpression &&
      field(node, "operatorToken")?.kind === SyntaxKind.EqualsToken &&
      ["class", "className"].includes(textOf(field(field(node, "left") ?? node, "name")))
    )
      skip(field(node, "right"));
  }
  const textOfPiece = (node: Node): string =>
    node.kind === SyntaxKind.TemplateExpression
      ? [textOf(field(node, "head")), ...list(node, "templateSpans").map((span) => textOf(field(span, "literal")))].join(between)
      : textOf(node);
  const out: string[] = [];
  for (const { node, parent } of all) {
    if (skipped.has(node)) continue;
    // A chain of + is read once, at its top: its texts side by side join into one.
    const plus = (item: Node) => item.kind === SyntaxKind.BinaryExpression && field(item, "operatorToken")?.kind === SyntaxKind.PlusToken;
    if (plus(node) && !plus(parent)) {
      const operands: Node[] = [];
      const flatten = (item: Node) => {
        if (plus(item)) {
          flatten(field(item, "left") ?? item);
          flatten(field(item, "right") ?? item);
        } else operands.push(item);
      };
      flatten(node);
      let run: string[] = [];
      for (const operand of [...operands, null]) {
        if (operand && isText(operand) && !skipped.has(operand)) run.push(textOfPiece(operand));
        else {
          if (run.length) out.push(run.join(""));
          run = [];
        }
        if (operand) skipped.add(operand);
      }
      continue;
    }
    if (isText(node) && !plus(parent)) {
      out.push(textOfPiece(node));
      // A template's own pieces are read with it.
      for (const { node: inner } of nodes(node)) if (inner.kind !== SyntaxKind.TemplateExpression) skipped.add(inner);
    }
  }
  return out;
}

/** The names of keys, which a key handler compares and no person reads. */
const KEY_NAMES = new Set(["Escape", "Enter", "Home", "End", "Tab"]);
/**
 * The texts a module holds that a person would read: a literal of two words or more, or one capitalised word. Selectors,
 * class lists and the frame's style rules are left out.
 */
function sentences(file: SourceFile): string[] {
  return texts(file, " ", "words").filter(
    (literal) => !literal.includes("{") && (/(?<!\w)[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(literal) || (/^[A-Z][a-z]+$/.test(literal) && !KEY_NAMES.has(literal))),
  );
}

/** A name of a design as a page module would write it: each form that reads or sets it. */
const camel = (attribute: string): string => attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
function designNames(file: SourceFile): string[] {
  // A name built in pieces reads as one: "data-" + "proto-" is "data-proto-", and a template's text is joined around its ${...} parts.
  const strings = texts(file, "", "names");
  const datasets = nodes(file).flatMap(({ node }) => {
    const owner = field(node, "expression");
    if (!owner || textOf(owner.kind === SyntaxKind.PropertyAccessExpression ? field(owner, "name") : owner) !== "dataset") return [];
    if (node.kind === SyntaxKind.PropertyAccessExpression) return [textOf(field(node, "name"))];
    if (node.kind === SyntaxKind.ElementAccessExpression) return [textOf(field(node, "argumentExpression"))];
    return [];
  });
  const calls = nodes(file)
    .filter(({ node }) => node.kind === SyntaxKind.CallExpression)
    .map(({ node }) => node);
  const found: string[] = [];
  // data-testid is left out: it is the web's own convention, which the viewer's own controls carry too, and it stays the
  // same in every format of a design.
  const attributes = [...Object.values(READ), ...Object.values(SET)].filter((name) => name.startsWith("data-") && name !== READ.testid);
  for (const name of attributes) {
    if (strings.some((one) => new RegExp(`${name}(?![\\w-])`).test(one))) found.push(name);
    if (datasets.includes(camel(name))) found.push(`dataset.${camel(name)}`);
  }
  for (const name of [SET.safeTop, SET.safeBottom]) if (strings.some((one) => one.includes(name))) found.push(name);
  if (strings.some((one) => one.includes(PREFIX))) found.push(PREFIX);
  for (const name of Object.values(PAGE)) {
    const byId = calls.some((call) => calleeName(call) === "getElementById" && textOf(list(call, "arguments")[0]) === name);
    if (strings.some((one) => new RegExp(`#${name}(?![\\w-])`).test(one)) || byId) found.push(`#${name}`);
  }
  if (strings.some((one) => one.includes("section["))) found.push("section[");
  if (calls.some((call) => list(call, "arguments").length === 1 && isText(list(call, "arguments")[0] as Node) && textOf(list(call, "arguments")[0]) === "main"))
    found.push("main");
  return found;
}

/** A name as written text: a literal, texts joined by +, or either in brackets; anything else is no name a test can read. */
function writtenName(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral) return textOf(node);
  if (node.kind === SyntaxKind.ParenthesizedExpression) return writtenName(field(node, "expression"));
  if (node.kind === SyntaxKind.BinaryExpression && field(node, "operatorToken")?.kind === SyntaxKind.PlusToken) {
    const [left, right] = [writtenName(field(node, "left")), writtenName(field(node, "right"))];
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}
/** The name a node gives a property: after a dot, in brackets as a text, or as a key of an object. */
function propertyName(node: Node, parent: Node): string | undefined {
  if (node.kind === SyntaxKind.PropertyAccessExpression) return textOf(field(node, "name"));
  if (node.kind === SyntaxKind.ElementAccessExpression) return writtenName(field(node, "argumentExpression"));
  if (
    (node.kind === SyntaxKind.PropertyAssignment || node.kind === SyntaxKind.ShorthandPropertyAssignment) &&
    parent.kind === SyntaxKind.ObjectLiteralExpression
  ) {
    const name = field(node, "name");
    return name?.kind === SyntaxKind.ComputedPropertyName ? writtenName(field(name, "expression")) : textOf(name);
  }
  return undefined;
}
const isAssigned = (node: Node, parent: Node): boolean => {
  const operator = field(parent, "operatorToken")?.kind;
  return (
    parent.kind === SyntaxKind.BinaryExpression &&
    field(parent, "left") === node &&
    operator !== undefined &&
    operator >= SyntaxKind.FirstAssignment &&
    operator <= SyntaxKind.LastAssignment
  );
};
const isEmptyText = (node: Node | undefined): boolean => writtenName(node) === "";

/** What parses a text as markup whenever it is named: a call, a constructor, or a method read to be called later. */
const PARSERS = new Set(["insertAdjacentHTML", "createContextualFragment", "DOMParser", "parseHTMLUnsafe", "setHTMLUnsafe"]);
/** What parses a text as markup when it is set: reading it is a read, and reading `template.innerHTML` is how design.ts hashes the design. */
const SET_AS_MARKUP = new Set(["innerHTML", "outerHTML"]);
/** A receiver that names a document, whose write and writeln parse their text as markup; `ctx.write` is the viewer's own. */
const DOCUMENT = /doc/i;

/**
 * Each place a module writes markup, by the language's reading: a parser named in any form, `innerHTML` or `outerHTML`
 * set as a property, in brackets, as a key of an object (so through `Object.assign` or `el`'s props), or as the text a
 * call such as `Reflect.set` takes; a document's `write` or `writeln`; and `srcdoc` set to anything but an empty text,
 * in any of those forms or by `setAttribute`.
 */
function markupSinks(file: SourceFile): string[] {
  const found: string[] = [];
  for (const { node, parent } of nodes(file)) {
    if (node.kind === SyntaxKind.Identifier && isReference(node, parent) && PARSERS.has(textOf(node))) found.push(textOf(node));
    if (node.kind === SyntaxKind.CallExpression) {
      const args = list(node, "arguments");
      const callee = calleeName(node) || (writtenName(field(field(node, "expression") ?? node, "argumentExpression")) ?? "");
      args.forEach((argument, at) => {
        const named = writtenName(argument);
        if (named !== undefined && (PARSERS.has(named) || SET_AS_MARKUP.has(named))) found.push(`${callee}("${named}")`);
        if (named === "srcdoc" && !isEmptyText(args[at + 1])) found.push(`${callee}("srcdoc")`);
      });
      if (callee === "write" || callee === "writeln") {
        const receiver = field(field(node, "expression") ?? node, "expression");
        if (receiver && DOCUMENT.test(receiver.getText(file))) found.push(`${receiver.getText(file)}.${callee}`);
      }
    }
    const name = propertyName(node, parent);
    if (name === undefined) continue;
    const isKey = node.kind === SyntaxKind.PropertyAssignment || node.kind === SyntaxKind.ShorthandPropertyAssignment;
    if (PARSERS.has(name)) found.push(name);
    if (SET_AS_MARKUP.has(name) && (isKey || isAssigned(node, parent))) found.push(name);
    if (name === "srcdoc") {
      // A key's value, or the value set; a read of the property is neither.
      const value = isKey ? field(node, "initializer") : isAssigned(node, parent) ? field(parent, "right") : null;
      if (value === undefined || (value !== null && !isEmptyText(value))) found.push(name);
    }
  }
  return found;
}

/** The element names that open a document of their own inside the viewer. */
const FRAMES = new Set(["iframe", "frame", "object", "embed", "fencedframe", "portal"]);
/** The one sandbox a frame of the viewer carries: the frame's own document, and no script, form, popup, or navigation. */
const SANDBOX = "allow-same-origin";
/** The calls that make an element, and the argument that names it. */
const MAKERS = new Map([
  ["el", 0],
  ["createElement", 0],
  ["createElementNS", 1],
]);
/** Where an element is made from a name the caller gives: the one helper, `el`, and `svgEl`, whose elements are SVG's. */
const GENERIC_MAKERS = new Set(["dom.ts"]);

/** The names an element's name can be: a written name, or either side of a choice between two. */
function tagNames(node: Node | undefined): string[] | undefined {
  if (node?.kind === SyntaxKind.ConditionalExpression) {
    const [yes, no] = [tagNames(field(node, "whenTrue")), tagNames(field(node, "whenFalse"))];
    return yes && no ? [...yes, ...no] : undefined;
  }
  const name = writtenName(node);
  return name === undefined ? undefined : [name];
}

/**
 * Each place a module makes a frame other than through `el("iframe", { ..., sandbox: "allow-same-origin" })` with that
 * key written once, as a text; each element made from a name no test can read, outside dom.ts; and each other place that
 * names `sandbox`, which could change a frame's sandbox once it is made.
 */
function looseFrames(file: SourceFile, module: string): string[] {
  const found: string[] = [];
  const allowedKeys = new Set<Node>();
  for (const { node } of nodes(file)) {
    if (node.kind !== SyntaxKind.CallExpression) continue;
    const maker = calleeName(node);
    const at = MAKERS.get(maker);
    if (at === undefined) continue;
    const args = list(node, "arguments");
    const tags = tagNames(args[at]);
    if (tags === undefined) {
      if (!GENERIC_MAKERS.has(module)) found.push(`${maker}(${args[at]?.getText(file) ?? ""})`);
      continue;
    }
    const tag = tags.find((name) => FRAMES.has(name.toLowerCase()));
    if (tag === undefined) continue;
    const props = args[1];
    const keys = props?.kind === SyntaxKind.ObjectLiteralExpression ? list(props, "properties") : [];
    const sandboxes = keys.filter((key) => key.kind === SyntaxKind.PropertyAssignment && propertyName(key, props as Node) === "sandbox");
    const spread = keys.some((key) => key.kind === SyntaxKind.SpreadAssignment);
    const [only] = sandboxes;
    if (maker === "el" && tag === "iframe" && !spread && sandboxes.length === 1 && only && writtenName(field(only, "initializer")) === SANDBOX)
      allowedKeys.add(only);
    else found.push(`${maker}("${tag}")`);
  }
  for (const { node, parent } of nodes(file)) {
    if (allowedKeys.has(node)) continue;
    const name =
      node.kind === SyntaxKind.Identifier ? (isReference(node, parent) ? textOf(node) : undefined) : (propertyName(node, parent) ?? writtenName(node));
    if (name?.toLowerCase() === "sandbox" && !(node.kind === SyntaxKind.Identifier && parent.kind === SyntaxKind.PropertyAssignment)) found.push("sandbox");
  }
  return found;
}

describe("the viewer's layers", () => {
  test("the markup holds no tab, panel or button of a view: the table of views builds each, from the view's row", () => {
    const markup = readFileSync(join(VIEWER, "viewer.html"), "utf8");
    expect(markup.match(/role="tab"[^>]*data-tab=|data-tab="[^"]*"[^>]*role="tab"/g)).toBeNull();
    const names = [...readFileSync(join(VIEWER, "views/table.ts"), "utf8").matchAll(/\bname: "([a-z-]+)",\s*label:/g)].map((found) => found[1]);
    expect(names).toEqual(["prototype", "board", "system", "compare"]);
    expect(names.filter((name) => markup.includes(`id="panel-${name}"`) || markup.includes(`id="${name}"`))).toEqual([]);
  });
  test("every file of viewer/ is in the table, and the table names no missing file", () => {
    expect(files(VIEWER).sort()).toEqual(Object.keys(MODULES).sort());
  });
  const of = (kind: Kind) => Object.keys(MODULES).filter((file) => MODULES[file] === kind);
  test.each(of("pure"))("%s is pure: it imports only pure modules, and names nothing of the page", (file) => {
    expect(imports(file).filter((imported) => MODULES[imported] !== "pure" && !(file === TOOL_READER && TOOL.includes(imported)))).toEqual([]);
    expect(pageNames(sourceOf(file))).toEqual([]);
  });
  test.each(of("page"))("%s reads nothing of the page when it loads, but what its row of AT_LOAD names", (file) => {
    expect(pageAtLoad(sourceOf(file))).toEqual(AT_LOAD[file] ?? []);
  });
  test("the check of what loads finds a name of the page outside a function, and none inside one", async () => {
    expect(pageAtLoad(await parsedOne("const a = document.body; const b = () => window.x; function c() { return localStorage; }"))).toEqual(["document"]);
    expect(pageAtLoad(await parsedOne("class A { m() { return document; } } const d = { get e() { return location; } };"))).toEqual([]);
  });
  test.each([...of("page"), ...of("main")])("%s imports only modules of the table, and a page module never imports main", (file) => {
    expect(imports(file).filter((imported) => !(imported in MODULES) || (MODULES[file] === "page" && MODULES[imported] === "main"))).toEqual([]);
  });
  test.each(Object.keys(MODULES).filter((file) => file !== "words.ts"))("%s holds no text a person reads: the words live in words.ts", (file) => {
    expect(sentences(sourceOf(file))).toEqual([]);
  });
  test.each(Object.keys(MODULES).filter((file) => file !== "names.ts"))("%s holds no name of a design: the names live in names.ts", (file) => {
    expect(designNames(sourceOf(file))).toEqual([]);
  });
  test("the check of names finds a design's name in each form a module could write it", async () => {
    const probe =
      'a.dataset.protoScreen; b.getAttribute("data-proto-go"); f.querySelector("section[x]"); g.closest("main"); h.style.setProperty("--safe-area-inset-top", "0"); i.getElementById("fixtures"); j.getAttribute("data-" + "proto-" + "x"); k.dataset["protoTitle"]';
    expect(designNames(await parsedOne(probe))).toEqual([
      "dataset.protoScreen",
      "dataset.protoTitle",
      "data-proto-go",
      "--safe-area-inset-top",
      "data-proto-",
      "#fixtures",
      "section[",
      "main",
    ]);
    expect(designNames(await parsedOne('x.dataset.themePick; y.dataset.pvScreen; "data-pv-platform"; "data-theme-pick"; // "data-proto-go"'))).toEqual([]);
  });
  test("names.ts takes every name it reads or sets from the format's own table, and is the one module that imports the tool", () => {
    const owned = new Set<string>([...Object.values(ATTR), ...VOCABULARY.set_by_the_tool.map((name) => PREFIX + name)]);
    expect([...Object.values(READ), ...Object.values(SET)].filter((name) => name.startsWith("data-") && !owned.has(name))).toEqual([]);
    expect([...new Set(imports("names.ts"))].sort()).toEqual(TOOL);
    expect(
      of("pure")
        .concat(of("page"), of("main"))
        .filter((file) => file !== TOOL_READER && imports(file).some((imported) => imported.startsWith("../"))),
    ).toEqual([]);
  });
  test("the check of words finds a sentence and a label, over lines too, and leaves out key names, class lists, selectors, and comments", async () => {
    expect(
      sentences(
        await parsedOne(
          'say("Next state you haven\'t seen"); b.text = "Show"; if (key === "Escape") {} el("p", { class: "pv-hint pv-wide" }); one(".pv-top [role=tablist]", E); svgEl("svg", { class: on ? "icon pv-st" : "icon" }); // "A comment here"',
        ),
      ),
    ).toEqual(["Next state you haven't seen", "Show"]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is a sample of source code that holds a template literal.
    expect(sentences(await parsedOne("say(`Opened ${title} just now`); b.text = 'Close it'; c.text =\n  'Over ' +\n  'two lines';"))).toEqual([
      "Opened   just now",
      "Close it",
      "Over two lines",
    ]);
  });
  test("the check of names finds a name built in pieces or in a template", async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is a sample of source code that holds a template literal.
    const probe = 'a.getAttribute("data-" + "proto-" + "go"); b.closest(`[data-${x}proto-y]`)';
    expect(designNames(await parsedOne(probe)).filter((name) => name.startsWith("data-proto-"))).toEqual(["data-proto-go", "data-proto-"]);
  });
  test("the check of imports reads every form: over lines, a re-export, an effect, a dynamic import, and a path with no extension", async () => {
    const probe =
      'import {\n  a,\n  b,\n} from "./words.ts";\nexport { c } from "./dom.ts";\nimport "./store.ts";\nconst d = await import("./frame.ts");\nimport f from "./link";\nimport g from "node:fs";\nconst h = "words from " + x;\n// import "./main.ts";';
    expect(specifiersOf(await parsedOne(probe))).toEqual(["./words.ts", "./dom.ts", "./store.ts", "./frame.ts", "./link", "node:fs"]);
    // An import(...) of anything but one literal is no path of the table, so a module that holds one fails its row.
    expect(specifiersOf(await parsedOne("const e = await import(name);"))).toEqual(["a dynamic import of name: name the module as written text"]);
  });

  test.each(Object.keys(MODULES))("%s writes no markup: every value reaches the page as text", (file) => {
    expect(markupSinks(sourceOf(file))).toEqual([]);
  });
  test("the check of markup finds each way to write it, and leaves a read, an empty srcdoc, and the viewer's own write alone", async () => {
    for (const probe of [
      "a.innerHTML = x;",
      "a.outerHTML += x;",
      'a["inner" + "HTML"] = x;',
      "Object.assign(a, { innerHTML: x });",
      'el("div", { outerHTML: x });',
      'Reflect.set(a, "innerHTML", x);',
      'a.insertAdjacentHTML("beforeend", x);',
      'const put = a["insertAdjacentHTML"];',
      "new DOMParser().parseFromString(x, t);",
      "const p = globalThis.DOMParser;",
      "range.createContextualFragment(x);",
      "document.write(x);",
      "frame.contentDocument.writeln(x);",
      'doc["write"](x);',
      "a.setHTMLUnsafe(x);",
      "Document.parseHTMLUnsafe(x);",
      "frame.srcdoc = x;",
      'frame["srcdoc"] = "<p>";',
      'frame.setAttribute("srcdoc", x);',
      'el("iframe", { srcdoc: x, sandbox: "allow-same-origin" });',
      "Object.assign(frame, { srcdoc });",
    ])
      expect([probe, markupSinks(await parsedOne(probe)).length > 0]).toEqual([probe, true]);
    const allowed =
      'const t = template.innerHTML; const o = a.outerHTML; frame.srcdoc = ""; frame.setAttribute("srcdoc", ""); ctx.write(false); a.textContent = x; // a.innerHTML = x';
    expect(markupSinks(await parsedOne(allowed))).toEqual([]);
  });
  test.each(Object.keys(MODULES))("%s makes a frame only with exactly the one sandbox, and changes no sandbox", (file) => {
    expect(looseFrames(sourceOf(file), file)).toEqual([]);
  });
  test("the viewer's markup holds no frame of its own: each is made by a module, where its sandbox is held", () => {
    expect(readFileSync(join(VIEWER, "viewer.html"), "utf8").match(/<(iframe|frame|object|embed|fencedframe|portal)\b/gi)).toBeNull();
  });
  test("the check of frames finds a frame with no sandbox, another sandbox, or one changed after, and passes the one form", async () => {
    for (const probe of [
      'el("iframe", { title: "x" });',
      'el("iframe", { sandbox: "allow-same-origin allow-scripts" });',
      'el("iframe", { sandbox: "" });',
      'el("iframe", { sandbox: s });',
      'el("iframe", { ...props, sandbox: "allow-same-origin" });',
      'el("iframe", { sandbox: "allow-same-origin", sandbox: "allow-scripts" });',
      'el("IFRAME", { sandbox: "allow-same-origin" });',
      'document.createElement("iframe");',
      'doc.createElementNS(HTML, "iframe");',
      'el("object", { data: x });',
      'el("embed", { src: x });',
      "document.createElement(tag);",
      'frame.removeAttribute("sandbox");',
      'frame.setAttribute("sandbox", "allow-scripts");',
      'frame.sandbox.add("allow-scripts");',
      'frame["sand" + "box"] = "";',
    ])
      expect([probe, looseFrames(await parsedOne(probe), "probe.ts").length > 0]).toEqual([probe, true]);
    const allowed =
      'const f = el("iframe", { title: t, tabindex: "-1", sandbox: "allow-same-origin" }); el("div", { class: "x" }); document.createElement("div");';
    expect(looseFrames(await parsedOne(allowed), "probe.ts")).toEqual([]);
  });

  test("a pure module may not reach the page through globalThis, nor the clock, the network or the runtime, nor name an element's type", async () => {
    for (const probe of [
      "globalThis.location.hash",
      "const at = Date.now()",
      "fetch(url)",
      "Bun.write(path, text)",
      "process.env.X",
      "self.history.back()",
      "const el = (x: unknown) => x as HTMLElement;",
      "const w =\n  window\n    .innerWidth;",
    ])
      expect([probe, pageNames(await parsedOne(probe)).length]).toEqual([probe, 1]);
    expect(pageNames(await parsedOne('const a = row.document; const b = "window"; // Date.now()'))).toEqual([]);
  });
});
