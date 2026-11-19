// `shots --capture`: headless Chrome takes each shot of the list from the built page. The tool starts Chrome with a
// throwaway profile, speaks Chrome's DevTools protocol to it over a pipe, and stops it at the end, however the capture
// ends. It opens no port and needs no shell, so it runs on any system Chrome runs on.

import { type ChildProcess, spawn } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { READY_SELECTOR, VIEWER_READY } from "./contract.ts";
import { READ_LIMITS } from "./format.ts";
import { isLink, pathInside, reasonOf, writeWhole } from "./fs.ts";
import type { Shot } from "./shots.ts";

const CALL_SECONDS = 30;
const READY = `Boolean(location.href !== 'about:blank' && document.querySelector(${JSON.stringify(READY_SELECTOR)}) && document.getElementById('${VIEWER_READY.frame}'))`;
const BOX =
  `(() => { const r = document.getElementById('${VIEWER_READY.frame}')?.getBoundingClientRect();` +
  " return r && r.width > 0 && r.height > 0 ? {x: r.left, y: r.top, width: r.width, height: r.height, scale: 1} : null; })()";

/** The design's whole height in the frame, when it is taller than the frame; else 0. */
const TALL =
  `(() => { const frame = document.getElementById('${VIEWER_READY.frame}'); const page = frame?.contentDocument;` +
  " if (!frame || !page?.documentElement) return 0;" +
  " const whole = Math.ceil(Math.max(page.documentElement.scrollHeight, page.body?.scrollHeight ?? 0));" +
  " return whole > frame.clientHeight + 1 ? whole : 0; })()";
/**
 * The frame made as tall as the design, and its slot as tall as the frame, by a rule that wins over the sizes the viewer
 * sets on them, so a redraw cannot take the height back; then two painted frames, so the picture holds the whole view.
 */
const grow = (height: number): string =>
  "new Promise((done) => { const sheet = document.styleSheets[document.styleSheets.length - 1];" +
  ` sheet.insertRule('#frame { height: ${height}px !important; }', sheet.cssRules.length);` +
  " sheet.insertRule('#device-slot { height: auto !important; }', sheet.cssRules.length);" +
  " requestAnimationFrame(() => requestAnimationFrame(() => done(true))); })";
/** The window's size for a capture: wide and tall enough for any frame of the device table at 100%. */
const WINDOW = { width: 2200, height: 1100 };

function isRegular(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// The paths a pattern of the form `<base>/<prefix>*<rest>` names, newest name first, for Playwright's downloaded Chromium.
function downloaded(base: string, folderPrefix: string, inner: string[]): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(base)
      .filter((name) => name.startsWith(folderPrefix))
      .sort()
      .reverse();
  } catch {
    return [];
  }
  return names.flatMap((name) => inner.map((part) => join(base, name, part)));
}

/** Chrome or Chromium: `CHROME_BIN`, then the `PATH`, then the usual installs, then a Chromium Playwright downloaded. */
export function findChrome(home: string = homedir()): string | null {
  if (process.env.CHROME_BIN !== undefined) {
    const named = process.env.CHROME_BIN;
    return named && isRegular(named) ? named : null;
  }
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const found = Bun.which(name);
    if (found) return found;
  }
  const places = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    ...downloaded(join(home, "Library/Caches/ms-playwright"), "chromium-", [
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    ]),
    ...downloaded(join(home, ".cache/ms-playwright"), "chromium-", ["chrome-linux/chrome", "chrome-linux64/chrome"]),
  ];
  return places.find(isRegular) ?? null;
}

type Message = { id?: number; result?: Record<string, unknown>; error?: unknown; method?: string };

/** Chrome's DevTools protocol over the pipe Chrome reads on its file 3 and writes on its file 4: each message is JSON
 * ended by a NUL byte, and each call waits for its own answer, 30 seconds at most. No port is open, so no other program
 * can drive this browser. The one client of the repository: the capture and the browser tests both speak through it. */
export class DevTools {
  private next = 0;
  private buffer = "";
  private readonly waiting = new Map<number, (message: Message) => void>();
  private closed = false;
  /** Why the client takes no more calls, once it takes none. */
  private why = "Chrome closed the pipe";
  /** Whether Chrome sent a message that is no JSON: nothing after it on the pipe is read. */
  private unreadable = false;

