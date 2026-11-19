#!/usr/bin/env bun
// The command line: it composes the stages, prints, and exits with one code from one table: 0 when it did its work,
// 1 when the design has a problem, 2 when the request was refused, 3 when the tool failed, and 130 or 143 after a
// signal. With --json a command prints one object on stdout; a refusal is always one line on stderr too.
import { readSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import manifest from "../package.json" with { type: "json" };
import { COMMANDS, type CommandName, HelpRequest, type Parsed, parse, UsageError } from "./cli/arguments.ts";
import { exists, faultMessage, finding, plural, printable, projectPath, shownPath, systemError } from "./cli/internal.ts";
import { referenceText } from "./cli/reference.ts";
import {
  buildCommand,
  captureShots,
  check,
  componentContract,
  countsOf,
  type Design,
  EXAMPLE_FILE,
  EXIT,
  type Files,
  type Finding,
  family,
  findingData,
  findingLine,
  guideData,
  guideText,
  levelOf,
  load,
  loadProject,
  missingStories,
  newDesign,
  newDesignMd,
  OUTPUT_VERSION,
  outputFolder,
  PROGRAM,
  type Project,
  page,
  pageStops,
  problemsOf,
  projectFacts,
  READ_LIMITS,
  Refusal,
  type RequestRule,
  type RuleId,
  readFiles,
  readRounds,
  readSource,
  readStoryIndex,
  removePage,
  rulesOff,
  saveRound,
  screensOf,
  serve,
  settingsFor,
  shotFrames,
  shotList,
  storiesOf,
  Unreadable,
  viewerAssets,
  writeExample,
  writePage,
} from "./index.ts";

/** The version, from the one place it is written. */
const VERSION: string = manifest.version;

type Io = { out(line: string): void; err(line: string): void };

/** What a command gives: its exit code, the one object it prints with --json, and the lines it prints without. */
type Result = { code: number; data: Record<string, unknown>; text: string[] };
type Command = (project: Project, parsed: Parsed, io: Io) => Promise<Result> | Result;

/**
 * The one envelope of every command's JSON: the version, whether the command did its work with no problem, the design
 * it names, the findings, then the command's own keys (`schemas/output.schema.json` holds each command's).
 */
function envelope(target: string | null, findings: Finding[], own: Record<string, unknown>, code: number): Record<string, unknown> {
  return { schema_version: OUTPUT_VERSION, ok: code === EXIT.done, target, findings: findings.map(findingData), ...own };
}

const done = (target: string | null, findings: Finding[], own: Record<string, unknown>, text: string[], code: number = EXIT.done): Result => ({
  code,
  data: envelope(target, findings, own, code),
  text,
});

function findingLines(findings: Finding[]): string[] {
  return findings.map((item) => `${levelOf(item.rule)}: ${findingLine(item)}`);
}

type Opened = { design: Design; files: Files };

/** The design a command names, read and loaded. */
function opened(project: Project, file: string): Opened {
  const files = readFiles(project, file);
  return { design: load(files), files };
}

function okLine(design: Design): string {
  if (!design.facts) return "";
  const counts = countsOf(design.facts);
  return `ok: ${plural(counts.screens, "screen")}, ${plural(counts.states, "state")}, ${plural(counts.test_ids, "test id")}`;
}

/** The last line of a design with problems: how many, and the files they are in, as each finding names them. */
function problemsLine(problems: Finding[], where: string): string {
  const files = [...new Set(problems.map((item) => printable(item.file ?? where)))];
  const named =
    files.length > 3
      ? `the ${files.length} files named above`
      : files.length > 1
        ? `${files.slice(0, -1).join(", ")} and ${files.at(-1)}`
        : (files[0] ?? where);
  return `${plural(problems.length, "problem")}; fix ${problems.length === 1 ? "it" : "them"} in ${named}`;
}

function checkCommand(project: Project, parsed: Parsed): Result {
  const file = parsed.args.file ?? "";
  const { design } = opened(project, file);
  const findings = check(design, project);
  const problems = problemsOf(findings);
  const code = problems.length ? EXIT.problems : EXIT.done;
  const text = [...findingLines(findings), problems.length ? problemsLine(problems, file) : okLine(design) || "the prototype is consistent"];
  return done(design.design, findings, { counts: design.facts ? countsOf(design.facts) : null }, text, code);
}

/** A design whose screens can be read, or the result that names the problems in the way, with the command's own keys null. */
function readable(project: Project, parsed: Parsed, own: string[]): { open: Opened } | { result: Result } {
  const open = opened(project, parsed.args.file ?? "");
  const findings = check(open.design, project);
  const blocking = problemsOf(findings).filter((item) => ["read", "unsafe", "structure"].includes(family(item.rule)));
  if (open.design.facts && !blocking.length) return { open };
  const last = `fix ${open.design.design} first: its screens are read only from a design that loads`;
  return {
    result: done(
      open.design.design,
      blocking,
      Object.fromEntries(own.map((key) => [key, null])),
      [...blocking.map((item) => `problem: ${findingLine(item)}`), `problem: ${last}`],
      EXIT.problems,
    ),
  };
}

function factsOf(open: Opened) {
  if (!open.design.facts) throw new Error("a read design has no facts: the tool's files changed");
  return open.design.facts;
}

function screensCommand(project: Project, parsed: Parsed): Result {
  const read = readable(project, parsed, ["screens"]);
  if ("result" in read) return read.result;
  return manifestResult(read.open.design.design, [], { screens: screensOf(factsOf(read.open)) });
}

function componentsCommand(project: Project, parsed: Parsed): Result {
  const read = readable(project, parsed, ["components"]);
  if ("result" in read) return read.result;
  return manifestResult(read.open.design.design, [], { components: componentContract(factsOf(read.open)).components });
}

/** The page of a design whose findings let it be written, or null. */
function pageOf(project: Project, open: Opened, findings: Finding[]): string | null {
  if (pageStops(findings)) return null;
  return page({ design: open.design, findings, rounds: readRounds(open.design.rounds, open.design.name).rounds, project }, viewerAssets());
}

/** A manifest's result: its JSON, printed with or without --json, since a person reads it as an agent does; or the findings that stopped it. */
function manifestResult(target: string, findings: Finding[], own: Record<string, unknown>, code: number = EXIT.done): Result {
  const data = envelope(target, findings, own, code);
  return { code, data, text: code === EXIT.done ? [JSON.stringify(data, null, 2)] : findingLines(findings) };
}

async function shotsCommand(project: Project, parsed: Parsed, io: Io): Promise<Result> {
  const capture = parsed.switches.has("capture");
  // The folder for the pictures is checked before anything else, so a capture never starts toward a bad folder.
  const outRel = parsed.texts.get("out") ?? `${project.outDir}/shots`;
  const out = capture ? projectPath(project.root, outRel, { what: "the shots folder", dotted: true }) : "";
  const read = readable(project, parsed, ["shots", "captured"]);
  if ("result" in read) return read.result;
  const design = read.open.design;
  const named = parsed.texts.get("frames");
  const frames = (named ?? "")
    .split(",")
    .map((frame) => frame.trim())
    .filter((frame) => frame !== "");
  if (named !== undefined && !frames.length)
    throw new Refusal(
      `--frames ${JSON.stringify(named)} names no frame: name one or more ids of the device table, comma-separated, such as --frames 320,1024`,
      "request.value",
    );
  const list = shotList(factsOf(read.open), project.devices.frames, {
    components: parsed.lists.get("changed-component") ?? [],
    screens: parsed.lists.get("changed-screen") ?? [],
    frames: frames.length ? frames : (project.frames ?? shotFrames(design.platforms, project.devices)),
    themes: design.themes,
  });
  // A frame, a screen, or a component the request names and the design lacks is a refused request.
  if (list.refused) throw new Refusal(list.problems.join("\n"), "request.value");
  const findings = check(design, project);
  if (!list.shots.length) {
    // No state to take: the screens with no state are the findings, each at its line.
    const stateless = findings.filter((item) => item.rule === "integrity.no-state");
    const why = stateless.length ? stateless : list.problems.map((problem) => finding("integrity.no-state", problem, design.design));
    return manifestResult(design.design, why, { shots: null, captured: null }, EXIT.problems);
  }
  if (!capture) return manifestResult(design.design, [], { shots: list.shots, captured: null });
  const text = pageOf(project, read.open, findings);
  if (text === null) return manifestResult(design.design, problemsOf(findings), { shots: list.shots, captured: null }, EXIT.problems);
  outputFolder(project);
  const taken = await captureShots(text, list.shots, out);
  if (taken.refused) throw new Refusal(taken.problems.join("\n"), "request.browser");
  const captured = taken.written.map((file) => relative(project.root, file).split("\\").join("/"));
  if (taken.problems.length) {
    return manifestResult(
      design.design,
      taken.problems.map((problem) => finding("tool.failed", problem)),
      { shots: list.shots, captured },
      EXIT.failed,
    );
  }
  io.err(`captured ${taken.written.length} shots in ${outRel}`);
  const cut = taken.cut.map(({ file, height }) =>
    finding(
      "device.picture-height",
      `the view is ${height} px tall, past the ${READ_LIMITS.picture_height} px a picture takes, so its picture stops there: split the screen, or show fewer rows in its state`,
      file,
    ),
  );
  for (const line of findingLines(cut)) io.err(line);
  return manifestResult(design.design, cut, { shots: list.shots, captured });
}

function fileUrl(path: string): string {
  return pathToFileURL(resolve(path)).href;
}

// Open a page in the default browser, when this machine has one, with the system's own opener.
function openPage(path: string): string {
  const [name = "", ...rest] = process.platform === "darwin" ? ["open"] : process.platform === "win32" ? ["cmd", "/c", "start", ""] : ["xdg-open"];
  // The opener is found on the PATH as it is now: the runtime's own lookup reads the PATH it started with.
  const opener = Bun.which(name, { PATH: process.env.PATH ?? "" }) ?? name;
  try {
    const ran = Bun.spawnSync([opener, ...rest, fileUrl(path)], { stdout: "ignore", stderr: "ignore" });
    return ran.exitCode === 0 ? "opened it in your browser" : "no browser opened here: open the address above";
  } catch {
    return "no browser opened here: open the address above";
  }
}

/** Build a design's page: its findings, and the page when they let it be written; else its old page goes. */
function built(project: Project, file: string, parsed: Parsed): Result & { findings: Finding[] } {
  const open = opened(project, file);
  const design = open.design;
  const findings = check(design, project);
  const problems = problemsOf(findings);
  const code = problems.length ? EXIT.problems : EXIT.done;
  const text = pageOf(project, open, findings);
  if (text === null) {
    removePage(project, design);
    return { ...done(design.design, findings, { page: null }, findingLines(findings), EXIT.problems), findings };
  }
  const written = writePage(project, design, text);
  const shown = relative(project.root, written).split("\\").join("/");
  // With --open the last line says whether a browser opened it, so the first asks nothing of the person.
  const opening = parsed.switches.has("open");
  const lines = [...findingLines(findings), opening ? `wrote ${shown}` : `wrote ${shown}: open it in a browser`, fileUrl(written)];
  if (opening) lines.push(openPage(written));
  if (problems.length) lines.push(problemsLine(problems, file));
  return { ...done(design.design, findings, { page: shown }, lines, code), findings };
}

function buildCommandRun(project: Project, parsed: Parsed): Result {
  return built(project, parsed.args.file ?? "", parsed);
}

/** Write the tool's example into the output folder, as any design is written, and build it. */
function exampleCommand(project: Project, parsed: Parsed): Result {
  const { folder, written } = writeExample(project);
  const file = `${folder}/${EXAMPLE_FILE}`;
  const own = settingsFor(project, file);
  const result = built(own, file, parsed);
  // The rounds beside the example are a reviewer's, saved with save-comments, so a problem in one is told as any design's
  // is, at its file; any other problem is in the tool's own files, a fault of the tool.
  const others = problemsOf(result.findings).filter((item) => family(item.rule) !== "rounds");
  if (others.length) throw new Error("the example has problems: the tool's files changed");
  const read = `read ${file} (and its flows/ and blocks/), and check or serve it with \`${PROGRAM} check ${file}\` or \`${PROGRAM} serve ${file}\``;
  return done(
    String(result.data.target),
    result.findings,
    { written, page: result.data.page },
    [...result.text, `next: ${read}, then start your own with \`${PROGRAM} new-design <file>\``],
    result.code,
  );
}

/** Whether the project has a design document to read: a new design then reads its tokens, and writes none of its own. */
function documented(project: Project): boolean {
  return project.designMd !== null && exists(projectPath(project.root, project.designMd, { what: "the design document" }));
}

function newDesignCommand(project: Project, parsed: Parsed): Result {
  const shown = newDesign(project.root, parsed.args.file ?? "", parsed.texts.get("title") ?? "A direction", !documented(project));
  return done(shown, [], { written: [shown] }, [shown, `next: sketch the design in it, then \`${PROGRAM} build ${shown}\` to see it`]);
}

function newDesignMdCommand(project: Project, parsed: Parsed): Result {
  const written = newDesignMd(project.root, project.designMd, parsed.texts.get("name") ?? "");
  return done(written, [], { written: [written] }, [
    written,
    `next: write the product's own values and words in it, from the person's answers, then \`${PROGRAM} new-design <file>\``,
  ]);
}

/** What the project holds for a design, as JSON with or without --json, its findings in it, since a person reads it as an agent does. */
function projectCommand(project: Project): Result {
  const { facts, findings } = projectFacts(project);
  const code = problemsOf(findings).length ? EXIT.problems : EXIT.done;
  const data = envelope(null, findings, facts, code);
  return { code, data, text: [JSON.stringify(data, null, 2)] };
}

/** The standard input, read up to `most` bytes and no further, so a longer one is refused without being read whole. */
function standardInput(most: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  const buffer = Buffer.alloc(64 * 1024);
  let size = 0;
  while (size < most) {
    let count: number;
    try {
      count = readSync(0, buffer, 0, Math.min(buffer.length, most - size), null);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EAGAIN") continue;
      if (code === "EOF") break;
      throw error;
    }
    if (count === 0) break;
    chunks.push(Uint8Array.from(buffer.subarray(0, count)));
    size += count;
  }
  return Buffer.concat(chunks);
}

function saveCommentsCommand(project: Project, parsed: Parsed): Result {
  const file = parsed.args.file ?? "";
  const { design } = opened(project, file);
  const parent = design.folder;
  // The round is written beside the design, so the design's own folder is a place the tool writes.
  const folder = parent ? projectPath(project.root, parent, { what: "the design's folder" }) : project.root;
  const source = parsed.args.source ?? "";
  // The source is the person's own file, such as a download, so it may sit outside the project; a link is refused.
  const read = readSource(source, source === "-" ? source : resolve(project.root, source), () => standardInput(READ_LIMITS.round_file + 1));
  if (!read.data) throw new Refusal(read.problem, "request.file");
  const saved = relative(project.root, saveRound(folder, design.name, read.data, parsed.numbers.get("round") ?? null, parent))
    .split("\\")
    .join("/");
  return done(design.design, [], { saved }, [`saved ${saved}`, `next: rebuild to review earlier rounds with \`${buildCommand(design)}\``]);
}

async function serveCommand(project: Project, parsed: Parsed, io: Io): Promise<Result> {
  const file = parsed.args.file ?? "";
  // A design that cannot be opened is refused before the server starts.
  opened(project, file);
  // Each request builds the page in memory: a request writes and removes nothing. Why a page cannot be built goes to
  // the terminal that runs serve, and the network hears only that it could not be.
  const build = () => {
    let built: { design: Design; findings: Finding[]; text: string | null };
    try {
      const now = opened(project, file);
      const findings = check(now.design, project);
      built = { design: now.design, findings, text: pageOf(project, now, findings) };
    } catch (error) {
      const refusal = refusalOf(error, project.root);
      if (refusal) for (const line of refusal.lines) io.err(`problem: ${findingLine(finding(refusal.rule, line))}`);
      else io.err(`problem: ${findingLine(finding("tool.failed", faultLine(error, project.root)))}`);
      throw error;
    }
    if (built.text === null) {
      for (const item of problemsOf(built.findings)) io.err(`problem: ${findingLine(item)}`);
      throw new Error(
        `the design has problems that stop its page; the terminal that runs serve lists them, and \`${buildCommand(built.design)}\` prints them too`,
      );
    }
    return built.text;
  };
  const code = await serve(
    build,
    parsed.switches.has("lan"),
    parsed.numbers.get("port") ?? null,
    (line) => io.out(line),
    (line) => io.err(`problem: ${line}`),
  );
  return { code, data: {}, text: [] };
}

function storiesCommand(project: Project, parsed: Parsed): Result {
  const index = parsed.args.index ?? "";
  if (index.endsWith(".html"))
    throw new Refusal(
      `${index} is a design, and stories takes Storybook's index.json first: run \`${PROGRAM} stories <index.json> ${index}\``,
      "request.usage",
    );
  const read = readable(project, parsed, ["stories", "missing"]);
  if ("result" in read) return read.result;
  const contract = componentContract(factsOf(read.open));
  const stories = storiesOf(readStoryIndex(project.root, index));
  const missing = missingStories(contract, stories);
  const findings = missing.map((item) => finding("stories.missing", item.message, index));
  return done(
    read.open.design.design,
    findings,
    { stories: stories.size, missing: missing.map((item) => ({ component: item.component, variant: item.variant })) },
    missing.length ? findingLines(findings) : [`every component variant has a story (${stories.size} stories read)`],
    missing.length ? EXIT.problems : EXIT.done,
  );
}

function guideCommand(_project: Project, parsed: Parsed): Result {
  const reference = referenceText(VERSION);
  return done(null, [], { ...guideData(), reference }, [parsed.switches.has("reference") ? reference : guideText(Object.keys(COMMANDS))]);
}

const DISPATCH = {
  check: checkCommand,
  build: buildCommandRun,
  screens: screensCommand,
  components: componentsCommand,
  shots: shotsCommand,
  stories: storiesCommand,
  serve: serveCommand,
  project: projectCommand,
  "new-design": newDesignCommand,
  "new-design-md": newDesignMdCommand,
  "save-comments": saveCommentsCommand,
  example: exampleCommand,
  guide: guideCommand,
} satisfies Record<CommandName, Command>;

/** The commands that read a design, each under the settings `settingsFor` gives it. */
const READS_A_DESIGN: ReadonlySet<CommandName> = new Set(["check", "build", "screens", "components", "shots", "stories", "serve", "save-comments"]);

/** A refusal's id and lines: the tool's own, or what the file system said, with its path from the project's top and the next step. */
function refusalOf(error: unknown, root: string): { rule: RequestRule; lines: string[] } | null {
  if (error instanceof Refusal) return { rule: error.rule, lines: error.message.split("\n") };
  if (error instanceof Unreadable) return { rule: "request.file", lines: [error.message] };
  const known = systemError(error);
  if (!known) return null;
  const path = (error as NodeJS.ErrnoException).path;
  return { rule: "request.path", lines: [`${path ? `${shownPath(root, path)}: ` : ""}${known.what} (${known.code}): ${known.next}`] };
}

/** The words of a fault of the tool, which never reads as a design problem. */
function faultLine(error: unknown, root: string): string {
  return `the tool failed: ${faultMessage(error, root)}. This is a fault of the tool, not of the design: report it with the command you ran`;
}

/** A refused request, or a fault of the tool: one object on stdout with --json, and its lines on stderr always. */
function stopped(io: Io, json: boolean, rule: RuleId, lines: string[], target: string | null, code: number): number {
  if (json)
    io.out(
      JSON.stringify(
        envelope(
          target,
          lines.map((message) => finding(rule, message)),
          {},
          code,
        ),
        null,
        2,
      ),
    );
  for (const line of lines) io.err(`problem: ${findingLine(finding(rule, line))}`);
  return code;
}

/** Run one command in the project folder `root`, and return its exit code. */
export async function run(argv: string[], io: Io, root: string = process.cwd()): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parse(argv, VERSION);
  } catch (error) {
    if (error instanceof HelpRequest) {
      io.out(error.message);
      return EXIT.done;
    }
    if (error instanceof UsageError) {
      if (!error.json) io.err(error.usage);
      return stopped(io, error.json, "request.usage", [error.message], null, EXIT.refused);
    }
    throw error;
  }
  try {
    const loaded = loadProject(root, parsed.global);
    const project = READS_A_DESIGN.has(parsed.command) ? settingsFor(loaded, parsed.args.file ?? "") : loaded;
    rulesOff(project);
    const command: Command = DISPATCH[parsed.command];
    const result = await command(project, parsed, io);
    if (parsed.json && parsed.command !== "serve") io.out(JSON.stringify(result.data, null, 2));
    else for (const line of result.text) io.out(line);
    return result.code;
  } catch (error) {
    const target = parsed.args.file ?? null;
    const refusal = refusalOf(error, root);
    if (refusal) return stopped(io, parsed.json, refusal.rule, refusal.lines, target, EXIT.refused);
    return stopped(io, parsed.json && parsed.command !== "serve", "tool.failed", [faultLine(error, root)], target, EXIT.failed);
  }
}

if (import.meta.main) {
  const io: Io = { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) };
  process.exitCode = await run(process.argv.slice(2), io);
}
