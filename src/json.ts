// JSON as the tool reads it: strictly, naming the line and the column of a mistake, so a message can say where to fix a
// sitemap or a fixtures block. No runtime reader gives the place of a mistake, so this one does. Writing is
// `JSON.stringify`.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** A failed read names its place in the text: `error` is the whole sentence, `line`, `column`, and `reason` its parts. */
type JsonRead = { ok: true; value: Json } | { ok: false; error: string; line: number; column: number; reason: string };

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every text a JSON value holds, at any depth, in the order it stands: a list's items, then an object's values. */
export function textsOf(value: Json | undefined, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) textsOf(item, out);
  else if (isObject(value)) for (const item of Object.values(value)) textsOf(item, out);
  return out;
}

/** Set a key as an own property, so a key such as `__proto__` is data and never changes the object's prototype. */
function setKey(target: JsonObject, key: string, value: Json): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

const MAX_NESTING = 1000;

class JsonError extends Error {
  constructor(
    readonly reason: string,
    readonly at: number,
  ) {
    super(reason);
  }
}

/** Read JSON text, strictly: `NaN`, `Infinity`, and a key written twice in one object are refused, each with its line. */
export function readJson(text: string): JsonRead {
  try {
    if (text.startsWith("\uFEFF")) throw new JsonError("the text starts with a byte order mark: save it as UTF-8 without one", 0);
    const reader = new Reader(text);
    const start = reader.space(0);
    const [value, end] = reader.value(start, 0);
    const rest = reader.space(end);
    if (rest !== text.length) throw new JsonError("more text follows the JSON value: take it out, or hold the values in one list or object", rest);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof JsonError) return { ok: false, ...located(text, error.reason, error.at) };
    throw error;
  }
}

function located(text: string, reason: string, at: number): { error: string; line: number; column: number; reason: string } {
  const line = text.slice(0, at).split("\n").length;
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const column = Array.from(text.slice(lineStart, at)).length + 1;
  return { error: `at line ${line}, column ${column}: ${reason}`, line, column, reason };
}

const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/y;
const PLAIN = /[^"\\\x00-\x1f]*/y;

class Reader {
  constructor(readonly text: string) {}

  space(at: number): number {
    let i = at;
    while (i < this.text.length && " \t\n\r".includes(this.text[i] ?? "x")) i++;
    return i;
  }

  value(at: number, depth: number): [Json, number] {
    const text = this.text;
    const char = text[at];
    if (depth > MAX_NESTING) throw new JsonError(`the values nest more than ${MAX_NESTING} levels deep: flatten them`, at);
    if (char === '"') return this.string(at + 1);
    if (char === "{") return this.object(at + 1, depth + 1);
    if (char === "[") return this.array(at + 1, depth + 1);
    if (text.startsWith("null", at)) return [null, at + 4];
    if (text.startsWith("true", at)) return [true, at + 4];
    if (text.startsWith("false", at)) return [false, at + 5];
    for (const word of ["NaN", "Infinity", "-Infinity"]) {
      if (text.startsWith(word, at)) throw new JsonError(`${word} is no JSON value: write a number`, at);
    }
    NUMBER.lastIndex = at;
    const found = NUMBER.exec(text);
    if (found) {
      const number = Number(found[0]);
      // A number past the largest a double holds reads as Infinity, which is no JSON value.
      if (!Number.isFinite(number)) throw new JsonError("a number is too large to read: write a smaller one", at);
      return [number, at + found[0].length];
    }
    throw new JsonError("a value is missing, or is no JSON: write a text in double quotes, a number, true, false, null, a list, or an object", at);
  }

  string(begin: number): [string, number] {
    const text = this.text;
    let at = begin;
    let out = "";
    for (;;) {
      PLAIN.lastIndex = at;
      const chunk = PLAIN.exec(text)?.[0] ?? "";
      out += chunk;
      at += chunk.length;
      const char = text[at];
      if (char === undefined) throw new JsonError("a text starts here and never ends: close it with a double quote", begin - 1);
      if (char === '"') return [out, at + 1];
      if (char !== "\\") throw new JsonError("a control character stands inside a text: write a line break as \\n and a tab as \\t", at);
      const escaped = text[at + 1];
      if (escaped === undefined) throw new JsonError("a text starts here and never ends: close it with a double quote", begin - 1);
      const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (escaped in simple) {
        out += simple[escaped];
        at += 2;
        continue;
      }
      if (escaped !== "u") throw new JsonError("a backslash starts an escape JSON does not have: write \\\\ for a backslash", at);
      const hex = text.slice(at + 2, at + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new JsonError("a \\u escape needs four hexadecimal digits, such as \\u00e9", at + 1);
      out += String.fromCharCode(parseInt(hex, 16));
      at += 6;
    }
  }

  object(at: number, depth: number): [JsonObject, number] {
    const text = this.text;
    const out: JsonObject = {};
    let i = this.space(at);
    if (text[i] === "}") return [out, i + 1];
    if (text[i] !== '"') throw new JsonError("a key must be a text in double quotes", i);
    for (;;) {
      const keyAt = i;
      const [key, afterKey] = this.string(i + 1);
      i = this.space(afterKey);
      if (text[i] !== ":") throw new JsonError("a key needs a colon before its value", i);
      i = this.space(i + 1);
      const [value, afterValue] = this.value(i, depth);
      if (Object.hasOwn(out, key)) throw new JsonError(`the key ${JSON.stringify(key)} is written twice in one object: keep one`, keyAt);
      setKey(out, key, value);
      i = this.space(afterValue);
      if (text[i] === "}") return [out, i + 1];
      if (text[i] !== ",") throw new JsonError("a comma is missing between two values", i);
      const comma = i;
      i = this.space(i + 1);
      if (text[i] === "}") throw new JsonError("a comma follows the last value of an object: take it out", comma);
      if (text[i] !== '"') throw new JsonError("a key must be a text in double quotes", i);
    }
  }

  array(at: number, depth: number): [Json[], number] {
    const text = this.text;
    const out: Json[] = [];
    let i = this.space(at);
    if (text[i] === "]") return [out, i + 1];
    for (;;) {
      const [value, after] = this.value(i, depth);
      out.push(value);
      i = this.space(after);
      if (text[i] === "]") return [out, i + 1];
      if (text[i] !== ",") throw new JsonError("a comma is missing between two values", i);
      const comma = i;
      i = this.space(i + 1);
      if (text[i] === "]") throw new JsonError("a comma follows the last value of a list: take it out", comma);
    }
  }
}
