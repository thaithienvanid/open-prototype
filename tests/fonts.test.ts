/// <reference lib="dom" />
// Font files: a `url()` of an `@font-face`, in a design's styles or in a tokens file, names a font file inside the
// project, and the build writes it into the page as a `data:` URL of its media type. Each case is a row of a table.
// In a browser, text set in the test font, `tests/fonts/proof-wide.woff2` (made by `tests/fonts/proof-wide.py`, CC0),
// is measured against the same text in its fallback.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { READ_LIMITS } from "../src/format.ts";
import { type FileContent, FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project, REPOSITORY, without } from "./helpers.ts";
import { BROWSER, Browser } from "./viewer/page.ts";

type Finding = { rule: string; file: string | null; line: number | null; message: string };

const PROOF = new Uint8Array(readFileSync(join(REPOSITORY, "tests/fonts/proof-wide.woff2")));
/** A file that starts with a font's signature, as the build reads it: the browser is not asked to draw it. */
const signed = (head: string): { bytes: Uint8Array } => ({ bytes: new Uint8Array([...Buffer.from(head, "latin1"), 0, 1, 0, 0, 0, 0]) });
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const face = (src: string) => `@font-face {\n  font-family: "Brand";\n  src: ${src};\n}`;
/** A single design whose style holds one `@font-face`, at line 9 of the file, and reads its family. */
const design = (src: string, head = "") => single({ head, styles: `<style>\n${face(src)}\np { font-family: "Brand", sans-serif; }\n</style>` });
const TOKENS_HEAD = '<meta name="tokens" content="tokens/brand.css">\n';

/** Check and build the design, and give its findings and the page the build wrote. */
async function built(files: Record<string, FileContent>, file: string | null = "design/case.html"): Promise<{ findings: Finding[]; page: string }> {
  const folder = project(files);
  const args = file ? [file] : [];
  const { findings } = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", ...args));
  await cli(folder, "build", ...args);
  const page = readFileSync(join(folder, ".prototype/views", file ?? "index.html"), "utf8");
  return { findings, page };
}

/** The design's part of a page: its `<template id="product">`, which the frames show. */
const frames = (page: string): string =>
  page.slice(page.indexOf('<template id="product">'), page.indexOf('</template>\n<script type="application/json" id="fixtures">'));

