// A headless Chrome for the browser tests: a tab of a given size and media, keys, clicks, an expression run in the page,
// and a picture. It speaks through the tool's own pipe client (src/capture.ts), the one driver of the repository, with
// the capture's flags, so the browser makes no network use of its own and opens no port. One Chrome serves every test
// file of a run that asks for the same flags: the first `Browser` starts it, and it stops after the last test file, on an
// exit, or on a signal. Each `Browser` is a browser context of its own in it, so no storage, cookie, or tab crosses from
// one to another, and its close disposes the context. The tests run only when PROTOTYPE_BROWSER_TESTS=1 and a Chrome exists.

import type { ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DevTools, ended, findChrome, launch, removeProfile } from "../../src/capture.ts";
import { tempFolder } from "../temp.ts";
import { buildPages } from "./pages.ts";

/** The Chrome to run: the capture's own search, `CHROME_BIN` first. */
export const chromePath = (): string | null => findChrome();

/** Whether the browser tests run: asked for, and a Chrome exists. */
export const BROWSER = process.env.PROTOTYPE_BROWSER_TESTS === "1" && chromePath() !== null;

export type Media = { dark?: boolean; reducedMotion?: boolean; forcedColors?: boolean };
export type Clip = { x: number; y: number; width: number; height: number };

const KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Tab: { code: "Tab", vk: 9 },
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Escape: { code: "Escape", vk: 27 },
  Shift: { code: "ShiftLeft", vk: 16 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  " ": { code: "Space", vk: 32, text: " " },
};

/** One running Chrome, shared by every `Browser` of the run with the same flags. */
type Chrome = { child: ChildProcess; tools: DevTools; profile: string };

/** The running Chromes, by their flags. */
const running = new Map<string, Chrome>();

/** Chrome for these flags: the running one, or one started now, after every test page is built. */
function chromeFor(extra: readonly string[]): Chrome {
  const key = extra.join("\n");
  const found = running.get(key);
  if (found) return found;
  const chrome = chromePath();
  if (!chrome) throw new Error("no Chrome found: set CHROME_BIN");
  buildPages();
  const profile = tempFolder(join(tmpdir(), "prototype-viewer-chrome-"));
  // The tests read every box without a scrollbar's width, as a phone or an overlay scrollbar shows them.
  const { child, tools } = launch(chrome, profile, ["--hide-scrollbars", ...extra]);
  const started = { child, tools, profile };
  running.set(key, started);
  const stop = () => {
    child.kill("SIGKILL");
  };
  process.once("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.once(signal, () => {
      stop();
      process.exit(1);
    });
  return started;
}

/**
 * Stop every Chrome the tests started, and remove its profile, about 11 MB, once Chrome has quit: on Windows, once
 * Chrome's helpers let its files go. One still held then goes when the run ends. The preload calls it after the last file.
 */
export async function stopBrowsers(): Promise<void> {
  for (const [key, { child, tools, profile }] of [...running]) {
    running.delete(key);
    // Chrome quits, and its pipe is closed and its close awaited, as the capture does (src/capture.ts, ended).
    await tools.call("Browser.close").catch(() => {});
    tools.close();
    child.kill("SIGKILL");
    await ended({ child, tools });
    await removeProfile(profile);
  }
}

export class Browser {
  private readonly chrome: Chrome;
  /** This browser's own context in the shared Chrome, made at the first need: its storage, cookies, and tabs are its own. */
  private context: Promise<string> | null = null;

  /** `extra` adds flags after the capture's own, such as a rule that lets the browser reach a logger on this machine. */
  constructor(extra: readonly string[] = []) {
    this.chrome = chromeFor(extra);
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    return this.chrome.tools.call(method, params, sessionId);
  }

  private contextId(): Promise<string> {
    this.context ??= this.send("Target.createBrowserContext").then((made) => String(made.browserContextId));
    return this.context;
  }

