// Every example the guide, the README, and the reference print works as written: each name's example passes the check
// in a design that holds what it names, the README's start commands run, the reference's settings file and the README's
// changes file are read clean.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { COMMANDS } from "../src/cli/arguments.ts";
import { guideText } from "../src/guide.ts";
import { single } from "./cases.ts";
import { cli, json, project, REPOSITORY } from "./helpers.ts";

const README = readFileSync(join(REPOSITORY, "README.md"), "utf8");
const REFERENCE = readFileSync(join(REPOSITORY, "docs/reference.md"), "utf8");
type Finding = { rule: string; level: string; message: string };

// What the guide's examples name: the screens inbox and message, their states, the fixtures, a part, and a panel.
const FIXTURES = JSON.stringify({
  product: "Mail",
  back: "Back",
  inbox: { heading: "Inbox" },
  avatar: "data:image/png;base64,iVBORw0KGgo=",
  messages: [{ subject: "Lunch?", sender: "Sam" }],
});
const PART = '<article data-proto-component="message-row"><p>{{subject}}</p></article>\n';
const MESSAGE =
  '<section data-proto-screen="message" data-proto-title="Message" data-proto-parent="inbox" data-proto-source="messages"><div data-proto-state="ready" data-testid="message-ready"><button type="button" data-proto-go="inbox" data-testid="message-inbox">Inbox</button></div></section>';

/** One example of the guide, closed when it opens an element it does not close, in a design that holds what it names. */
function designFor(example: string): string {
  const tag = /^<([a-z]+)/.exec(example)?.[1] ?? "";
  const item = '<template data-proto-item><li data-proto-field="subject"></li></template>';
  const whole =
    example.endsWith(`</${tag}>`) || example.endsWith("/>") || ["img", "input", "br", "wbr", "hr"].includes(tag)
      ? example
      : `${example}${tag === "ul" ? item : ""}</${tag}>`;
  // An item stands in its list.
  const closed = tag === "template" ? `<ul data-proto-list="messages">${whole}</ul>` : whole;
  const panel = example.includes("data-proto-panel") ? "" : '<div id="filters" data-proto-panel="filters" hidden><p>Filters</p></div>';
  const states =
    '<div data-proto-state="loading" data-testid="inbox-loading"><p>Loading</p></div><div data-proto-state="empty" data-testid="inbox-empty"><p>No mail</p></div>';
  let inbox: string;
  if (tag === "section")
    inbox = closed
      .replace(/<\/section>$/, `<button type="button" data-proto-go="message" data-testid="inbox-open">Open</button>${states}</section>`)
      .replace(/data-proto-screen="message"[^>]*>/, (open) => open);
  else if (closed.startsWith("<div data-proto-state"))
    inbox = `<section data-proto-screen="inbox" data-proto-title="Inbox"><button type="button" data-proto-go="message" data-testid="inbox-open">Open</button>${closed.replace("></div>", "><p>None</p></div>")}<div data-proto-state="loading" data-testid="inbox-loading"><p>Loading</p></div></section>`;
  else
    inbox = `<section data-proto-screen="inbox" data-proto-title="Inbox"><div data-proto-state="loading" data-testid="inbox-loading"><button type="button" data-proto-go="message" data-testid="inbox-go">Open</button><button type="button" data-proto-toggle="filters" aria-controls="filters" aria-expanded="false" data-testid="inbox-filters-open">More</button>${panel}${closed}</div><div data-proto-state="empty" data-testid="inbox-empty"><p>No mail</p></div></section>`;
  // A field outside an item reads the chosen entry of a screen that names its list.
  if (example.includes("data-proto-field") && !example.includes("data-proto-item") && !example.includes("data-proto-list"))
    return single({
      screens: `${inbox.replace(closed, "")}\n${MESSAGE.replace("</div></section>", `${closed}</div></section>`)}`,
      fixtures: FIXTURES,
      styles: "<style data-proto-tokens>:root { --color-accent: #1d4ed8; }</style>",
    });
  const screens = inbox.includes('data-proto-screen="message"')
    ? inbox.replace(
        /^<section data-proto-screen="message"/,
        '<section data-proto-screen="inbox" data-proto-title="Inbox"><div data-proto-state="loading" data-testid="inbox-loading"><button type="button" data-proto-go="message" data-testid="inbox-open">Open</button></div><div data-proto-state="empty" data-testid="inbox-empty"><p>No mail</p></div></section>\n<section data-proto-screen="message"',
      )
    : `${inbox}\n${MESSAGE}`;
  return single({ screens, fixtures: FIXTURES, styles: "<style data-proto-tokens>:root { --color-accent: #1d4ed8; }</style>" });
}

const FLOW =
  '<section data-proto-screen="start" data-proto-title="Inbox"><div data-proto-state="ready" data-testid="inbox-flow-ready"><p>Hi</p></div></section>\n';

