// Review rounds on disk, one layout for both kinds of design: `<design folder>/rounds/<design name>/<N>/comments.json`
// holds a round's comments, and `changes.json` there names the comments that round answers. The design's name is its
// file's stem. Reading the rounds is pure, over the files `readFiles` read; `save.ts` writes a new
// round, never over a file. The limits are one table, in the comments schema, and nothing is ever cut in silence.
import changesSchema from "../../schemas/round-changes.schema.json" with { type: "json" };
import { COMMENT_CONTROL, COMMENT_ID, COMMENT_KEYS, type EarlierItem, type EarlierRound, ROUND_LIMITS } from "../contract.ts";
import { type Finding, finding } from "../finding.ts";
import { COMMENT_TYPES, isCommentType, isTheme, PROGRAM, ROUND_VERSION, ROUNDS, THEMES } from "../format.ts";
import { isObject, type Json, type JsonObject, readJson } from "../json.ts";
import { length, quoted, shown } from "../text.ts";

/** The round files beside a design, by path in its folder, as text or with why they are left out. */
type RoundFiles = ReadonlyMap<string, string | { why: string }>;

/** A round's folder: its number, 1 to 9999, written with no leading zero, as `save-comments` writes it. */
const ROUND = /^[1-9][0-9]{0,3}$/;
/** A folder that reads as a number, which the disk stage reads so a round in a folder of another name is a finding. */
const NUMBERED = /^[0-9]{1,4}$/;
/** The most changes one changes file holds: its schema's own limit. */
const MAX_CHANGES = changesSchema.properties.changes.maxItems;
const ITEM_KEYS: ReadonlySet<string> = new Set(COMMENT_KEYS);
const COMMENTS_KEYS = new Set(["schema_version", "round", "items"]);
const CHANGES_KEYS = new Set(["schema_version", "changes"]);
const CHANGE_KEYS = new Set(["summary", "answers", "screen", "state"]);

/** The folder of a design's rounds, inside its own folder. */
export function roundsFolder(name: string): string {
  return `${ROUNDS}/${name}`;
}

/** What is wrong with one comment, as the save and the build read it alike; `round` is the round its file holds. */
function itemProblems(raw: Json, round: number, where: string): string[] {
  if (!isObject(raw)) return [`${where} is not a JSON object`];
  const problems: string[] = [];
  const id = typeof raw.id === "string" ? raw.id : "";
  const named = COMMENT_ID.exec(id);
  if (!named) problems.push(`${where} has a missing or invalid id ${shown(raw.id ?? null)}: write r<round>-<n>, such as r${round}-1`);
  else if (Number(named[1]) !== round) problems.push(`comment \`${id}\` names round ${named[1]}, but it is in round ${round}: its id is r${round}-<n>`);
  const label = named ? `comment \`${id}\`` : where;
  for (const key of Object.keys(raw))
    if (!ITEM_KEYS.has(key)) problems.push(`${label} holds \`${quoted(key)}\`, which a round file has no place for: take it out`);
  for (const key of ["screen", "state", "comment"] as const)
    if (typeof raw[key] !== "string" || raw[key] === "") problems.push(`${label} needs \`${key}\` as a text`);
  if (typeof raw.comment === "string") {
    if (length(raw.comment) > ROUND_LIMITS.comment_characters)
      problems.push(
        `${label} has a comment of ${length(raw.comment)} characters, more than the ${ROUND_LIMITS.comment_characters} a comment holds: shorten it, or split it into two`,
      );
    if (COMMENT_CONTROL.test(raw.comment)) problems.push(`${label} holds a control character: a comment holds text, tabs, and line breaks only`);
  }
  if (raw.type !== undefined && !(COMMENT_TYPES as readonly Json[]).includes(raw.type))
    problems.push(`${label} has the type ${shown(raw.type)}: use ${COMMENT_TYPES.join(", ")}`);
  for (const key of ["testid", "frame", "theme", "link", "by"] as const)
    if (raw[key] !== undefined && typeof raw[key] !== "string") problems.push(`${label} needs \`${key}\` as a text`);
  if (raw.shown_theme !== undefined && !(THEMES as readonly Json[]).includes(raw.shown_theme))
    problems.push(`${label} has the shown theme ${shown(raw.shown_theme)}: use ${THEMES.join(" or ")}`);
  if (typeof raw.by === "string" && !/^\S+$/.test(raw.by))
    problems.push(`${label} names its writer ${shown(raw.by)}: write it with no space, such as agent:<harness>/<model>`);
  if (raw.index !== undefined && !(typeof raw.index === "number" && Number.isInteger(raw.index) && raw.index >= 0))
    problems.push(`${label} needs \`index\` as a whole number from 0`);
  const box = raw.box;
  const keys = ["x", "y", "width", "height"] as const;
  const good =
    box === undefined ||
    box === null ||
    (isObject(box) &&
      keys.every((key) => typeof box[key] === "number" && Number.isFinite(box[key])) &&
      Object.keys(box).every((key) => (keys as readonly string[]).includes(key)) &&
      Number(box.width) >= 0 &&
      Number(box.height) >= 0);
  if (!good) problems.push(`${label} needs \`box\` as x, y, width, and height in CSS px, with no negative size, or null`);
  return problems;
}

