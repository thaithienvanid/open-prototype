/// <reference lib="dom" />
// A review round as the README gives it, end to end, on a stranger's design (a to-do list with an emoji, a state named
// online, one platform, one theme, and one rule turned off): look at every view, comment, download, save the round, answer
// it in a changes file, build again, and see the comment answered. On the way: the declared platform and theme are the
// only ones offered, the comment field counts and never cuts, the export names the theme seen, a link of the design
// never navigates, and a link to a place in the screen scrolls (decisions 6, 10, 13, 14, 19).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../../src/cli.ts";
import { tempFolder } from "../temp.ts";
import { BROWSER, Browser, type Page } from "./page.ts";

const folder = tempFolder(join(tmpdir(), "prototype-viewer-review-"));
const quiet = { out: () => {}, err: () => {} };
const page = (): string => pathToFileURL(join(folder, ".prototype/views/design/todo.html")).href;
const frameDoc = "(document.getElementById('frame')).contentDocument";
const text = (page: Page, id: string) => page.evaluate((name: string) => (document.getElementById(name)?.textContent ?? "").replace(/\s+/g, " ").trim(), id);

describe.skipIf(!BROWSER)("a review round, as the README gives it", () => {
  let browser: Browser;
  beforeAll(async () => {
    mkdirSync(join(folder, "design"));
    cpSync(join(import.meta.dir, "designs/todo.html"), join(folder, "design/todo.html"));
    writeFileSync(join(folder, "prototype.config.json"), JSON.stringify({ rules: { "copy.emoji": "off" } }));
    expect(await run(["build", "design/todo.html"], quiet, folder)).toBe(0);
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("look, comment, download, save, answer, build again, and see it answered", async () => {
    const tab = await browser.open(1440, 900);
    await tab.goto(page());
    await tab.evaluate(`localStorage.clear()`);
    await tab.reload();
    // One platform and one theme declared: only the web's frames, only the light theme, and one view a state.
    expect(
      await tab.evaluate(() => ({
        frames: [...document.querySelectorAll<HTMLOptionElement>("#frame-pick option")].map((option) => option.value).join(" "),
        themes: [...document.querySelectorAll<HTMLElement>("[data-theme-pick]")]
          .filter((button) => !button.hidden)
          .map((button) => button.dataset.themePick)
          .join(" "),
        states: [...document.querySelectorAll<HTMLElement>("#screen-list [data-show]")].map((button) => button.dataset.show).join(" "),
        root: (document.getElementById("frame") as HTMLIFrameElement).contentDocument!.documentElement.getAttribute("data-proto-theme"),
      })),
    ).toEqual({ frames: "320 768 1024 1440 fill", themes: "light", states: "online empty", root: "light" });
    expect(await text(tab, "seen-count")).toBe("1 of 2");
    await tab.key("n");
    await tab.settled();
    expect([await text(tab, "seen-count"), await text(tab, "closing-h")]).toEqual(["2 of 2", "Every view seen"]);
    await tab.key("k");
    await tab.settled();

    // A link of the design never navigates: an outside one says its address; one to a place in the screen scrolls there.
    await tab.click('[data-testid="tasks-terms"]', true);
    await tab.until(`document.getElementById("announce").textContent.includes("https://example.com/terms")`);
    expect([await text(tab, "announce"), await tab.evaluate(`${frameDoc}.location.href`)]).toEqual([
      "A link of the design, not followed in the prototype: https://example.com/terms",
      "about:srcdoc",
    ]);
    await tab.click('[data-testid="tasks-help"]', true);
    await tab.until(`${frameDoc}.scrollingElement.scrollTop > 1000`);
    expect(await tab.evaluate(`${frameDoc}.scrollingElement.scrollTop > 1000`)).toBe(true);
    await tab.evaluate(`${frameDoc}.scrollingElement.scrollTop = 0`);

    // The comment field counts against the limit, never cuts, and turns Save off past it with the reason as text.
    await tab.key("c");
    await tab.click('[data-testid="tasks-add"]', true);
    await tab.type("x".repeat(2001));
    const form = () =>
      tab.evaluate(() => ({
        count: document.getElementById("comment-count")!.textContent,
        save: (document.getElementById("comment-add") as HTMLButtonElement).disabled,
        reason: document.getElementById("comment-limit")!.hidden ? "" : document.getElementById("comment-limit")!.textContent,
        length: (document.getElementById("comment-text") as HTMLTextAreaElement).value.length,
      }));
    expect(await form()).toEqual({
      count: "2001 of 2000 characters",
      save: true,
      reason: "The comment is 1 character over the limit of 2000. Shorten it, then save.",
      length: 2001,
    });
    await tab.evaluate(() => {
      const field = document.getElementById("comment-text") as HTMLTextAreaElement;
      field.value = "Say what the button adds \u202Ehere";
      field.dispatchEvent(new Event("input"));
    });
    expect(await form()).toMatchObject({ save: false, reason: "" });
    await tab.click("#comment-add");
    await tab.settled();
    expect(await tab.evaluate(() => document.querySelector("#comments-list > li p")?.textContent)).toBe("Say what the button adds [U+202E]here");

    // The download holds the round in the shape the save reads, with the theme seen and the theme in the link; its toast
    // names the save command and the design's folder of rounds.
    const exported = await tab.evaluate(() =>
      decodeURIComponent(document.getElementById("comments-download")!.getAttribute("href")!.split(",").slice(1).join(",")),
    );
    const round = JSON.parse(exported) as { round: number; items: { id: string; shown_theme: string; link: string; theme: string }[] };
    expect([round.round, round.items[0]?.id, round.items[0]?.theme, round.items[0]?.shown_theme, round.items[0]?.link]).toEqual([
      1,
      "r1-1",
      "light",
      "light",
      "#tasks/online?theme=light&frame=1024",
    ]);
    await tab.evaluate(() => {
      const link = document.getElementById("comments-download")!;
      link.addEventListener("click", (event) => event.preventDefault(), { once: true });
      link.click();
    });
    expect(await text(tab, "announce")).toBe(
      "Downloading comments.json. Save it with open-prototype save-comments comments.json design/todo.html, which keeps it as design/rounds/todo/1/comments.json",
    );

    // Save it, answer it in the next round's changes, and build again, as the README says.
    writeFileSync(join(folder, "comments.json"), exported);
    expect(await run(["save-comments", "comments.json", "design/todo.html"], quiet, folder)).toBe(0);
    expect(existsSync(join(folder, "design/rounds/todo/1/comments.json"))).toBe(true);
    mkdirSync(join(folder, "design/rounds/todo/2"), { recursive: true });
    writeFileSync(
      join(folder, "design/rounds/todo/2/changes.json"),
      JSON.stringify({ changes: [{ answers: ["r1-1"], summary: "The button says what it adds." }] }),
    );
    expect(await run(["build", "design/todo.html"], quiet, folder)).toBe(0);
    await tab.goto(page());
    expect(
      await tab.evaluate(() => ({
        round: (document.getElementById("round-number") as HTMLInputElement).value,
        earlier: [...document.querySelectorAll("#earlier-rounds-list .pv-status-tag")].map((tag) => tag.textContent).join(" "),
        summary: document.querySelector("#earlier-rounds-list summary")?.textContent,
      })),
    ).toEqual({ round: "2", earlier: "Answered", summary: "1 answered" });
    expect(JSON.parse(readFileSync(join(folder, "design/rounds/todo/1/comments.json"), "utf8")).items[0].shown_theme).toBe("light");
    await tab.close();
  }, 120_000);
});

// A link that names no round opens the round after the saved ones, as the page opened: Back, Forward, the design's own
// back control, and a typed link restore the view they name and keep that round. Only a link that names a round opens it.
const ROUNDS_DESIGN = `<!doctype html>
<html lang="en" data-proto-format="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="platforms" content="web">
<title>Rounds</title>
</head>
<body>
<main><h1 data-proto-slot="title"></h1>
<section data-proto-screen="start" data-proto-title="Start" data-proto-initial="ready">
  <div data-proto-state="ready" data-testid="start-ready">
    <button type="button" data-proto-go="start/empty" data-testid="start-clear">Clear it</button>
    <button type="button" data-proto-go="detail" data-testid="start-open">Open it</button>
  </div>
  <div data-proto-state="empty" data-testid="start-empty"><p>Nothing here yet.</p></div>
</section>
<section data-proto-screen="detail" data-proto-title="Detail" data-proto-parent="start">
  <div data-proto-state="ready" data-testid="detail-ready">
    <button type="button" data-proto-back data-testid="detail-back">Back</button>
  </div>
</section></main>
</body>
</html>
`;

describe.skipIf(!BROWSER)("the round a link opens", () => {
  const project = tempFolder(join(tmpdir(), "prototype-viewer-rounds-"));
  const url = (): string => pathToFileURL(join(project, ".prototype/views/design/rounds.html")).href;
  let browser: Browser;
  beforeAll(async () => {
    mkdirSync(join(project, "design"));
    writeFileSync(join(project, "design/rounds.html"), ROUNDS_DESIGN);
    writeFileSync(
      join(project, "comments.json"),
      JSON.stringify({ schema_version: "1", round: 1, items: [{ id: "r1-1", type: "question", screen: "start", state: "ready", comment: "Why?" }] }),
    );
    expect(await run(["save-comments", "comments.json", "design/rounds.html"], quiet, project)).toBe(0);
    expect(await run(["build", "design/rounds.html"], quiet, project)).toBe(0);
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("Back, Forward, and the design's back control keep the open round; a link that names round 1 opens it", async () => {
    const tab = await browser.open(1440, 900);
    const where = () => tab.evaluate(() => ({ hash: location.hash, round: (document.getElementById("round-number") as HTMLInputElement).value }));
    await tab.goto(url());
    expect(await where()).toEqual({ hash: "#start/ready", round: "2" });
    // A go, then the browser's Back, then its Forward.
    await tab.click('[data-testid="start-clear"]', true);
    await tab.settled();
    expect(await where()).toEqual({ hash: "#start/empty", round: "2" });
    await tab.evaluate(() => history.back());
    await tab.until(`location.hash === "#start/ready"`);
    await tab.settled();
    expect(await where()).toEqual({ hash: "#start/ready", round: "2" });
    await tab.evaluate(() => history.forward());
    await tab.until(`location.hash === "#start/empty"`);
    await tab.settled();
    expect(await where()).toEqual({ hash: "#start/empty", round: "2" });
    // A go to another screen, then the design's back control.
    await tab.evaluate(() => {
      location.hash = "#start/ready";
    });
    await tab.settled();
    await tab.click('[data-testid="start-open"]', true);
    await tab.settled();
    expect(await where()).toEqual({ hash: "#detail/ready", round: "2" });
    await tab.click('[data-testid="detail-back"]', true);
    await tab.until(`location.hash.startsWith("#start/")`);
    await tab.settled();
    expect(await where()).toEqual({ hash: "#start/ready", round: "2" });
    // A link that names the saved round opens it, and a typed link with no round goes back to the open one.
    await tab.evaluate(() => {
      location.hash = "#start/ready?round=1";
    });
    await tab.settled();
    expect(await where()).toEqual({ hash: "#start/ready?round=1", round: "1" });
    await tab.evaluate(() => {
      location.hash = "#start/empty";
    });
    await tab.settled();
    expect(await where()).toEqual({ hash: "#start/empty", round: "2" });
    await tab.close();
  }, 60_000);
});

// A design's version covers its copy and its images, which live in the fixtures, outside its markup: a change to either
// counts the views seen again, and the same design built twice keeps one version.
describe.skipIf(!BROWSER)("the version of a design", () => {
  const project = tempFolder(join(tmpdir(), "prototype-viewer-version-"));
  const url = (): string => pathToFileURL(join(project, ".prototype/views/design/todo.html")).href;
  const design = join(project, "design/todo.html");
  let browser: Browser;
  beforeAll(async () => {
    mkdirSync(join(project, "design"));
    cpSync(join(import.meta.dir, "designs/todo.html"), design);
    writeFileSync(join(project, "prototype.config.json"), JSON.stringify({ rules: { "copy.emoji": "off" } }));
    expect(await run(["build", "design/todo.html"], quiet, project)).toBe(0);
    browser = new Browser();
  });
  afterAll(() => browser.close());

  test("follows the copy, and stays when the same design is built again", async () => {
    const tab = await browser.open(1440, 900);
    const seen = () => tab.evaluate(() => [document.getElementById("seen-count")?.textContent?.trim(), !document.getElementById("seen-stale")?.hidden]);
    await tab.goto(url());
    await tab.evaluate(`localStorage.clear()`);
    await tab.reload();
    await tab.key("n");
    await tab.settled();
    const first = await seen();
    expect(await run(["build", "design/todo.html"], quiet, project)).toBe(0);
    await tab.reload();
    const again = await seen();
    writeFileSync(design, readFileSync(design, "utf8").replace("Nothing to do.", "All done."));
    expect(await run(["build", "design/todo.html"], quiet, project)).toBe(0);
    await tab.reload();
    const copy = await seen();
    await tab.close();
    expect([first, again, copy]).toEqual([
      ["2 of 2", false],
      ["2 of 2", false],
      ["1 of 2", true],
    ]);
  }, 60_000);
});
