// Fills the parts of docs/tech-spec.md that the code owns, so no one types them: each command's usage and the keys of
// its JSON, the limits, the device frames, and what the public entry exports. A part sits between two marks,
// `<!-- generated:<name> ... -->` and `<!-- /generated:<name> -->`. The settings are in the reference, which
// `open-prototype guide --reference` writes.
//   bun tools/tech-spec.ts           writes the parts again
//   bun tools/tech-spec.ts --check   writes nothing, and exits 1 when a part is stale
// `tests/docs.test.ts` holds the same check.
import { join, resolve } from "node:path";
import outputSchema from "../schemas/output.schema.json" with { type: "json" };
import changesSchema from "../schemas/round-changes.schema.json" with { type: "json" };
import { shippedDevices } from "../src/assets.ts";
import { COMMANDS, usage } from "../src/cli/arguments.ts";
import { ROUND_LIMITS } from "../src/contract.ts";
import { READ_LIMITS } from "../src/format.ts";
import * as entry from "../src/index.ts";

const ROOT = resolve(import.meta.dir, "..");
export const TECH_SPEC = join(ROOT, "docs/tech-spec.md");

/** A table cell: text outside code writes `<` as an entity; text inside a code span is shown as written. */
const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("<", "&lt;");
const code = (text: string): string => `\`${text.replaceAll("|", "\\|")}\``;
const count = (value: number): string => value.toLocaleString("en-US");

/** The keys every command's JSON holds, which `schemas/output.schema.json` requires of each. */
const COMMON: readonly string[] = outputSchema.required;

/** Each command, in the order the help lists them: its usage line, and the keys of its JSON beside the common ones. */
function commands(): string {
  const shapes = outputSchema.$defs as Record<string, { properties?: Record<string, unknown> }>;
  const rows = Object.entries(COMMANDS).map(([name, spec]) => {
    const own = Object.keys(shapes[name]?.properties ?? {}).filter((key) => !COMMON.includes(key));
    if (spec.json && !shapes[name]) throw new Error(`schemas/output.schema.json has no shape for ${name}`);
    const keys = !spec.json ? "prints no JSON" : own.map((key) => `\`${key}\``).join(", ");
    return `| \`${name}\` | ${code(usage(name).replace(/^usage: /, ""))} | ${keys} |`;
  });
  return ["| Command | Usage | Its own keys with `--json` |", "| --- | --- | --- |", ...rows].join("\n");
}

/** What each limit bounds. A limit with no line here stops this tool, so a new limit gets its meaning. */
const LIMIT_MEANS: Record<string, string> = {
  depth: "levels of nested elements; a deeper design is not read",
  uses: "blocks one flow, or one design, may place",
  expansion: "characters the blocks may add to a whole design",
  followed_value: "characters a custom property's value may reach with each `var()` in it followed; a longer one is a `read.var-limit` finding",
  findings: "findings `check` prints before it says how many more; a finding that stops the page is never cut, and problems fill it before notes",
  image: "bytes of one image a fixtures key names",
  images: "bytes of all the images of one page",
  font: "bytes of one font file an `@font-face` names; a larger one is an `integrity.font` finding, and the page carries none of it",
  fonts: "bytes of all the font files of one page",
  round_file: "bytes of a round file, or of the comments the save reads",
  tokens_file: "bytes of a tokens file",
  design_md: "bytes of the project's design document; a larger one is not read",
  design_file: "bytes of one file of a design: the design, a flow, or a block; a larger one is not read",
  picture_height: "pixels a captured picture runs below its frame's top; a taller view is pictured to here, with a `device.picture-height` note",
  comment_characters: "characters of one comment, counted in code points",
  comments_in_a_round: "comments in one round",
  rounds_shown: "earlier rounds a page shows, newest first",
  characters_in_all_rounds: "characters of all the rounds a page shows; the newest round shows whole, past it",
  changes_in_a_round: "changes in one round's changes file",
};