/**
 * Why a round file's `schema_version` stops its read, or "": a file without one reads as this tool's. A newer version
 * asks for a newer tool; anything else is no version.
 */
function roundVersionProblem(found: Json | undefined): string {
  if (found === undefined || found === ROUND_VERSION) return "";
  if (typeof found === "string" && /^[1-9][0-9]{0,8}$/.test(found) && Number(found) > Number(ROUND_VERSION)) {
    return `is round file version ${found}, newer than this tool's ${ROUND_VERSION}: update the tool, with \`${PROGRAM} --version\` to see which you have`;
  }
  return `names the version ${shown(found)}, which no round file has: write "${ROUND_VERSION}", or take \`schema_version\` out`;
}

/** The problems of a whole comments file for a round, or none. */
export function commentsProblems(data: JsonObject, round: number): string[] {
  const problems: string[] = [];
  const version = roundVersionProblem(data.schema_version);
  if (version) return [`the comments ${version}`];
  for (const key of Object.keys(data))
    if (!COMMENTS_KEYS.has(key)) problems.push(`the comments hold \`${quoted(key)}\`, which a round file has no place for: keep \`round\` and \`items\` only`);
  const items = data.items;
  if (!Array.isArray(items) || !items.length) return [...problems, "the comments need a non-empty `items` list"];
  if (items.length > ROUND_LIMITS.comments_in_a_round)
    problems.push(
      `the round holds ${items.length} comments, more than the ${ROUND_LIMITS.comments_in_a_round} a round holds: save the first ${ROUND_LIMITS.comments_in_a_round} as this round and the rest as the next`,
    );
  items.forEach((raw, index) => {
    problems.push(...itemProblems(raw, round, `item ${index + 1}`));
  });
  problems.push(...repeatedIds(items));
  return problems;
}

/** Each comment id a round holds twice: an answer that names it would answer both. */
function repeatedIds(items: Json[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const raw of items) {
    const id = isObject(raw) && typeof raw.id === "string" ? raw.id : "";
    if (id && seen.has(id)) problems.push(`comment \`${id}\` is in the round twice: give each comment its own id, r<round>-<n>`);
    seen.add(id);
  }
  return problems;
}

function parse(files: RoundFiles, path: string, findings: Finding[]): JsonObject | null {
  const found = files.get(path);
  if (found === undefined) return null;
  if (typeof found !== "string") {
    findings.push(finding("rounds.file", found.why, path));
    return null;
  }
  const read = readJson(found);
  if (!read.ok || !isObject(read.value)) {
    findings.push(finding("rounds.file", read.ok ? "is no JSON object, so it is left out" : `is not JSON (${read.error}), so it is left out`, path));
    return null;
  }
  // The version is read first: a newer file may hold what this tool has no place for, and that is not the file's fault.
  const version = roundVersionProblem(read.value.schema_version);
  if (version) {
    findings.push(finding("rounds.file", `${version}; it is left out`, path));
    return null;
  }
  return read.value;
}

