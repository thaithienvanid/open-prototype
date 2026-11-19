// The controls a review broke without a test noticing: each test here fails when its control is taken out.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { READ_LIMITS } from "../src/format.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project } from "./helpers.ts";

type Finding = { rule: string; file: string | null; line: number | null };

async function rules(folder: string, ...file: string[]): Promise<string[]> {
  return json<{ findings: Finding[] }>(await cli(folder, "check", "--json", ...file)).findings.map((item) => item.rule);
}

describe("controls", () => {
  test("an image path never leaves the design's folder", async () => {
    const folder = project({
      "design/case.html": single({
        screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><img data-proto-image="photo" alt=""></div></section>',
        fixtures: '{ "product": "x", "photo": "../secret.png" }',
      }),
      "secret.png": "\u0089PNG",
    });
    expect(await rules(folder, "design/case.html")).toContain("integrity.image");
    await cli(folder, "build", "design/case.html");
    expect(readFileSync(join(folder, ".prototype/views/design/case.html"), "utf8")).not.toContain("data:image/png;base64");
    const linked = project({
      "design/case.html": single({
        screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><img data-proto-image="photo" alt=""></div></section>',
        fixtures: '{ "product": "x", "photo": "pic.png" }',
      }),
      "secret.png": "\u0089PNG",
      "design/pic.png": { link: "../secret.png" },
    });
    expect(await rules(linked, "design/case.html")).toContain("integrity.image");
  });

  test("a file of a design past its byte limit is never read: a design is read.file, and a block compose.use", async () => {
    const past = (text: string) => text.replace("</body>", `<!--${" ".repeat(READ_LIMITS.design_file)}--></body>`);
    const big = project({ "design/big.html": past(single()) });
    const found = json<{ findings: Finding[] }>(await cli(big, "check", "--json", "design/big.html")).findings;
    expect(found.map((item) => [item.rule, item.file])).toEqual([["read.file", "design/big.html"]]);
    const files = flowDesign();
    files["design/blocks/item-card.html"] = `${files["design/blocks/item-card.html"] ?? ""}<!--${" ".repeat(READ_LIMITS.design_file)}-->`;
    expect(await rules(project(files), FLOW_DESIGN)).toContain("compose.use");
  });

  test("a block's argument is escaped, so it adds no markup", async () => {
    const files = flowDesign();
    files["design/blocks/item-card.html"] = (files["design/blocks/item-card.html"] ?? "").replace("{{action}}", "<b>{{action}}</b>");
    files["design/flows/items.html"] = (files["design/flows/items.html"] ?? "").replaceAll(
      'data-proto-arg-action="Open item"',
      'data-proto-arg-action="&lt;script&gt;x()&lt;/script&gt;"',
    );
    const folder = project(files);
    expect(await rules(folder, FLOW_DESIGN)).not.toContain("unsafe.markup");
    await cli(folder, "build", FLOW_DESIGN);
    const page = readFileSync(join(folder, ".prototype/views", FLOW_DESIGN), "utf8");
    expect(page).toContain("<b>&lt;script&gt;x()&lt;/script&gt;</b>");
  });

  test("a flow link to a screen no flow draws is a problem, at its file and line", async () => {
    const files = flowDesign();
    files["design/flows/settings.html"] = (files["design/flows/settings.html"] ?? "").replace(
      /<\/section>\s*$/,
      '<button type="button" data-proto-go="items:nowhere" data-testid="x-go">Go</button></section>\n',
    );
    const found = json<{ findings: Finding[] }>(await cli(project(files), "check", "--json", FLOW_DESIGN)).findings;
    expect(found.filter((item) => item.rule === "integrity.link")).toEqual([expect.objectContaining({ file: "design/flows/settings.html", line: 6 })]);
  });

  // What was read past the limit is a fragment of the design, so no page and no manifest is made of it.
  test("a design nested deeper than the limit is refused with one problem, and stops the page and the manifests", async () => {
    const deep = "<div>".repeat(405) + "</div>".repeat(405);
    const folder = project({
      "design/case.html": single({ screens: `<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">${deep}</div></section>` }),
    });
    expect(await rules(folder, "design/case.html")).toEqual(["read.depth"]);
    const built = await cli(folder, "build", "--json", "design/case.html");
    expect([built.code, json<{ page: string | null }>(built).page, existsSync(join(folder, ".prototype/views/design/case.html"))]).toEqual([1, null, false]);
    for (const command of ["screens", "shots"]) expect((await cli(folder, command, "design/case.html")).code).toBe(1);
  });

  test("a format newer than the tool's is refused", async () => {
    const folder = project({ "design/case.html": single({ format: ' data-proto-format="2"' }) });
    expect(await rules(folder, "design/case.html")).toEqual(["read.format"]);
    expect((await cli(folder, "build", "design/case.html")).code).toBe(1);
  });

  test("a variant is a design of its own: the old variant line is refused, and no page is written", async () => {
    const folder = project({ "explore/a.html": single({ head: '<meta name="variant" content="a">\n' }) });
    expect(await rules(folder, "explore/a.html")).toEqual(["unsafe.markup"]);
    expect((await cli(folder, "build", "explore/a.html")).code).toBe(1);
  });

  describe("token files", () => {
    const named = (content: string) => single({ head: `<meta name="tokens" content="${content}">\n` });
    test.each([
      ["one that would end its style block", "design/t.css", ":root { --a: #fff; } </style><script>x()</script>"],
      ["one outside the project", "../t.css", null],
      ["one that is not UTF-8", "design/t.css", new Uint8Array([0x3a, 0xff, 0xfe, 0x7b])],
    ] as const)("%s is a read finding, and no page is written", async (_what, name, content) => {
      const files: Record<string, string | { bytes: Uint8Array }> = { "design/case.html": named(name) };
      if (typeof content === "string") files["design/t.css"] = content;
      else if (content) files["design/t.css"] = { bytes: content };
      const folder = project(files);
      expect(await rules(folder, "design/case.html")).toEqual(["system.tokens-file"]);
      expect((await cli(folder, "build", "design/case.html")).code).toBe(1);
      expect(existsSync(join(folder, ".prototype/views/design/case.html"))).toBe(false);
    });
  });

  test("an image larger than the limit is a finding, and the page carries none of it", async () => {
    const big = new Uint8Array(2_000_001);
    big.set([0x89, 0x50, 0x4e, 0x47]);
    const folder = project({
      "design/case.html": single({
        screens: '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><img data-proto-image="photo" alt=""></div></section>',
        fixtures: '{ "product": "x", "photo": "big.png" }',
      }),
      "design/big.png": { bytes: big },
    });
    expect(await rules(folder, "design/case.html")).toEqual(["integrity.image"]);
    await cli(folder, "build", "design/case.html");
    expect(readFileSync(join(folder, ".prototype/views/design/case.html"), "utf8")).not.toContain("data:image/png;base64");
  });

  test("a round file that cannot be read is left out, with a finding that names it", async () => {
    const folder = project({ "design/case.html": single(), "design/rounds/case/1/comments.json": { bytes: new Uint8Array([0x7b, 0xff, 0x7d]) } });
    const found = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.map((item) => [item.rule, item.file])).toEqual([["rounds.file", "design/rounds/case/1/comments.json"]]);
  });

  test("a change that answers a comment of its own round answers nothing", async () => {
    const folder = project({
      "design/case.html": single(),
      "design/rounds/case/1/comments.json": JSON.stringify({ round: 1, items: [{ id: "r1-1", screen: "start", state: "success", comment: "Make it bigger" }] }),
      "design/rounds/case/1/changes.json": JSON.stringify({ changes: [{ summary: "Bigger", answers: ["r1-1"] }] }),
    });
    expect(await rules(folder, "design/case.html")).toEqual(["rounds.answer"]);
    await cli(folder, "build", "design/case.html");
    const page = readFileSync(join(folder, ".prototype/views/design/case.html"), "utf8");
    const config = JSON.parse(/id="page-config">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? "{}");
    expect(config.rounds[0].items[0].done).toBe(false);
  });

  test("a work item with a space is never kept", async () => {
    const folder = project({ "design/case.html": single({ head: '<meta name="work-item" content="CARD 12">\n' }) });
    await cli(folder, "build", "design/case.html");
    const page = readFileSync(join(folder, ".prototype/views/design/case.html"), "utf8");
    expect(JSON.parse(/id="page-config">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? "{}").work_item).toBe("");
  });
});

