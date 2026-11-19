// A review round: the viewer's export saved whole, answered by a later round's changes, and shown done on the next
// page, with nothing cut; the limits and rules of a round file; and one rounds folder for each design.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readRounds } from "../src/checks/rounds.ts";
import { LAST_ROUND } from "../src/contract.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project, schema, schemaErrors } from "./helpers.ts";

const VIEWER_EXPORT = {
  round: 1,
  items: [
    {
      id: "r1-1",
      type: "remove",
      screen: "items:list",
      state: "empty",
      testid: "items-reload",
      index: 0,
      box: { x: 1, y: 2.5, width: 10, height: 5 },
      comment: 'Remove this. Ünïcödé, "quotes", and a tab\there.',
      frame: "1024",
      theme: "system",
      shown_theme: "dark",
      link: "#items%3Alist/empty",
    },
    {
      id: "r1-2",
      type: "question",
      screen: "items:detail",
      state: "ready",
      testid: "detail-back",
      index: 0,
      box: null,
      comment: "x".repeat(2000),
      frame: "ios",
      theme: "dark",
      link: "#items%3Adetail/ready",
    },
  ],
};

type Item = { id: string; comment: string; done: boolean; shown_theme: string };

function pageConfig(folder: string, name = "index.html"): { rounds: { round: number; items: Item[] }[]; rounds_path: string; findings: { rule: string }[] } {
  const html = readFileSync(join(folder, ".prototype/views", name), "utf8");
  return JSON.parse(/<script type="application\/json" id="page-config">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "{}");
}

const rules = async (folder: string, ...file: string[]) =>
  json<{ findings: { rule: string; file: string }[] }>(await cli(folder, "check", "--json", ...file)).findings.map((item) => item.rule);

describe("an answered comment carries its answer", () => {
  test("the page holds the round and the summary of the first change that answers it, and nothing for one no change answers", async () => {
    const folder = project({
      "design/case.html": single(),
      "design/rounds/case/1/comments.json": JSON.stringify({
        round: 1,
        items: [
          { id: "r1-1", type: "question", screen: "start", state: "success", comment: "Why two buttons?" },
          { id: "r1-2", screen: "start", state: "success", comment: "Bigger" },
        ],
      }),
      "design/rounds/case/2/changes.json": JSON.stringify({ changes: [{ summary: "One button now: the second did the same.", answers: ["r1-1"] }] }),
      "design/rounds/case/3/changes.json": JSON.stringify({ changes: [{ summary: "Asked again, answered again.", answers: ["r1-1"] }] }),
    });
    expect((await cli(folder, "build", "design/case.html")).code).toBe(0);
    const config = pageConfig(folder, "design/case.html");
    expect(schemaErrors(config, schema("page-config"))).toEqual([]);
    const [asked, other] = config.rounds[0]?.items ?? [];
    expect([asked?.done, (asked as Record<string, unknown> | undefined)?.answered_by]).toEqual([
      true,
      { round: 2, summary: "One button now: the second did the same." },
    ]);
    expect([other?.done, Object.hasOwn(other ?? {}, "answered_by")]).toEqual([false, false]);
  });
});

describe("a round file's version", () => {
  const comments = (version: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ schema_version: version, round: 1, items: [{ id: "r1-1", screen: "start", state: "success", comment: "Hidden", ...extra }] });
  test.each([
    ["a newer comments file", "rounds/case/1/comments.json", comments("9"), "newer"],
    ["a newer comments file with a key this tool has no place for", "rounds/case/1/comments.json", comments("9", { mood: "sad" }), "newer"],
    ["a comments file of no version", "rounds/case/1/comments.json", comments("0"), "no round file"],
    ["a newer changes file", "rounds/case/2/changes.json", JSON.stringify({ schema_version: "2", changes: [{ summary: "x" }] }), "newer"],
  ])("%s is left out, with one finding that says so", async (_what, file, text, says) => {
    const folder = project({ "design/case.html": single(), [`design/${file}`]: text });
    const found = json<{ findings: { rule: string; message: string }[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.map((item) => item.rule)).toEqual(["rounds.file"]);
    expect(found[0]?.message).toContain(says);
    await cli(folder, "build", "design/case.html");
    expect(pageConfig(folder, "design/case.html").rounds.flatMap((round) => round.items)).toEqual([]);
  });
  test.each([
    ["0", "no round file"],
    ["2", "newer"],
    [1, "no round file"],
  ])("save-comments refuses version %p, saying %p", async (version, says) => {
    const folder = project({ "design/case.html": single(), "c.json": comments(version) });
    const ran = await cli(folder, "save-comments", "c.json", "design/case.html");
    expect([ran.code, ran.err.includes(says), ran.err.split("\n").length]).toEqual([2, true, 1]);
  });
});

