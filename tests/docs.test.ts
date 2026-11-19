// The documents a reader starts from, held to the code. The technical specification: its generated parts are what
// the code gives now, every name it states is one the code has, it leaves out no test file, tool, or viewer module, and
// its example builds. The product specification: each link into the technical specification, and back, names a heading
// that is there, and each command and flag it states is the code's. The README: it copies no list the code owns, and
// each of its links reaches a file and a heading that are there. Every diagram: its classes are CONTRIBUTING.md's.
// The skill: it has its form, it states no fact the guide prints outside its one worked example, that example and the
// round files of its references run as written, and its evals file holds its cold run as the cold run's page states it.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RULES } from "../src/checks/rules.ts";
import { COMMANDS, GLOBAL, parse } from "../src/cli/arguments.ts";
import { FAMILIES } from "../src/finding.ts";
import { PREFIX, VOCABULARY } from "../src/format.ts";
import { guideText } from "../src/guide.ts";
import { filled } from "../tools/tech-spec.ts";
import { cli, json, project, REPOSITORY, schema } from "./helpers.ts";

const read = (path: string): string => readFileSync(join(REPOSITORY, path), "utf8");
const SPEC = read("docs/tech-spec.md");
const SKILL = read("skills/prototyping/SKILL.md");
const CHECKLIST = read("skills/prototyping/references/review-checklist.md");
const ROUND = read("skills/prototyping/references/review-round.md");
const BROWSER = process.env.PROTOTYPE_BROWSER_TESTS === "1";

type Finding = { rule: string; level: string; message: string };

