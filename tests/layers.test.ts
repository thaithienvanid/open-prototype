// The layers, held by a test. Each module has one row; a file imports only from rows above it, or from files before it
// in its own row. Every way a module names another counts: an import or an export from it, a dynamic import, with or
// without the extension. The pure stages read no file, no clock, and no environment. Only the command line prints or
// exits, and no code decides by a finding's words. The TypeScript compiler reads every module (`tests/source.ts`), so
// a layout, a comment, or a string that looks like code reads as the language reads it, and each rule has a table of
// probes it must find.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { MODULE_ROWS } from "../src/modules.ts";
import { field, isReference, list, type Named, type Node, namedModules, nodes, parsed, parsedOne, type SourceFile, SyntaxKind, textOf } from "./source.ts";

const SRC = join(import.meta.dir, "../src");

const ROWS: string[][] = MODULE_ROWS.map((row) => row.files);

function files(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith(".ts") && !name.endsWith(".d.ts") ? [relative(SRC, path).split(sep).join("/")] : [];
  });
}

const place = new Map(ROWS.flatMap((row, rowIndex) => row.map((file, index): [string, [number, number]] => [file, [rowIndex, index]])));

/** Every module of `src/`, parsed once by the compiler. */
const SOURCES = await parsed(Object.fromEntries(files(SRC).map((file) => [file, readFileSync(join(SRC, file), "utf8")])));
const sourceOf = (file: string): SourceFile => {
  const found = SOURCES.get(file);
  if (!found) throw new Error(`${file} was not parsed`);
  return found;
};

/**
 * The module of `src/` a name inside `file` resolves to, with or without its extension, or null for data and the
 * runtime's own. A module is named by its path in `src/` with `/` on every system, as the table of rows names it.
 */
function resolved(file: string, spec: string): string | null | undefined {
  if (!spec.startsWith(".")) return null;
  const target = posix.join(file, "..", spec);
  if (!target.endsWith(".ts") && /\.[a-z]+$/.test(target) && !target.endsWith(".js")) return null;
  for (const candidate of [target, `${target.replace(/\.js$/, "")}.ts`, posix.join(target, "index.ts")])
    if (candidate.endsWith(".ts") && existsSync(join(SRC, candidate))) return candidate;
  return undefined;
}

/** A node with the parentheses, `as`, `satisfies`, and `!` around it taken off. */
function bare(node: Node): Node {
  let current = node;
  while (
    current.kind === SyntaxKind.ParenthesizedExpression ||
    current.kind === SyntaxKind.AsExpression ||
    current.kind === SyntaxKind.SatisfiesExpression ||
    current.kind === SyntaxKind.NonNullExpression
  )
    current = field(current, "expression") ?? current;
  return current;
}

/** What a pure module never names: the clock, the environment, the runtime's own, or chance. */
const IMPURE_NAMES = new Set(["process", "Date", "Bun", "performance", "globalThis", "fetch", "setTimeout", "setInterval", "require"]);
/** The modules of the runtime a pure module may import, and what of each: the path's text, and a hash. */
const PURE_RUNTIME: Record<string, Set<string> | "all"> = { "node:path": "all", "node:crypto": new Set(["createHash"]) };

