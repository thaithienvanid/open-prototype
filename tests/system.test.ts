// The design document, DESIGN.md: how its YAML is read, how each token becomes a CSS custom property, the light and
// dark roles, and every finding of the document at its own line. Then the system rules over a token file and a theme;
// `tests/checks.test.ts` holds each rule's failing, passing, and turned-off design.
import { describe, expect, test } from "bun:test";
import { readDesignMd } from "../src/design/designmd.ts";
import { literal, readSystem, systemCss } from "../src/design/system.ts";
import { single } from "./cases.ts";
import { answerWithin, cli, json, project } from "./helpers.ts";

type Finding = { rule: string; file: string | null; line: number | null; message: string };

/** The document read from its text, as `readFiles` and `load` read it. */
function read(text: string, themes: string[] = ["light"]) {
  const doc = readDesignMd(text);
  const system = readSystem("DESIGN.md", doc.blocks, doc.sections);
  return { system, css: systemCss(system, themes), rules: system.findings.map((item) => `${item.rule}:${item.line}`) };
}
const front = (yaml: string) => `---\n${yaml}\n---\n\n## Overview\n`;
const declared = (css: string) => Object.fromEntries([...css.matchAll(/^ {2}(--[\w-]+): (.*);$/gm)].map((found) => [found[1], found[2]]));

describe("each group of the document becomes custom properties by the format's own names", () => {
  test.each([
    ["a hex colour", 'colors:\n  primary: "#1D4ED8"', { "--color-primary": "#1D4ED8" }],
    ["a named colour and transparent", "colors:\n  ink: rebeccapurple\n  none: transparent", { "--color-ink": "rebeccapurple", "--color-none": "transparent" }],
    [
      "a nested color-mix()",
      'colors:\n  mix: "color-mix(in oklch, oklch(0.6 0.1 200) 40%, color-mix(in srgb, red, blue))"',
      { "--color-mix": "color-mix(in oklch, oklch(0.6 0.1 200) 40%, color-mix(in srgb, red, blue))" },
    ],
    ["a token named as a keyword", 'colors:\n  inherit: "#000"', { "--color-inherit": "#000" }],
    [
      "a signed dimension and 100%",
      "spacing:\n  pull: -0.5rem\n  container: 100%\n  '5': '5'",
      { "--spacing-pull": "-0.5rem", "--spacing-container": "100%", "--spacing-5": "5" },
    ],
    [
      "a spacing in each kind of CSS length unit, in any case",
      "spacing:\n  a: 2cm\n  b: 4Q\n  c: 60ch\n  d: 1.5lh\n  e: 100dvh\n  f: 50svw\n  g: 10vmax\n  h: 2REM",
      {
        "--spacing-a": "2cm",
        "--spacing-b": "4Q",
        "--spacing-c": "60ch",
        "--spacing-d": "1.5lh",
        "--spacing-e": "100dvh",
        "--spacing-f": "50svw",
        "--spacing-g": "10vmax",
        "--spacing-h": "2REM",
      },
    ],
    ["a radius", "rounded:\n  control: 8px", { "--radius-control": "8px" }],
    [
      "a bare 0 wherever a dimension goes",
      "spacing:\n  none: 0\nrounded:\n  square: 0\ntypography:\n  body:\n    fontFamily: serif\n    fontSize: 1rem\n    letterSpacing: 0\ncomponents:\n  row:\n    padding: 0",
      {
        "--spacing-none": "0",
        "--radius-square": "0",
        "--typography-body": "var(--text-body) var(--font-body)",
        "--font-body": "serif",
        "--text-body": "1rem",
        "--tracking-body": "0",
        "--component-row-padding": "0",
      },
    ],
    [
      "typography, with a quoted family and a negative tracking",
      "typography:\n  body:\n    fontFamily: \"'Inter', sans-serif\"\n    fontSize: 1rem\n    fontWeight: 400\n    lineHeight: 1.5\n    letterSpacing: -0.02em",
      {
        "--typography-body": "var(--font-weight-body) var(--text-body)/var(--leading-body) var(--font-body)",
        "--font-body": '"Inter", sans-serif',
        "--text-body": "1rem",
        "--font-weight-body": "400",
        "--leading-body": "1.5",
        "--tracking-body": "-0.02em",
      },
    ],
    [
      "a breakpoint group as a plain path",
      "typography:\n  sm:\n    headline-lg:\n      fontFamily: serif\n      fontSize: 2rem",
      {
        "--typography-sm-headline-lg": "var(--text-sm-headline-lg) var(--font-sm-headline-lg)",
        "--font-sm-headline-lg": "serif",
        "--text-sm-headline-lg": "2rem",
      },
    ],
    [
      "motion",
      "motion:\n  state-change:\n    duration: 150ms\n    delay: 0ms\n    timingFunction: cubic-bezier(0.2, 0, 0, 1)",
      {
        "--motion-state-change-duration": "150ms",
        "--motion-state-change-delay": "0ms",
        "--motion-state-change-timing-function": "cubic-bezier(0.2, 0, 0, 1)",
      },
    ],
    [
      "a component, by its properties in kebab case; an unknown one in a CSS length unit kept, one in no unit left out",
      'colors:\n  primary: "#1d4ed8"\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"\n    padding: 12px\n    shadowColor: "#000"\n    label: Send\n    gap: 2dvh\n    inset: 16foo',
      {
        "--color-primary": "#1d4ed8",
        "--component-button-primary-background-color": "var(--color-primary)",
        "--component-button-primary-padding": "12px",
        "--component-button-primary-shadow-color": "#000",
        "--component-button-primary-gap": "2dvh",
      },
    ],
    [
      "a chain of references stays live",
      'colors:\n  brand: "#123456"\n  primary: "{colors.brand}"\n  accent: "{colors.primary}"',
      { "--color-brand": "#123456", "--color-primary": "var(--color-brand)", "--color-accent": "var(--color-primary)" },
    ],
    ["a group beside a token", 'colors:\n  light: "#fff"\n  text: "#000"', { "--color-light": "#fff", "--color-text": "#000" }],
  ])("%s", (_what, yaml, expected) => {
    const { css, rules } = read(front(yaml));
    expect(rules).toEqual([]);
    expect(declared(css)).toEqual(expected);
  });

  test("the CSS follows the document's lines, so a number-like key keeps its place", () => {
    expect(Object.keys(declared(read(front("spacing:\n  '3': 1rem\n  '2': 0.5rem")).css))).toEqual(["--spacing-3", "--spacing-2"]);
  });
});

