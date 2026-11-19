// The OpenCode plugin. OpenCode 2 loads this file from the package's "./server" export. The plugin adds the one skill,
// read from `skills/prototyping/SKILL.md` in the plugin's own folder, so every harness reads the same file. It puts the
// plugin's `bin/` first on the PATH of each shell OpenCode starts, as Claude Code does for its plugins, so
// `open-prototype` runs from the plugin's own copy. It imports nothing from OpenCode: a plugin is a plain object of an
// id and a setup, which OpenCode's own `Plugin.define` returns unchanged, so the tool keeps no runtime dependency.
import { readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";

/** The skill's file, beside this folder in the plugin. */
export const SKILL_FILE = fileURLToPath(new URL("../skills/prototyping/SKILL.md", import.meta.url));

/** The plugin's `bin/` folder, which holds the `open-prototype` command. */
export const BIN = fileURLToPath(new URL("../bin", import.meta.url));

/**
 * A shell's environment with `bin` first on its PATH. Windows names the variable `Path`, so the name it already has is kept.
 */
export function withBin(env: Record<string, string | undefined>, bin: string): void {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const rest = env[key] ?? process.env[key] ?? "";
  env[key] = rest ? `${bin}${delimiter}${rest}` : bin;
}

/** A skill as OpenCode's skill editor adds it: `path` is the absolute path of its SKILL.md. */
export type OpenCodeSkill = { id: string; name: string; description: string; path: string; content: string };

/** The skill's name and description from its front matter, and the instructions after it, or why it cannot be read. */
export function readSkill(text: string, path: string): OpenCodeSkill {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!front) throw new Error(`${path}: no front matter`);
  const field = (key: string) => new RegExp(`^${key}: *(.+)$`, "m").exec(front[1] ?? "")?.[1]?.trim() ?? "";
  const name = field("name");
  const description = field("description");
  if (!name || !description) throw new Error(`${path}: the front matter needs a name and a description`);
  return { id: name, name, description, path, content: text.slice(front[0].length) };
}

/** The part of OpenCode's plugin context this plugin uses. */
type Context = {
  skill: { transform: (edit: (editor: { add: (skill: OpenCodeSkill) => void }) => void) => Promise<unknown> };
  shell: { hook: (name: "create.before", run: (input: { env: Record<string, string | undefined> }) => void) => Promise<unknown> };
};

export default {
  id: "open-prototype",
  async setup(ctx: Context): Promise<void> {
    const skill = readSkill(readFileSync(SKILL_FILE, "utf8"), SKILL_FILE);
    await ctx.skill.transform((editor) => editor.add(skill));
    await ctx.shell.hook("create.before", (input) => withBin(input.env, BIN));
  },
};
