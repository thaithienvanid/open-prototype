// The source of the tool and of the viewer, read by the TypeScript compiler, so a layer test reads what the compiler
// reads: an import over many lines, a comment, a string that looks like code, and a layout Biome writes each read as
// the language reads them. The compiler parses each text in a project of its own, on a file system it is given, and
// follows no import. TypeScript 7 gives its syntax tree through its `unstable` API, the only one it has, at the version
// `package.json` pins.
import { type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";
import { createVirtualFileSystem } from "typescript/unstable/fs";

export type { Node, SourceFile };
export { SyntaxKind };

const ROOT = "/source";

/** Each text parsed by the compiler, by the name it is given. */
export async function parsed(texts: Record<string, string>): Promise<Map<string, SourceFile>> {
  const files = Object.fromEntries(Object.entries(texts).map(([name, text]) => [`${ROOT}/${name}`, text]));
  const config = {
    compilerOptions: { noLib: true, types: [], noResolve: true, allowImportingTsExtensions: true, noEmit: true, module: "preserve", target: "esnext" },
    files: Object.keys(files),
  };
  const api = new API({ cwd: ROOT, fs: createVirtualFileSystem({ ...files, [`${ROOT}/tsconfig.json`]: JSON.stringify(config) }) });
  try {
    const snapshot = await api.updateSnapshot({ openProject: `${ROOT}/tsconfig.json` });
    const project = snapshot.getProjects()[0];
    if (!project) throw new Error("the compiler opened no project");
    const out = new Map<string, SourceFile>();
    for (const name of Object.keys(texts)) {
      const file = await project.program.getSourceFile(`${ROOT}/${name}`);
      if (!file) throw new Error(`the compiler did not parse ${name}`);
      out.set(name, file);
    }
    return out;
  } finally {
    await api.close();
  }
}

/** One text parsed by the compiler. */
export async function parsedOne(text: string): Promise<SourceFile> {
  const file = (await parsed({ "probe.ts": text })).get("probe.ts");
  if (!file) throw new Error("the compiler did not parse the probe");
  return file;
}

/** Every node of a tree below `root`, each before its children, with its parent. */
export function nodes(root: Node): { node: Node; parent: Node }[] {
  const out: { node: Node; parent: Node }[] = [];
  const visit = (parent: Node) => (node: Node) => {
    out.push({ node, parent });
    node.forEachChild(visit(node));
  };
  root.forEachChild(visit(root));
  return out;
}

/** A node's own fields, for the kinds a test reads, so a test names a field and never casts. */
export const field = (node: Node, name: string): Node | undefined => (node as unknown as Record<string, Node | undefined>)[name];
export const list = (node: Node, name: string): Node[] => [...((node as unknown as Record<string, Iterable<Node> | undefined>)[name] ?? [])];
export const flag = (node: Node, name: string): boolean => Boolean((node as unknown as Record<string, unknown>)[name]);
/** The text of an identifier, a string literal, or a template's piece. */
export const textOf = (node: Node | undefined): string => String((node as unknown as { text?: unknown } | undefined)?.text ?? "");

/** A module a text names, and whether the name is erased with the types. */
export type Named = { spec: string; types: boolean };

/**
 * Every module a text names: by an import or an export from it, a side-effect import, or a dynamic import, however it
 * is laid out; or why a name cannot be followed: a dynamic import of anything but one literal, or a `require`.
 */
export function namedModules(file: SourceFile): Named[] | string {
  const out: Named[] = [];
  for (const { node } of nodes(file)) {
    if (node.kind === SyntaxKind.ImportDeclaration) {
      const clause = field(node, "importClause");
      const bindings = clause ? field(clause, "namedBindings") : undefined;
      const specifiers = bindings?.kind === SyntaxKind.NamedImports ? list(bindings, "elements") : [];
      // `import type`, and `import { type A, type B }` with no default import, are erased with the types.
      const typeOnly =
        clause !== undefined &&
        ((field(clause, "phaseModifier") as unknown) === SyntaxKind.TypeKeyword ||
          (!field(clause, "name") && specifiers.length > 0 && specifiers.every((item) => flag(item, "isTypeOnly"))));
      out.push({ spec: textOf(field(node, "moduleSpecifier")), types: typeOnly });
    } else if (node.kind === SyntaxKind.ExportDeclaration && field(node, "moduleSpecifier")) {
      const clause = field(node, "exportClause");
      const specifiers = clause?.kind === SyntaxKind.NamedExports ? list(clause, "elements") : [];
      const typeOnly = flag(node, "isTypeOnly") || (specifiers.length > 0 && specifiers.every((item) => flag(item, "isTypeOnly")));
      out.push({ spec: textOf(field(node, "moduleSpecifier")), types: typeOnly });
    } else if (node.kind === SyntaxKind.CallExpression && field(node, "expression")?.kind === SyntaxKind.ImportKeyword) {
      const [argument] = list(node, "arguments");
      if (argument?.kind !== SyntaxKind.StringLiteral && argument?.kind !== SyntaxKind.NoSubstitutionTemplateLiteral)
        return `a dynamic import of ${argument?.getText(file) ?? "nothing"}: name the module as written text`;
      out.push({ spec: textOf(argument), types: false });
    } else if (node.kind === SyntaxKind.ImportEqualsDeclaration) return "an import of the form import x = require(): import the module";
    else if (
      node.kind === SyntaxKind.CallExpression &&
      textOf(field(node, "expression")) === "require" &&
      field(node, "expression")?.kind === SyntaxKind.Identifier
    )
      return "a require(): import the module";
  }
  return out;
}

/** Whether an identifier stands for a name of its own scope, not a property after a dot or a key of an object. */
export function isReference(node: Node, parent: Node): boolean {
  if (node.kind !== SyntaxKind.Identifier) return false;
  if (parent.kind === SyntaxKind.PropertyAccessExpression && field(parent, "name") === node) return false;
  if ((parent.kind === SyntaxKind.PropertyAssignment || parent.kind === SyntaxKind.PropertySignature) && field(parent, "name") === node) return false;
  if ((parent.kind === SyntaxKind.MethodDeclaration || parent.kind === SyntaxKind.PropertyDeclaration) && field(parent, "name") === node) return false;
  return true;
}