describe("light and dark become one role", () => {
  const two = 'colors:\n  light:\n    surface: "#fafafb"\n    only: "#eee"\n  dark:\n    surface: "#111317"';
  test.each([
    ["both groups, both themes", two, ["light", "dark"], { "--color-surface": "light-dark(var(--color-light-surface), var(--color-dark-surface))" }, true],
    ["both groups, the dark theme only", two, ["dark"], { "--color-surface": "var(--color-dark-surface)" }, false],
    ["both groups, the light theme only", two, ["light"], { "--color-surface": "var(--color-light-surface)" }, false],
    ["one group, both themes", 'colors:\n  light:\n    surface: "#fafafb"', ["light", "dark"], { "--color-surface": "var(--color-light-surface)" }, false],
  ])("%s", (_what, yaml, themes, roles, scheme) => {
    const { css } = read(front(yaml), themes);
    const found = declared(css);
    for (const [name, value] of Object.entries(roles)) expect(found[name]).toBe(value);
    // A path one group holds beside the other group gets no role.
    if (yaml.includes("dark:")) expect(found["--color-only"]).toBeUndefined();
    expect(css.includes("color-scheme: light dark")).toBe(scheme);
  });

  test("a reference to a member names the role, so it follows the theme, and each theme's value resolves", () => {
    const { system, css } = read(front(`${two}\ncomponents:\n  card:\n    backgroundColor: "{colors.light.surface}"`), ["light", "dark"]);
    expect(declared(css)["--component-card-background-color"]).toBe("var(--color-surface)");
    expect([literal(system, "--component-card-background-color", "light"), literal(system, "--component-card-background-color", "dark")]).toEqual([
      "#fafafb",
      "#111317",
    ]);
  });

  test("a member that names a member of a theme reads that member, never the role: no cycle, and no value of the other theme", () => {
    const yaml =
      'colors:\n  light:\n    brand: "#1d4ed8"\n    text: "#111111"\n    badge: "#222222"\n  dark:\n    brand: "{colors.light.brand}"\n    text: "#ffffff"\n    badge: "{colors.light.text}"';
    const { system, css, rules } = read(front(yaml), ["light", "dark"]);
    expect(rules).toEqual([]);
    expect([declared(css)["--color-dark-brand"], declared(css)["--color-dark-badge"]]).toEqual(["var(--color-light-brand)", "var(--color-light-text)"]);
    expect(["light", "dark"].map((theme) => literal(system, "--color-brand", theme as "light" | "dark"))).toEqual(["#1d4ed8", "#1d4ed8"]);
    expect(literal(system, "--color-badge", "dark")).toBe("#111111");
  });

  test.each([
    ["light", two, "system.theme:5", "add colors.dark.only"],
    ["dark", 'colors:\n  light:\n    surface: "#fafafb"\n  dark:\n    surface: "#111317"\n    only: "#222"', "system.theme:7", "add colors.light.only"],
  ])("a colour only %s holds is a theme note at its line that says to add the other, and joins no role", (_theme, yaml, rule, words) => {
    const { system, css, rules } = read(front(yaml), ["light", "dark"]);
    expect(rules).toEqual([rule]);
    expect(system.findings[0]?.message).toContain(words);
    expect(declared(css)["--color-only"]).toBeUndefined();
  });

  test("a role whose name a flat token has is a name finding, and no role is made", () => {
    const { css, rules } = read(front('colors:\n  surface: "#fff"\n  light:\n    surface: "#fafafb"'));
    expect(rules).toEqual(["system.name:5"]);
    expect(declared(css)["--color-surface"]).toBe("#fff");
  });
});