  constructor(
    private readonly input: Writable,
    output: Readable,
  ) {
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      if (this.unreadable) return;
      this.buffer += chunk;
      for (let end = this.buffer.indexOf("\0"); end >= 0; end = this.buffer.indexOf("\0")) {
        let message: Message;
        try {
          message = JSON.parse(this.buffer.slice(0, end)) as Message;
        } catch {
          // A message that is no JSON would throw outside every call: the pipe is no longer read, and each call fails.
          this.buffer = "";
          this.unreadable = true;
          this.end("Chrome sent a message that is no JSON, so its pipe is no longer read");
          return;
        }
        this.buffer = this.buffer.slice(end + 1);
        if (message.id !== undefined) this.waiting.get(message.id)?.(message);
      }
    });
    output.on("close", () => this.end("Chrome closed the pipe"));
  }

  /** Take no more calls, and fail each waiting one with `why`. */
  private end(why: string): void {
    if (!this.closed) this.why = why;
    this.closed = true;
    for (const answer of [...this.waiting.values()]) answer({ error: why });
  }

  call(method: string, params: Record<string, unknown> = {}, session?: string): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(new Error(this.why));
    const id = ++this.next;
    return new Promise((done, fail) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        fail(new Error(`Chrome timed out waiting for ${method}`));
      }, CALL_SECONDS * 1000);
      this.waiting.set(id, (message) => {
        clearTimeout(timer);
        this.waiting.delete(id);
        if (message.error !== undefined) fail(new Error(`${method}: ${JSON.stringify(message.error)}`));
        else done(message.result ?? {});
      });
      this.input.write(`${JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) })}\0`);
    });
  }

  /**
   * Take no more calls. The pipe itself closes once, when Chrome's process ends, and only its socket closes it: see
   * `started` below for the second close the runtime adds.
   */
  close(): void {
    this.closed = true;
  }
}

/** The flags Chrome starts with: headless, the pipe and no port, a throwaway profile, and no network use of its own. */
export const FLAGS = [
  "--headless=new",
  "--remote-debugging-pipe",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-features=OptimizationHints,Translate,MediaRouter",
  "--disable-sync",
  "--no-proxy-server",
  "--force-device-scale-factor=1",
  "--use-mock-keychain",
  "--password-store=basic",
  // Chrome's own background traffic: no name resolves, no field trial is fetched, no ping and no metrics are sent.
  "--host-resolver-rules=MAP * ~NOTFOUND",
  "--disable-field-trial-config",
  "--no-pings",
  "--metrics-recording-only",
];

type Launched = { child: ChildProcess; tools: DevTools };
/**
 * Every Chrome this process started, kept to the end, so none is collected. In Bun 1.3, `node:child_process` wraps each
 * end of the pipe in a socket that closes its file number when the pipe ends. Bun's own process object also owns that
 * number, and closes it again when the collector finalises the object. By then the number may be another file's, such
 * as the next Chrome's pipe (oven-sh/bun#47561 and #47956). A test in `tests/product.test.ts` failed without this list on
 * Bun 1.3.14. Bun 1.4.0 fixed the double close, and the tool needs Bun 1.4.4, yet the list stays until a run without it
 * is proven.
 */
const started: ChildProcess[] = [];

/** Start Chrome with a throwaway profile, talking over a pipe it shares with this process alone. `extra` adds flags after the capture's own. */
export function launch(chrome: string, profile: string, extra: readonly string[] = []): Launched {
  // A program the system will not run is refused here, with its reason: the spawn would say so only later, as an event.
  accessSync(chrome, constants.X_OK);
  const child = spawn(chrome, [...FLAGS, ...extra, `--user-data-dir=${profile}`, "about:blank"], {
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
  });
  started.push(child);
  // A start that fails is told by the pid it lacks; its event, which names the program's full path, is not printed.
  child.on("error", () => undefined);
  if (child.pid === undefined) throw new Error("the browser did not start");
  const input = child.stdio[3];
  const output = child.stdio[4];
  if (!(input instanceof Writable) || !(output instanceof Readable)) throw new Error("Chrome's pipe did not open");
  return { child, tools: new DevTools(input, output) };
}