describe("a finding inside a block names its use", () => {
  test("the block's file and line, and the line that uses it, from the project's top", async () => {
    const screens = [
      '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">',
      '<div data-proto-use="row"></div>',
      '<div data-proto-use="row"></div>',
      '<div data-proto-use="go" data-proto-arg-to="start"></div>',
      '<div data-proto-use="go" data-proto-arg-to="nowhere"></div>',
      "</div></section>",
    ].join("\n");
    const folder = project({
      "design/case.html": single({ screens }),
      "design/blocks/row.html": '<p id="r1">Row</p>\n',
      "design/blocks/go.html": '<button type="button" data-proto-go="{{to}}" data-testid="go-{{to}}">Go</button>\n',
    });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    const at = (rule: string) =>
      found.filter((item) => item.rule === rule).map((item) => [item.file, item.line, /\(used at ([^)]*)\)$/.exec(item.message)?.[1]]);
    expect(at("integrity.id-repeat")).toEqual([["design/blocks/row.html", 1, "design/case.html:18"]]);
    expect(at("integrity.link")).toEqual([["design/blocks/go.html", 1, "design/case.html:20"]]);
  });

  // A missing block, as a missing flow, names the file to write, so a person knows where it goes.
  test("a missing block and a missing flow each name the file to write from the project's top", async () => {
    const screens = [
      '<div data-proto-flow="shop"></div>',
      '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">',
      '<div data-proto-use="card"></div>',
      "</div></section>",
    ].join("\n");
    const folder = project({ "design/case.html": single({ screens }) });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.filter((item) => item.message.includes("does not exist")).map((item) => [item.rule, item.message])).toEqual([
      ["flow.include", 'flows/shop.html does not exist: write design/flows/shop.html, or take out data-proto-flow="shop"'],
      ["compose.use", 'blocks/card.html does not exist: write design/blocks/card.html, or take out data-proto-use="card"'],
    ]);
  });

  // The first line of a block is the block's wherever its use sits on the host's line; what stands before or after the
  // use on that line stays the host's.
  test.each([
    ["on a line of its own", ['<div data-proto-use="go" data-proto-arg-to="nowhere"></div>'], [["design/blocks/go.html", 1, "design/case.html:17"]]],
    [
      "in the middle of a line, between the host's own links",
      [
        '<button type="button" data-proto-go="before">B</button><div data-proto-use="go" data-proto-arg-to="nowhere"></div><button type="button" data-proto-go="after">A</button>',
      ],
      [
        ["design/case.html", 17, undefined],
        ["design/case.html", 17, undefined],
        ["design/blocks/go.html", 1, "design/case.html:17"],
      ],
    ],
    [
      "twice on one line",
      ['<p>Two</p><div data-proto-use="go" data-proto-arg-to="nowhere"></div><div data-proto-use="go" data-proto-arg-to="elsewhere"></div>'],
      [
        ["design/blocks/go.html", 1, "design/case.html:17"],
        ["design/blocks/go.html", 1, "design/case.html:17"],
      ],
    ],
    [
      "in a block used in the middle of a line",
      ['<p>Nested</p><div data-proto-use="wrap"></div>'],
      [["design/blocks/go.html", 1, "design/blocks/wrap.html:1, itself used at design/case.html:17"]],
    ],
  ])("a block used %s", async (_how, lines, expected) => {
    const screens = ['<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">', ...lines, "</div></section>"].join("\n");
    const folder = project({
      "design/case.html": single({ screens }),
      "design/blocks/go.html": '<button type="button" data-proto-go="{{to}}">Go</button>\n',
      "design/blocks/wrap.html": '<div><b>W</b><div data-proto-use="go" data-proto-arg-to="inner"></div></div>\n',
    });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    const links = found.filter((item) => item.rule === "integrity.link").map((item) => [item.file, item.line, /\(used at ([^)]*)\)$/.exec(item.message)?.[1]]);
    expect(links).toEqual(expected);
  });

  // A fault of the block itself is the block's, so it is told once, at its line, and not again for each use.
  test("a fault of the block itself is told once, at its own line and its first use", async () => {
    const screens = [
      '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">',
      ...Array.from({ length: 2 }, () => '<div data-proto-use="pair"></div>\n<div data-proto-use="named"></div>\n<div data-proto-use="host"></div>'),
      "</div></section>",
    ].join("\n");
    const folder = project({
      "design/case.html": single({ screens }),
      "design/blocks/pair.html": "<p>a</p>\n<p>b</p>\n",
      "design/blocks/named.html": "<div>\n<p>{{Bad}}</p>\n</div>\n",
      "design/blocks/host.html": '<div>\n<div data-proto-use="pair" class="x"></div>\n</div>\n',
    });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(
      found.filter((item) => item.rule.startsWith("compose.")).map((item) => [item.rule, item.file, item.line, /\(used at ([^)]*)\)$/.exec(item.message)?.[1]]),
    ).toEqual([
      ["compose.use", "design/blocks/host.html", 2, "design/case.html:19"],
      ["compose.arg", "design/blocks/named.html", 2, "design/case.html:18"],
      ["compose.use", "design/blocks/pair.html", 2, "design/case.html:17"],
    ]);
  });

  // The earlier place of a repeated id is read at its column, since a line a block shares with its host holds both, and
  // only the column tells the host's file from the block's.
  test.each([
    ["the host's id, then the block on its line", '<p id="a">x</p><div data-proto-use="one"></div>', ["design/blocks/one.html", 1, "design/case.html:17"]],
    ["the block, then the host's id on its line", '<div data-proto-use="tail"></div><p id="a">y</p>', ["design/case.html", 17, "design/blocks/tail.html:2"]],
  ])("a repeated id names the earlier one's own file: %s", async (_how, line, expected) => {
    const screens = ['<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">', line, "</div></section>"].join("\n");
    const folder = project({
      "design/case.html": single({ screens }),
      "design/blocks/one.html": '<p id="a">y</p>\n',
      "design/blocks/tail.html": '<div>\n<p id="a">t</p>\n</div>\n',
    });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(
      found.filter((item) => item.rule === "integrity.id-repeat").map((item) => [item.file, item.line, /repeats the id on (\S+);/.exec(item.message)?.[1]]),
    ).toEqual([expected]);
  });

  // A finding in a block used in a block named only the nearest use, a line of a block that may be used many times.
  test("a finding in a block used in a block names each use, out to the design's file", async () => {
    const screens = [
      '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">',
      '<div data-proto-use="wrap" data-proto-arg-to="start"></div>',
      '<div data-proto-use="wrap" data-proto-arg-to="nowhere"></div>',
      "</div></section>",
    ].join("\n");
    const folder = project({
      "design/case.html": single({ screens }),
      "design/blocks/wrap.html": '<div>\n<div data-proto-use="go" data-proto-arg-to="{{to}}"></div>\n</div>\n',
      "design/blocks/go.html": '<button type="button" data-proto-go="{{to}}" data-testid="go">Go</button>\n',
    });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(
      found.filter((item) => item.rule === "integrity.link").map((item) => [item.file, item.line, /\(used at ([^)]*)\)$/.exec(item.message)?.[1]]),
    ).toEqual([["design/blocks/go.html", 1, "design/blocks/wrap.html:2, itself used at design/case.html:18"]]);
  });
});