describe("each fault of the document is a finding at its line, and the token is left out", () => {
  test.each([['---\ncolors:\n  primary: "#1d4ed8"\n--- \n\n## Overview\n'], ['--- \ncolors:\n  primary: "#1d4ed8"\n---\t\n\n## Overview\n']])(
    "a front matter line with spaces after its --- still opens and closes it: %p",
    (text) => {
      const { css, rules } = read(text);
      expect([rules, declared(css)]).toEqual([[], { "--color-primary": "#1d4ed8" }]);
    },
  );

  test("a reference to a typography token with no family or no size is a reference finding, and no name is left dangling", () => {
    for (const body of ["    fontSize: 1rem", "    fontFamily: system-ui", '    fontFamily: system-ui\n    fontSize: "1rem; x"']) {
      const { css, rules } = read(front(`typography:\n  body:\n${body}\ncomponents:\n  button:\n    typography: "{typography.body}"`));
      expect({ body, reference: rules.includes(`system.reference:${body.split("\n").length + 6}`) }).toEqual({ body, reference: true });
      expect(css).not.toContain("var(--typography-body)");
    }
  });

  test.each([
    ["two paths that give one name", 'colors:\n  primary-light: "#fff"\n  primary:\n    light: "#eee"', ["system.name:5"]],
    [
      "a weight beside a token's own fontWeight",
      "typography:\n  x:\n    fontFamily: serif\n    fontWeight: 400\n  weight-x:\n    fontFamily: serif",
      ["system.name:7"],
    ],
    ["a key a CSS name cannot take", 'colors:\n  "brand color": "#fff"', ["system.name:3"]],
    ["__proto__ as a key", 'colors:\n  __proto__: "#fff"', ["system.name:3"]],
    ["an unquoted hex, which YAML reads as a comment", "colors:\n  primary: #fff", ["system.value:3"]],
    ["no dimension", "spacing:\n  md: 16 px", ["system.value:3"]],
    ["a radius with no unit", "rounded:\n  control: 8", ["system.value:3"]],
    ["a radius with a unit that is none", "rounded:\n  weird: 16foo", ["system.value:3"]],
    ["a spacing with a unit that is none", "spacing:\n  md: 16foo", ["system.value:3"]],
    ["a spacing in a unit no length has", "spacing:\n  md: 2deg", ["system.value:3"]],
    ["a radius in a length unit the format does not take", "rounded:\n  control: 1vh", ["system.value:3"]],
    ["a component's padding with no unit", "components:\n  row:\n    padding: 8", ["system.value:4"]],
    ["a component's height in a unit the format does not take", "components:\n  row:\n    height: 50%", ["system.value:4"]],
    [
      "a component's padding that names a bare number of spacing",
      "spacing:\n  md: 16\ncomponents:\n  row:\n    padding: '{spacing.md}'",
      ["system.reference:6"],
    ],
    ["a duration in seconds", "motion:\n  fast:\n    duration: 0.15s", ["system.value:4"]],
    ["an unsafe value", 'colors:\n  x: "#fff; } body { background: url(https://x) }"', ["system.value:3"]],
    ["a font family with a quote inside", "typography:\n  x:\n    fontFamily: 'Inter\", serif'\n    fontSize: 1rem", ["system.value:4"]],
    ["a token and a group in one", "typography:\n  x:\n    fontSize: 1rem\n    big:\n      fontSize: 2rem", ["system.value:3"]],
    [
      "a typography token where a colour goes",
      "colors:\n  x: '{typography.body}'\ntypography:\n  body:\n    fontFamily: serif\n    fontSize: 1rem",
      ["system.reference:3"],
    ],
    ["a reference to a missing path", "colors:\n  accent: '{colors.brand}'", ["system.reference:3"]],
    ["a reference to a group", "colors:\n  accent: '{colors.light}'\n  light:\n    a: '#fff'", ["system.reference:3"]],
    ["a cycle", "colors:\n  a: '{colors.b}'\n  b: '{colors.a}'", ["system.reference:3", "system.reference:4"]],
    ["a key written twice", 'colors:\n  primary: "#fff"\n  primary: "#000"', ["system.read:4"]],
    ["a block that is a list", "- a\n- b", ["system.read:1"]],
    ["no YAML", "colors: [", ["system.read:1"]],
  ])("%s", (_what, yaml, rules) => {
    expect(read(front(yaml)).rules).toEqual(rules);
  });

  test("a spacing value in no length's unit says what a spacing value may be", () => {
    const { system } = read(front("spacing:\n  md: 16foo"));
    expect(system.findings.map((item) => item.message)).toEqual([
      "`spacing.md` is `16foo`, which is no spacing value: write a number with a CSS length unit or %, such as 16px, 1.5rem, 100dvh, or 50%, or a bare number for a count or a ratio, such as 12",
    ]);
  });

  test("a chain of 21 references is too deep", () => {
    const chain = Array.from({ length: 22 }, (_, index) => `  c${index}: '${index === 21 ? "#fff" : `{colors.c${index + 1}}`}'`).join("\n");
    expect(read(front(`colors:\n${chain}`)).rules).toContain("system.reference:3");
  });

  test("an alias bomb stops at the node limit, quickly, and places nothing", async () => {
    const levels = Array.from({ length: 8 }, (_, index) => `l${index + 1}: &l${index + 1} [${Array(9).fill(`*l${index}`).join(", ")}]`).join("\n");
    const text = front(`l0: &l0 [x, x, x, x, x, x, x, x, x]\n${levels}\ncolors:\n  a: "#fff"`);
    const script = `import { readDesignMd } from "./src/design/designmd.ts";
import { readSystem } from "./src/design/system.ts";
const doc = readDesignMd(${JSON.stringify(text)});
const system = readSystem("DESIGN.md", doc.blocks, doc.sections);
console.log(JSON.stringify([system.findings.map((item) => item.rule + ":" + item.line), system.tokens]));`;
    expect(await answerWithin(script, 4_000)).toEqual({ answer: [["system.read:1"], []], within: true });
  });

  // A key and a heading each followed by a long run of space cost the square of the line, about 7 and 17 minutes at 1 MB.
  test.each([
    ["a key", '"---\\n  a" + " ".repeat(1_000_000) + "x\\n---\\n"'],
    ["a heading", '"## a" + " ".repeat(1_000_000) + "b\\n"'],
  ])("a line of 1 MB with %s and a long run of space is read in seconds", async (_what, text) => {
    const script = `import { readDesignMd } from "./src/design/designmd.ts";
readDesignMd(${text});
console.log("true");`;
    expect(await answerWithin(script, 4_000)).toEqual({ answer: true, within: true });
  });

  test("a top-level key in two blocks rejects the file whole", () => {
    const { system, rules } = read(`${front('colors:\n  a: "#fff"')}\n\`\`\`yaml\ncolors:\n  b: "#000"\n\`\`\`\n`);
    expect([rules, system.tokens]).toEqual([["system.read:8"], []]);
  });
});