describe("a round trip", () => {
  test("every comment and every character survives, whole, and an answered comment shows done", async () => {
    const folder = project({ ...flowDesign(), "export.json": JSON.stringify(VIEWER_EXPORT) });
    const saved = await cli(folder, "save-comments", "export.json", FLOW_DESIGN);
    expect([saved.code, saved.out.split("\n")[0]]).toEqual([0, "saved design/rounds/app/1/comments.json"]);
    const file = JSON.parse(readFileSync(join(folder, "design/rounds/app/1/comments.json"), "utf8"));
    expect(schemaErrors(file, schema("round-comments"))).toEqual([]);
    expect(file.items.map((item: { comment: string }) => item.comment)).toEqual(VIEWER_EXPORT.items.map((item) => item.comment));
    expect(file.items[0].box).toEqual({ x: 1, y: 3, width: 10, height: 5 });
    const changes = { changes: [{ answers: ["r1-1"], summary: "Removed the reload button." }] };
    expect(schemaErrors(changes, schema("round-changes"))).toEqual([]);
    await Bun.write(join(folder, "design/rounds/app/2/changes.json"), JSON.stringify(changes));
    expect((await cli(folder, "build", FLOW_DESIGN)).code).toBe(0);
    const config = pageConfig(folder, FLOW_DESIGN);
    expect(config.rounds_path).toBe("design/rounds/app");
    expect(config.rounds[0]?.items.map((item) => [item.id, item.done, item.shown_theme])).toEqual([
      ["r1-1", true, "dark"],
      ["r1-2", false, ""],
    ]);
    expect(config.rounds[0]?.items[1]?.comment).toBe("x".repeat(2000));
  });

  test("a round file is never written over", async () => {
    const folder = project({ ...flowDesign(), "export.json": JSON.stringify(VIEWER_EXPORT) });
    await cli(folder, "save-comments", "export.json", FLOW_DESIGN);
    const again = await cli(folder, "save-comments", "export.json", FLOW_DESIGN);
    expect([again.code, again.err]).toEqual([2, expect.stringContaining("saved already")]);
    const next = { ...VIEWER_EXPORT, round: 2, items: VIEWER_EXPORT.items.map((item) => ({ ...item, id: item.id.replace("r1-", "r2-") })) };
    await Bun.write(join(folder, "next.json"), JSON.stringify(next));
    expect((await cli(folder, "save-comments", "next.json", FLOW_DESIGN)).code).toBe(0);
  });

  test("the standard input is read as a file is", async () => {
    const folder = project({ ...flowDesign() });
    const ran = Bun.spawnSync(["bun", join(import.meta.dir, "../src/cli.ts"), "save-comments", "-", FLOW_DESIGN], {
      cwd: folder,
      stdin: Buffer.from(JSON.stringify(VIEWER_EXPORT)),
    });
    expect(ran.exitCode).toBe(0);
    expect(existsSync(join(folder, "design/rounds/app/1/comments.json"))).toBe(true);
  });
});