/** The answers of a changes file, each comment id with the summary of the change that answers it, and each of its problems as a finding. */
function changesOf(data: JsonObject, path: string, findings: Finding[]): [id: string, summary: string][] {
  const answers: [string, string][] = [];
  for (const key of Object.keys(data))
    if (!CHANGES_KEYS.has(key)) findings.push(finding("rounds.key", `holds \`${quoted(key)}\`, which a changes file has no place for: keep \`changes\``, path));
  if (!Array.isArray(data.changes)) {
    findings.push(finding("rounds.field", "needs `changes` as a list", path));
    return answers;
  }
  if (data.changes.length > MAX_CHANGES)
    findings.push(
      finding("rounds.field", `holds ${data.changes.length} changes, more than the ${MAX_CHANGES} a changes file holds: keep the ones this round made`, path),
    );
  data.changes.forEach((change, index) => {
    const where = `change ${index + 1}`;
    if (!isObject(change)) {
      findings.push(finding("rounds.field", `${where} is not a JSON object`, path));
      return;
    }
    for (const key of Object.keys(change))
      if (!CHANGE_KEYS.has(key)) findings.push(finding("rounds.key", `${where} holds \`${quoted(key)}\`, which a change has no place for`, path));
    if (typeof change.summary !== "string" || change.summary === "")
      findings.push(finding("rounds.field", `${where} needs \`summary\`: what changed, in a sentence`, path));
    for (const key of ["screen", "state"] as const)
      if (change[key] !== undefined && (typeof change[key] !== "string" || change[key] === ""))
        findings.push(finding("rounds.field", `${where} needs \`${key}\` as a text, or none`, path));
    if (change.answers === undefined) return;
    if (!Array.isArray(change.answers) || !change.answers.every((item) => typeof item === "string")) {
      findings.push(finding("rounds.field", `${where} needs \`answers\` as a list of comment ids`, path));
      return;
    }
    const summary = typeof change.summary === "string" ? change.summary : "";
    for (const id of change.answers as string[]) answers.push([id, summary]);
  });
  return answers;
}

type Rounds = { rounds: EarlierRound[]; findings: Finding[] };
/** Each design's round files, read once for each name: the check and the page read the same rounds. */
const READ = new WeakMap<RoundFiles, Map<string, Rounds>>();

/** The earlier rounds beside a design, for the page and the check, and every problem in them as a finding. */
export function readRounds(files: RoundFiles, name: string): Rounds {
  let byName = READ.get(files);
  if (!byName) {
    byName = new Map();
    READ.set(files, byName);
  }
  let read = byName.get(name);
  if (!read) {
    read = parseRounds(files, name);
    byName.set(name, read);
  }
  return read;
}

