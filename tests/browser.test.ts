/// <reference lib="dom" />
// The page's own guard, in a browser: markup forced past the reader into a built page runs nothing,
// loads nothing from the network, and never moves the top window. A local logger stands for every address the markup
// names, so a request that left would reach it: it reads each connection's raw bytes, so a request, or any byte of one,
// is heard. Markup that would end the page's template, where the policy cannot stop a redirect, gets no page at all.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../src/cli.ts";
import * as entry from "../src/index.ts";
import { tempFolder } from "./temp.ts";
import { BROWSER, Browser, type Page } from "./viewer/page.ts";

// CDP's modifier bits: Ctrl is 2, Meta is 4, Shift is 8.
const PRESSES: [button: string, modifiers: number][] = [
  ["left", 0],
  ["middle", 0],
  ["left", 2],
  ["left", 4],
  ["left", 8],
];

/** Act on an element of the frame every way a person does: each click and modified click, then the Enter key on it. A missing element fails. */
async function actOn(page: Page, selector: string): Promise<void> {
  const at = await page.evaluate((selector: string) => {
    const frame = document.getElementById("frame") as HTMLIFrameElement | null;
    const found = frame?.contentDocument?.querySelector(selector) as HTMLElement | null | undefined;
    if (!frame || !found) return null;
    found.scrollIntoView({ block: "nearest" });
    const box = found.getBoundingClientRect();
    const outer = frame.getBoundingClientRect();
    const scale = outer.width / frame.offsetWidth;
    return { x: outer.x + (box.x + box.width / 2) * scale, y: outer.y + (box.y + box.height / 2) * scale };
  }, selector);
  if (!at) throw new Error(`nothing to act on: ${selector}`);
  for (const [button, modifiers] of PRESSES) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y, modifiers });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button, clickCount: 1, modifiers });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button, clickCount: 1, modifiers });
  }
  await page.evaluate(
    (selector: string) =>
      ((document.getElementById("frame") as HTMLIFrameElement | null)?.contentDocument?.querySelector(selector) as HTMLElement | null)?.focus(),
    selector,
  );
  await page.key("Enter");
}

const DESIGN = `<!doctype html>
<html lang="en" data-proto-format="1">
<head><meta charset="utf-8"><title>Forced</title></head>
<body>
<section data-proto-screen="a" data-proto-title="A">
  <div data-proto-state="ready" data-testid="a-ready"><p>A</p></div>
</section>
</body>
</html>
`;
const RAN = "document.documentElement.setAttribute('data-ran', '1'); top.document.title = 'ran'";

/** Each form forced past the reader, with what a person would do to it: the selectors clicked inside the frame. */
function attacks(at: string): [name: string, markup: string, clicks: string[]][] {
  return [
    ["an inline script", `<script>${RAN}</script>`, []],
    ["an event handler", `<img src="x" onerror="${RAN}">`, []],
    ["a javascript: link with a tab", `<a id="go" href="java&#9;script:${RAN}">x</a>`, ["#go"]],
    ["a refresh inside the frame", `<meta http-equiv="refresh" content="0;url=${at}/refresh">`, []],
    ["an image from the network", `<img src="${at}/image">`, []],
    ["an import and a background", `<style>@import url(${at}/import); p { background: url(${at}/background) }</style>`, []],
    ["a stylesheet and a prefetch", `<link rel="stylesheet" href="${at}/link"><link rel="prefetch" href="${at}/prefetch">`, []],
    ["a poster and an svg image", `<video poster="${at}/poster"></video><svg><image href="${at}/svg-image"/></svg>`, []],
    ["a frame, an object, and an embed", `<iframe src="${at}/iframe"></iframe><object data="${at}/object"></object><embed src="${at}/embed">`, []],
    ["a base and a relative link", `<base href="${at}/base/"><a id="go" href="relative">x</a>`, ["#go"]],
    [
      "a form and a form action",
      `<form action="${at}/form"><button id="go">Go</button><button id="also" formaction="${at}/formaction">Also</button></form>`,
      ["#go", "#also"],
    ],
    ["a link to the top", `<a id="go" href="${at}/top" target="_top">x</a>`, ["#go"]],
    ["a link that opens a window", `<a id="go" href="${at}/blank" target="_blank">x</a>`, ["#go"]],
    ["a data: link", `<a id="go" href="data:text/html,%3Cscript%3Etop.location='${at}/data'%3C/script%3E">x</a>`, ["#go"]],
    ["markup hidden in an svg textarea", `<svg><textarea><script>${RAN}</script><img src="${at}/textarea"></textarea></svg>`, []],
    // A dialog that opened would hold the page, so every later call to it would wait until the test's time limit.
    ["a dialog", `<script>alert(1)</script><img src="x" onerror="confirm(2)"><a id="go" href="javascript:alert(3)">x</a>`, ["#go"]],
    ["a design link to an outside page", `<a id="go" href="${at}/outside">x</a>`, ["#go"]],
  ];
}