/** Each fenced block of a page, with the word after its fence. */
const blocks = (page: string): (readonly [kind: string, text: string])[] =>
  [...page.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((found) => [found[1] ?? "", found[2] ?? ""] as const);
const block = (page: string, kind: string, holding = ""): string => blocks(page).find(([found, text]) => found === kind && text.includes(holding))?.[1] ?? "";
/** A page with its fenced blocks taken out, where a style's custom property would read as a flag. */
const prose = (page: string): string => page.replace(/```[\s\S]*?```/g, "");
/** Each text a page writes as code, inside one pair of backticks. */
const coded = (page: string): string[] => [...prose(page).matchAll(/`([^`\n]+)`/g)].map((found) => found[1] ?? "");

function filesBelow(folder: string, ends: string): string[] {
  return readdirSync(join(REPOSITORY, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesBelow(join(folder, entry.name), ends) : entry.name.endsWith(ends) ? [join(folder, entry.name)] : [],
  );
}

const FLAGS = new Set([
  "--help",
  "--version",
  ...Object.keys(GLOBAL).map((name) => `--${name}`),
  ...Object.values(COMMANDS).flatMap((spec) => Object.keys(spec.flags).map((name) => `--${name}`)),
]);
const NAMES = new Set<string>(Object.values(VOCABULARY).flat());
const RULE_IDS = new Set<string>(RULES.map((rule) => rule.id));
const FLAG = /(?<![\w-])--[a-z][a-z-]*/g;
const FILE_ENDS = /\.(?:html|json|md|ts|css|png|svg)$/;
/** A text shaped as a rule's id: a family, a stop, and a name that is no file's. */
const ruleShaped = (text: string): boolean =>
  /^[a-z]+\.[a-z][a-z-]*$/.test(text) && Object.hasOwn(FAMILIES, text.slice(0, text.indexOf("."))) && !FILE_ENDS.test(text);
/** The names of the format a text holds, each without the prefix. */
const formatNames = (text: string): string[] => [...text.matchAll(new RegExp(`${PREFIX}([a-z][a-z-]*)`, "g"))].map((found) => found[1] ?? "");

// The README is a stranger's first page. The four lists the code owns, its settings, commands, families, and exit
// codes, are in the reference, which the code writes, so the README copies none of them and links to the reference.
describe("the README", () => {
  const README = read("README.md");
  test("copies no list the code owns, and links to the reference that holds them", () => {
    const rows = (pattern: RegExp) => [...README.matchAll(pattern)].map((found) => found[1]);
    expect([rows(/^\| `([a-z_-]+)` \|/gm), rows(/^- \*\*`([a-z]+)`/gm), rows(/^\| ([0-9]+) \|/gm), README.includes("<!-- generated:")]).toEqual([
      [],
      [],
      [],
      false,
    ]);
    expect(README).toContain("(docs/reference.md)");
  });
  test("its links to files of the repository and to their headings are there", () => {
    const links = [...README.matchAll(/\]\(((?!https?:)[^)#]+)(?:#([^)]+))?\)/g)].map((found) => [found[1] ?? "", found[2]] as const);
    expect(links.length).toBeGreaterThan(8);
    const slug = (heading: string) =>
      heading
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "")
        .replaceAll(" ", "-");
    const missing = links.filter(([path, anchor]) => {
      if (!existsSync(join(REPOSITORY, path))) return true;
      if (!anchor) return false;
      const headings = [...read(path).matchAll(/^#+ (.+)$/gm)].map((found) => slug(found[1] ?? ""));
      return !headings.includes(anchor);
    });
    expect(missing).toEqual([]);
  });
});

// The eight classes of a diagram have one home, the code block of CONTRIBUTING.md's "Diagrams" part, so every
// diagram is held to that block, never to a copy of it here.
const DIAGRAM_CLASSES = block(read("CONTRIBUTING.md").slice(read("CONTRIBUTING.md").indexOf("## Diagrams")), "text", "classDef default")
  .trim()
  .split("\n");

/** Each Markdown file of the repository, outside its dependencies, its output, and its hidden folders. */
function markdownFiles(folder = ""): string[] {
  return readdirSync(join(REPOSITORY, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return entry.name.startsWith(".") || entry.name === "node_modules" ? [] : markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

test("every diagram copies its classes from CONTRIBUTING.md's eight, defines default, and draws a person as a stadium or a hexagon", () => {
  const diagrams = markdownFiles().flatMap((path) =>
    blocks(read(path))
      .filter(([kind]) => kind === "mermaid")
      .map(([, text]) => [path, text] as const),
  );
  expect(diagrams.length).toBeGreaterThan(0);
  expect(DIAGRAM_CLASSES.map((line) => line.split(" ")[1])).toEqual(["default", "group", "boundary", "focus", "human", "added", "changed", "removed"]);
  for (const [path, text] of diagrams) {
    const lines = text.split("\n").map((line) => line.trim());
    const defined = lines.filter((line) => line.startsWith("classDef "));
    expect([path, defined.filter((line) => !DIAGRAM_CLASSES.includes(line))]).toEqual([path, []]);
    if (/^(?:flowchart|graph)\b/.test(lines[0] ?? "")) expect([path, defined.some((line) => line.startsWith("classDef default "))]).toEqual([path, true]);
    // A node takes a class by a class line, `class a,b human`, or by its own `:::human`.
    const people = [
      ...lines.flatMap((line) => /^class ([\w,]+) human$/.exec(line)?.[1]?.split(",") ?? []),
      ...[...text.matchAll(/([\w-]+)[^\s]*:::human\b/g)].map((found) => found[1] ?? ""),
    ];
    for (const id of people) {
      const shapes = [...text.matchAll(new RegExp(`(?<![\\w-])${id}([[({>])(.)`, "g"))].map((found) => `${found[1]}${found[2]}`);
      expect([path, id, shapes.length > 0 && shapes.every((shape) => shape === "([" || shape === "{{")]).toEqual([path, id, true]);
    }
  }
});

describe("the technical specification", () => {
  test("its generated parts are what the code gives now: run `bun tools/tech-spec.ts` after a change to what they read", () => {
    expect(filled(SPEC) === SPEC).toBe(true);
  });

  test("holds its fifteen sections, in their order", () => {
    const numbers = [...SPEC.matchAll(/^## (\d+)\. /gm)].map((found) => Number(found[1]));
    expect(numbers).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
  });

  test("every file it names is in the repository", () => {
    const paths = coded(SPEC).filter(
      (text) => /^(?:src|viewer|tests|tools|schemas|docs|assets|skills)\/[\w./-]+$/.test(text) && (FILE_ENDS.test(text) || text.endsWith("/")),
    );
    expect(paths.length).toBeGreaterThan(80);
    expect(paths.filter((path) => !existsSync(join(REPOSITORY, path)))).toEqual([]);
    for (const path of ["README.md", "AGENTS.md", "CHANGELOG.md", "package.json"]) expect(existsSync(join(REPOSITORY, path))).toBe(true);
  });

  test("every rule, name of the format, flag, and command it states is one the code has", () => {
    const rules = coded(SPEC).filter(ruleShaped);
    expect(rules.length).toBeGreaterThan(30);
    expect(rules.filter((id) => !RULE_IDS.has(id))).toEqual([]);
    expect(formatNames(SPEC).filter((name) => !NAMES.has(name) && !name.startsWith("arg-"))).toEqual([]);
    expect((prose(SPEC).match(FLAG) ?? []).filter((flag) => !FLAGS.has(flag))).toEqual([]);
    const commands = [...prose(SPEC).matchAll(/`open-prototype ([a-z][a-z-]*)/g)].map((found) => found[1] ?? "");
    expect(commands.filter((name) => !Object.hasOwn(COMMANDS, name))).toEqual([]);
  });

  test("leaves out no command, no test file, no tool, and no module of the viewer", () => {
    const named = new Set(coded(SPEC));
    const wanted = [...filesBelow("tests", ".test.ts"), ...filesBelow("tools", ".ts"), ...filesBelow("viewer", ".ts")].map((path) =>
      path.split("\\").join("/"),
    );
    expect(wanted.length).toBeGreaterThan(50);
    expect(wanted.filter((path) => !named.has(path))).toEqual([]);
    expect(Object.keys(COMMANDS).filter((name) => !named.has(name))).toEqual([]);
  });

  test("links every list the code owns to the reference, and copies none", () => {
    for (const part of ["the-vocabulary", "rules", "commands", "settings", "exit-codes", "modules"]) expect(SPEC).toContain(`(reference.md#${part})`);
    // A table of the reference has a row for each rule; this page names a rule only where it explains one.
    expect(SPEC).not.toMatch(/\| Rule \| Family \| Level \| Since \|/);
    expect(SPEC).not.toMatch(/\| Attribute \| Kind \| Meaning \|/);
  });

  test("its example passes the check with no finding, and builds", async () => {
    const folder = project({ "design/loans.html": block(SPEC, "html") });
    const checked = await cli(folder, "check", "--json", "design/loans.html");
    expect([checked.code, json<{ findings: Finding[] }>(checked).findings]).toEqual([0, []]);
    expect((await cli(folder, "build", "design/loans.html")).code).toBe(0);
    // The line the page says the check prints is the line it prints.
    expect(SPEC).toContain(`\`${(await cli(folder, "check", "design/loans.html")).out}\``);
  });
});