describe("the limits and rules of a round file", () => {
  // An agent writes a round "by hand" against the schema, and the save reads it: both refuse the same characters and
  // state the same limits, which the limits table owns.
  test("the comments schema states each limit as the limits table does, and refuses each control character the save refuses", async () => {
    const comments = schema("round-comments") as {
      limits: { comments_in_a_round: number; comment_characters: number };
      properties: { round: { maximum: number }; items: { maxItems: number; items: { properties: { comment: { maxLength: number } } } } };
    };
    expect([comments.properties.items.maxItems, comments.properties.items.items.properties.comment.maxLength, comments.properties.round.maximum]).toEqual([
      comments.limits.comments_in_a_round,
      comments.limits.comment_characters,
      LAST_ROUND,
    ]);
    for (const [text, code] of [
      ["a\u0085b", 2],
      ["a\u009fb", 2],
      ["a\u0007b", 2],
      ["a\tb\nc", 0],
    ] as const) {
      const data = { round: 1, items: [{ id: "r1-1", screen: "start", state: "success", comment: text }] };
      const folder = project({ "design/a.html": single(), "c.json": JSON.stringify(data) });
      const saved = await cli(folder, "save-comments", "c.json", "design/a.html");
      expect([text, schemaErrors(data, schema("round-comments")).length === 0, saved.code]).toEqual([text, code === 0, code]);
    }
  });

  test.each([
    [
      "201 comments",
      { round: 1, items: Array.from({ length: 201 }, (_, i) => ({ id: `r1-${i + 1}`, screen: "s", state: "t", comment: "c" })) },
      "more than the 200 a round holds",
    ],
    [
      "a comment of 2,001 characters",
      { round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "x".repeat(2001) }] },
      "2001 characters, more than the 2000 a comment holds",
    ],
    ["an unknown type", { round: 1, items: [{ id: "r1-1", type: "delete", screen: "s", state: "t", comment: "c" }] }, 'has the type "delete"'],
    ["an unknown key", { round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c", count: 2 }] }, "holds `count`"],
    ["a writer with a space", { round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c", by: "a person" }] }, "with no space"],
    ["an id of another round", { round: 7, items: [{ id: "r1-3", screen: "s", state: "t", comment: "c" }] }, "names round 1, but it is in round 7"],
    ["a control character", { round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "a\u001b[31mb" }] }, "control character"],
    [
      "a shown theme that is no theme",
      { round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c", shown_theme: "system" }] },
      'shown theme "system"',
    ],
  ])("%s: the save fails, says why, and writes nothing", async (_what, data, why) => {
    const folder = project({ ...flowDesign(), "export.json": JSON.stringify(data) });
    const ran = await cli(folder, "save-comments", "export.json", FLOW_DESIGN);
    expect(ran.code).toBe(2);
    expect(ran.err).toContain(why);
    expect(existsSync(join(folder, "design/rounds"))).toBe(false);
  });

  test("check reads the round files: a broken changes file, and an answer that names no comment", async () => {
    const folder = project({
      ...flowDesign(),
      "design/rounds/app/1/comments.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c" }] }),
      "design/rounds/app/2/changes.json": JSON.stringify({ changes: [{ answers: ["r1-9", 5], aside: "x" }], extra: 1 }),
      "design/rounds/app/3/changes.json": "{ not json",
    });
    const found = await rules(folder, FLOW_DESIGN);
    expect(found.sort()).toEqual(["rounds.field", "rounds.field", "rounds.file", "rounds.key", "rounds.key"].sort());
    const answered = project({
      ...flowDesign(),
      "design/rounds/app/1/comments.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c" }] }),
      "design/rounds/app/2/changes.json": JSON.stringify({ changes: [{ answers: ["r1-9"], summary: "x" }] }),
    });
    expect(await rules(answered, FLOW_DESIGN)).toEqual(["rounds.answer"]);
  });

  test("check holds a round read from disk to the save's limits: no round 0, no leading zero, no empty round, and no more than 200 comments", async () => {
    const item = (round: number, n: number) => ({ id: `r${round}-${n}`, screen: "start", state: "success", comment: "c" });
    const folder = project({
      "design/a.html": single(),
      "design/rounds/a/1/comments.json": JSON.stringify({ round: 1, items: Array.from({ length: 201 }, (_, i) => item(1, i + 1)) }),
      "design/rounds/a/0/comments.json": JSON.stringify({ round: 0, items: [item(0, 1)] }),
      "design/rounds/a/01/comments.json": JSON.stringify({ round: 1, items: [item(1, 1)] }),
      "design/rounds/a/2/comments.json": JSON.stringify({ round: 2, items: [] }),
    });
    const found = json<{ findings: { rule: string; file: string }[] }>(await cli(folder, "check", "--json", "design/a.html")).findings;
    expect(found.map((item) => `${item.rule} ${item.file}`).sort()).toEqual(
      [
        "rounds.file design/rounds/a/0",
        "rounds.file design/rounds/a/01",
        "rounds.field design/rounds/a/1/comments.json",
        "rounds.field design/rounds/a/2/comments.json",
      ].sort(),
    );
    await cli(folder, "build", "design/a.html");
    expect(pageConfig(folder, "design/a.html").rounds.map((round) => [round.round, round.items.length])).toEqual([
      [1, 200],
      [2, 0],
    ]);
  });

  test("a round the page leaves out is a note that names it, and no comment is cut", async () => {
    const files: Record<string, string> = { ...flowDesign() };
    for (let round = 1; round <= 21; round++)
      files[`design/rounds/app/${round}/comments.json`] = JSON.stringify({
        round,
        items: [{ id: `r${round}-1`, screen: "s", state: "t", comment: "c" }],
      });
    const folder = project(files);
    expect((await cli(folder, "build", FLOW_DESIGN)).code).toBe(0);
    const config = pageConfig(folder, FLOW_DESIGN);
    expect(config.rounds.map((round) => round.round)).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
    expect(config.findings.map((item) => item.rule)).toEqual(["rounds.limit"]);
  });
});