  /** A new tab of this size, with the media settings a person may have. */
  async open(width: number, height: number, media: Media = {}): Promise<Page> {
    const browserContextId = await this.contextId();
    const { targetId } = (await this.send("Target.createTarget", { url: "about:blank", browserContextId })) as { targetId: string };
    const { sessionId } = (await this.send("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
    const page = new Page(this, sessionId, targetId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.size(width, height);
    await page.media(media);
    return page;
  }

  /** Dispose this browser's context, with every tab still open in it; the shared Chrome runs on for the next test file. */
  async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    if (context) await this.send("Target.disposeBrowserContext", { browserContextId: await context });
  }
}

export class Page {
  constructor(
    private browser: Browser,
    private sessionId: string,
    private targetId: string,
  ) {}

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.browser.send(method, params, this.sessionId);
  }

  size(width: number, height: number): Promise<unknown> {
    return this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  }

  media(media: Media): Promise<unknown> {
    const features = [
      { name: "prefers-color-scheme", value: media.dark ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: media.reducedMotion ? "reduce" : "no-preference" },
      { name: "forced-colors", value: media.forcedColors ? "active" : "none" },
    ];
    return this.send("Emulation.setEmulatedMedia", { features });
  }

  /** Run an expression, or a function with one JSON argument, in the page, and give its value back. */
  async evaluate<T, A = undefined>(code: string | ((argument: A) => T | Promise<T>), argument?: A): Promise<T> {
    const expression = typeof code === "string" ? code : `(${code.toString()})(${JSON.stringify(argument ?? null)})`;
    const ran = (await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    };
    if (ran.exceptionDetails) throw new Error(ran.exceptionDetails.exception?.description ?? ran.exceptionDetails.text);
    return ran.result.value;
  }

  /** Wait until an expression is true in the page. */
  async until(expression: string, milliseconds = 10_000): Promise<void> {
    const end = Date.now() + milliseconds;
    while (Date.now() < end) {
      if (await this.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return;
      await Bun.sleep(25);
    }
    throw new Error(`the page never reached: ${expression}`);
  }

  /** Open an address and wait for the viewer's ready signal. */
  async goto(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await this.settled();
  }

  /** Two frames painted: what the last step changed has been laid out and drawn. */
  async frames(): Promise<void> {
    await this.evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`);
  }

  /** The tasks queued before now have run, such as the hashchange a new address queued: a timer of no delay runs after them. */
  async tasksRun(): Promise<void> {
    await this.evaluate(`new Promise((done) => setTimeout(() => done(true), 0))`);
  }

  /**
   * What the last step started has finished drawing: two frames, so a transition it starts has begun, then every
   * transition of the viewer's own page done, then two frames more.
   */
  async calm(): Promise<void> {
    await this.frames();
    await this.until(`!document.getAnimations().some((one) => one instanceof CSSTransition && one.playState === "running")`);
    await this.frames();
  }

  /** The viewer's own ready signal: the frame shows the view, and two frames have painted. */
  async settled(): Promise<void> {
    await this.until(`document.readyState === "complete" && document.getElementById("workspace")?.dataset.ready === "true"`);
    await this.evaluate(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`);
  }

  async reload(): Promise<void> {
    await this.send("Page.reload");
    await Bun.sleep(50);
    await this.settled();
  }

  /** Press one key, as a keyboard does. `shift` holds Shift. */
  async key(key: string, shift = false): Promise<void> {
    const known = KEYS[key];
    const base = known
      ? { key, code: known.code, windowsVirtualKeyCode: known.vk }
      : { key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : "", windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
    const text = known ? known.text : key;
    const modifiers = shift ? 8 : 0;
    await this.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", modifiers, ...base, ...(text ? { text } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...base });
  }

  async type(text: string): Promise<void> {
    await this.send("Input.insertText", { text });
  }

  /** Click a point of the window with the pointer. */
  async clickAt(x: number, y: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }

  /** Click the centre of the first element a selector finds, in the page or, with `inFrame`, in the design's frame. */
  async click(selector: string, inFrame = false): Promise<void> {
    const at = await this.evaluate(
      ({ selector, inFrame }: { selector: string; inFrame: boolean }) => {
        const frame = document.getElementById("frame") as HTMLIFrameElement | null;
        const root = inFrame ? frame?.contentDocument : document;
        const found = root?.querySelector(selector);
        if (!found) return null;
        found.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = found.getBoundingClientRect();
        const outer = inFrame && frame ? frame.getBoundingClientRect() : { x: 0, y: 0, width: 0 };
        const scale = inFrame && frame ? outer.width / frame.offsetWidth : 1;
        return { x: outer.x + (box.x + box.width / 2) * scale, y: outer.y + (box.y + box.height / 2) * scale };
      },
      { selector, inFrame },
    );
    if (!at) throw new Error(`nothing to click: ${selector}`);
    await this.clickAt(at.x, at.y);
  }

  async screenshot(path: string, clip?: Clip, scale = 1): Promise<void> {
    const shot = (await this.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale } } : {}) })) as { data: string };
    writeFileSync(path, Buffer.from(shot.data, "base64"));
  }

  async close(): Promise<void> {
    await this.browser.send("Target.closeTarget", { targetId: this.targetId });
  }
}