describe("a block's own lines and its one root", () => {
  // An argument's line breaks are written as references, so the lines after it in the block keep their own numbers.
  test("a finding after an argument of three lines names the block's own line", async () => {
    const screens = [
      '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s">',
      '<div data-proto-use="card" data-proto-arg-label="a\nb\nc"></div>',
      "</div></section>",
    ].join("\n");
    const folder = project({
      "design/case.html": single({ screens }),
      "design/blocks/card.html": '<div>\n<p>{{label}}</p>\n<button type="button" data-proto-go="nowhere">Go</button>\n</div>\n',
    });
    const found = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.filter((item) => item.rule === "integrity.link").map((item) => [item.file, item.line])).toEqual([["design/blocks/card.html", 3]]);
  });

  test("a block of two roots is a finding, even when an end tag closes an element left open inside the first", async () => {
    const screens = '<section data-proto-screen="start"><div data-proto-state="success" data-testid="s"><div data-proto-use="two"></div></div></section>';
    const folder = project({ "design/case.html": single({ screens }), "design/blocks/two.html": "<div><span></div><div>second</div>\n" });
    const found = json<{ findings: (Finding & { message: string })[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.some((item) => item.rule === "compose.use" && item.message.startsWith("a block is one root element"))).toBe(true);
  });
});

