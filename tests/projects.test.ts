// The two kinds of project, each a folder under tests/projects, copied to a scratch folder and started as an agent
// starts it: `project` first, then what is missing. A new project writes its design document and its designs, and checks
// clean. An existing one has a design document, a token file, a story index, and real copy, and each finding is at its line.
import { describe, expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, json, outputErrors, project, REPOSITORY, schema, schemaErrors } from "./helpers.ts";

type Finding = { rule: string; level: string; file: string | null; line: number | null };
type Facts = {
  design_md: {
    file: string;
    exists: boolean;
    tokens: { name: string; light: string; dark: string }[];
    components: { name: string }[];
    sections: { heading: string }[];
  } | null;
  design_md_elsewhere: string[];
  tokens: { file: string; exists: boolean }[];
  story_index: string | null;
  findings: Finding[];
};

/** A copy of a test project in a new scratch folder. */
function copied(name: string): string {
  const folder = project();
  cpSync(join(REPOSITORY, "tests/projects", name), folder, { recursive: true });
  return folder;
}

const lineOf = (folder: string, file: string, needle: string) =>
  readFileSync(join(folder, file), "utf8")
    .split("\n")
    .findIndex((line) => line.includes(needle)) + 1;
const pageConfig = (folder: string, page: string) =>
  JSON.parse(/id="page-config">([\s\S]*?)<\/script>/.exec(readFileSync(join(folder, page), "utf8"))?.[1] ?? "{}") as Record<string, unknown>;

describe("a new project", () => {
  test("project finds nothing, and the starts write a document and designs that check clean", async () => {
    const folder = copied("new");
    const first = await cli(folder, "project");
    expect(first.code).toBe(0);
    const facts = json<Facts>(first);
    expect(outputErrors("project", facts)).toEqual([]);
    expect([facts.design_md?.exists, facts.design_md?.file, facts.design_md_elsewhere, facts.tokens, facts.story_index]).toEqual([
      false,
      "DESIGN.md",
      [],
      [],
      null,
    ]);
    const written = await cli(folder, "new-design-md", "--name", "Sample App", "--json");
    expect([written.code, outputErrors("new-design-md", json(written)), json<{ written: string[] }>(written).written]).toEqual([0, [], ["DESIGN.md"]]);
    expect((await cli(folder, "new-design", "design/start.html")).code).toBe(0);
    // The start reads the document's tokens, so it carries no tokens block of its own.
    expect(readFileSync(join(folder, "design/start.html"), "utf8")).not.toContain("data-proto-tokens");
    const ran = await cli(folder, "check", "--json", "design/start.html");
    expect([ran.code, json<{ findings: Finding[] }>(ran).findings]).toEqual([0, []]);
    const again = json<Facts>(await cli(folder, "project"));
    expect([again.design_md?.exists, again.findings]).toEqual([true, []]);
    expect(again.design_md?.sections.map((item) => item.heading)).toEqual([
      "Overview",
      "Colors",
      "Typography",
      "Layout",
      "Elevation & Depth",
      "Shapes",
      "Motion & Micro-interaction",
      "Voice & Content Strategy",
      "Components",
      "Do's and Don'ts",
    ]);
    expect((await cli(folder, "new-design-md")).code).toBe(2);
  });

  test("new-design-md is refused when the settings read no document, and writes the path they name", async () => {
    const off = project({ "prototype.config.json": '{ "design_md": null }' });
    const refused = await cli(off, "new-design-md", "--json");
    expect([refused.code, json<Facts>(refused).findings.map((item) => item.rule)]).toEqual([2, ["request.settings"]]);
    const named = project({ "prototype.config.json": '{ "design_md": "docs/DESIGN.md" }' });
    const facts = json<Facts>(await cli(named, "project"));
    expect([facts.design_md?.file, facts.design_md?.exists]).toEqual(["docs/DESIGN.md", false]);
    expect((await cli(named, "check", "design/a.html")).code).toBe(2);
    expect(json<{ written: string[] }>(await cli(named, "new-design-md", "--json")).written).toEqual(["docs/DESIGN.md"]);
  });

  test("the name is one value of YAML, so a colon or a quote adds no key", async () => {
    const folder = project();
    expect((await cli(folder, "new-design-md", "--name", 'A: "b" colors: x')).code).toBe(0);
    expect(readFileSync(join(folder, "DESIGN.md"), "utf8").split("\n")[2]).toBe('name: "A: \\"b\\" colors: x"');
    expect(json<Facts>(await cli(folder, "project")).findings).toEqual([]);
    expect((await cli(project(), "new-design-md", "--name", "two\nlines")).code).toBe(2);
  });
});

