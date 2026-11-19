// The OpenCode plugin: its "./server" export is a plain plugin object that adds the one skill, read from the
// repository's own SKILL.md, and puts the plugin's `bin/` first on the PATH of each shell OpenCode starts. A fake
// context stands in for OpenCode's, with only the two parts the plugin uses.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import plugin, { BIN, type OpenCodeSkill, readSkill, SKILL_FILE, withBin } from "../opencode/server.ts";
import { REPOSITORY } from "./helpers.ts";

/** Run the plugin's setup against a fake context, and return what it added and the PATH a new shell would get. */
async function setUp(env: Record<string, string | undefined>): Promise<{ skills: OpenCodeSkill[]; env: Record<string, string | undefined> }> {
  const skills: OpenCodeSkill[] = [];
  const hooks: ((input: { env: Record<string, string | undefined> }) => void)[] = [];
  await plugin.setup({
    skill: { transform: async (edit) => edit({ add: (skill) => skills.push(skill) }) },
    shell: { hook: async (_name, run) => hooks.push(run) },
  });
  const input = { env: { ...env } };
  for (const run of hooks) run(input);
  return { skills, env: input.env };
}

describe("the OpenCode plugin", () => {
  test("package.json exports it as the server part, and ships every folder it reads", () => {
    const pkg = JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8"));
    expect(pkg.exports["./server"]).toBe("./opencode/server.ts");
    for (const folder of ["opencode", "skills", "bin"]) expect(pkg.files).toContain(folder);
    expect([existsSync(SKILL_FILE), existsSync(join(BIN, "open-prototype"))]).toEqual([true, true]);
  });

  test("its setup adds the skill from the repository's SKILL.md, by its front matter's name and description", async () => {
    const { skills } = await setUp({ PATH: "/usr/bin" });
    const text = readFileSync(SKILL_FILE, "utf8");
    const description = /^description: (.+)$/m.exec(text)?.[1] ?? "no description";
    expect(skills.map((skill) => [skill.id, skill.name, skill.description, skill.path])).toEqual([["prototyping", "prototyping", description, SKILL_FILE]]);
    expect(skills[0]?.content).toStartWith("\n# Prototyping");
  });

  test("its setup puts the plugin's bin first on a new shell's PATH, and keeps the rest", async () => {
    expect((await setUp({ PATH: "/usr/bin" })).env.PATH).toBe(`${BIN}${delimiter}/usr/bin`);
  });

  test("on Windows the PATH keeps its own name, Path", () => {
    const env: Record<string, string | undefined> = { Path: "C:\\Windows" };
    withBin(env, "C:\\plugin\\bin");
    expect(env).toEqual({ Path: `C:\\plugin\\bin${delimiter}C:\\Windows` });
  });

  test("a SKILL.md with no front matter, or none of the two fields, is refused with its path", () => {
    expect(() => readSkill("# Prototyping\n", "x/SKILL.md")).toThrow("x/SKILL.md: no front matter");
    expect(() => readSkill("---\nname: prototyping\n---\n# P\n", "x/SKILL.md")).toThrow("needs a name and a description");
  });
});