describe("a tokens file is read as a tokens block", () => {
  const design = single({ head: '<meta name="tokens" content="brand/t.css">\n' });
  test.each([
    ["an import from the network", ':root { --a: #fff; }\n@import url("https://example.com/a.css");\n', "integrity.load", 2, 0],
    ["a font from the network", "@font-face { font-family: x;\n  src: url(https://example.com/x.woff2); }\n", "integrity.load", 2, 0],
    ["an image from the network", ':root {\n\n  --hero: url("//example.com/a.png");\n}\n', "integrity.load", 3, 0],
    ["</template> in a comment", ":root { --a: #fff; }\n/* </template> */\n", "system.tokens-file", 2, 1],
    ["<template", ":root { --a: #fff; }\n\n/* <template> */\n", "system.tokens-file", 3, 1],
    ["a NUL", ":root { --a: #fff; }\n:root { --b: \u0000; }\n", "system.tokens-file", 2, 1],
  ])("%s is a finding at the tokens file's own line, and a design problem", async (_what, css, rule, line, stops) => {
    const folder = project({ "design/case.html": design, "brand/t.css": css });
    const ran = await cli(folder, "check", "--json", "design/case.html");
    expect([ran.code, json<{ findings: Finding[] }>(ran).findings.map((item) => [item.rule, item.file, item.line])]).toEqual([
      1,
      [[rule, "brand/t.css", line]],
    ]);
    const built = await cli(folder, "build", "design/case.html");
    expect([built.code, existsSync(join(folder, ".prototype/views/design/case.html"))]).toEqual([1, stops === 0]);
  });
  test("a raw colour in a tokens file is the tokens block's own, and passes", async () => {
    const folder = project({ "design/case.html": design, "brand/t.css": ":root { --a: #fff; --shadow: 0 1px 2px rgb(0 0 0 / 0.2); }\n" });
    expect((await cli(folder, "check", "design/case.html")).code).toBe(0);
  });
  test("one larger than 1 MB is left out with a tokens-file finding, and never read whole", async () => {
    const folder = project({ "design/case.html": design, "brand/t.css": `:root { --a: #fff; }\n/* ${"x".repeat(1_000_000)} */\n` });
    const ran = await cli(folder, "check", "--json", "design/case.html");
    expect([ran.code, json<{ findings: Finding[] }>(ran).findings.map((item) => item.rule)]).toEqual([1, ["system.tokens-file"]]);
  });
});