describe("what the document says, and what it leaves out", () => {
  test("a yml block, a block scalar that holds keys, CRLF, and a byte order mark are read", () => {
    const text =
      "\uFEFF---\r\ndescription: |\r\n  name: one\r\n  name: two\r\ncolors:\r\n  a: '#fff'\r\n---\r\n\r\n```yml\r\nspacing:\r\n  md: 16px\r\n```\r\n";
    const { system, rules } = read(text);
    expect(rules).toEqual([]);
    expect(system.tokens.map((token) => [token.name, token.line])).toEqual([
      ["--color-a", 6],
      ["--spacing-md", 11],
    ]);
  });

  test("a yaml fence shown inside a four-backtick example is text", () => {
    const text = `${front('colors:\n  a: "#fff"')}\n\`\`\`\`markdown\n\`\`\`yaml\ncolors:\n  b: "#000"\n\`\`\`\n\`\`\`\`\n`;
    expect(read(text).system.tokens.map((token) => token.name)).toEqual(["--color-a"]);
  });

  test("a newer version is a note, an unknown key is ignored in silence, and the rest reads the same", () => {
    const { system, rules } = read(front('version: beta\niconography:\n  size: 24\ncolors:\n  a: "#fff"'));
    expect([rules, system.version, system.tokens.length]).toEqual([["system.version:2"], "beta", 1]);
  });

  test("a document with no tokens is one note", () => {
    expect(read("# Product\n\nWords only.\n").rules).toEqual(["system.empty:1"]);
  });

  test("the headings are kept with their lines, and a key's line is its own", () => {
    const { system } = read(front('colors:\n  a: "#fff"'));
    expect(system.sections).toEqual([{ heading: "Overview", line: 6 }]);
  });
});