// The capture's flags send no name anywhere; here the one address of the logger stays reachable, so a request that the
// page let out would be heard.
const LOGGER_REACHABLE = ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"];

/** What reached a raw logger on this machine: each connection's first line, or its byte count when it holds no line, and each connection. */
type Logger = { heard: string[]; connected: string[]; host: string; close: () => Promise<void> };

/**
 * A raw logger, since Bun's node:http gives a socket's bytes to its own parser and never to a listener. A connection
 * that sends no byte is no request, so it is in `connected` and never in `heard`. Chrome opens one for an <iframe>'s
 * address even when the policy blocks the frame, and one for a link's address when a person presses it, before any
 * listener of the page runs. A probe with Chrome 157 on 2026-11-19 showed it: Chrome's net log marks each
 * `is_preconnect`, and the socket got no byte. No policy, sandbox flag, link attribute, or listener stopped it, so the
 * build makes every link's address that leaves its screen inert, and section 12 of the tech spec names the frame's.
 */
async function startLogger(): Promise<Logger> {
  const heard: string[] = [];
  const connected: string[] = [];
  const server: Server = createServer((socket) => {
    connected.push("a connection");
    let got = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      if (got.length === 0) {
        const line = chunk.toString("latin1").split("\r\n")[0] ?? "";
        heard.push(/^[A-Z]+ \S+ HTTP\//.test(line) ? line : `${chunk.length} bytes`);
      }
      got = Buffer.concat([got, chunk]);
      if (got.includes("\r\n\r\n")) socket.end("HTTP/1.1 200 OK\r\ncontent-length: 6\r\nconnection: close\r\n\r\nlogged");
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const host = `127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  return { heard, connected, host, close: () => new Promise((done) => server.close(() => done())) };
}

/** A built page of the design whose screen holds `markup`, as if the reader had let it through. */
function forcedPage(folder: string, markup: string): string {
  const project = entry.loadProject(folder, {});
  const design = entry.load(entry.readFiles(project, "design/forced.html"));
  const forced = { ...design, body: design.body.replace("<p>A</p>", markup) };
  return entry.page({ design: forced, findings: [], rounds: [], project }, entry.viewerAssets());
}

describe.skipIf(!BROWSER)("pages forced past the reader", () => {
  let browser: Browser;
  let logger: Logger;
  let at = "";
  const folder = tempFolder(join(tmpdir(), "prototype-forced-"));
  beforeAll(async () => {
    mkdirSync(join(folder, "design"));
    writeFileSync(join(folder, "design/forced.html"), DESIGN);
    logger = await startLogger();
    at = `http://${logger.host}`;
    browser = new Browser(LOGGER_REACHABLE);
  });
  afterAll(async () => {
    await browser.close();
    await logger.close();
  });

  test("run nothing, load nothing, and never move the top window", async () => {
    const outcomes: string[] = [];
    for (const [name, markup, clicks] of attacks(at)) {
      const file = join(folder, `page-${outcomes.length}.html`);
      writeFileSync(file, forcedPage(folder, markup));
      const page = await browser.open(1024, 768);
      await page.goto(pathToFileURL(file).href);
      // The top's own address, as the browser names it: on Windows a temporary folder's short name, such as RUNNER~1,
      // differs from the long one the path holds, so no address built from the path is compared.
      const opened = await page.evaluate(() => location.protocol + location.pathname);
      for (const click of clicks) await actOn(page, click);
      await Bun.sleep(400);
      const seen = await page.evaluate(() => {
        const doc = (document.getElementById("frame") as HTMLIFrameElement | null)?.contentDocument;
        return {
          top: location.protocol + location.pathname,
          title: document.title,
          ran: doc?.documentElement.hasAttribute("data-ran") ?? null,
          frame: doc?.location.href ?? "",
        };
      });
      await page.close();
      outcomes.push(
        [
          name,
          seen.top === opened ? "top stayed" : `top moved to ${seen.top}`,
          seen.title === "ran" ? "a script ran" : "",
          seen.ran ? "a script ran in the frame" : "",
          seen.frame === "about:srcdoc" ? "" : `the frame moved to ${seen.frame}`,
        ]
          .filter(Boolean)
          .join(", "),
      );
    }
    expect(outcomes).toEqual(attacks(at).map(([name]) => `${name}, top stayed`));
    expect(logger.heard).toEqual([]);
  }, 120_000);

  test("a design that tries to redirect outside the frame gets no page from build, so a browser has nothing to open", async () => {
    const tries = [
      `</template><meta http-equiv="refresh" content="0;url=${at}/outside">`,
      `</TEMPLATE ><meta http-equiv="refresh" content="0;url=${at}/outside"><template>`,
      `<!-- </template> --><meta http-equiv="refresh" content="0;url=${at}/outside">`,
      `<p title="x`,
    ];
    for (const [index, markup] of tries.entries()) {
      const name = `design/redirect-${index}.html`;
      writeFileSync(join(folder, name), DESIGN.replace("<p>A</p>", markup));
      const out: string[] = [];
      const code = await run(["build", name], { out: (line) => out.push(line), err: (line) => out.push(line) }, folder);
      expect([markup, code, existsSync(join(folder, ".prototype/views", name))]).toEqual([markup, 1, false]);
    }
    // And a page built anyway, past the reader, by the stages alone: the page's own guard refuses it.
    for (const markup of tries) expect(() => forcedPage(folder, markup)).toThrow("would end the page's template");
    expect(logger.heard).toEqual([]);
  });

  test("markup that would end the page's template, such as a redirect outside the frame, gets no page", () => {
    for (const markup of [
      `</template><meta http-equiv="refresh" content="0;url=${at}/outside">`,
      `</TEMPLATE ><meta http-equiv="refresh" content="0;url=${at}/outside"><template>`,
      `<!-- </template> --><meta http-equiv="refresh" content="0">`,
    ]) {
      expect(() => forcedPage(folder, markup)).toThrow("would end the page's template");
    }
    expect(forcedPage(folder, `<ul data-proto-list="x"><template data-proto-item><li>i</li></template></ul>`)).toContain("<template data-proto-item>");
  });
});