describe("the design document is hostile input", () => {
  // Each value would close the page's style block, load from the network, or end a declaration, if it reached the page.
  test.each([
    ["a value that ends the rule", '"#fff; } body { background: red }"', ";}"],
    ["a url()", '"url(https://example.com/x.png)"', "url("],
    ["a quote", "'#fff\" onload=\"x()'", "onload"],
    ["the end of the style block", '"</style><script>x()</script>"', "</style><script"],
    ["a var() of the page's own", '"var(--anything)"', "var(--anything)"],
  ])("%s never reaches the page, and is a value finding", async (_what, value, needle) => {
    const folder = project({ "DESIGN.md": `---\ncolors:\n  bad: ${value}\n  good: "#fff"\n---\n`, "design/case.html": single() });
    const found = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.filter((item) => item.file === "DESIGN.md").map((item) => `${item.rule}:${item.line}`)).toEqual(["system.value:3"]);
    await cli(folder, "build", "design/case.html");
    const page = readFileSync(join(folder, ".prototype/views/design/case.html"), "utf8");
    const config = JSON.parse(/id="page-config">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? "{}") as { tokens: { file: string; css: string }[] };
    const block = config.tokens.find((token) => token.file === "DESIGN.md")?.css ?? "";
    expect(block).toContain("--color-good: #fff;");
    expect(page).toContain("--color-good: #fff;");
    expect(block).not.toContain(needle);
    expect(page.split("--color-bad").length).toBe(1);
  });

  test("a family name with a quote, and a feature with an open quote, are refused", async () => {
    const folder = project({
      "DESIGN.md": `---\ntypography:\n  a:\n    fontFamily: 'x", serif'\n    fontSize: 1rem\n    fontFeature: '"liga'\n---\n`,
      "design/case.html": single(),
    });
    const found = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect(found.filter((item) => item.file === "DESIGN.md").map((item) => `${item.rule}:${item.line}`)).toEqual(["system.value:4", "system.value:6"]);
  });
});
