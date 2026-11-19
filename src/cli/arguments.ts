// The command line's words: one table of commands, each with its arguments and flags, read by `node:util`'s
// `parseArgs`. A flag may stand anywhere after the program's name, no flag is ever shortened, and a mistake is one line
// that says what to type instead.
import { parseArgs } from "node:util";
import { PROGRAM } from "../format.ts";

type FlagKind = "switch" | "text" | "number" | "list";
type FlagSpec = { kind: FlagKind; value?: string; help: string };
type Positional = { name: string; optional: boolean; help: string };
type CommandSpec = { help: string; positionals: Positional[]; flags: Record<string, FlagSpec>; json: boolean };

const FILE: Positional = { name: "file", optional: false, help: "the design file, such as design/cards.html" };
const OPEN: FlagSpec = { kind: "switch", help: "open the written page in your browser" };

/** Every command, in the order the help lists them. */
export const COMMANDS = {
  check: { help: "check the design and write nothing: every finding with its file and line; exit 1 on a problem", positionals: [FILE], flags: {}, json: true },
  build: { help: "write the design's page in the viewer, and print its findings", positionals: [FILE], flags: { open: OPEN }, json: true },
  screens: {
    help: "print the design's screens: each one's id, title, parent, first state, and states in drawn order",
    positionals: [FILE],
    flags: {},
    json: true,
  },
  components: { help: "print the design's component contract", positionals: [FILE], flags: {}, json: true },
  shots: {
    help: "print the views to capture, sized to the change, and take them with --capture",
    positionals: [FILE],
    flags: {
      capture: { kind: "switch", help: "take each view as a PNG with headless Chrome" },
      "changed-component": { kind: "list", value: "NAME", help: "a component whose look or states changed; repeat for each" },
      "changed-screen": { kind: "list", value: "ID", help: "a new or reshaped screen: its full matrix; repeat for each" },
      frames: { kind: "list", value: "IDS", help: "the frames to take, by device id, comma-separated or repeated (default: each declared platform's)" },
      out: { kind: "text", value: "DIR", help: "the folder for --capture's pictures (default: <out-dir>/shots)" },
    },
    json: true,
  },
  stories: {
    help: "check Storybook's index.json against the component contract: exit 1 on a missing story",
    positionals: [{ name: "index.json", optional: false, help: "Storybook's index.json, from a static build (storybook-static/index.json)" }, FILE],
    flags: {},
    json: true,
  },
  serve: {
    help: "serve the page on 127.0.0.1 until Ctrl-C, built again on each reload (a link that changes only after # does not reload: reload the page), with --lan for a phone",
    positionals: [FILE],
    flags: {
      lan: { kind: "switch", help: "listen on the local network too, so a phone on it can open the page" },
      port: { kind: "number", value: "PORT", help: "the port, used or refused (default: the first free one from 8765 to 8784; 0 picks any free one)" },
    },
    json: false,
  },
  project: {
    help: "print what the project holds for a design: its design document's tokens, components, and section headings with their lines, its token files, and its story index",
    positionals: [],
    flags: {},
    json: true,
  },
  "new-design": {
    help: "start a design file from the starter",
    positionals: [{ name: "file", optional: false, help: "where to write it, such as design/cards.html" }],
    flags: { title: { kind: "text", value: "TITLE", help: "what it shows (default: A direction)" } },
    json: true,
  },
  "new-design-md": {
    help: "start the project's design document, DESIGN.md, with its tokens and sections to fill in",
    positionals: [],
    flags: { name: { kind: "text", value: "NAME", help: "the product's name (default: Your product)" } },
    json: true,
  },
  "save-comments": {
    help: "save the comments the viewer gave as the design's next round",
    positionals: [
      { name: "source", optional: false, help: "the JSON file the viewer's Download gives: its path, or - for the standard input" },
      { name: "file", optional: false, help: "the design file, whose rounds get the comments" },
    ],
    flags: { round: { kind: "number", value: "N", help: "the round to write (default: the round the JSON names)" } },
    json: true,
  },
  example: {
    help: "write the tool's example into <out-dir>/example/, a complete design with flows and blocks, and build it",
    positionals: [],
    flags: { open: OPEN },
    json: true,
  },
  guide: {
    help: "print the guide: the format's whole vocabulary, composition, the review round, and the commands",
    positionals: [],
    flags: { reference: { kind: "switch", help: "print the reference: every name, rule, command, exit code, and module, as Markdown" } },
    json: true,
  },
} satisfies Record<string, CommandSpec>;