/** Each heading's anchor, as a Markdown host writes it: lowercase, its punctuation dropped, a space a hyphen. */
const anchors = (page: string): Set<string> =>
  new Set(
    [...page.matchAll(/^#{1,6} (.+)$/gm)].map((found) =>
      (found[1] ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .replace(/ /g, "-"),
    ),
  );
/** Each anchor a page links to in another page, or in itself when `file` is empty. */
const linked = (page: string, file: string): string[] =>
  [...page.matchAll(new RegExp(`\\]\\(${file.replace(".", "\\.")}#([\\w-]+)\\)`, "g"))].map((found) => found[1] ?? "");

// The product specification says what and why, and links each statement to the technical specification's section
// that makes it true; the technical specification links back for what comes later. A link to a heading that is gone
// fails here, so a renamed section is renamed in both.
describe("the product specification", () => {
  const PRODUCT = read("docs/product-spec.md");

  test("every link into the technical specification, and back, names a heading that page has", () => {
    const links = linked(PRODUCT, "tech-spec.md");
    expect(links.length).toBeGreaterThan(40);
    expect(links.filter((anchor) => !anchors(SPEC).has(anchor))).toEqual([]);
    const back = linked(SPEC, "product-spec.md");
    expect(back.length).toBeGreaterThan(3);
    expect([...back, ...linked(PRODUCT, "")].filter((anchor) => !anchors(PRODUCT).has(anchor))).toEqual([]);
  });

  test("every command and flag it states is one the code has", () => {
    expect(
      [...prose(PRODUCT).matchAll(/`open-prototype ([a-z][a-z-]*)/g)].map((found) => found[1] ?? "").filter((name) => !Object.hasOwn(COMMANDS, name)),
    ).toEqual([]);
    expect((prose(PRODUCT).match(FLAG) ?? []).filter((flag) => !FLAGS.has(flag))).toEqual([]);
  });
});

describe("the skill", () => {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(SKILL);
  const fields = new Map((front?.[1] ?? "").split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()] as const));
  const body = SKILL.slice(front?.[0].length ?? 0);
  // The one worked example, in a reference of its own that the loop links once; the body is all outside it.
  const example = read("skills/prototyping/references/small-design.md");
  const outside = body;
  const evals = "skills/prototyping/evals";

  test("has the form of an agent skill: a name, a description that says when to load it, and a short body", () => {
    expect(fields.get("name")).toBe("prototyping");
    const description = fields.get("description") ?? "";
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThan(400);
    expect(description.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(2);
    expect(description).toMatch(/^[A-Z][a-z]+s /);
    expect(description).toContain("Load it when");
    expect(body.trimEnd().split("\n").length).toBeLessThanOrEqual(120);
  });

  test("names each of its reference files, and each one it names exists", () => {
    const folder = "skills/prototyping/references";
    const linked = [...body.matchAll(/\]\((references\/[\w.-]+)\)/g)].map((found) => found[1] ?? "");
    expect(linked.sort()).toEqual(
      readdirSync(join(REPOSITORY, folder))
        .map((name) => `references/${name}`)
        .sort(),
    );
    expect([existsSync(join(REPOSITORY, evals, "cold-run.md")), existsSync(join(REPOSITORY, evals, "evals.json"))]).toEqual([true, true]);
    expect(body.split("(references/small-design.md)").length).toBe(2);
  });

  test("holds judgment and the loop: outside its one worked example it states no name of the format, no flag, and no rule", () => {
    expect(example).toContain(PREFIX);
    for (const [where, text] of [
      ["SKILL.md", outside],
      ["review-checklist.md", CHECKLIST],
      ["review-round.md", ROUND],
    ] as const) {
      expect([where, formatNames(text)]).toEqual([where, []]);
      expect([where, text.match(FLAG) ?? []]).toEqual([where, []]);
      expect([where, coded(text).filter(ruleShaped)]).toEqual([where, []]);
    }
    expect(body).toContain("`open-prototype guide`");
  });

  test("is generic: no harness's name, and no path outside the project", () => {
    const references = ["draft-copy.md", "no-person.md", "small-design.md"].map((name) => read(`skills/prototyping/references/${name}`));
    for (const text of [SKILL, CHECKLIST, ROUND, ...references, read(`${evals}/cold-run.md`), read(`${evals}/evals.json`)]) {
      expect(text.match(/\b(?:claude|codex|copilot|gemini|windsurf|aider|opencode|antigravity|muse)\b/gi) ?? []).toEqual([]);
      expect(text.match(/(?:^|[\s`"(])(?:~\/|\/(?:Users|home|usr|etc|tmp|var|opt)\b)[^\s`"]*/gm) ?? []).toEqual([]);
    }
  });

  test("says never to open a design file one did not write, as the README does", () => {
    for (const text of [body, read("README.md")])
      expect([text.includes("Never open a design file you did not write"), text.includes("`open-prototype serve`")]).toEqual([true, true]);
  });

  test("its review checklist holds eleven checks, and the four rules of a control in a group", () => {
    const rows = [...CHECKLIST.matchAll(/^\| (\d+) \| /gm)].map((found) => Number(found[1]));
    expect(rows).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    for (const rule of ["K8", "K9", "K10", "K11"]) expect(CHECKLIST).toContain(`| ${rule} | `);
  });

  test("its round reference names a comment's type by the four words the tool reads, and says the contrast check with no command is not run", () => {
    const types = schema("round-comments") as unknown as { properties: { items: { items: { properties: { type: { enum: string[] } } } } } };
    const words = types.properties.items.items.properties.type.enum.map((word) => `\`${word}\``);
    expect(ROUND).toContain(`its type: ${words.slice(0, -1).join(", ")}, or ${words.at(-1)}.`);
    expect([ROUND.includes("contrast"), ROUND.includes('"not run"')]).toEqual([true, true]);
  });

  test("it gives a way to propose draft copy, a path for a run with no person, a second reader, the tool's own form, which names win, and a way to measure", () => {
    const draft = read("skills/prototyping/references/draft-copy.md");
    const alone = read("skills/prototyping/references/no-person.md");
    expect([
      body.includes("(references/draft-copy.md)"),
      draft.includes("draft"),
      body.includes("(references/no-person.md)"),
      alone.includes("step 6"),
      body.includes("second reader"),
      body.includes("`bun run <the tool's folder>/src/cli.ts`"),
      body.includes("use the story index's names"),
      CHECKLIST.includes("`open-prototype serve`"),
    ]).toEqual([true, true, true, true, true, true, true, true]);
  });

  test("its step on looking says what to do with a check that needs a browser the agent does not have", () => {
    // The step, from its first line to the next step's.
    const look = /\n5\. \*\*Look at every view\.\*\*[\s\S]*?(?=\n6\. )/.exec(body)?.[0] ?? "";
    expect([look.includes("browser"), look.includes('"not run"')]).toEqual([true, true]);
  });

  test("its evals file holds the cold run as its page states it, and trigger queries, half that should load the skill", () => {
    type Evals = { skill_name: string; evals: { prompt: string; assertions: string[] }[]; trigger_queries: { query: string; should_trigger: boolean }[] };
    const data = JSON.parse(read(`${evals}/evals.json`)) as Evals;
    const page = read(`${evals}/cold-run.md`);
    const request = page.split("## The request\n\n")[1]?.split("\n\n")[0]?.trim();
    const ticks = [...(page.split("## The pass checks\n")[1]?.split("\n## ")[0] ?? "").matchAll(/^- \[ \] (.*)$/gm)].map((found) => found[1] ?? "");
    expect([data.skill_name, data.evals.length, data.evals[0]?.prompt, data.evals[0]?.assertions]).toEqual(["prototyping", 1, request, ticks]);
    const queries = data.trigger_queries;
    expect(queries.length).toBeGreaterThanOrEqual(16);
    expect(new Set(queries.map((entry) => entry.query)).size).toBe(queries.length);
    expect(queries.filter((entry) => entry.should_trigger).length * 2).toBe(queries.length);
  });

  test("its worked example counts the views as the list does", async () => {
    const stated = /`open-prototype shots` lists (\d+) views/.exec(example)?.[1];
    const folder = project({ "design/items.html": block(example, "html") });
    expect([stated, String(json<{ shots: unknown[] }>(await cli(folder, "shots", "design/items.html")).shots.length)]).toEqual(["14", "14"]);
  });

  test("its worked example runs as written, and so do the round files of its reference", async () => {
    const file = /Save it as `([\w./-]+)`/.exec(example)?.[1] ?? "";
    expect(file).toBe("design/items.html");
    const folder = project({ [file]: block(example, "html") });
    const commands = block(example, "sh").trim().split("\n");
    expect(commands.length).toBeGreaterThan(3);
    for (const line of commands) {
      expect(line.startsWith("open-prototype ")).toBe(true);
      const argv = line.slice("open-prototype ".length).split(/\s+/);
      // A capture starts a browser, so it runs with the browser tests; without them its words are still read.
      if (argv.includes("--capture") && !BROWSER) expect([line, parse(argv, "0").command]).toEqual([line, "shots"]);
      else expect([line, (await cli(folder, ...argv)).code]).toEqual([line, 0]);
    }
    // A reviewer's round, saved, then answered by the next round's changes file, at the path the reference names, each file the guide's example.
    // The reference keeps the steps; the guide gives each file's shape, with one example, from the schema.
    expect(blocks(ROUND).filter(([kind]) => kind === "json")).toEqual([]);
    const shapeExample = (file: string) =>
      guideText(Object.keys(COMMANDS))
        .split("\n")
        .slice(
          guideText(Object.keys(COMMANDS))
            .split("\n")
            .findIndex((line) => line.startsWith(`  ${file}:`)),
        )
        .find((line) => line.startsWith("    {"))
        ?.trim() ?? "";
    writeFileSync(join(folder, "comments.json"), shapeExample("comments.json"));
    const saved = await cli(folder, "save-comments", "comments.json", file);
    expect([saved.code, saved.out.split("\n")[0]]).toEqual([0, "saved design/rounds/items/1/comments.json"]);
    const changes = /that file is `([\w./-]+)`/.exec(ROUND)?.[1] ?? "";
    expect(changes).toBe("design/rounds/items/2/changes.json");
    mkdirSync(dirname(join(folder, changes)), { recursive: true });
    writeFileSync(join(folder, changes), shapeExample("changes.json"));
    const checked = await cli(folder, "check", "--json", file);
    expect([checked.code, json<{ findings: Finding[] }>(checked).findings]).toEqual([0, []]);
    const page = readFileSync(join(folder, ".prototype/views", file), "utf8");
    expect((await cli(folder, "build", file)).code).toBe(0);
    expect(readFileSync(join(folder, ".prototype/views", file), "utf8")).not.toBe(page);
    expect(readFileSync(join(folder, ".prototype/views", file), "utf8")).toContain("answered_by");
  }, 60_000);
});

describe("the code's own words", () => {
  // A comment or a test's name says what it means in words. An id of a review kept outside this repository means nothing
  // to a reader here, so the one id they may cite is a rule of the skill's review checklist, and C0 and C1 name the two
  // sets of control characters. An SVG path such as "M0 0" is no id. A lower-case round and a finding's number, joined
  // by a hyphen, are an id too, but a comment's id, "r1-1", is the format's own. A review's round named in words, such
  // as a round of fixes or the last review, means nothing here either.
  const ID = /(?<![\w#%&./-])(?:[a-z][0-9] )?[A-Z][0-9]{1,2}(?:-[A-Z]?[0-9]+)?(?![\w-]| [0-9])/g;
  const ROUND_ID = /(?<![\w#%&./-])[a-qs-z][0-9]{1,2}-[0-9]+(?![\w])/g;
  const ROUND_WORDS = /\bfix(?:es)? round\b|\bfinal review\b|\bstep [0-9]+ fix/gi;
  const KNOWN = new Set([...[...CHECKLIST.matchAll(/^\| ([A-Z][0-9]+) \| /gm)].map((found) => found[1] ?? ""), "C0", "C1"]);
  const files = (folder: string): string[] =>
    readdirSync(join(REPOSITORY, folder), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(folder, entry.name)) : /\.(ts|css)$/.test(entry.name) ? [join(folder, entry.name)] : [],
    );
  test("no test, no tool, and no part of the source or the viewer cites a review by an id or names its round", () => {
    const cited = [...files("src"), ...files("viewer"), ...files("tests"), ...files("tools")].flatMap((file) =>
      [...read(file).matchAll(ID), ...read(file).matchAll(ROUND_ID), ...read(file).matchAll(ROUND_WORDS)]
        .map((found) => found[0])
        .filter((id) => !KNOWN.has(id))
        .map((id) => `${file}: ${id}`),
    );
    expect(cited).toEqual([]);
  });
});

test("the guide's commands are the command line's own table, in its order", async () => {
  const listed = (await cli(project(), "guide")).out.split("\nCommands\n")[1]?.split("\n  `")[0]?.replace(/\s+/g, " ").trim();
  expect(listed).toBe(`${Object.keys(COMMANDS).join(", ")}.`);
  expect(guideText(["one", "two"])).toContain("\nCommands\n  one, two.\n");
});

test("the settings' keys are one table: the guide lists each row, and an unknown key's refusal names them in its order", async () => {
  const { SETTINGS } = await import("../src/project.ts");
  const guide = (await cli(project(), "guide")).out.split("\nSettings\n")[1]?.split("\nCommands\n")[0] ?? "";
  expect(guide.split("\n").flatMap((line) => /^ {4}([a-z_]+) /.exec(line)?.[1] ?? [])).toEqual(SETTINGS.map((setting) => setting.key));
  const refused = await cli(project({ "prototype.config.json": '{ "nope": 1 }', "design/a.html": "" }), "check", "design/a.html");
  expect(refused.err).toContain(`use ${SETTINGS.map((setting) => `\`${setting.key}\``).join(", ")} [request.settings]`);
});