describe.skipIf(!BROWSER)("the links of a design that passes the reader", () => {
  let browser: Browser;
  let logger: Logger;
  const folder = tempFolder(join(tmpdir(), "prototype-links-"));
  beforeAll(async () => {
    mkdirSync(join(folder, "design"));
    writeFileSync(join(folder, "design/forced.html"), DESIGN);
    logger = await startLogger();
    browser = new Browser(LOGGER_REACHABLE);
  });
  afterAll(async () => {
    await browser.close();
    await logger.close();
  });

  /** Open a page, press each of its links every way a person does, and say what each link is and what the viewer said of it. */
  async function press(file: string, links: string[]): Promise<string[]> {
    const page = await browser.open(1024, 768);
    await page.goto(pathToFileURL(file).href);
    const said: string[] = [];
    for (const id of links) {
      await actOn(page, `#${id}`);
      await Bun.sleep(300);
      said.push(
        await page.evaluate((id: string) => {
          const link = (document.getElementById("frame") as HTMLIFrameElement | null)?.contentDocument?.getElementById(id);
          const note = document.getElementById("announce")?.textContent || "no note";
          return `${id}: ${link?.matches("a:any-link") ? "a link" : "no link"}, href ${link?.getAttribute("href")}, ${note}`;
        }, id),
      );
    }
    await page.close();
    return said;
  }

  test("press an http:// and an https:// link of a built design, and no connection and no byte reaches their address", async () => {
    const http = `http://${logger.host}/http`;
    const https = `https://${logger.host}/https`;
    // The reader lets an https:// link through, so this is a design as a person writes it, built by the command line.
    writeFileSync(join(folder, "design/links.html"), DESIGN.replace("<p>A</p>", `<p><a id="https" href="${https}" data-testid="a-help">Help</a></p>`));
    const code = await run(["build", "design/links.html"], { out: () => undefined, err: () => undefined }, folder);
    const built = join(folder, ".prototype/views/design/links.html");
    expect([code, existsSync(built)]).toEqual([0, true]);
    // The reader refuses an http://, a mailto:, and a tel: link, so only a page built past it holds one.
    const forced = join(folder, "forced-links.html");
    const others = `<a id="http" href="${http}">Site</a> <a id="mail" href="mailto:a@${logger.host}">Mail</a> <a id="call" href="tel:+1555">Call</a>`;
    writeFileSync(forced, forcedPage(folder, others));
    const said = [...(await press(built, ["https"])), ...(await press(forced, ["http", "mail", "call"]))];
    expect([logger.connected, logger.heard]).toEqual([[], []]);
    // Each stays a link, and the viewer says the address the design wrote, which the page holds as text alone.
    const note = (address: string) => `A link of the design, not followed in the prototype: ${address}`;
    expect(said).toEqual([
      `https: a link, href about:blank, ${note(https)}`,
      `http: a link, href about:blank, ${note(http)}`,
      `mail: a link, href about:blank, ${note(`mailto:a@${logger.host}`)}`,
      `call: a link, href about:blank, ${note("tel:+1555")}`,
    ]);
    expect(/(?<![\w-])href="(?:https?|mailto|tel):/i.test(readFileSync(built, "utf8") + readFileSync(forced, "utf8"))).toBe(false);
  }, 60_000);
});
