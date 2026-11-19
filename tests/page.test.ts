// The page: one script, named by its hash; each style block named by its hash; every frame sandboxed with no script;
// example data that never reaches the parser as markup; and comments kept by a design id.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withImages } from "../src/checks/images.ts";
import { isProductName, PAGE_BLOCKS, VIEWER_READY } from "../src/contract.ts";
import { styleHashes } from "../src/page.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, project, REPOSITORY } from "./helpers.ts";

const sha = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

async function page(files: Record<string, string>, ...file: string[]): Promise<string> {
  const folder = project(files);
  expect((await cli(folder, "build", ...file)).code).toBe(0);
  const name = file.length ? (file[0] ?? "") : "index.html";
  return readFileSync(join(folder, ".prototype/views", name), "utf8");
}

function policyOf(html: string): string {
  return /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1] ?? "";
}

describe("the page's policy", () => {
  test("names the viewer's one script and each style block by hash, and loads nothing", async () => {
    const html = await page(flowDesign(), FLOW_DESIGN);
    const policy = policyOf(html);
    const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (found) => found[1] ?? "");
    expect(scripts.length).toBe(1);
    expect(policy).toContain(`script-src ${sha(scripts[0] ?? "")};`);
    const styles = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g), (found) => sha(found[1] ?? ""));
    expect(policy).toContain(`style-src-elem ${[...new Set(styles)].join(" ")};`);
    for (const part of ["default-src 'none'", "img-src data:", "font-src data:", "base-uri 'none'", "form-action 'none'"]) expect(policy).toContain(part);
    expect(html.match(/<script\b/g)?.length).toBe(1 + (html.match(/<script type="application\/json"/g)?.length ?? 0));
  });

  test("every frame the viewer makes is sandboxed with no script", () => {
    const viewer = readFileSync(join(REPOSITORY, "assets/viewer.html"), "utf8");
    const sandboxes = viewer.match(/sandbox[:=]\s*"([^"]*)"/g) ?? [];
    expect(sandboxes.length).toBeGreaterThanOrEqual(3);
    for (const sandbox of sandboxes) expect(sandbox).toMatch(/"allow-same-origin"$/);
    expect(viewer).not.toMatch(/fetch\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon/);
  });

  test("example data never reaches the parser as markup", async () => {
    const html = await page(
      { "design/case.html": single({ fixtures: '{ "product": "x", "welcome": "\\u003c/script><script>alert(1)\\u003c/script> & <b>" }' }) },
      "design/case.html",
    );
    const fixtures = /<script type="application\/json" id="fixtures">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(fixtures).not.toMatch(/[<>&]/);
    expect(JSON.parse(fixtures).welcome).toBe("</script><script>alert(1)</script> & <b>");
  });

  test("the design goes in last, inside its template, and a title is escaped", async () => {
    const html = await page({ "design/case.html": single().replace("<title>A case</title>", "<title>&lt;b&gt; x</title>") }, "design/case.html");
    expect(html).toContain("<title>&lt;b&gt; x</title>");
    expect(html.indexOf('<template id="product">')).toBeLessThan(html.indexOf('<section data-proto-screen="start"'));
  });
});

describe("style hashes", () => {
  test("name each style block the tokenizer reads, and never one hidden inside svg", () => {
    expect(styleHashes("<style>a{}</style><p>x</p>")).toBe(sha("a{}"));
    expect(styleHashes("<svg><textarea><style>b{}</style></textarea></svg>")).toBe("'none'");
  });
});

describe("image fields", () => {
  test("a file a path names through a list's index is read in, as the viewer reads the path", () => {
    const images = new Map([["pic.png", { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }]]);
    const fixtures = { pics: [{ src: "pic.png" }], list: [{ "0": "pic.png" }] };
    const out = withImages(fixtures, new Set(["pics.0.src", "list.0"]), images);
    expect(out.fixtures).toEqual({ pics: [{ src: "data:image/png;base64,iVBORw==" }], list: [""] });
    expect(out.problems).toEqual(["the fixture `list.0` is no text: name a file beside the design, or a data:image URI"]);
  });
});

describe("comments are kept by a design id", () => {
  const config = (html: string) =>
    JSON.parse(/<script type="application\/json" id="page-config">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "{}") as { design_id: string };
  test("two designs get two ids, and one design keeps its id from build to build", async () => {
    const files = { "design/a.html": single(), "design/b.html": single() };
    const folder = project(files);
    await cli(folder, "build", "design/a.html");
    await cli(folder, "build", "design/b.html");
    const a = config(readFileSync(join(folder, ".prototype/views/design/a.html"), "utf8")).design_id;
    const b = config(readFileSync(join(folder, ".prototype/views/design/b.html"), "utf8")).design_id;
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    await cli(folder, "build", "design/a.html");
    expect(config(readFileSync(join(folder, ".prototype/views/design/a.html"), "utf8")).design_id).toBe(a);
  });
});

// The capture waits on the ready signal, and the tool fills the page's blocks, by names the contract owns: the viewer's
// page holds each, so the two programs cannot name one differently.
test("the built viewer holds the workspace the ready signal is on, and each block the tool fills, by the contract's ids", () => {
  const html = readFileSync(join(REPOSITORY, "assets/viewer.html"), "utf8");
  expect([
    html.includes(`id="${VIEWER_READY.workspace}"`),
    html.includes(`<template id="${PAGE_BLOCKS.product}">`),
    html.includes(`<script type="application/json" id="${PAGE_BLOCKS.fixtures}">`),
  ]).toEqual([true, true, true]);
});

// The check, the page's cut, and the viewer's header each counted the product's name: a character past U+FFFF, such as
// an emoji, is one to a person, and one to each of them now, so a name the check passes is one the header shows.
test("a product's name of 60 characters with one past U+FFFF passes the check, keeps its length in the page, and is one the header shows", async () => {
  const name = `\u{1d406} ${"Garden club reading list, seed and harvest planner".padEnd(58, ".")}`;
  expect([Array.from(name).length, name.length]).toEqual([60, 61]);
  const folder = project({ "design/a.html": single({ fixtures: JSON.stringify({ product: name, welcome: "Welcome back" }) }) });
  const ran = await cli(folder, "build", "design/a.html");
  const page = readFileSync(join(folder, ".prototype/views/design/a.html"), "utf8");
  const config = JSON.parse(/<script type="application\/json" id="page-config">\n([\s\S]*?)\n<\/script>/.exec(page)?.[1] ?? "{}") as { product: string };
  expect([ran.code, config.product === name, isProductName(config.product), isProductName(`${name}x`)]).toEqual([0, true, true, false]);
});
