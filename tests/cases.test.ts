// Every recorded case, run as a person runs it, against the result recorded for it. Run with RECORD=1 to write the
// results again after a change made on purpose, and say so in the commit.
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "./cases.ts";
import { cli, project, type Ran } from "./helpers.ts";

const RECORDED = join(import.meta.dir, "recorded.json");
const recording = process.env.RECORD === "1";
const recorded: Record<string, string[]> = recording ? {} : JSON.parse(readFileSync(RECORDED, "utf8"));
const MANIFESTS = ["screens", "components", "shots"];
/** Each case's manifest that a golden file holds: the same design, the same command, and no flag. */
const GOLDEN = new Set<string>();

// What a run says, without its wording: its exit code, the findings of a check, each entry of a printed manifest, and
// how many problem lines it printed. A manifest's entry is one line of JSON, so a change shows as the entries that
// differ, and a change of the output's spacing changes none. A manifest whose command and design have a golden file,
// `tests/golden/`, is held there whole by `tests/commands.test.ts`, so it is left out here.
function digest(caseName: string, command: string[], ran: Ran): string[] {
  const lines = [`exit ${ran.code}`];
  if (command[0] === "check" && command.includes("--json")) {
    const data = JSON.parse(ran.out) as { findings: { rule: string; level: string; file: string | null; line: number | null }[]; counts: unknown };
    lines.push(
      `counts ${JSON.stringify(data.counts ?? null)}`,
      ...data.findings.map((item) => `${item.rule} ${item.level} ${item.file ?? ""}${item.line === null ? "" : `:${item.line}`}`),
    );
  } else if (MANIFESTS.includes(command[0] ?? "") && ran.code === 0) {
    const name = command[0] ?? "";
    if (!GOLDEN.has(`${caseName} ${command.join(" ")}`)) {
      const entries = (JSON.parse(ran.out) as Record<string, unknown>)[name];
      for (const entry of Array.isArray(entries) ? entries : []) lines.push(`${name} ${JSON.stringify(entry)}`);
    }
  } else {
    const problems = [...ran.out.split("\n"), ...ran.err.split("\n")].filter((line) => line.startsWith("problem: ")).length;
    lines.push(`problems ${problems}`);
  }
  if (/^wrote /m.test(ran.out)) lines.push("wrote a page");
  if (/^saved /m.test(ran.out)) lines.push("saved a round");
  return lines;
}

for (const item of CASES) {
  test(item.name, async () => {
    const folder = project(item.files);
    for (const [index, command] of item.commands.entries()) {
      const key = `${item.name} ${index + 1}: ${command.join(" ")}`;
      const result = digest(item.name, command, await cli(folder, ...command));
      if (recording) recorded[key] = result;
      else expect({ [key]: result }).toEqual({ [key]: recorded[key] ?? [] });
    }
  });
}

if (recording) test("write the recorded results", () => writeFileSync(RECORDED, `${JSON.stringify(recorded, null, 1)}\n`));
