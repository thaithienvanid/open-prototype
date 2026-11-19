// The one path rule. A project may sit under a linked folder; below its root, a link is refused for every read and
// every write. Each refusal is one line, exit code 2.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, project, SCRATCH } from "./helpers.ts";

const outside = join(SCRATCH, "outside");
mkdirSync(join(outside, "app/flows"), { recursive: true });
writeFileSync(join(outside, "secret.html"), "OUTSIDE-SECRET");
for (const [path, text] of Object.entries(flowDesign())) {
  mkdirSync(join(outside, "app", path.replace("design/", ""), ".."), { recursive: true });
  writeFileSync(join(outside, "app", path.replace("design/", "")), text);
}

async function refusedInOneLine(folder: string, ...argv: string[]): Promise<void> {
  const ran = await cli(folder, ...argv);
  expect({ argv, code: ran.code }).toEqual({ argv, code: 2 });
  expect(ran.err.split("\n").filter((line) => line)).toHaveLength(1);
  expect(ran.out + ran.err).not.toContain("OUTSIDE-SECRET");
}

describe("a project under a linked folder", () => {
  test("works as any other: the link above the project is no part of it", async () => {
    const real = project({ ...flowDesign(), "design/ok.html": single() });
    const linked = join(SCRATCH, `linked-${Date.now()}`);
    symlinkSync(real, linked);
    for (const argv of [
      ["check", FLOW_DESIGN],
      ["build", FLOW_DESIGN],
      ["check", "design/ok.html"],
      ["build", "design/ok.html"],
      ["new-design", "design/new.html"],
    ]) {
      expect({ argv, code: (await cli(linked, ...argv)).code }).toEqual({ argv, code: 0 });
    }
  });
});

describe("a link inside the project that leads out", () => {
  test("as the design's folder", async () => {
    const folder = project({ "docs/keep": "x" });
    symlinkSync(join(outside, "app"), join(folder, "design"));
    for (const argv of [
      ["check", FLOW_DESIGN],
      ["build", FLOW_DESIGN],
      ["screens", FLOW_DESIGN],
      ["components", FLOW_DESIGN],
      ["shots", FLOW_DESIGN],
      ["serve", "--port", "0", FLOW_DESIGN],
      ["save-comments", "c.json", FLOW_DESIGN],
    ])
      await refusedInOneLine(folder, ...argv);
  });

  test("as a flow or a block", async () => {
    for (const file of ["flows/items.html", "blocks/item-card.html"]) {
      const files = flowDesign();
      delete files[`design/${file}`];
      const folder = project(files);
      mkdirSync(join(folder, "design", file, ".."), { recursive: true });
      symlinkSync(join(outside, "secret.html"), join(folder, "design", file));
      const ran = await cli(folder, "build", FLOW_DESIGN);
      expect(ran.out + ran.err).not.toContain("OUTSIDE-SECRET");
      expect(ran.code).not.toBe(0);
      expect(
        existsSync(join(folder, ".prototype/views", FLOW_DESIGN)) &&
          readFileSync(join(folder, ".prototype/views", FLOW_DESIGN), "utf8").includes("OUTSIDE-SECRET"),
      ).toBe(false);
    }
  });

  test("as a design file, a tokens file, or a stories index", async () => {
    const folder = project({ "prototype.config.json": '{ "tokens": ["brand.css"] }' });
    symlinkSync(join(outside, "secret.html"), join(folder, "design.html"));
    symlinkSync(join(outside, "secret.html"), join(folder, "brand.css"));
    symlinkSync(join(outside, "secret.html"), join(folder, "index.json"));
    await refusedInOneLine(folder, "check", "design.html");
    await Bun.write(join(folder, "design/a.html"), single());
    await refusedInOneLine(folder, "build", "design/a.html");
    expect(existsSync(join(folder, ".prototype/views"))).toBe(false);
  });
});

describe("a link at the design document's path", () => {
  test("is a finding of project and check, never followed, and new-design goes on as for a document, as project does", async () => {
    const real = project({ "DESIGN.md": "# Product\n" });
    expect((await cli(real, "new-design", "design/a.html")).code).toBe(0);
    for (const target of [join(outside, "secret.html"), "docs/real.md", "nowhere.md"]) {
      const folder = project({ "docs/real.md": "# Product\n" });
      symlinkSync(target, join(folder, "DESIGN.md"));
      const made = await cli(folder, "new-design", "design/a.html");
      expect({ target, made: [made.code, made.err] }).toEqual({ target, made: [0, ""] });
      // The design is the one a project with a document that gives no token gets: the link is never read.
      expect(readFileSync(join(folder, "design/a.html"), "utf8")).toBe(readFileSync(join(real, "design/a.html"), "utf8"));
      const checked = await cli(folder, "check", "design/a.html");
      expect([checked.code, checked.out.includes("[system.read]"), checked.out.includes("OUTSIDE-SECRET")]).toEqual([1, true, false]);
      const facts = await cli(folder, "project");
      expect([facts.code, facts.out.includes('"rule": "system.read"'), facts.out.includes("OUTSIDE-SECRET")]).toEqual([1, true, false]);
    }
  });
});

