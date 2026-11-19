// Shared test helpers: a new project folder for each test, the command line run in this process, and a small JSON
// Schema reader for the schemas the tool ships.
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { run } from "../src/cli.ts";
import type { FileContent } from "./cases.ts";
import { tempFolder } from "./temp.ts";

export const REPOSITORY = resolve(import.meta.dir, "..");

/** Whether the tests run on Windows, where a few tests cannot run because the system lacks what they test. */
export const WINDOWS = process.platform === "win32";
/** The words a test's name ends with when Windows skips it, with the reason: "" on every other system. */
export const onWindows = (reason: string): string => (WINDOWS ? ` (skipped on Windows: ${reason})` : "");

/**
 * Take a right away from files or folders while a command runs, and give it back after: reading a file, or writing in a
 * folder. Windows keeps no POSIX permissions, and its `chmod` sets only the read-only flag, so there `icacls` denies
 * Everyone (SID S-1-1-0) the right instead: read data (RD) of a file, or adding a file (WD) or a folder (AD) to a folder.
 */
export async function without<T>(right: "read" | "write", paths: string[], run: () => Promise<T>): Promise<T> {
  for (const path of paths)
    if (WINDOWS) icacls(path, "/deny", right === "read" ? "*S-1-1-0:(RD)" : "*S-1-1-0:(WD,AD)");
    else chmodSync(path, right === "read" ? 0o000 : 0o500);
  try {
    return await run();
  } finally {
    for (const path of paths)
      if (WINDOWS) icacls(path, "/remove:d", "*S-1-1-0");
      else chmodSync(path, right === "read" ? 0o600 : 0o700);
  }
}
function icacls(...args: string[]): void {
  const ran = Bun.spawnSync(["icacls", ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  if (ran.exitCode !== 0) throw new Error(`icacls ${args.join(" ")} failed: ${ran.stderr.toString()}${ran.stdout.toString()}`);
}
export const SCRATCH = tempFolder(join(tmpdir(), "prototype-tests-"));
let made = 0;

/** A new, empty project folder with these files in it. Folders are removed when the test run ends. */
export function project(files: Record<string, FileContent> = {}): string {
  const folder = join(SCRATCH, String(++made));
  mkdirSync(folder, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const target = join(folder, path);
    mkdirSync(dirname(target), { recursive: true });
    if (typeof content === "string") writeFileSync(target, content);
    else if ("link" in content) symlinkSync(content.link, target);
    else writeFileSync(target, content.bytes);
  }
  return folder;
}

export type Ran = { code: number; out: string; err: string };

/** Run one command in `folder`, as the command line does, and collect what it prints. */
export async function cli(folder: string, ...argv: string[]): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (line) => out.push(line), err: (line) => err.push(line) }, folder);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export function json<T = unknown>(ran: Ran): T {
  return JSON.parse(ran.out) as T;
}

type Schema = Record<string, unknown>;

export function schema(name: string): Schema {
  return JSON.parse(readFileSync(join(REPOSITORY, "schemas", `${name}.schema.json`), "utf8")) as Schema;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/** What a value breaks of a schema: the keywords the shipped schemas use, each as a path and a reason. */
export function schemaErrors(value: unknown, node: Schema, root: Schema = node, path = "$"): string[] {
  const errors: string[] = [];
  if (Array.isArray(node.allOf)) for (const part of node.allOf) errors.push(...schemaErrors(value, part as Schema, root, path));
  if (typeof node.$ref === "string") {
    const target = node.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], root);
    errors.push(...schemaErrors(value, target as Schema, root, path));
  }
  if ("const" in node && value !== node.const) errors.push(`${path}: not ${JSON.stringify(node.const)}`);
  if (Array.isArray(node.enum) && !node.enum.includes(value)) errors.push(`${path}: not one of ${JSON.stringify(node.enum)}`);
  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) errors.push(`${path}: a ${actual}, not ${types.join(" or ")}`);
  }
  if (Array.isArray(node.oneOf)) {
    const passing = node.oneOf.filter((option) => !schemaErrors(value, option as Schema, root, path).length).length;
    if (passing !== 1) errors.push(`${path}: matches ${passing} of oneOf`);
  }
  if (typeof value === "string") {
    if (typeof node.minLength === "number" && Array.from(value).length < node.minLength) errors.push(`${path}: shorter than ${node.minLength}`);
    if (typeof node.maxLength === "number" && Array.from(value).length > node.maxLength) errors.push(`${path}: longer than ${node.maxLength}`);
    if (typeof node.pattern === "string" && !new RegExp(node.pattern, "u").test(value)) errors.push(`${path}: does not match ${node.pattern}`);
  }
  if (typeof value === "number" && typeof node.minimum === "number" && value < node.minimum) errors.push(`${path}: below ${node.minimum}`);
  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) errors.push(`${path}: fewer than ${node.minItems} items`);
    if (typeof node.maxItems === "number" && value.length > node.maxItems) errors.push(`${path}: more than ${node.maxItems} items`);
    if (node.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: items repeat`);
    if (node.items)
      value.forEach((item, index) => {
        errors.push(...schemaErrors(item, node.items as Schema, root, `${path}[${index}]`));
      });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of (node.required as string[] | undefined) ?? []) if (!(key in object)) errors.push(`${path}: lacks ${key}`);
    const properties = (node.properties as Record<string, Schema> | undefined) ?? {};
    for (const [key, item] of Object.entries(object)) {
      if (properties[key]) errors.push(...schemaErrors(item, properties[key], root, `${path}.${key}`));
      else if (node.additionalProperties === false) errors.push(`${path}: holds ${key}, which the schema allows not`);
    }
  }
  return errors;
}

/** What a command's JSON breaks of its shape in `schemas/output.schema.json`: its command's, or a refusal's. */
export function outputErrors(command: string, value: unknown): string[] {
  const root = schema("output");
  const defs = root.$defs as Record<string, Schema>;
  const own = defs[command];
  if (!own) return [`no shape for the command ${command}`];
  const refusal = defs.refusal as Schema;
  const asOwn = schemaErrors(value, own, root);
  return asOwn.length && schemaErrors(value, refusal, root).length ? asOwn : [];
}
