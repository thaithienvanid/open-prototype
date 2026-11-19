import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readMarkup } from "../src/html/tokenizer.ts";
import { unescapeAttribute, unescapeText } from "../src/html/unescape.ts";
import { readJson } from "../src/json.ts";
import { nearest, quoted, shown } from "../src/text.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, json, project } from "./helpers.ts";

function events(text: string): unknown[] {
  const out: unknown[] = [];
  readMarkup(text, {
    start: (tag, attrs, place) => out.push(["start", tag, attrs, place.line]),
    startEnd: (tag, attrs, place) => out.push(["startEnd", tag, attrs, place.line]),
    end: (tag) => out.push(["end", tag]),
    data: (data) => out.push(["data", data]),
    comment: (data) => out.push(["comment", data]),
  });
  return out;
}

describe("the tokenizer", () => {
  test.each([
    [
      "<div a=1 b='2' c d>x</div>",
      [
        [
          "start",
          "div",
          [
            ["a", "1"],
            ["b", "2"],
            ["c", null],
            ["d", null],
          ],
          1,
        ],
        ["data", "x"],
        ["end", "div"],
      ],
    ],
    [
      '<p title="a &amp; b &copy=x">&nbsp;</p>',
      [
        ["start", "p", [["title", "a & b &copy=x"]], 1],
        ["data", " "],
        ["end", "p"],
      ],
    ],
    [
      "<script>if (a < b) '</div>'</script>",
      [
        ["start", "script", [], 1],
        ["data", "if (a < b) '</div>'"],
        ["end", "script"],
      ],
    ],
    [
      "<!--> x --!> <!-- y -->",
      [
        ["comment", ""],
        ["data", " x --!> "],
        ["comment", " y "],
      ],
    ],
    [
      "</ div><!x>",
      [
        ["comment", " div"],
        ["comment", "x"],
      ],
    ],
    [
      "<br/>\n<svg/>",
      [
        ["startEnd", "br", [], 1],
        ["data", "\n"],
        ["startEnd", "svg", [], 2],
      ],
    ],
    ["<div", []],
    [
      "<textarea>&amp;<b></textarea>",
      [
        ["start", "textarea", [], 1],
        ["data", "&<b>"],
        ["end", "textarea"],
      ],
    ],
  ])("%p", (text, expected) => {
    const merged = (events(text) as [string, ...unknown[]][]).reduce<unknown[][]>((list, event) => {
      const last = list[list.length - 1];
      if (event[0] === "data" && last?.[0] === "data") last[1] = String(last[1]) + String(event[1]);
      else list.push([...event]);
      return list;
    }, []);
    expect(merged).toEqual(expected as unknown[][]);
  });

  test("a start tag's line is the line it starts on", () => {
    expect(events("<a>\n\n<b\n c>")[1]).toEqual(["data", "\n\n"]);
    expect(events("<a>\n\n<b\n c>")[2]).toEqual(["start", "b", [["c", null]], 3]);
  });
});

describe("character references", () => {
  test("text takes the longest name the standard knows", () => {
    expect(unescapeText("&notit; &#128; &#x110000; &amp")).toBe("¬it; € � &");
  });
  test("an attribute takes a named reference only when it is exact", () => {
    expect(unescapeAttribute("&notit;&amp;&copy=")).toBe("&notit;&&copy=");
  });
});

describe("JSON", () => {
  test("a mistake names its line and column", () => {
    expect(readJson('{\n  "a": 1,\n}')).toMatchObject({ ok: false, error: expect.stringContaining("at line 2, column 9") });
    expect(readJson("NaN").ok).toBe(false);
  });
  test("a number too large for a double is refused, as Infinity is, and a key written twice is named at its own quote", () => {
    expect([readJson("1e1000").ok, readJson('{"a": -1e400}').ok, readJson("1e308").ok]).toEqual([false, false, true]);
    expect(readJson('{"\\u0061": 1, "\\u0061": 2}')).toMatchObject({ ok: false, error: expect.stringContaining("at line 1, column 15") });
    expect(readJson('{"a": 1, "a": 2}')).toMatchObject({ ok: false, error: expect.stringContaining("at line 1, column 10") });
  });
  test("__proto__ is data, never the object's prototype", () => {
    const read = readJson('{"b": 1, "__proto__": {"x": 1}}');
    if (!read.ok) throw new Error(read.error);
    expect(Object.keys(read.value as object)).toEqual(["b", "__proto__"]);
    expect(Object.getPrototypeOf(read.value)).toBe(Object.prototype);
  });
});

describe("messages", () => {
  test("a quoted value has no control or direction character and 80 characters at most", () => {
    expect(quoted("a\u001b[2Kb‮c")).toBe("a[2Kbc");
    expect(Array.from(quoted("é".repeat(100))).length).toBe(80);
  });
  test("a value shows as JSON writes it, so a person sees where a text starts and ends", () => {
    expect(shown("it's")).toBe('"it\'s"');
    expect(shown({ go: "x" })).toBe('{"go":"x"}');
  });
  test("the nearest name is the one a few edits away", () => {
    expect(nearest("sucess", ["success", "empty"])).toBe("success");
    expect(nearest("zzz", ["success"])).toBeNull();
  });
});