// A capture stops its Chrome and removes the profile however the tool ends: on exit, and on a signal, after which the
// tool exits with the signal's code.
function guard(profile: string): { watch: (child: ChildProcess) => void; release: () => void } {
  let child: ChildProcess | null = null;
  const stop = () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    // Chrome may still be writing into the profile as it dies, so a folder that is not empty yet is tried again. A
    // profile the system still holds, as Windows holds a file Chrome's helpers have open, is left to the next sweep.
    try {
      if (existsSync(profile)) rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 25 });
    } catch {
      // `removeStaleProfiles` removes it at the next capture's start
    }
  };
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map((signal) => {
    // After the cleanup, the signal is raised again with no handler, so the tool ends as the signal ends it.
    const handler = () => {
      stop();
      for (const [other, otherHandler] of handlers) process.off(other, otherHandler);
      process.kill(process.pid, signal);
    };
    process.on(signal, handler);
    return [signal, handler] as const;
  });
  process.on("exit", stop);
  return {
    watch: (started) => {
      child = started;
    },
    release: () => {
      stop();
      for (const [signal, handler] of handlers) process.off(signal, handler);
      process.off("exit", stop);
    },
  };
}

async function waitFor(tools: DevTools, session: string, expression: string, message: string): Promise<void> {
  const end = Date.now() + CALL_SECONDS * 1000;
  while (Date.now() < end) {
    let value: unknown = null;
    try {
      const result = await tools.call("Runtime.evaluate", { expression, returnByValue: true }, session);
      value = (result.result as { value?: unknown } | undefined)?.value;
    } catch (error) {
      if (!String((error as Error).message).includes("navigated or closed")) throw error;
    }
    if (value) return;
    await Bun.sleep(20);
  }
  throw new Error(message);
}

/** Write a shot's picture into its own plain file: a link at its name is refused, and the write replaces no file through one. */
function writeShot(target: string, bytes: Uint8Array): void {
  if (isLink(target)) throw new Error(`the shot ${basename(target)} is a link in the shots folder: write screenshots only into plain files`);
  writeWhole(target, bytes);
}