/** The limits, in the order the code lists them: the read limits, then the limits of a round. */
function limits(): string {
  const tables: [owner: string, table: Record<string, number>][] = [
    ["`READ_LIMITS` in `src/format.ts`", READ_LIMITS],
    ["`limits` in `schemas/round-comments.schema.json`", ROUND_LIMITS],
    ["`maxItems` of `changes` in `schemas/round-changes.schema.json`", { changes_in_a_round: changesSchema.properties.changes.maxItems }],
  ];
  const rows = tables.flatMap(([owner, table]) =>
    Object.entries(table).map(([name, value]) => {
      const means = LIMIT_MEANS[name];
      if (!means) throw new Error(`the limit ${name} has no line in LIMIT_MEANS of tools/tech-spec.ts: say what it bounds`);
      return `| \`${name}\` | ${count(value)} | ${means} | ${owner} |`;
    }),
  );
  return ["| Limit | Value | Bounds | Owner |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

/** The device frames, in the order of the viewer's menu, then the frames a full pass of shots takes for each platform. */
function frames(): string {
  const devices = shippedDevices();
  const rows = Array.from(devices.frames, ([id, frame]) => {
    const bars = frame.safe_area ? `${frame.safe_area.top} top, ${frame.safe_area.bottom} bottom` : "none";
    return `| \`${id}\` | ${cell(frame.name)} | ${frame.platform} | ${frame.width} by ${frame.height} | ${bars} |`;
  });
  const shots = Object.entries(devices.shots).map(([platform, ids]) => `${platform}: ${ids.map((id) => `\`${id}\``).join(", ")}`);
  return [
    "| Id | Name | Platform | Size, CSS px | System bars, CSS px |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Frames a full pass of shots takes, for each declared platform: ${shots.join("; ")}.`,
  ].join("\n");
}

/** Every value the public entry exports, in alphabetical order. A type it exports has no value, so it is not listed. */
function entryNames(): string {
  return `${Object.keys(entry)
    .sort()
    .map((name) => `\`${name}\``)
    .join(", ")}.`;
}

/** Each generated part, by its name in the page. */
export const PARTS: Record<string, () => string> = { commands, limits, frames, entry: entryNames };

/**
 * The page with every generated part written again. A part the page marks and the code does not know is a mistake, and
 * so is a part of `required` the page lacks: the specification holds every part.
 */
export function filled(page: string, file = "docs/tech-spec.md", required: readonly string[] = Object.keys(PARTS)): string {
  const seen = new Set<string>();
  const out = page.replace(/(<!-- generated:([a-z-]+)[^>]*-->\n)[\s\S]*?(<!-- \/generated:\2 -->)/g, (_whole, open: string, name: string, close: string) => {
    const part = PARTS[name];
    if (!part) throw new Error(`${file} marks a generated part \`${name}\`, which tools/tech-spec.ts does not write`);
    seen.add(name);
    return `${open}${part()}\n${close}`;
  });
  for (const name of required)
    if (!seen.has(name))
      throw new Error(`${file} lacks the generated part \`${name}\`: mark it with <!-- generated:${name} --> and <!-- /generated:${name} -->`);
  return out;
}

/** The pages whose parts this writes: the specification, every part. */
export const PAGES: { file: string; required: readonly string[] }[] = [{ file: "docs/tech-spec.md", required: Object.keys(PARTS) }];

if (import.meta.main) {
  const check = process.argv.includes("--check");
  let stale = false;
  for (const { file, required } of PAGES) {
    const path = join(ROOT, file);
    const page = await Bun.file(path).text();
    const now = filled(page, file, required);
    if (now === page) console.log(`${file}: its generated parts are up to date`);
    else if (check) {
      console.error(`${file}: a generated part is stale: run \`bun tools/tech-spec.ts\``);
      stale = true;
    } else {
      await Bun.write(path, now);
      console.log(`wrote ${file}: its generated parts`);
    }
  }
  if (stale) process.exit(1);
}