describe("the guide's examples", () => {
  const { NAME_EXAMPLES } = require("../src/guide.ts") as { NAME_EXAMPLES: Record<string, string> };
  // The document's own parts are the starter's, which its own test checks.
  const shown = Object.entries(NAME_EXAMPLES).filter(([name]) => !["format", "fixtures", "tokens"].includes(name));
  test.each(shown)("%s: its example passes the check", async (name, example) => {
    const html =
      name === "flow"
        ? single({
            chrome: '<nav aria-label="Main"><button type="button" data-proto-go="inbox:start" data-testid="nav-inbox">Inbox</button></nav>\n',
            screens: example,
            fixtures: FIXTURES,
            styles: "<style data-proto-tokens>:root { --color-accent: #1d4ed8; }</style>",
          })
        : designFor(example);
    const folder = project({ "design/case.html": html, "design/blocks/message-row.html": PART, "design/flows/inbox.html": FLOW });
    const found = json<{ findings: Finding[] }>(await cli(folder, "check", "--json", "design/case.html")).findings;
    expect([example, found.filter((item) => item.level === "problem").map((item) => `${item.rule}: ${item.message}`)]).toEqual([example, []]);
  });
  test("the guide prints each of them", () => {
    for (const [, example] of shown) expect(guideText(Object.keys(COMMANDS))).toContain(example);
  });
});

describe("the README's examples", () => {
  const blocks = [...README.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((found) => [found[1] ?? "", found[2] ?? ""] as const);
  test("the start commands run as written, each with exit 0", async () => {
    const folder = project();
    const commands = blocks.filter(([kind, text]) => kind === "sh" && text.startsWith("open-prototype ")).flatMap(([, text]) => text.trim().split("\n"));
    expect(commands.length).toBeGreaterThan(3);
    // A command that opens a browser cannot run in a test, so the README's runnable lines never carry --open.
    expect(commands.filter((line) => line.includes("--open"))).toEqual([]);
    for (const line of commands) {
      const argv = [...line.slice("open-prototype ".length).matchAll(/"([^"]*)"|(\S+)/g)].map((found) => found[1] ?? found[2] ?? "");
      expect([line, (await cli(folder, ...argv)).code]).toEqual([line, 0]);
    }
  });
  test("the reference's settings file reads clean, and the changes file the README names answers a comment with no finding", async () => {
    const settings = /```json\n([\s\S]*?)```/.exec(REFERENCE.slice(REFERENCE.indexOf("## Settings")))?.[1] ?? "";
    expect(settings).toContain('"rules"');
    const changes = /`(\{"changes": [^`]*\})`/.exec(README)?.[1] ?? "";
    const folder = project({
      "prototype.config.json": settings,
      "design/tokens.css": ":root { --color-accent: #1d4ed8; }\n",
      "design/todo.html": single(),
      "design/rounds/todo/1/comments.json": JSON.stringify({
        round: 1,
        items: [{ id: "r1-1", screen: "start", state: "success", comment: "Say what it adds" }],
      }),
      "design/rounds/todo/2/changes.json": changes,
    });
    expect(changes).toContain("r1-1");
    const ran = await cli(folder, "check", "--json", "design/todo.html");
    expect([ran.code, json<{ findings: Finding[] }>(ran).findings]).toEqual([0, []]);
  });
});

test("the guide and the README say never to open a design file, where a reviewer reads it, and never that check guards it", () => {
  // The rule's key words, never its whole sentence, so the owner may reword it.
  const rule = "Never open a design file you did not write";
  const review = README.slice(README.indexOf("## Review a design"));
  expect(review.split("\n").find((line) => line.startsWith("1. "))).toContain(rule);
  expect(guideText(Object.keys(COMMANDS)).replace(/\n\s*/g, " ")).toContain(rule);
  expect(
    guideText(Object.keys(COMMANDS))
      .slice(guideText(Object.keys(COMMANDS)).indexOf("Review"))
      .replace(/\n\s*/g, " "),
  ).toContain(rule);
  for (const text of [README, guideText(Object.keys(COMMANDS))]) expect(text).not.toMatch(/guards the raw file|as safe as any/);
});

test("each shipped design whose panel or back control has a display of its own keeps hidden working with its own rule", () => {
  // The viewer closes a panel and hides the back control with the standard hidden attribute; a class that sets display
  // on them would show them again, so the design holds the one reset rule, as any web page does.
  // Every HTML file the examples ship, so a new example is held to the rule as the one it replaces was.
  const shipped = readdirSync(join(REPOSITORY, "assets/examples"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".html"))
    .map((file) => `assets/examples/${file.split(sep).join("/")}`)
    .sort();
  expect(shipped).toContain("assets/examples/app.html");
  const main = readFileSync(join(REPOSITORY, "assets/examples/app.html"), "utf8");
  for (const file of shipped) {
    const text = readFileSync(join(REPOSITORY, file), "utf8");
    const styled = /<[a-z]+ [^>]*class="[^"]+"[^>]*data-proto-(?:back|panel)[^>]*hidden/.test(text);
    if (!styled) continue;
    // A flow's styles and a block's are its main design's.
    const styles = file === "assets/examples/app.html" ? text : main;
    expect([file, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(styles)]).toEqual([file, true]);
  }
  expect(guideText(Object.keys(COMMANDS))).toContain("[hidden] { display: none !important; }");
});