/** The name of a command: a key of `COMMANDS`. */
export type CommandName = keyof typeof COMMANDS;
/** The name of a command's own flag, of any command, without its `--`: a typo in one is a type error. */
export type FlagName = { [Name in CommandName]: keyof (typeof COMMANDS)[Name]["flags"] }[CommandName] & string;

export function isCommand(word: string): word is CommandName {
  return Object.hasOwn(COMMANDS, word);
}

/** The flags every command takes, wherever they stand. */
export const GLOBAL: Record<string, FlagSpec> = {
  "out-dir": { kind: "text", value: "DIR", help: "the folder for pages and screenshots (default: .prototype)" },
  json: { kind: "switch", help: "print the result as one JSON object on stdout" },
};

/** The words of one command line: each flag by its name, without its `--`, in the table of its kind. */
export type Parsed = {
  command: CommandName;
  global: { outDir?: string };
  json: boolean;
  args: Record<string, string | undefined>;
  switches: Set<FlagName>;
  texts: Map<FlagName, string>;
  numbers: Map<FlagName, number>;
  lists: Map<FlagName, string[]>;
};

/** A mistake on the command line: its usage line and what was wrong. */
export class UsageError extends Error {
  constructor(
    readonly usage: string,
    message: string,
    readonly json = false,
  ) {
    super(message);
  }
}

/** Help or the version, which print and exit with code 0. */
export class HelpRequest extends Error {}

function flagUsage(name: string, spec: FlagSpec): string {
  return spec.kind === "switch" ? `[--${name}]` : `[--${name} ${spec.value ?? "VALUE"}]${spec.kind === "list" ? "..." : ""}`;
}

/** A command's own table, or none for a word that is no command. */
function specOf(command: string | undefined): CommandSpec | undefined {
  return command !== undefined && isCommand(command) ? COMMANDS[command] : undefined;
}

export function usage(command?: string): string {
  const spec = specOf(command);
  if (!command || !spec) return `usage: ${PROGRAM} <command> [arguments] [--json] [--out-dir DIR]`;
  const flags = Object.entries(spec.flags).map(([name, flag]) => flagUsage(name, flag));
  const positionals = spec.positionals.map((item) => (item.optional ? `[${item.name}]` : `<${item.name}>`));
  return `usage: ${PROGRAM} ${command} ${[...positionals, ...flags, ...(spec.json ? ["[--json]"] : [])].join(" ")}`.trimEnd();
}

function help(command?: string, version = ""): string {
  const spec = specOf(command);
  if (!command || !spec) {
    const lines = [
      usage(),
      "",
      `Check a design, show it in the viewer, and read its screens, components, and shots.${version ? ` Version ${version}.` : ""}`,
      "",
      "commands:",
    ];
    for (const [name, item] of Object.entries(COMMANDS)) lines.push(`  ${name.padEnd(14)}${item.help}`);
    lines.push("", "flags for every command, anywhere on the line:");
    for (const [name, item] of Object.entries(GLOBAL)) lines.push(`  ${`--${name}${item.value ? ` ${item.value}` : ""}`.padEnd(20)}${item.help}`);
    lines.push(
      `  ${"--version".padEnd(20)}print the version`,
      "",
      `Run \`${PROGRAM} <command> --help\` for a command's arguments, and \`${PROGRAM} guide\` for the format.`,
    );
    return lines.join("\n");
  }
  const lines = [usage(command), "", spec.help];
  if (spec.positionals.length) lines.push("", "arguments:", ...spec.positionals.map((item) => `  ${item.name.padEnd(20)}${item.help}`));
  if (Object.keys(spec.flags).length)
    lines.push(
      "",
      "flags:",
      ...Object.entries(spec.flags).map(([name, flag]) => `  ${`--${name}${flag.value ? ` ${flag.value}` : ""}`.padEnd(28)}${flag.help}`),
    );
  return lines.join("\n");
}

/**
 * Each flag that takes a value, in any command's table or the global one: before the command is known, such a flag
 * takes the next word with it, so a flag may stand anywhere on the line. No name is a switch in one table and takes a
 * value in another, which a test holds.
 */