describe("the system rules over a design that reads the document", () => {
  const doc = front(
    'colors:\n  primary: "#1d4ed8"\n  light:\n    surface: "#fafafb"\n  dark:\n    surface: "#111317"\nspacing:\n  "3": 1rem\nmotion:\n  state-change:\n    duration: 150ms\ncomponents:\n  button-primary:\n    backgroundColor: "{colors.primary}"',
  );
  const themes = '<meta name="themes" content="light dark">\n';
  const styled = (css: string, tokens = "") =>
    `<style data-proto-tokens>\n:root { --ring: 0 0 0 2px var(--color-primary); }${tokens}\n</style>\n<style>\n${css}\n</style>`;
  async function found(design: string, files: Record<string, string> = {}): Promise<{ code: number; found: Finding[] }> {
    const folder = project({ "DESIGN.md": doc, "design/case.html": design, ...files });
    const ran = await cli(folder, "check", "--json", "design/case.html");
    return { code: ran.code, found: json<{ findings: Finding[] }>(ran).findings };
  }
  const brief = (items: Finding[]) => items.map((item) => `${item.rule} ${item.file}:${item.line}`);

  test("a token file's override and its extra tokens are found at its lines; a dark variant is no override", async () => {
    const tokens =
      ':root {\n  --color-primary: #1d4ed8;\n  --spacing-3: 2rem;\n  --color-promo: #f00;\n}\n:root[data-proto-theme="dark"] { --color-primary: #93c5fd; }\n';
    const result = await found(single({ head: `${themes}<meta name="tokens" content="tokens/brand.css">\n`, styles: styled("") }), {
      "tokens/brand.css": tokens,
    });
    expect(brief(result.found)).toEqual(["system.override tokens/brand.css:3", "system.extra-token tokens/brand.css:4"]);
    expect(result.found[1]?.message).toBe("tokens/brand.css sets 1 token DESIGN.md lacks, such as --color-promo: add the ones designs share to DESIGN.md");
  });

  test("a design that shows a theme the document has no colours for is a note at the colors line", async () => {
    const folder = project({
      "DESIGN.md": front('colors:\n  light:\n    surface: "#fff"'),
      "design/case.html": single({ head: themes, styles: "<style>\np { margin: 0; }\n</style>" }),
    });
    expect(brief(json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings)).toEqual(["system.theme DESIGN.md:2"]);
  });

  test("each rule turns off, and the document's own rules with it", async () => {
    const folder = project({
      "DESIGN.md": front('colors:\n  a: "#fff"\n  b: "{colors.c}"'),
      "design/case.html": single({ styles: styled("p { color: var(--color-z); }") }),
      "prototype.config.json": JSON.stringify({ rules: { "system.reference": "off", "system.unknown-token": "off" } }),
    });
    expect(json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings).toEqual([]);
  });

  test("a design that reads a colour one theme lacks is told to add the other, and no suggestion names a member", async () => {
    const folder = project({
      "DESIGN.md": front('colors:\n  light:\n    surface: "#fafafb"\n    only: "#eeeeee"\n  dark:\n    surface: "#111317"'),
      "design/case.html": single({
        head: themes,
        styles: "<style>\np { color: var(--color-only); }\nb { color: var(--color-light-surfac); }\ni { color: #eeeeee; }\n</style>",
      }),
    });
    const findings = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    const words = (rule: string) => findings.filter((item) => item.rule === rule).map((item) => item.message);
    expect(words("system.unknown-token")).toEqual([
      "var(--color-only) names no token: DESIGN.md has colors.light.only and no colors.dark twin, so it is no role: add colors.dark.only to DESIGN.md",
      "var(--color-light-surfac) names no token: DESIGN.md has --color-surface",
    ]);
    expect(words("paint.raw-color")).toEqual([expect.not.stringContaining("--color-light-")]);
    expect(brief(findings.filter((item) => item.rule === "system.theme"))).toEqual(["system.theme DESIGN.md:5"]);
  });

  test("the design document's colours are the paint rules' suggestions, a role over its member", async () => {
    const result = await found(single({ styles: styled("p { color: #fafafb; }"), head: themes }));
    expect(result.found.map((item) => item.message)).toEqual([expect.stringContaining("var(--color-surface)")]);
  });
});