describe("one rounds folder for each design", () => {
  test("two designs in one folder keep their own rounds", async () => {
    const one = { round: 1, items: [{ id: "r1-1", screen: "start", state: "success", comment: "Cards." }] };
    const folder = project({ "design/cards.html": single(), "design/list.html": single(), "one.json": JSON.stringify(one) });
    expect((await cli(folder, "save-comments", "one.json", "design/cards.html")).code).toBe(0);
    expect((await cli(folder, "save-comments", "one.json", "design/list.html")).code).toBe(0);
    expect([existsSync(join(folder, "design/rounds/cards/1/comments.json")), existsSync(join(folder, "design/rounds/list/1/comments.json"))]).toEqual([
      true,
      true,
    ]);
    await cli(folder, "build", "design/list.html");
    expect(pageConfig(folder, "design/list.html").rounds_path).toBe("design/rounds/list");
  });
});

describe("a round file's faults, each a finding or a refusal, and a comment's length", () => {
  const item = (id: string, comment = "c") => ({ id, screen: "start", state: "success", comment });
  test.each([
    ["one id twice in a round", "rounds/case/1/comments.json", { round: 1, items: [item("r1-1"), item("r1-1")] }],
    ["a C1 control character", "rounds/case/1/comments.json", { round: 1, items: [item("r1-1", "a\u0085b")] }],
    ["a change's screen that is no text", "rounds/case/2/changes.json", { changes: [{ summary: "x", screen: 5 }] }],
    ["more than 500 changes", "rounds/case/2/changes.json", { changes: Array.from({ length: 501 }, () => ({ summary: "x" })) }],
  ])("%s is a finding", async (_what, file, data) => {
    const folder = project({ "design/case.html": single(), [`design/${file}`]: JSON.stringify(data) });
    expect(await rules(folder, "design/case.html")).toEqual(["rounds.field"]);
  });
  test.each([
    ["one id twice", { round: 1, items: [item("r1-1"), item("r1-1")] }],
    ["a C1 control character", { round: 1, items: [item("r1-1", "a\u009bb")] }],
  ])("save-comments refuses %s, in one line", async (_what, data) => {
    const folder = project({ "design/case.html": single(), "c.json": JSON.stringify(data) });
    const ran = await cli(folder, "save-comments", "c.json", "design/case.html");
    expect([ran.code, ran.err.split("\n").length, existsSync(join(folder, "design/rounds"))]).toEqual([2, 1, false]);
  });
  test("a comment's length is counted in code points: 2,000 emoji are saved whole, 2,001 refused", async () => {
    const at = (n: number) => project({ "design/case.html": single(), "c.json": JSON.stringify({ round: 1, items: [item("r1-1", "🎉".repeat(n))] }) });
    expect((await cli(at(2000), "save-comments", "c.json", "design/case.html")).code).toBe(0);
    expect((await cli(at(2001), "save-comments", "c.json", "design/case.html")).code).toBe(2);
  });
});

// A ceiling, not a pin: the answers are gathered once, so a comment's answer costs its own answers, never every later
// round's. Each comment looked through each later round's answers here in about 2.3 s, and the gathered answers take 0.1.
test("200 rounds of 200 comments, answered by none of 199 changes files, are read within a second", () => {
  const files = new Map<string, string>();
  for (let round = 1; round <= 200; round++) {
    const items = Array.from({ length: 200 }, (_, i) => ({ id: `r${round}-${i + 1}`, screen: "s", state: "t", comment: "c" }));
    files.set(`rounds/a/${round}/comments.json`, JSON.stringify({ round, items }));
    if (round > 1) files.set(`rounds/a/${round}/changes.json`, JSON.stringify({ changes: [{ summary: "x", answers: items.map((_, i) => `r1-${i + 1}`) }] }));
  }
  const started = performance.now();
  const read = readRounds(files, "a");
  const took = performance.now() - started;
  expect([read.rounds.length, took < 1000]).toEqual([20, true]);
});

// The save read the whole standard input, then cut it: an endless one never ended.
test("save-comments stops reading an endless standard input at its limit, and refuses it", async () => {
  const folder = project({ "design/a.html": single() });
  const child = Bun.spawn(["bun", join(import.meta.dir, "../src/cli.ts"), "save-comments", "-", "design/a.html"], {
    cwd: folder,
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });
  const chunk = new Uint8Array(64 * 1024).fill(32);
  let open = true;
  const feed = (async () => {
    while (open) {
      try {
        child.stdin.write(chunk);
        await child.stdin.flush();
      } catch {
        return;
      }
    }
  })();
  const stop = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const code = await child.exited;
  open = false;
  clearTimeout(stop);
  await feed;
  expect(code).toBe(2);
}, 20_000);