describe("an @font-face's url() names a font file, and the page carries it", () => {
  test.each([
    ["a .woff2 beside the design", { "design/case.html": design("url(fonts/brand.woff2)"), "design/fonts/brand.woff2": { bytes: PROOF } }, "font/woff2", PROOF],
    ["a .woff", { "design/case.html": design("url(fonts/brand.woff)"), "design/fonts/brand.woff": signed("wOFF") }, "font/woff", signed("wOFF").bytes],
    [
      "a .ttf of TrueType outlines",
      { "design/case.html": design("url(fonts/brand.ttf)"), "design/fonts/brand.ttf": signed("\u0000\u0001\u0000\u0000") },
      "font/ttf",
      signed("\u0000\u0001\u0000\u0000").bytes,
    ],
    [
      "a .otf of CFF outlines",
      { "design/case.html": design("url(fonts/brand.otf)"), "design/fonts/brand.otf": signed("OTTO") },
      "font/otf",
      signed("OTTO").bytes,
    ],
    [
      "a quoted url() with a query and a format hint",
      { "design/case.html": design('url("fonts/brand.woff2?v=2") format("woff2")'), "design/fonts/brand.woff2": { bytes: PROOF } },
      "font/woff2",
      PROOF,
    ],
    [
      "a path that climbs out of the design's folder and stays in the project",
      { "design/case.html": design("url(../shared/brand.woff2)"), "shared/brand.woff2": { bytes: PROOF } },
      "font/woff2",
      PROOF,
    ],
    [
      "a tokens file's, read from that file's folder",
      { "design/case.html": single({ head: TOKENS_HEAD }), "tokens/brand.css": face("url(fonts/brand.woff2)"), "tokens/fonts/brand.woff2": { bytes: PROOF } },
      "font/woff2",
      PROOF,
    ],
  ] as const)("%s", async (_what, files, mime, bytes) => {
    const { findings, page } = await built(files);
    expect(findings).toEqual([]);
    expect(page).toContain(`url("data:${mime};base64,${base64(bytes)}")`);
    // The frames' markup holds the font as data alone; the page's settings block keeps a tokens file's text as written, for the System view.
    expect(frames(page)).not.toMatch(/url\("?(?:\.\.\/shared|fonts)\//);
  });

  test("a multi-flow design names its font file from the design's folder", async () => {
    const files: Record<string, FileContent> = flowDesign();
    files[FLOW_DESIGN] = String(files[FLOW_DESIGN] ?? "").replace("<title>", `<style>\n${face("url(fonts/brand.woff2)")}\n</style>\n<title>`);
    files["design/fonts/brand.woff2"] = { bytes: PROOF };
    const { findings, page } = await built(files, FLOW_DESIGN);
    expect(findings.filter((item) => item.rule === "integrity.font")).toEqual([]);
    expect(page).toContain(`url("data:font/woff2;base64,${base64(PROOF)}")`);
  });
});

describe("a url() whose font file the page cannot carry is a finding at its file and line, and the page carries none of it", () => {
  const big = new Uint8Array(READ_LIMITS.font + 1);
  big.set([...Buffer.from("wOF2")]);
  test.each([
    ["a file that does not exist", { "design/case.html": design("url(fonts/brand.woff2)") }, "design/case.html", 9, "does not exist"],
    ["a path that leaves the project", { "design/case.html": design("url(../../brand.woff2)") }, "design/case.html", 9, "leaves the project"],
    ["an absolute path", { "design/case.html": design("url(/fonts/brand.woff2)") }, "design/case.html", 9, "absolute path"],
    ["a file: URL", { "design/case.html": design("url(file:///fonts/brand.woff2)") }, "design/case.html", 9, "names no file of the project"],
    [
      "a path through a link",
      { "design/case.html": design("url(fonts/brand.woff2)"), "real/brand.woff2": { bytes: PROOF }, "design/fonts": { link: "../real" } },
      "design/case.html",
      9,
      "is a link",
    ],
    [
      "a file over the limit",
      { "design/case.html": design("url(fonts/brand.woff2)"), "design/fonts/brand.woff2": { bytes: big } },
      "design/case.html",
      9,
      `${READ_LIMITS.font / 1_000_000} MB`,
    ],
    [
      "a file whose bytes are no font of its type",
      { "design/case.html": design("url(fonts/brand.woff2)"), "design/fonts/brand.woff2": "<svg></svg>" },
      "design/case.html",
      9,
      "no .woff2 font",
    ],
    [
      "a type the page cannot carry",
      { "design/case.html": design("url(fonts/brand.eot)"), "design/fonts/brand.eot": "x" },
      "design/case.html",
      9,
      ".woff2, .woff",
    ],
    [
      "a tokens file's missing file, at the tokens file's line",
      { "design/case.html": single({ head: TOKENS_HEAD }), "tokens/brand.css": face("url(fonts/brand.woff2)") },
      "tokens/brand.css",
      3,
      "the tokens file's folder",
    ],
  ] as const)("%s", async (_what, files, file, line, words) => {
    const { findings, page } = await built(files);
    expect(findings.map((item) => [item.rule, item.file, item.line])).toEqual([["integrity.font", file, line]]);
    expect(findings[0]?.message).toContain(words);
    expect(page).not.toContain("data:font/");
  });

  test("a file the system will not let the tool read", async () => {
    const folder = project({ "design/case.html": design("url(fonts/brand.woff2)"), "design/fonts/brand.woff2": { bytes: PROOF } });
    const ran = await without("read", [join(folder, "design/fonts/brand.woff2")], () => cli(folder, "check", "--json", "design/case.html"));
    const findings = json<{ findings: Finding[] }>(ran).findings;
    expect([ran.code, findings.map((item) => [item.rule, item.file, item.line])]).toEqual([1, [["integrity.font", "design/case.html", 9]]]);
    expect(findings[0]?.message).toContain("cannot be read");
  });

  test("a font from the network stays integrity.load, and its message names the local way", async () => {
    const { findings, page } = await built({ "design/case.html": design('url("https://fonts.gstatic.com/s/brand/v1/brand.woff2") format("woff2")') });
    expect(findings.map((item) => [item.rule, item.file, item.line])).toEqual([["integrity.load", "design/case.html", 9]]);
    for (const words of ["download", "Google Fonts or Fontsource", "keep them in the project", "url()"]) expect(findings[0]?.message).toContain(words);
    expect(page).not.toContain("data:font/");
  });
});

describe.skipIf(!BROWSER)("an embedded font in a browser", () => {
  let browser: Browser;
  beforeAll(() => {
    browser = new Browser();
  });
  afterAll(async () => {
    await browser.close();
  });

  test("text set in the test font draws in it, and far wider than its fallback", async () => {
    const screens = `<section data-proto-screen="start" data-proto-title="Start">
  <div data-proto-state="success" data-testid="start-success"><p><span id="wide">Proof</span></p><p><span id="plain">Proof</span></p></div>
</section>`;
    const styles = `<style>\n${face("url(fonts/proof-wide.woff2)").replace('"Brand"', '"Proof Wide"')}\n#wide { font-family: "Proof Wide", monospace; }\n#plain { font-family: monospace; }\n</style>`;
    const folder = project({ "design/case.html": single({ styles, screens }), "design/fonts/proof-wide.woff2": { bytes: PROOF } });
    expect((await cli(folder, "build", "design/case.html")).code).toBe(0);
    const page = await browser.open(1024, 768);
    await page.goto(pathToFileURL(join(folder, ".prototype/views/design/case.html")).href);
    const seen = await page.evaluate(async () => {
      const doc = (document.getElementById("frame") as HTMLIFrameElement | null)?.contentDocument;
      if (!doc) return null;
      await doc.fonts.load('16px "Proof Wide"').catch(() => []);
      await doc.fonts.ready;
      const width = (id: string) => doc.getElementById(id)?.getBoundingClientRect().width ?? 0;
      return { faces: [...doc.fonts].map((one) => `${one.family.replaceAll('"', "")}: ${one.status}`), wide: width("wide"), plain: width("plain") };
    });
    await page.close();
    expect(seen?.faces).toEqual(["Proof Wide: loaded"]);
    // Each letter of the test font is two em wide, so five of them at 16 px take 160 px; a monospace fallback takes about 48.
    expect(seen?.wide ?? 0).toBeGreaterThan(3 * (seen?.plain ?? 0));
  }, 60_000);
});
