// Saving a round: the JSON the viewer gave, read from a file or the standard input, written as a design's next round
// beside it, never over a file, and held to the same rules the check reads a round by.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commentsProblems, ROUND_FOLDER, roundsFolder } from "./checks/rounds.ts";
import { COMMENT_KEYS, LAST_ROUND } from "./contract.ts";
import { Refusal } from "./errors.ts";
import { READ_LIMITS, ROUND_VERSION, ROUNDS } from "./format.ts";
import { decodeUtf8, isLink, reasonOf, writeNew } from "./fs.ts";
import { isObject, type Json, type JsonObject, readJson } from "./json.ts";

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

/** The round after the highest one saved in a design's rounds folder, as the page's `next_round` counts it. */
function freeRound(top: string): number {
  let highest = 0;
  for (const entry of readdirSync(top))
    if (ROUND_FOLDER.test(entry) && existsSync(join(top, entry, "comments.json"))) highest = Math.max(highest, Number(entry));
  return highest + 1;
}

/** A box of four finite numbers in whole pixels; any other value as it is, for the check to name. */
function wholeBox(box: Json): Json {
  if (!isObject(box)) return box;
  const keys = ["x", "y", "width", "height"] as const;
  if (!keys.every((key) => typeof box[key] === "number" && Number.isFinite(box[key]))) return box;
  return { ...box, ...Object.fromEntries(keys.map((key) => [key, Math.round(box[key] as number)])) };
}

/**
 * Write the viewer's comments as round `N` of a design, in `folder`, never over a file that exists. A refusal names a
 * folder from the project's top, where `shown` is how the project names `folder` ("" for its top).
 */
export function saveRound(folder: string, name: string, data: JsonObject, chosen: number | null, shown = ""): string {
  const round = chosen ?? data.round;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > LAST_ROUND)
    throw new Refusal(`the comments need an integer \`round\` from 1 to ${LAST_ROUND} (or pass --round N)`, "request.file");
  // The viewer measures a box in fractions of a pixel, and a round file holds whole pixels, so the save rounds a box of
  // four numbers before it checks the comments, and writes what it checked.
  const checked: JsonObject = Array.isArray(data.items)
    ? { ...data, items: data.items.map((raw) => (isObject(raw) && raw.box !== undefined ? { ...raw, box: wholeBox(raw.box) } : raw)) }
    : data;
  const problems = commentsProblems(checked, round);
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
  const written = (checked.items as JsonObject[]).map((raw) => {
    const item: JsonObject = {
      id: raw.id ?? null,
      type: typeof raw.type === "string" ? raw.type : "change",
      screen: raw.screen ?? null,
      state: raw.state ?? null,
      comment: raw.comment ?? null,
    };
    for (const key of others) if (raw[key] !== undefined) item[key] = raw[key] ?? null;
    if (raw.box !== undefined) item.box = raw.box ?? null;
    return item;
  });
  const path = join(target, "comments.json");
  try {
    writeNew(path, `${JSON.stringify({ schema_version: ROUND_VERSION, round, items: written }, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const next = freeRound(join(folder, roundsFolder(name)));
      throw new Refusal(
        `round ${round} of ${name} is saved already: never overwrite a round file; export the next round from a page built after this one, or pass --round ${next} with its ids written r${next}-<n>`,
        "request.exists",
      );
    }
    throw error;
  }
  return path;
}