function parseRounds(files: RoundFiles, name: string): Rounds {
  const findings: Finding[] = [];
  const top = roundsFolder(name);
  const folders = [...new Set([...files.keys()].filter((path) => path.startsWith(`${top}/`)).map((path) => path.slice(top.length + 1).split("/")[0] ?? ""))];
  for (const dir of folders.filter((dir) => NUMBERED.test(dir) && !ROUND.test(dir)))
    findings.push(
      finding(
        "rounds.file",
        "is no round's folder, so its files are left out: a round's folder is its number, 1 to 9999, with no leading zero; rename it",
        `${top}/${dir}`,
      ),
    );
  const numbers = folders
    .filter((dir) => ROUND.test(dir))
    .map(Number)
    .sort((a, b) => a - b);
  const all: EarlierRound[] = [];
  const answered = new Map<number, [id: string, summary: string][]>();
  for (const round of numbers) {
    const changesPath = `${top}/${round}/changes.json`;
    const changes = parse(files, changesPath, findings);
    if (changes) answered.set(round, changesOf(changes, changesPath, findings));
    const path = `${top}/${round}/comments.json`;
    const data = parse(files, path, findings);
    if (!data) continue;
    for (const key of Object.keys(data))
      if (!COMMENTS_KEYS.has(key)) findings.push(finding("rounds.key", `holds \`${quoted(key)}\`, which a round file has no place for`, path));
    if (data.round !== undefined && data.round !== round)
      findings.push(finding("rounds.field", `names round ${shown(data.round)}, but it is in the folder of round ${round}`, path));
    const items: EarlierItem[] = [];
    const listed = Array.isArray(data.items) ? data.items : [];
    // The save's limits hold for a round read from disk: no empty round, and no more comments than a round holds.
    if (Array.isArray(data.items) && !listed.length) findings.push(finding("rounds.field", "needs a non-empty `items` list", path));
    if (listed.length > ROUND_LIMITS.comments_in_a_round)
      findings.push(
        finding(
          "rounds.field",
          `holds ${listed.length} comments, more than the ${ROUND_LIMITS.comments_in_a_round} a round holds; the page shows the first ${ROUND_LIMITS.comments_in_a_round}: move the rest to a round of their own`,
          path,
        ),
      );
    listed.slice(0, ROUND_LIMITS.comments_in_a_round).forEach((raw, index) => {
      const problems = itemProblems(raw, round, `item ${index + 1}`);
      if (problems.length || !isObject(raw)) {
        for (const problem of problems) findings.push(finding("rounds.field", `${problem}; the page leaves it out`, path));
        return;
      }
      const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
      // The problems above hold each value to its list, so a type the file leaves out is a change, and a theme it leaves out is "".
      const type = text("type");
      const theme = text("shown_theme");
      if (items.some((item) => item.id === text("id"))) {
        findings.push(finding("rounds.field", `${repeatedIds([{ id: text("id") }, { id: text("id") }])[0]}; the page leaves the second out`, path));
        return;
      }
      items.push({
        id: text("id"),
        screen: text("screen"),
        state: text("state"),
        testid: text("testid"),
        comment: text("comment"),
        type: isCommentType(type) ? type : "change",
        by: text("by"),
        done: false,
        shown_theme: isTheme(theme) ? theme : "",
      });
    });
    if (!Array.isArray(data.items)) findings.push(finding("rounds.field", "needs `items` as a list", path));
    all.push({ round, items });
  }
  const known = new Map(all.flatMap((round) => round.items.map((item): [string, number] => [item.id, round.round])));
  for (const [round, answers] of answered) {
    for (const [id] of answers) {
      const from = known.get(id);
      if (from === undefined || from >= round)
        findings.push(
          finding(
            "rounds.answer",
            `answers ${quoted(id)}, which no earlier round holds: name a comment of a round before ${round}`,
            `${top}/${round}/changes.json`,
          ),
        );
    }
  }
  // A comment is answered by the first change of a later round that names it; the page carries that change's summary.
  // Each id's answers are gathered once, round by round, the first of each round kept, so the cost is the answers' count.
  const answersOf = new Map<string, { round: number; summary: string }[]>();
  for (const [later, answers] of [...answered].sort((a, b) => a[0] - b[0])) {
    for (const [id, summary] of answers) {
      const list = answersOf.get(id) ?? [];
      if (list.at(-1)?.round === later) continue;
      list.push({ round: later, summary });
      answersOf.set(id, list);
    }
  }
  for (const round of all) {
    for (const item of round.items) {
      const answer = answersOf.get(item.id)?.find((one) => one.round > round.round);
      if (!answer) continue;
      item.done = true;
      item.answered_by = { round: answer.round, summary: answer.summary };
    }
  }
  // The page shows the newest rounds, within the limits; each round it leaves out is a finding that names it.
  const visible: EarlierRound[] = [];
  let total = 0;
  for (const round of [...all].reverse()) {
    const size = round.items.reduce((sum, item) => sum + length(item.comment) + length(item.screen) + length(item.state) + length(item.id), 0);
    if (visible.length >= ROUND_LIMITS.rounds_shown || total + size > ROUND_LIMITS.characters_in_all_rounds) {
      findings.push(
        finding(
          "rounds.limit",
          `round ${round.round} is left out of the page: a page shows the newest ${ROUND_LIMITS.rounds_shown} rounds, ${ROUND_LIMITS.characters_in_all_rounds} characters in all`,
          `${top}/${round.round}/comments.json`,
        ),
      );
      continue;
    }
    total += size;
    visible.unshift(round);
  }
  return { rounds: visible, findings };
}