export const VALUE_FLAGS: ReadonlySet<string> = new Set(
  [GLOBAL, ...Object.values(COMMANDS).map((spec) => spec.flags)].flatMap((table) =>
    Object.entries(table as Record<string, FlagSpec>)
      .filter(([, flag]) => flag.kind !== "switch")
      .map(([name]) => name),
  ),
);

/** Read the words after the program's name. */
export function parse(argv: string[], version: string): Parsed {
  const asJson = argv.includes("--json");
  // The command is the first word that is no flag and no value of a flag before it.
  let first = -1;
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index] ?? "";
    // A flag that takes a value takes the next word with it.
    if (word.startsWith("--") && VALUE_FLAGS.has(word.slice(2))) index++;
    else if (!word.startsWith("-")) {
      first = index;
      break;
    }
  }
  const command = first < 0 ? undefined : argv[first];
  if (argv.includes("--version") && (command === undefined || !isCommand(command))) throw new HelpRequest(version);
  if (command === undefined) {
    if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) throw new HelpRequest(help(undefined, version));
    throw new UsageError(usage(), `name a command: ${Object.keys(COMMANDS).join(", ")}`, asJson);
  }
  if (!isCommand(command)) throw new UsageError(usage(), `\`${command}\` is no command: name one of ${Object.keys(COMMANDS).join(", ")}`, asJson);
  const spec: CommandSpec = COMMANDS[command];
  const usageLine = usage(command);
  if (argv.includes("--help") || argv.includes("-h")) throw new HelpRequest(help(command));
  const flags: Record<string, FlagSpec> = { ...GLOBAL, ...spec.flags };
  const options: Record<string, { type: "string" | "boolean"; multiple?: boolean }> = { version: { type: "boolean" } };
  for (const [name, flag] of Object.entries(flags))
    options[name] = { type: flag.kind === "switch" ? "boolean" : "string", ...(flag.kind === "list" ? { multiple: true } : {}) };
  let read: ReturnType<typeof parseArgs>;
  try {
    read = parseArgs({ args: argv.filter((_, index) => index !== first), options, allowPositionals: true, strict: true });
  } catch (error) {
    const said = (error as Error).message.split("\n")[0] ?? "";
    const unknown = /Unknown option '([^']+)'/.exec(said)?.[1];
    throw new UsageError(usageLine, unknown ? `\`${unknown}\` is no flag of \`${command}\`: run \`${PROGRAM} ${command} --help\` for its flags` : said, asJson);
  }
  if (read.values.version) throw new HelpRequest(version);
  if (!spec.json && read.values.json) throw new UsageError(usageLine, `\`${command}\` prints no JSON: it runs until you stop it`, false);
  const parsed: Parsed = {
    command,
    global: {},
    json: Boolean(read.values.json),
    args: {},
    switches: new Set(),
    texts: new Map(),
    numbers: new Map(),
    lists: new Map(),
  };
  for (const [name, value] of Object.entries(read.values)) {
    if (name === "version" || name === "json") continue;
    if (name === "out-dir") parsed.global.outDir = String(value);
    // Every other name is a flag of the command's own table, which parseArgs held the line to.
    const own = name as FlagName;
    if (flags[name]?.kind === "switch") {
      if (value) parsed.switches.add(own);
    } else if (flags[name]?.kind === "list") parsed.lists.set(own, (value as string[]).map(String));
    else if (flags[name]?.kind === "number") {
      const number = /^-?[0-9]+$/.test(String(value)) ? Number(value) : Number.NaN;
      if (!Number.isSafeInteger(number))
        throw new UsageError(usageLine, `--${name} takes a whole number, such as 2, not ${JSON.stringify(value)}`, parsed.json);
      parsed.numbers.set(own, number);
    } else parsed.texts.set(own, String(value));
  }
  const positionals = read.positionals;
  const required = spec.positionals.filter((item) => !item.optional);
  if (positionals.length < required.length)
    throw new UsageError(
      usageLine,
      `name ${required
        .slice(positionals.length)
        .map((item) => `<${item.name}>`)
        .join(" and ")}`,
      parsed.json,
    );
  if (positionals.length > spec.positionals.length)
    throw new UsageError(usageLine, `\`${positionals.slice(spec.positionals.length).join(" ")}\` is one argument too many`, parsed.json);
  spec.positionals.forEach((item, index) => {
    parsed.args[item.name === "index.json" ? "index" : item.name] = positionals[index];
  });
  return parsed;
}