describe("a link inside the project that stays inside", () => {
  test("is refused too: below the root, no part of a path is a link", async () => {
    const folder = project({ "design/ok.html": single() });
    symlinkSync(join(folder, "design"), join(folder, "alias"));
    await refusedInOneLine(folder, "check", "alias/ok.html");
  });
});

describe("a link at a place the tool writes", () => {
  test("is refused even when it stays inside", async () => {
    const folder = project({ "design/ok.html": single(), "real/keep": "x" });
    symlinkSync(join(folder, "real"), join(folder, "out"));
    await refusedInOneLine(folder, "--out-dir", "out", "build", "design/ok.html");
    await refusedInOneLine(folder, "new-design", "out/a.html");
    await refusedInOneLine(folder, "shots", "--capture", "--out", "out/shots", "design/ok.html");
    expect(existsSync(join(folder, "real/a.html"))).toBe(false);
  });

  test("as the design's folder, for a new design or a saved round", async () => {
    const folder = project({ "real/keep": "x", "c.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "s", state: "t", comment: "c" }] }) });
    mkdirSync(join(folder, "docs"));
    symlinkSync(join(folder, "real"), join(folder, "docs/design"));
    await refusedInOneLine(folder, "new-design", "docs/design/app.html");
    expect(existsSync(join(folder, "real/app.html"))).toBe(false);
  });
});

describe("a link at a place the tool writes or removes, leading out", () => {
  // Each plants a link out of the project where the tool writes or removes a file, and holds that the file outside is
  // the same after the command, and that the command refused in one line.
  const victim = (name: string) => {
    const folder = join(SCRATCH, `victim-${name}-${Date.now()}`);
    mkdirSync(join(folder, "design"), { recursive: true });
    writeFileSync(join(folder, "design/bad.html"), "VICTIM");
    writeFileSync(join(folder, "victim.png"), "VICTIM");
    return folder;
  };

  test("an old page is never removed through a linked views folder, or a linked folder inside it", async () => {
    const bad = single({ screens: '<section data-proto-screen="s"><div data-proto-state="t"><script>x</script></div></section>' });
    for (const link of [".prototype/views", ".prototype/views/design"]) {
      const outside = victim("views");
      const folder = project({ "design/bad.html": bad, ".prototype/.gitignore": "*\n" });
      mkdirSync(join(folder, link, ".."), { recursive: true });
      symlinkSync(link.endsWith("/design") ? join(outside, "design") : outside, join(folder, link));
      await refusedInOneLine(folder, "build", "design/bad.html");
      expect({ link, kept: existsSync(join(outside, "design/bad.html")) }).toEqual({ link, kept: true });
    }
  });

  test("a capture never writes a shot through a link at its name, even a shot taken as a copy of another", async () => {
    const folder = project(flowDesign());
    const outside = victim("shots");
    mkdirSync(join(folder, ".prototype/shots"), { recursive: true });
    // The overview and the component's own shot of one view share a link, so the second is the copy of the first.
    symlinkSync(join(outside, "victim.png"), join(folder, ".prototype/shots/items+list.populated.1024.light.item-card.default.png"));
    const saved = process.env.CHROME_BIN;
    process.env.CHROME_BIN = "/no/such/chrome";
    const argv = ["shots", "--capture", "--changed-component", "item-card", "--frames", "1024", FLOW_DESIGN];
    const ran = await cli(folder, ...argv);
    if (saved === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = saved;
    expect([ran.code, ran.err.includes("is a link"), readFileSync(join(outside, "victim.png"), "utf8")]).toEqual([2, true, "VICTIM"]);
  });
});

describe("the text of a path", () => {
  const folder = project({ "design/ok.html": single() });
  test.each([
    ["..", "../ok.html"],
    ["an absolute path", "/etc/hosts"],
    ["a NUL", "design/a\u0000.html"],
    ["a backslash", "design\\ok.html"],
    ["a space", "design/a b.html"],
    ["a dash first", "design/-x.html"],
    ["a dot first", "design/.x.html"],
    ["an empty path", ""],
    ["a part too long", `design/${"x".repeat(300)}.html`],
    ["a path too long", `${"d/".repeat(600)}x.html`],
  ])("%s is refused for a read and for a write", async (_what, path) => {
    await refusedInOneLine(folder, "check", path);
    await refusedInOneLine(folder, "new-design", "--", path);
  });
  test("each setting folder is held to the same rule", async () => {
    for (const bad of ["../x", "/tmp", "a b", "a\\b"]) await refusedInOneLine(folder, "--out-dir", bad, "check", "design/ok.html");
  });
  // A disk that ignores case finds the design by another spelling, which would give it another id and another page.
  const ignoresCase = existsSync(join(folder, "Design/OK.html"));
  test.skipIf(!ignoresCase)(
    `a design named in another case is refused, with the disk's spelling${ignoresCase ? "" : " (skipped: this disk tells case apart)"}`,
    async () => {
      for (const command of ["check", "build", "screens"]) {
        await refusedInOneLine(folder, command, "Design/OK.html");
        expect((await cli(folder, command, "Design/OK.html")).err).toContain("is spelled design/ok.html on the disk");
      }
      await refusedInOneLine(folder, "check", "design/Ok.html");
      expect((await cli(folder, "check", "./design//ok.html")).code).toBe(0);
    },
  );
});