/** Take one shot into `target`, and return the design's whole height when the picture stopped at the limit, else 0. */
async function captureOne(tools: DevTools, session: string, url: string, shot: Shot, target: string): Promise<number> {
  await tools.call("Emulation.setDeviceMetricsOverride", { ...WINDOW, deviceScaleFactor: 1, mobile: false }, session);
  await tools.call(
    "Emulation.setEmulatedMedia",
    {
      features: [
        { name: "prefers-color-scheme", value: shot.theme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    },
    session,
  );
  await tools.call("Page.navigate", { url: "about:blank" }, session);
  await waitFor(tools, session, "location.href === 'about:blank'", "timed out resetting page to about:blank");
  await tools.call("Page.navigate", { url }, session);
  await waitFor(tools, session, READY, `timed out waiting for the viewer's ${READY_SELECTOR}`);
  // A view taller than its frame is pictured whole: the window grows by twice the design's height, so the artboard holds
  // the grown frame wherever it centres the frame's own height, then the frame grows to the design's height. The
  // picture's first frame height is what shows before a scroll.
  const measured = await tools.call("Runtime.evaluate", { expression: TALL, returnByValue: true }, session);
  const whole = Number((measured.result as { value?: unknown } | undefined)?.value ?? 0);
  // A design may run to any height, and Chrome's memory grows with the window, so a picture stops at the limit, and says so.
  const tall = Math.min(whole, READ_LIMITS.picture_height);
  if (tall > 0) {
    await tools.call(
      "Emulation.setDeviceMetricsOverride",
      { width: WINDOW.width, height: WINDOW.height + 2 * tall, deviceScaleFactor: 1, mobile: false },
      session,
    );
    await waitFor(tools, session, `window.innerHeight === ${WINDOW.height + 2 * tall}`, "timed out waiting for the taller window");
    await Bun.sleep(100);
    await waitFor(tools, session, READY, `timed out waiting for the viewer's ${READY_SELECTOR}`);
    await tools.call("Runtime.evaluate", { expression: grow(tall), returnByValue: true, awaitPromise: true }, session);
  }
  const box = await tools.call("Runtime.evaluate", { expression: BOX, returnByValue: true }, session);
  const clip = (box.result as { value?: unknown } | undefined)?.value;
  const params: Record<string, unknown> = { format: "png", captureBeyondViewport: true, ...(clip && typeof clip === "object" ? { clip } : {}) };
  const picture = await tools.call("Page.captureScreenshot", params, session);
  writeShot(target, Buffer.from(String(picture.data ?? ""), "base64"));
  return whole > tall ? whole : 0;
}

/** The start of the name of every profile folder a capture makes. */
const PROFILE_PREFIX = "prototype-shots-";
/** A profile folder younger than this may be a capture that is starting, so it is never taken as stale. */
const STALE_SECONDS = 60;

/**
 * The file in which a capture writes its own process id into the profile it makes, so a sweep never takes a profile a
 * running capture holds, on any system: Windows gives Chrome's lock no link to read.
 */
const OWNER_FILE = "capture.pid";
/** The capture that made a profile, by the id it wrote there, or 0 when the profile holds none that can be read. */
function ownerOf(profile: string): number {
  try {
    const path = join(profile, OWNER_FILE);
    if (!lstatSync(path).isFile()) return 0;
    const text = readFileSync(path, "utf8").trim();
    return /^[0-9]{1,10}$/.test(text) ? Number(text) : 0;
  } catch {
    return 0;
  }
}

/** Whether a process of this machine runs: Chrome's lock in its profile names its host and process, `<host>-<pid>`. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Remove the profile folders earlier captures left, as a capture stopped by force leaves its own: only a plain folder
 * whose name this tool gives, of this user, older than a minute, whose capture, by the id it wrote there, no longer
 * runs, and that no running Chrome holds by its lock.
 */
export function removeStaleProfiles(base: string = tmpdir(), now: number = Date.now()): string[] {
  const removed: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(base).filter((name) => name.startsWith(PROFILE_PREFIX) && /^[A-Za-z0-9]{6}$/.test(name.slice(PROFILE_PREFIX.length)));
  } catch {
    return removed;
  }
  for (const name of names) {
    const path = join(base, name);
    try {
      const info = lstatSync(path);
      if (!info.isDirectory() || (typeof process.getuid === "function" && info.uid !== process.getuid()) || now - info.mtimeMs < STALE_SECONDS * 1000) continue;
      const owner = ownerOf(path);
      if (owner > 0 && running(owner)) continue;
      let lock = "";
      try {
        lock = readlinkSync(join(path, "SingletonLock"));
      } catch {
        // no lock: no Chrome holds the folder
      }
      const pid = Number(/-([0-9]+)$/.exec(lock)?.[1] ?? "");
      if (lock && (!Number.isInteger(pid) || pid <= 0 || running(pid))) continue;
      rmSync(path, { recursive: true, force: true });
      removed.push(path);
    } catch {
      // a folder that went away, or that cannot be removed, is left as it is
    }
  }
  return removed;
}

/** What a capture wrote, and why it could not run: no Chrome found is a refusal; a Chrome that cannot start or times out is a fault. */
/** Whether this process runs as root, the user Chrome will not start in its sandbox as. */
export function asRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

/** What a capture wrote, why it failed, and each shot whose picture stopped at `READ_LIMITS.picture_height`, with its design's height. */
export type CaptureResult = { written: string[]; problems: string[]; refused: boolean; cut: { file: string; height: number }[] };

/**
 * Take each shot of the list from a page's text into `folder`. The page is written into the capture's own throwaway
 * profile, which goes when the capture ends. Two shots of one view are taken once: the second is a copy of the first.
 * Each shot's file is held to the path rule before Chrome starts, so a link at a shot's name is a refused request.
 */
export async function captureShots(pageText: string, shots: Shot[], folder: string): Promise<CaptureResult> {
  const files = shots.map((shot) => {
    const name = shot.file.split("/").pop() ?? shot.file;
    return pathInside(folder, name, `the shot ${name} in the shots folder`);
  });
  // Chrome starts as root only with its sandbox off, and a hostile design's images would then be decoded with no wall
  // around them, so a capture as root is refused, never run with the sandbox off.
  if (asRoot())
    return {
      written: [],
      problems: ["Chrome starts as root only with its sandbox off, so the capture never runs as root: run it as a user who is not root"],
      refused: true,
      cut: [],
    };
  const chrome = findChrome();
  if (!chrome) {
    // A CHROME_BIN the person set and the disk lacks is named as theirs, by what it is, never by its full path.
    const problem =
      process.env.CHROME_BIN !== undefined
        ? "CHROME_BIN names no program on this machine: set it to the path of Chrome's or Chromium's program, or unset it so the tool looks for Chrome"
        : "no Chrome or Chromium found: install Chrome or set CHROME_BIN to capture shots";
    return { written: [], problems: [problem], refused: true, cut: [] };
  }
  mkdirSync(folder, { recursive: true });
  removeStaleProfiles();
  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  const { watch, release } = guard(profile);
  const written: string[] = [];
  const cut: CaptureResult["cut"] = [];
  try {
    writeWhole(join(profile, OWNER_FILE), String(process.pid));
  } catch (error) {
    release();
    return {
      written,
      problems: [`cannot write into the capture's profile in the system's temporary folder (${reasonOf(error)}): free space there, then run the command again`],
      refused: false,
      cut,
    };
  }
  let started: Launched;
  try {
    started = launch(chrome, profile);
    watch(started.child);
  } catch (error) {
    release();
    const which = process.env.CHROME_BIN ? "the browser that CHROME_BIN names" : "the Chrome or Chromium found on this machine";
    return {
      written,
      problems: [`cannot start ${which} (${reasonOf(error)}): set CHROME_BIN to the program of Chrome or Chromium, or install Chrome`],
      refused: false,
      cut,
    };
  }
  const { tools } = started;
  try {
    const targets = (await tools.call("Target.getTargets")).targetInfos as { targetId: string; type: string }[];
    const opened = targets.find((target) => target.type === "page");
    if (!opened) throw new Error("Chrome opened no page");
    const session = String((await tools.call("Target.attachToTarget", { targetId: opened.targetId, flatten: true })).sessionId);
    await tools.call("Page.enable", {}, session);
    await tools.call("Runtime.enable", {}, session);
    const page = join(profile, "page.html");
    writeWhole(page, pageText);
    const base = pathToFileURL(page).href;
    const taken = new Map<string, string>();
    for (const [index, shot] of shots.entries()) {
      const target = files[index] ?? "";
      const same = taken.get(shot.link);
      if (same) writeShot(target, readFileSync(same));
      else {
        const height = await captureOne(tools, session, base + shot.link, shot, target);
        if (height) cut.push({ file: shot.file, height });
      }
      taken.set(shot.link, target);
      written.push(target);
    }
    return { written, problems: [], refused: false, cut };
  } catch (error) {
    return {
      written,
      problems: [`Chrome screenshot capture failed (${reasonOf(error)}): run the command again, and report it with the command you ran when it fails again`],
      refused: false,
      cut,
    };
  } finally {
    // Chrome is stopped, and its exit awaited, before its profile goes: on Windows its files stay held until it ends.
    tools.close();
    const { child } = started;
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await ended(started);
    await removeProfile(profile);
    release();
  }
}

/** How long a stopped Chrome's profile is tried again while the system still holds a file of it. */
const REMOVE_SECONDS = 10;

/**
 * Remove a stopped browser's profile folder, and try again for a few seconds while the system still holds a file in
 * it, as Windows does until each of Chrome's helper processes has ended. Returns whether the folder is gone; a folder
 * still held is left, and `removeStaleProfiles` removes it at the next capture's start.
 */
export async function removeProfile(profile: string): Promise<boolean> {
  const end = Date.now() + REMOVE_SECONDS * 1000;
  for (;;) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return true;
    } catch {
      if (Date.now() >= end) return false;
      await Bun.sleep(100);
    }
  }
}

/**
 * Wait, a few seconds at most, until a stopped Chrome has exited and both ends of its pipe have closed, so no file number
 * of the pipe is still closing when a program started next takes the same number for a pipe of its own.
 */
export async function ended({ child }: Launched): Promise<void> {
  const exited = new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) done(true);
    else child.once("exit", done);
  });
  const ends = [child.stdio[3], child.stdio[4]].filter((end): end is NonNullable<typeof end> => Boolean(end));
  const closed = ends.map(
    (end) =>
      new Promise((done) => {
        if ((end as { closed?: boolean }).closed) done(true);
        else end.once("close", done);
      }),
  );
  // The ceiling's timer is cleared once Chrome has ended, so a pending timer never holds the tool open after its work.
  let ceiling: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all([exited, ...closed]), new Promise((done) => (ceiling = setTimeout(done, 3000)))]);
  clearTimeout(ceiling);
}
