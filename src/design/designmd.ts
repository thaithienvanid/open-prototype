// The project's design document, `DESIGN.md`, read as its format reads it: the front matter and every fenced `yaml` or
// `yml` block, each parsed as YAML, with the line of each key; and its `##` headings, with their lines. The prose is
// never read. It is the one module that parses YAML, and it sits in the disk stage, because the pure stages name nothing
// of the runtime's own: `design/system.ts` turns what it gives into tokens.

/** A key of a YAML block, by its dotted path, at its line of the file. A path may stand twice: YAML keeps the last. */
type DesignMdKey = { path: string; line: number };
/** One YAML block: its first line in the file, its value, or the reader's words when it is no YAML, and its keys. */
export type DesignMdBlock = { line: number; value: unknown; error: string; keys: DesignMdKey[] };
export type DesignMdSection = { heading: string; line: number };
/** What the document says to the tool: its YAML blocks, in order, and its `##` headings, for a person to read. */
type DesignMdText = { blocks: DesignMdBlock[]; sections: DesignMdSection[] };

// A fence opens with three or more backticks or tildes, indented three spaces at most; a backtick fence's info has no
// backtick. It closes with the same mark, at least as many, and nothing but space after it.
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
// A key at the start of a line, after its indent and an optional "- ": bare, or quoted, then ":" and a space or the end.
// A bare key's run of space is taken only when more of the key follows it, so no run is read twice: the cost of a line
// is in proportion to its length, however long its run of space.
const KEY = /^( *)(?:- +)?(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s"'#{}[\],&*!|>%@`:](?:[^:#\s]|\s+(?=[^\s:#]))*))\s*:(?=\s|$)(.*)$/;
// What follows a key that opens a block scalar: `|` or `>`, with its indicators, and an optional comment.
const BLOCK_SCALAR = /^\s*[|>][-+0-9]*\s*(?:#.*)?$/;
// A `##` heading's text: its closing run of `#` and the space around it are taken off by `headingText`, in one pass.
const HEADING = /^ {0,3}##[ \t]+(.*)$/;

/** A heading's text with its trailing space, and a closing run of `#` after a space, taken off, as Markdown reads it. */
function headingText(text: string): string {
  const space = (at: number) => text[at] === " " || text[at] === "\t";
  let end = text.length;
  while (end > 0 && space(end - 1)) end--;
  let hashes = end;
  while (hashes > 0 && text[hashes - 1] === "#") hashes--;
  if (hashes < end && hashes > 0 && space(hashes - 1)) {
    end = hashes;
    while (end > 0 && space(end - 1)) end--;
  }
  return text.slice(0, end);
}

/** How deep a flow collection (`{` or `[`) stands open at the end of a value, outside quotes and comments. */
function flowDepth(text: string, start: number): number {
  let depth = start;
  let quote = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? "";
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (index === 0 || /\s/.test(text[index - 1] ?? ""))) break;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * The line of each key of a block, by its path: one pass with a stack of (indent, key). The lines of a block scalar are
 * skipped, so text in a description is never a key, and a key inside a flow collection takes its parent's line.
 */
function keyLines(lines: string[], first: number): DesignMdKey[] {
  const keys: DesignMdKey[] = [];
  const stack: { indent: number; key: string }[] = [];
  let scalar = -1; // the indent of the key whose block scalar is being skipped, or -1
  let flow = 0;
  lines.forEach((line, index) => {
    const indent = /^ */.exec(line)?.[0].length ?? 0;
    if (scalar >= 0) {
      if (line.trim() === "" || indent > scalar) return;
      scalar = -1;
    }
    if (flow > 0) {
      flow = flowDepth(line, flow);
      return;
    }
    if (/^\s*(?:#|$)/.test(line) || /^(?:---|\.\.\.)\s*$/.test(line)) return;
    const found = KEY.exec(line);
    if (!found) return;
    const key = found[2] !== undefined ? found[2].replace(/\\(.)/g, "$1") : found[3] !== undefined ? found[3].replaceAll("''", "'") : (found[4] ?? "").trim();
    const at = /^ *(?:- +)?/.exec(line)?.[0].length ?? 0;
    while (stack.length && (stack[stack.length - 1]?.indent ?? 0) >= at) stack.pop();
    stack.push({ indent: at, key });
    keys.push({ path: stack.map((item) => item.key).join("."), line: first + index });
    const rest = found[5] ?? "";
    if (BLOCK_SCALAR.test(rest)) scalar = at;
    else flow = flowDepth(rest, 0);
  });
  return keys;
}

/** A block of YAML: parsed, or the reader's words. An empty block says nothing: it is read as null. */
function parsed(text: string): { value: unknown; error: string } {
  try {
    return { value: Bun.YAML.parse(text), error: "" };
  } catch (error) {
    const words = error instanceof Error ? error.message : String(error);
    return {
      value: null,
      error:
        words
          .replace(/^YAML Parse error:\s*/i, "")
          .replace(/[\x00-\x1f\x7f]/g, " ")
          .trim() || "it cannot be read",
    };
  }
}

/** The document's text as the format reads it: a byte order mark dropped, and each line ending read as LF. */
export function readDesignMd(source: string): DesignMdText {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n");
  const blocks: DesignMdBlock[] = [];
  const sections: DesignMdSection[] = [];
  const block = (line: number, body: string[]) => blocks.push({ line, ...parsed(body.join("\n")), keys: keyLines(body, line + 1) });
  let index = 0;
  // A front matter line is `---` with any spaces or tabs after it, as Jekyll and Hugo read one.
  const delimiter = (line: string | undefined) => line !== undefined && /^---[ \t]*$/.test(line);
  if (delimiter(lines[0])) {
    const end = lines.findIndex((line, at) => at > 0 && delimiter(line));
    if (end < 0) {
      blocks.push({ line: 1, value: null, error: "its front matter has no closing --- line", keys: [] });
      return { blocks, sections };
    }
    block(1, lines.slice(1, end));
    index = end + 1;
  }
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fence = FENCE.exec(line);
    if (fence && !(fence[2]?.startsWith("`") && fence[3]?.includes("`"))) {
      const [, indent = "", mark = "", info = ""] = fence;
      const close = new RegExp(`^ {0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}\\s*$`);
      let end = index + 1;
      while (end < lines.length && !close.test(lines[end] ?? "")) end++;
      const language = (info.trim().split(/\s+/)[0] ?? "").toLowerCase();
      if (language === "yaml" || language === "yml") {
        const strip = new RegExp(`^ {0,${indent.length}}`);
        block(
          index + 1,
          lines.slice(index + 1, end).map((text) => text.replace(strip, "")),
        );
      }
      index = end + 1;
      continue;
    }
    const heading = HEADING.exec(line);
    const text = headingText(heading?.[1] ?? "");
    if (text) sections.push({ heading: text, line: index + 1 });
    index++;
  }
  return { blocks, sections };
}