/** Each thing a pure module may not do, as `<line>: <what>`. */
function impurities(file: SourceFile): string[] {
  const out: string[] = [];
  const at = (node: Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  for (const { node, parent } of nodes(file)) {
    if (isReference(node, parent) && IMPURE_NAMES.has(textOf(node))) out.push(`${at(node)}: ${textOf(node)}`);
    if (node.kind === SyntaxKind.PropertyAccessExpression && textOf(field(node, "expression")) === "Math" && textOf(field(node, "name")) === "random")
      out.push(`${at(node)}: Math.random`);
    if (node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) {
      const spec = textOf(field(node, "moduleSpecifier"));
      if (!spec.startsWith("node:")) continue;
      const allowed = PURE_RUNTIME[spec];
      const clause = field(node, "importClause");
      const bindings = clause ? field(clause, "namedBindings") : undefined;
      const names =
        bindings?.kind === SyntaxKind.NamedImports
          ? list(bindings, "elements").map((item) => textOf(field(item, "propertyName") ?? field(item, "name")))
          : null;
      if (allowed !== "all" && (!allowed || !names || names.some((name) => !allowed.has(name)))) out.push(`${at(node)}: ${spec}`);
    }
  }
  return out;
}

/** Each way a module prints or exits, as `<line>: <what>`. */
function printing(file: SourceFile): string[] {
  const out: string[] = [];
  const at = (node: Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  for (const { node, parent } of nodes(file)) {
    if (isReference(node, parent) && textOf(node) === "console") out.push(`${at(node)}: console`);
    if (node.kind !== SyntaxKind.PropertyAccessExpression) continue;
    const owner = bare(field(node, "expression") ?? node);
    const name = textOf(field(node, "name"));
    if (owner.kind === SyntaxKind.Identifier && textOf(owner) === "process" && ["stdout", "stderr", "exit", "exitCode"].includes(name))
      out.push(`${at(node)}: process.${name}`);
    if (owner.kind === SyntaxKind.Identifier && textOf(owner) === "Bun" && ["stdout", "stderr"].includes(name)) out.push(`${at(node)}: Bun.${name}`);
  }
  return out;
}

/** The calls that look a message up or read into it: what a check would decide by. */
const LOOKUPS = new Set([
  "has",
  "get",
  "set",
  "add",
  "delete",
  "includes",
  "indexOf",
  "lastIndexOf",
  "test",
  "exec",
  "match",
  "matchAll",
  "search",
  "startsWith",
  "endsWith",
  "localeCompare",
  "replace",
  "replaceAll",
  "split",
  "slice",
  "at",
  "charAt",
]);
const COMPARISONS = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanEqualsToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);
/** Names retired because they decided by words: none may come back. */
const RETIRED = new Set(["STATELESS", "statedByProduct", "hintPaint", "REFERENCE_LINE"]);

/**
 * Each place a module decides by a finding's words, as `<line>: <what>`. A message is read to be shown: passed on as a
 * value, put into a text, or stored. It is never compared, tested, looked up alone, read into, branched on, or
 * destructured. A finding's whole identity, its rule, its place, and its words, may key a set that keeps each finding
 * once. An error's message, from the runtime or from Chrome, is not a finding's: a read of `error.message` is left out.
 */
function wordReads(file: SourceFile): string[] {
  const out: string[] = [];
  const parents = new Map<Node, Node>();
  const all = nodes(file);
  for (const { node, parent } of all) parents.set(node, parent);
  const at = (node: Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const isMessage = (node: Node) =>
    (node.kind === SyntaxKind.PropertyAccessExpression && textOf(field(node, "name")) === "message") ||
    (node.kind === SyntaxKind.ElementAccessExpression && textOf(field(node, "argumentExpression")) === "message");
  for (const { node } of all) {
    if (node.kind === SyntaxKind.Identifier && RETIRED.has(textOf(node))) out.push(`${at(node)}: ${textOf(node)}`);
    if (node.kind === SyntaxKind.BindingElement && [field(node, "propertyName"), field(node, "name")].some((name) => textOf(name) === "message"))
      out.push(`${at(node)}: a message destructured`);
    if (!isMessage(node)) continue;
    const owner = bare(field(node, "expression") ?? node);
    if (owner.kind === SyntaxKind.Identifier && /^(error|.*Error)$/.test(textOf(owner))) continue;
    let use: Node = node;
    let parent = parents.get(use);
    while (parent && bare(parent) !== parent && field(parent, "expression") === use) {
      use = parent;
      parent = parents.get(use);
    }
    if (!parent) continue;
    const kind = parent.kind;
    const read =
      ((kind === SyntaxKind.PropertyAccessExpression || kind === SyntaxKind.ElementAccessExpression) && field(parent, "expression") === use) ||
      (kind === SyntaxKind.CallExpression &&
        list(parent, "arguments").includes(use) &&
        LOOKUPS.has(textOf(field(bare(field(parent, "expression") ?? parent), "name")))) ||
      (kind === SyntaxKind.BinaryExpression && COMPARISONS.has(field(parent, "operatorToken")?.kind ?? SyntaxKind.Unknown)) ||
      (kind === SyntaxKind.PrefixUnaryExpression && field(parent, "operand") === use) ||
      ([SyntaxKind.IfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement, SyntaxKind.ConditionalExpression].includes(kind) &&
        field(parent, kind === SyntaxKind.ConditionalExpression ? "condition" : "expression") === use) ||
      ((kind === SyntaxKind.SwitchStatement || kind === SyntaxKind.CaseClause) && field(parent, "expression") === use);
    if (read) out.push(`${at(node)}: ${node.getText(file).replace(/\s+/g, "")}`);
  }
  return out;
}

describe("the layers", () => {
  test("every file has a row, and imports only from above it, however it names a module", () => {
    const wrong: string[] = [];
    for (const file of files(SRC)) {
      const at = place.get(file);
      if (!at) {
        wrong.push(`${file} is in no row`);
        continue;
      }
      const named = namedModules(sourceOf(file));
      if (typeof named === "string") {
        wrong.push(`${file}: ${named}`);
        continue;
      }
      for (const { spec } of named) {
        if (!spec.startsWith(".") && !spec.startsWith("node:")) wrong.push(`${file} imports ${spec}, a package: the tool has no runtime dependency`);
        const target = resolved(file, spec);
        if (target === null) continue;
        const to = target === undefined ? undefined : place.get(target);
        if (!to || to[0] > at[0] || (to[0] === at[0] && to[1] >= at[1])) wrong.push(`${file} imports ${target ?? spec}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("the reader of names finds each way a module is named, and none in a comment or a string", async () => {
    const cases: [string, string[]][] = [
      ['import { a } from "./a.ts";', ["./a.ts"]],
      ['import {\n  a,\n  b,\n} from "./b";', ["./b"]],
      ['export { RULES } from "./rules.ts";', ["./rules.ts"]],
      ['export * from "./c.ts";', ["./c.ts"]],
      ['import "./d.ts";', ["./d.ts"]],
      ['const m = await import("./e.ts");', ["./e.ts"]],
      ['const m = await import(\n  "./f.ts"\n);', ["./f.ts"]],
      ['// import "./g.ts";\n/* export * from "./h.ts"; */\nconst text = \'import "./i.ts"\';', []],
    ];
    for (const [text, specs] of cases) expect([text, ((namedModules(await parsedOne(text)) as Named[]) ?? []).map((item) => item.spec)]).toEqual([text, specs]);
    expect(typeof namedModules(await parsedOne("const m = await import(name);"))).toBe("string");
    expect(typeof namedModules(await parsedOne('const m = require("./a.ts");'))).toBe("string");
    expect((namedModules(await parsedOne('import type { A } from "./a.ts";')) as Named[])[0]?.types).toBe(true);
    expect((namedModules(await parsedOne('import { type A, type B } from "./a.ts";')) as Named[])[0]?.types).toBe(true);
    expect((namedModules(await parsedOne('export type { A } from "./a.ts";')) as Named[])[0]?.types).toBe(true);
    expect((namedModules(await parsedOne('import { a, type B } from "./a.ts";')) as Named[])[0]?.types).toBe(false);
  });

  test("the pure stages, and every module they run, read no file, no clock, no environment, nothing of the runtime's own, and no chance", () => {
    // load, check, the manifests, and the page: what each module names for its values, followed to the end.
    const todo = ["design/load.ts", "checks/rules.ts", "manifest.ts", "shots.ts", "stories.ts", "page.ts"];
    const seen = new Set<string>();
    const impure: string[] = [];
    while (todo.length) {
      const file = todo.pop() ?? "";
      if (seen.has(file)) continue;
      seen.add(file);
      for (const found of impurities(sourceOf(file))) impure.push(`${file}:${found}`);
      const named = namedModules(sourceOf(file));
      if (typeof named === "string") impure.push(`${file}: ${named}`);
      else
        for (const { spec, types } of named)
          if (!types) {
            const target = resolved(file, spec);
            if (target) todo.push(target);
          }
    }
    expect(impure).toEqual([]);
    expect(seen.size).toBeGreaterThan(15);
  });

  test("the check of purity finds each form, wherever it stands, and leaves a property of that name alone", async () => {
    const found = [
      'import { readFileSync } from "node:fs";',
      'import { spawn } from "node:child_process";',
      'import { randomBytes } from "node:crypto";',
      "const at = Date.now();",
      "const home = process.env.HOME;",
      "const text = Bun.file(path);",
      "const t = performance.now();",
      "const page = globalThis.document;",
      "const n = Math.random();",
      "fetch(url);",
      "setTimeout(go, 1);",
      "const x = (\n  process\n).cwd();",
    ];
    for (const probe of found) expect([probe, impurities(await parsedOne(probe)).length]).toEqual([probe, 1]);
    const left = [
      'import { createHash } from "node:crypto";',
      'import { join } from "node:path";',
      "const a = row.Date;",
      "const b = { process: 1 };",
      '// Date.now()\nconst c = "process.env";',
    ];
    for (const probe of left) expect([probe, impurities(await parsedOne(probe))]).toEqual([probe, []]);
  });

  test("only the command line prints or exits", () => {
    const found = files(SRC)
      .filter((file) => file !== "cli.ts")
      .flatMap((file) => printing(sourceOf(file)).map((what) => `${file}:${what}`));
    expect(found).toEqual([]);
  });

  test("the command line runs every stage through the public entry, and its own modules through src/cli/", () => {
    const named = namedModules(sourceOf("cli.ts"));
    const targets = typeof named === "string" ? [named] : named.map(({ spec }) => resolved("cli.ts", spec)).filter((target) => target !== null);
    expect(targets.filter((target) => target !== "index.ts" && !target?.startsWith("cli/"))).toEqual([]);
    // The internal door holds only names: each statement is an export from a module.
    const door = sourceOf("cli/internal.ts");
    expect(list(door, "statements").filter((statement) => statement.kind !== SyntaxKind.ExportDeclaration).length).toBe(0);
  });

  test("the check of printing finds each form, and none in a comment or a string", async () => {
    for (const probe of [
      "console.log(x);",
      "process.stdout.write(x);",
      "process.exitCode = 1;",
      "process.exit(2);",
      "Bun.write(Bun.stderr, x);",
      "(process as never).stderr;",
    ])
      expect([probe, printing(await parsedOne(probe)).length]).toEqual([probe, 1]);
    expect(printing(await parsedOne('// console.log(x)\nconst a = "process.exit(1)";'))).toEqual([]);
  });

  test("no code decides by a finding's words, by any means", () => {
    const reading = files(SRC).flatMap((file) => wordReads(sourceOf(file)).map((what) => `${file}:${what}`));
    expect(reading).toEqual([]);
  });

  test("the check of words finds each way a check could decide by a message, over lines too, and leaves a message shown alone", async () => {
    const found = [
      'if (item.message.startsWith("x")) {}',
      'const same = item.message === "x";',
      "const hit = /x/.test(item.message);",
      "if (seen.has(issue.message)) {}",
      "const { message } = item;",
      'const near = item\n  .message\n  .includes("x");',
      "switch (item.message) {}",
      "const none = !item.message;",
      'const hit = item["message"].includes("x");',
      "const pick = item.message ? 1 : 2;",
      "const size = (item as Finding).message.length;",
      "const STATELESS = 1;",
    ];
    for (const probe of found) expect([probe, wordReads(await parsedOne(probe)).length]).toEqual([probe, 1]);
    const left = [
      "out.push(finding(issue.rule, issue.message, file));",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is a sample of source code that holds a template literal.
      "const key = `${item.rule}\\u0000${item.file}\\u0000${item.message}`;",
      'const first = error.message.split("\\n")[0];',
      'const said = (error as Error).message.includes("x");',
      "const data = { message: item.message };",
      '// item.message === "x"\nconst text = "item.message.startsWith(x)";',
    ];
    for (const probe of left) expect([probe, wordReads(await parsedOne(probe))]).toEqual([probe, []]);
  });
});
