// The project folder and its settings: where pages and screenshots are written, which stylesheets hold the project's
// own tokens, and the question a review ends on. Each has a default, a project may set it in `prototype.config.json`,
// and a flag anywhere on the line wins over both.
import { type Devices, shippedDevices } from "./assets.ts";
import { Refusal, Unreadable } from "./errors.ts";
import { CONFIG_FILE, DESIGN_MD } from "./format.ts";
import { exists, pathParts, projectPath, readText } from "./fs.ts";
import { isObject, type Json, readJson } from "./json.ts";

const DEFAULT_OUT_DIR = ".prototype";

export type Project = {
  /** The project folder: the folder the command runs in. */
  root: string;
  /** The folder for the tool's output: pages in `views/`, screenshots in `shots/`. */
  outDir: string;
  /** The stylesheets a new design's tokens block takes, in order, or null for none. */
  tokens: string[] | null;
  /** The rules the settings file names, each with its setting, as written: the check holds them to the registry. */
  rules: Record<string, unknown>;
  /** The frames the shot list takes when a command names none, by id. */
  frames: string[] | null;
  /** The device table the checks, the shot list, and the page read: the tool's own, so no stage after this reads a file. */
  devices: Devices;
  /** The project's design document, inside the project, or null when the settings turn its reading off. */
  designMd: string | null;
  /** Whether the settings name the design document: a document they name must exist. */
  designMdNamed: boolean;
};

/** A folder setting, held to the one path rule's text checks; the disk is checked where the folder is used. */
function folderSetting(value: string, what: string, dotted = false): string {
  return pathParts(value, { what, dotted }).join("/");
}

type Flags = { outDir?: string };

/** A key of the settings file: what it sets and its default, in words, and how its value is read into the project. */
type Setting = { key: string; sets: string; default: string; read: (value: Json, project: Project) => void };

const refused = (message: string) => new Refusal(`${CONFIG_FILE}: ${message}`, "request.settings");
const textOf = (key: string, value: Json): string => {
  if (typeof value !== "string") throw refused(`\`${key}\` must be a text`);
  return value;
};

/** Every key the settings file may hold, in alphabetical order: the guide and the specification list them from here. */
export const SETTINGS: readonly Setting[] = [
  {
    key: "design_md",
    sets: "the project's design document, by its path inside the project; `null` reads none, and a path the settings name that does not exist is refused",
    default: `\`${DESIGN_MD}\`, read only when it exists`,
    read: (value, project) => {
      if (value !== null && typeof value !== "string")
        throw refused(`\`design_md\` must be the design document's path, such as "${DESIGN_MD}", or null to read none`);
      project.designMd = value === null ? null : folderSetting(value, "the design document");
      project.designMdNamed = true;
    },
  },
  {
    key: "frames",
    sets: "the frames `shots` takes when a command names none, by their ids in the device table",
    default: "each declared platform's own",
    read: (value, project) => {
      if (!Array.isArray(value) || !value.length || !value.every((item) => typeof item === "string"))
        throw refused('`frames` must be a list of frame ids, such as ["320", "ios", "1024"]');
      project.frames = value as string[];
    },
  },
  {
    key: "out_dir",
    sets: "the output folder",
    default: `\`${DEFAULT_OUT_DIR}\``,
    read: (value, project) => {
      project.outDir = textOf("out_dir", value);
    },
  },
  {
    key: "rules",
    sets: 'rules turned off, each as `"<id>": "off"`, such as `{"copy.emoji": "off"}`',
    default: "none",
    read: (value, project) => {
      if (!isObject(value)) throw refused('`rules` must be an object, such as {"copy.emoji": "off"}');
      project.rules = value;
    },
  },
  {
    key: "tokens",
    sets: "the tokens files the build places before each design's styles",
    default: "none",
    read: (value, project) => {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
        throw refused('`tokens` must be a list of stylesheet paths, such as ["design/tokens.css"]');
      project.tokens = (value as string[]).map((item) => folderSetting(item, "a tokens file"));
    },
  },
];

export function loadProject(root: string, flags: Flags = {}): Project {
  const project: Project = {
    root,
    outDir: DEFAULT_OUT_DIR,
    tokens: null,
    rules: {},
    frames: null,
    devices: shippedDevices(),
    designMd: DESIGN_MD,
    designMdNamed: false,
  };
  // The settings file is read under the path rule, as every file below the root is: a link there is refused.
  const path = projectPath(root, CONFIG_FILE, { what: "the settings file" });
  if (exists(path)) {
    let text: string | null;
    try {
      text = readText(path);
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      throw new Refusal(`${CONFIG_FILE} cannot be read: ${error.message}`, "request.settings");
    }
    const read = readJson(text ?? "");
    if (!read.ok) throw new Refusal(`${CONFIG_FILE} is not JSON (${read.error}): fix it there`, "request.settings");
    const config = read.value;
    if (!isObject(config)) throw new Refusal(`${CONFIG_FILE} must hold one JSON object`, "request.settings");
    for (const key of Object.keys(config)) {
      if (!SETTINGS.some((setting) => setting.key === key) && key !== "$comment" && key !== "$schema")
        throw new Refusal(
          `${CONFIG_FILE} sets \`${key}\`, which the tool does not know: use ${SETTINGS.map((setting) => `\`${setting.key}\``).join(", ")}`,
          "request.settings",
        );
    }
    for (const setting of SETTINGS) {
      const value = config[setting.key];
      if (value !== undefined) setting.read(value, project);
    }
  }
  if (flags.outDir !== undefined) project.outDir = flags.outDir;
  project.outDir = folderSetting(project.outDir, "the output folder", true);
  return project;
}

/** The folder the tool writes its example into: `example/` in the output folder. */
export function exampleFolder(project: Project): string {
  return `${project.outDir}/example`;
}

/**
 * The settings a design is read under. The tool's example, in `exampleFolder`, is its own design, so every command
 * reads it with none of the project's design document, tokens files, and rules, which it was never written for, as
 * `example` builds it; any other design takes the project's settings.
 */
export function settingsFor(project: Project, file: string): Project {
  // The path rule refuses any other spelling of a path, such as one with `./`, so the text is the path.
  const folder = exampleFolder(project);
  if (file !== folder && !file.startsWith(`${folder}/`)) return project;
  return { ...project, designMd: null, designMdNamed: false, tokens: null, rules: {} };
}
