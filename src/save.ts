// Saving a round: the JSON the viewer gave, read from a file or the standard input, written as a design's next round
// beside it, never over a file, and held to the same rules the check reads a round by.
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commentsProblems, roundsFolder } from "./checks/rounds.ts";
import { COMMENT_KEYS, LAST_ROUND } from "./contract.ts";
import { Refusal } from "./errors.ts";
import { READ_LIMITS, ROUND_VERSION, ROUNDS } from "./format.ts";
import { decodeUtf8, isLink, reasonOf, writeNew } from "./fs.ts";
import { isObject, type JsonObject, readJson } from "./json.ts";

/** The JSON the viewer gave, from a file or from the standard input, or why it cannot be read. */
export function readSource(source: string, path: string, standardInput: () => Uint8Array): { data: JsonObject | null; problem: string } {
  let bytes: Uint8Array;
  if (source === "-") bytes = standardInput();
  else {
    try {
      const info = lstatSync(path);
      if (info.isSymbolicLink()) return { data: null, problem: `${source}: is a link; pass a regular JSON file` };
      if (!info.isFile()) return { data: null, problem: `${source}: not a plain file; pass a regular JSON file` };
      if (info.size > READ_LIMITS.round_file) return { data: null, problem: `${source}: larger than ${READ_LIMITS.round_file} bytes` };
      bytes = readFileSync(path);
    } catch (error) {
      return {
        data: null,
        problem: `${source}: cannot be read (${reasonOf(error)}): download comments.json from the page, then give its path, or \`-\` to read it from the standard input`,
      };
    }
  }
  if (bytes.length > READ_LIMITS.round_file) return { data: null, problem: `${source}: larger than ${READ_LIMITS.round_file} bytes` };
  const text = decodeUtf8(bytes);
  if (text === null) return { data: null, problem: `${source}: cannot be read (the text is not UTF-8)` };
  const read = readJson(text);
  if (!read.ok) return { data: null, problem: `${source}: not valid JSON (${read.error})` };
  return isObject(read.value) ? { data: read.value, problem: "" } : { data: null, problem: `${source}: JSON must be an object with \`round\` and \`items\`` };
}

/**
 * Write the viewer's comments as round `N` of a design, in `folder`, never over a file that exists. A refusal names a
 * folder from the project's top, where `shown` is how the project names `folder` ("" for its top).
 */
export function saveRound(folder: string, name: string, data: JsonObject, chosen: number | null, shown = ""): string {
  const round = chosen ?? data.round;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > LAST_ROUND)
    throw new Refusal(`the comments need an integer \`round\` from 1 to ${LAST_ROUND} (or pass --round N)`, "request.file");
  const problems = commentsProblems(data, round);
  if (problems.length) throw new Refusal(problems.join("\n"), "request.file");
  const target = join(folder, roundsFolder(name), String(round));
  for (const rel of [ROUNDS, roundsFolder(name), `${roundsFolder(name)}/${round}`]) {
    const step = join(folder, rel);
    const named = shown ? `${shown}/${rel}` : rel;
    if (isLink(step)) throw new Refusal(`${named} is a link: rounds/ must be plain folders`, "request.path");
    let folderHere = true;
    try {
      folderHere = lstatSync(step).isDirectory();
    } catch {
      // the folder does not exist yet, and is made below
    }
    if (!folderHere) throw new Refusal(`${named} is a file, not a folder: move the file away, then save again`, "request.path");
  }
  mkdirSync(target, { recursive: true });
  // The keys every comment is written with first, in this order; each other key of the schema follows when the comment holds it, and the box last.
  const first = ["id", "type", "screen", "state", "comment"];
  const others = COMMENT_KEYS.filter((key) => !first.includes(key) && key !== "box");
  const items = (data.items as JsonObject[]).map((raw) => {
    const item: JsonObject = {
      id: raw.id ?? null,
      type: typeof raw.type === "string" ? raw.type : "change",
      screen: raw.screen ?? null,
      state: raw.state ?? null,
      comment: raw.comment ?? null,
    };
    for (const key of others) if (raw[key] !== undefined) item[key] = raw[key] ?? null;
    const box = raw.box;
    if (isObject(box))
      item.box = { x: Math.round(Number(box.x)), y: Math.round(Number(box.y)), width: Math.round(Number(box.width)), height: Math.round(Number(box.height)) };
    else if (box === null) item.box = null;
    return item;
  });
  const path = join(target, "comments.json");
  try {
    writeNew(path, `${JSON.stringify({ schema_version: ROUND_VERSION, round, items }, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Refusal(
        `round ${round} of ${name} is saved already: never overwrite a round file; export the next round from a page built after this one, or pass --round ${round + 1} with its ids written r${round + 1}-<n>`,
        "request.exists",
      );
    throw error;
  }
  return path;
}