describe("the strict JSON reader", () => {
  test.each([['{"a": NaN}'], ['{"a": Infinity}'], ['{"a": -Infinity}'], ['{"a": 1,\n "a": 2}']])("refuses %p with its line", (text) => {
    const read = readJson(text);
    expect(read.ok).toBe(false);
  });
  test("a page with NaN in its fixtures is never written", async () => {
    const { single } = await import("./cases.ts");
    const { cli, project } = await import("./helpers.ts");
    const ran = await cli(project({ "a.html": single({ fixtures: '{ "product": "x", "bad": NaN }' }) }), "build", "a.html");
    expect(ran.code).toBe(1);
    expect(ran.out).not.toContain("wrote ");
  });
});

/**
 * Whether `check` ends with `code` within a ceiling, not a pin. The check runs in a process of its own, stopped at the
 * ceiling, because the runtime cannot end a test inside synchronous work: so a slow reader fails here at the ceiling
 * and never hangs the run.
 */
async function checksWithin(folder: string, args: string[], code: number, ceiling: number): Promise<void> {
  const started = performance.now();
  const child = Bun.spawn(["bun", join(import.meta.dir, "../src/cli.ts"), "check", ...args], { cwd: folder, stdout: "ignore", stderr: "ignore" });
  const stop = setTimeout(() => child.kill("SIGKILL"), ceiling);
  const exited = await child.exited;
  clearTimeout(stop);
  expect({ code: exited, within: performance.now() - started < ceiling }).toEqual({ code, within: true });
}

test("one line of 6 MB is read in seconds: the tokenizer's cost is in proportion to the text", async () => {
  const folder = project({
    "design/long.html": single({
      screens: `<section data-proto-screen="start" data-proto-title="Start"><div data-proto-state="success" data-testid="s">${"<p>A word</p>".repeat(480_000)}</div></section>`,
    }),
  });
  // A text read once for each tag it holds took minutes.
  await checksWithin(folder, ["design/long.html"], 0, 20_000);
}, 40_000);

// 80,000 elements left open, then 80,000 end tags that close none of them: each end tag that searched every open
// element made the read cost the square of the text, about 25 seconds here, where a read in proportion takes one.
const OPEN = "<div>".repeat(80_000);
const STRAY = "</span>".repeat(80_000);

test("a design of open elements and stray end tags is read in seconds: each end tag costs the same, however deep the design", async () => {
  const folder = project({
    "design/deep.html": single({
      screens: `<section data-proto-screen="start" data-proto-title="Start"><div data-proto-state="success" data-testid="s">${OPEN}${STRAY}<style></style>${"</template>".repeat(20_000)}</div></section>`,
    }),
  });
  await checksWithin(folder, ["design/deep.html"], 1, 8_000);
}, 30_000);

// A flow's text written again whole for each of its 120,000 links took about 13 seconds.
test("a design of open elements and stray end tags, and a flow of many links, are read in seconds", async () => {
  const files = flowDesign();
  files[FLOW_DESIGN] = (files[FLOW_DESIGN] ?? "").replace("</body>", `${OPEN}${STRAY}</body>`);
  const flow = "design/flows/items.html";
  files[flow] =
    `${files[flow] ?? ""}<section data-proto-screen="many" data-proto-title="Many"><div data-proto-state="success" data-testid="many">${'<i data-proto-go="list"></i>'.repeat(120_000)}</div></section>`;
  await checksWithin(project(files), [FLOW_DESIGN], 1, 8_000);
}, 30_000);

// A custom property that names the one before it ten times, eight steps deep: each var() followed again wherever it was
// named took 35 seconds and 2 GB for 1.3 KB of design, ten times more for each step.
test("a chain of custom properties that each name the last ten times is read in a second, and its first long step stops the page", async () => {
  const chain = Array.from({ length: 8 }, (_, index) => `  --t${index + 1}: ${Array(10).fill(`var(--t${index})`).join(" ")};`).join("\n");
  const styles = `<style>\n:root {\n  --t0: 1ms;\n${chain}\n}\np { transition: opacity var(--t8); }\n</style>`;
  const folder = project({ "design/vars.html": single({ styles }) });
  await checksWithin(folder, ["design/vars.html"], 1, 3_000);
  const ran = await cli(folder, "check", "--json", "design/vars.html");
  const rules = json<{ findings: { rule: string; line: number }[] }>(ran).findings.filter((item) => item.rule === "read.var-limit");
  expect(rules.map((item) => item.line)).toEqual([13]);
}, 20_000);

test("each mistake the JSON reader names has its place and the tool's own words, with the step to take", () => {
  const bad = [
    "\uFEFF{}",
    "{} x",
    "[".repeat(1100),
    '{"a": }',
    '"abc',
    '"a\u0001"',
    '"\\q"',
    '"\\u12"',
    "{a: 1}",
    '{"a" 1}',
    "[1 2]",
    '{"a": 1,}',
    "[1,]",
    '{"a": NaN}',
    '{"a": 1, "a": 2}',
  ];
  for (const text of bad) {
    const read = readJson(text);
    const error = read.ok ? "" : read.error;
    expect([
      text.slice(0, 12),
      /^at line \d+, column \d+: [a-z\\NI-][\s\S]*$/.test(error) && !/Expecting|Extra data|recursion|utf-8-sig|\(char /.test(error),
    ]).toEqual([text.slice(0, 12), true]);
  }
});