test.each([
  ["with no design document", false],
  ["with a design document", true],
])("new-design, %s, puts the title slot's h1 inside main and passes every accessibility rule as written", async (_what, documented) => {
  const folder = project();
  if (documented) expect((await cli(folder, "new-design-md")).code).toBe(0);
  expect((await cli(folder, "new-design", "design/start.html")).code).toBe(0);
  const main = /<main[\s>][\s\S]*<\/main>/.exec(readFileSync(join(folder, "design/start.html"), "utf8"))?.[0] ?? "";
  expect(/<h1 data-proto-slot="title">/.test(main)).toBe(true);
  for (const argv of [["check", "--json", "design/start.html"]]) {
    const ran = await cli(folder, ...argv);
    expect([argv.join(" "), ran.code, json<{ findings: Finding[] }>(ran).findings.filter((item) => item.rule.startsWith("accessibility."))]).toEqual([
      argv.join(" "),
      0,
      [],
    ]);
  }
});

describe("an existing project", () => {
  const folder = copied("existing");

  test("project prints the document with its section headings, the token file, the story index, and the documents elsewhere", async () => {
    cpSync(join(folder, "DESIGN.md"), join(folder, "messages/DESIGN.md"));
    const ran = await cli(folder, "project", "--json");
    const facts = json<Facts>(ran);
    expect([ran.code, outputErrors("project", facts)]).toEqual([0, []]);
    expect([facts.design_md?.exists, facts.design_md_elsewhere, facts.tokens, facts.story_index]).toEqual([
      true,
      ["messages/DESIGN.md"],
      [{ file: "tokens/brand.css", exists: true }],
      "storybook-static/index.json",
    ]);
    expect(facts.design_md?.components.map((item) => item.name)).toEqual(["message-row", "button-primary", "button-secondary"]);
    // Each section heading with its line, so an agent knows which prose to read; and no prose itself.
    expect(facts.design_md?.sections).toEqual(
      [
        "Overview",
        "Colors",
        "Typography",
        "Layout",
        "Elevation & Depth",
        "Shapes",
        "Motion & Micro-interaction",
        "Voice & Content Strategy",
        "Components",
        "Do's and Don'ts",
      ].map((heading) => ({ heading, line: lineOf(folder, "DESIGN.md", `## ${heading}`) })),
    );
    expect(ran.out).not.toContain("a small support team");
    expect(facts.design_md?.tokens.find((token) => token.name === "--color-surface")).toEqual(expect.objectContaining({ light: "#fafafb", dark: "#111317" }));
  });

  test("a correct design on it gets no finding: the token file agrees on one name and sets a dark variant", async () => {
    const ran = await cli(folder, "check", "--json", "design/inbox.html");
    expect([ran.code, json<{ findings: Finding[] }>(ran).findings]).toEqual([0, []]);
    expect((await cli(folder, "stories", "storybook-static/index.json", "design/inbox.html")).code).toBe(0);
  });

  test("a token file that overrides one of its names and adds another is found at each line", async () => {
    const changed = copied("existing");
    writeFileSync(
      join(changed, "tokens/brand.css"),
      readFileSync(join(changed, "tokens/brand.css"), "utf8").replace(
        "  --color-primary: #1d4ed8;\n",
        "  --color-primary: #1d4ed8;\n  --spacing-3: 1.25rem;\n  --color-promo: #b91c1c;\n",
      ),
    );
    const ran = await cli(changed, "check", "--json", "design/inbox.html");
    expect(json<{ findings: Finding[] }>(ran).findings.map(({ rule, file, line }) => ({ rule, file, line }))).toEqual([
      { rule: "system.override", file: "tokens/brand.css", line: lineOf(changed, "tokens/brand.css", "--spacing-3") },
      { rule: "system.extra-token", file: "tokens/brand.css", line: lineOf(changed, "tokens/brand.css", "--color-promo") },
    ]);
  });

  test("its page carries the three sources of tokens in order, and the document's shape, as the page contract says", async () => {
    expect((await cli(folder, "build", "design/inbox.html")).code).toBe(0);
    const config = pageConfig(folder, ".prototype/views/design/inbox.html");
    expect(schemaErrors(config, schema("page-config"))).toEqual([]);
    expect((config.tokens as { file: string }[]).map((token) => token.file)).toEqual(["DESIGN.md", "tokens/brand.css"]);
    expect((config.design_md as { file: string }).file).toBe("DESIGN.md");
    // The design's own styles, its third source, follow in the page's template.
    expect(readFileSync(join(folder, ".prototype/views/design/inbox.html"), "utf8")).toContain("--motion-state-change-duration: 0ms");
  });
});

test("the design document's shape is one in both schemas", () => {
  const defs = (name: string) => (schema(name) as { $defs: Record<string, unknown> }).$defs.design_md;
  expect(defs("output")).toEqual(defs("page-config"));
});