describe("the settings key", () => {
  test("design_md names the document, null turns it off, and a named file that is missing is refused with the step", async () => {
    const design = single({ styles: "<style>\np { color: var(--color-nope); }\n</style>" });
    const doc = front('colors:\n  a: "#fff"');
    const named = project({ "docs/DESIGN.md": doc, "design/case.html": design, "prototype.config.json": '{ "design_md": "docs/DESIGN.md" }' });
    expect(json<{ findings: Finding[] }>(await cli(named, "check", "--json", "design/case.html")).findings.map((item) => item.rule)).toEqual([
      "system.unknown-token",
    ]);
    const off = project({ "DESIGN.md": doc, "design/case.html": design, "prototype.config.json": '{ "design_md": null }' });
    expect((await cli(off, "check", "--json", "design/case.html")).code).toBe(0);
    const missing = await cli(
      project({ "design/case.html": design, "prototype.config.json": '{ "design_md": "docs/DESIGN.md" }' }),
      "check",
      "design/case.html",
    );
    expect([missing.code, missing.err]).toEqual([
      2,
      "problem: `design_md` names docs/DESIGN.md, which does not exist: write it with `open-prototype new-design-md`, or set `design_md` to null [request.settings]",
    ]);
    const wrong = await cli(project({ "design/case.html": design, "prototype.config.json": '{ "design_md": 3 }' }), "check", "design/case.html");
    expect(wrong.code).toBe(2);
    // With the default and no file, nothing is read and nothing is said.
    expect((await cli(project({ "design/case.html": single() }), "check", "design/case.html")).code).toBe(0);
  });
});
