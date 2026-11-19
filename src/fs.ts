// The file system as the tool uses it. One path rule: every path below the project's root passes `projectPath`. The
// root is resolved once, so the root and the folders above it may be links, as `/tmp` is on macOS; each part below it is
// asked with `lstat`, and a link there is refused. Text is read as UTF-8 or refused, and a write lands whole or not at all.

import { randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, linkSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { Refusal, Unreadable } from "./errors.ts";

/** Bytes as UTF-8 text, a byte order mark kept as a character, or null when they are not UTF-8. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

// What the file system said, in words, and the step that works where the person is.
const SYSTEM_ERRORS: Record<string, [what: string, next: string]> = {
  EACCES: ["permission denied", "give yourself access to it (to read it, or to write where the tool writes), or name another path"],
  EPERM: ["the system refused the change", "give yourself access to it, or name another path"],
  EROFS: ["the file system is read-only", "name a folder on a writable disk"],
  EEXIST: ["a file stands where a folder is needed", "move the file away, or name another path"],
  ENOTDIR: ["a part of the path is a file, not a folder", "move the file away, or name another path"],
  EISDIR: ["it is a folder, not a file", "name a file"],
  ENOENT: ["no such file or folder", "check the path"],
  ENAMETOOLONG: ["the name is too long for the file system", "use a shorter name"],
  ENOSPC: ["the disk is full", "free some space, then run again"],
  EMFILE: ["too many files are open", "close some programs, then run again"],
};

/**
 * What the file system said, in words, with its code and the next step, or null for an error it did not give. Windows
 * tells a refused access (ERROR_ACCESS_DENIED) as EPERM, so there EPERM has the words of a permission denied.
 */
export function systemError(error: unknown, platform: string = process.platform): { code: string; what: string; next: string } | null {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const known = code ? SYSTEM_ERRORS[code === "EPERM" && platform === "win32" ? "EACCES" : code] : undefined;
  return code && known ? { code, what: known[0], next: known[1] } : null;
}

/**
 * Why a read failed, in words. The system's own message names the machine's full path, so an error of the system is
 * told in words with its code, never by that message; the tool's own reasons are told as they are.
 */
export function reasonOf(error: unknown): string {
  const known = systemError(error);
  if (known) return `${known.what}, ${known.code}`;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (typeof code === "string" && code !== "") return `the system refused it, ${code}`;
  return error instanceof Error ? error.message : String(error);
}

/** Why a file cannot be read, and the step that works: a file the system will not open is no matter of its encoding. */
function readProblem(error: unknown): string {
  const known = systemError(error);
  if (known) return `${known.what} (${known.code}): ${known.next}`;
  return `${reasonOf(error)}: check the file and its folder, then run again`;
}

/**
 * A fault's message with no path of this machine in it: a path the error carries, and the project's folder, are named
 * from the project's top, so the system's reason and code stay and the full path goes.
 */
export function faultMessage(error: unknown, root: string): string {
  let message = error instanceof Error ? error.message : String(error);
  const carried = error && typeof error === "object" ? [(error as { path?: unknown }).path, (error as { dest?: unknown }).dest] : [];
  for (const path of carried) if (typeof path === "string" && path !== "") message = message.replaceAll(path, shownPath(root, path));
  for (const top of new Set([realPath(root), root])) if (top.length > 1) message = message.replaceAll(`${top}/`, "").replaceAll(top, ".");
  return message;
}

/** A path as a message names it: from the project's top when it is inside the project, and by its own name when not. */
export function shownPath(root: string, path: string): string {
  for (const [top, at] of [
    [root, path],
    [realPath(root), realPath(path)],
  ] as const) {
    const rel = relative(top, at);
    if (rel !== "" && rel.split(/[\\/]/)[0] !== ".." && !isAbsolute(rel)) return rel.split("\\").join("/");
  }
  return basename(path);
}

/** Why a file is not read: it is a pipe or a device, which would hold the read until something writes to it. */
export const NOT_PLAIN = "it is no plain file, such as a pipe or a device";

/**
 * A file's bytes, opened without waiting and read only when the system says it is a plain file; a folder is read, so
 * the system says it is one. A pipe or a device is `Unreadable`, and any other error is the system's own. Windows has
 * no such flag, and no pipe at a file's path.
 */
export function readPlain(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() && !info.isDirectory()) throw new Unreadable(`${NOT_PLAIN}: put the file itself there`);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * A file's text, read as UTF-8 with each line ending written as `\n`: a missing file is null, and a file that cannot
 * be read, or is not UTF-8, is refused with its reason and the step that works for that reason.
 */
export function readText(path: string): string | null {
  let bytes: Buffer;
  try {
    bytes = readPlain(path);
  } catch (error) {
    if (error instanceof Unreadable) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Unreadable(readProblem(error));
  }
  const text = decodeUtf8(bytes);
  if (text === null) throw new Unreadable("the text is not UTF-8: save it as UTF-8 text");
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/** An error of a write through a temporary file, naming the file the write was for: the temporary one is the tool's own. */
function forTarget(error: unknown, temporary: string, target: string): unknown {
  const failed = error as NodeJS.ErrnoException | null;
  if (failed && typeof failed === "object" && failed.path === temporary) failed.path = target;
  return error;
}

/** Write a file through a temporary file beside it and a rename, so a reader never sees half of it. */
export function writeWhole(target: string, data: string | Uint8Array): void {
  const temporary = join(dirname(target), `.${randomBytes(6).toString("hex")}.tmp`);
  let handle: number;
  try {
    handle = openSync(temporary, "wx", 0o644);
  } catch (error) {
    throw forTarget(error, temporary, target);
  }
  try {
    // The file is closed whether or not the write lands, so a full disk leaves no file open.
    try {
      writeSync(handle, typeof data === "string" ? Buffer.from(data, "utf8") : data);
    } finally {
      closeSync(handle);
    }
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // the temporary file is gone already
    }
    throw forTarget(error, temporary, target);
  }
}

/** The faults of a hard link on a disk that has none, such as exFAT, FAT32, or some network shares. */
const NO_HARD_LINKS = new Set(["EPERM", "ENOTSUP", "EXDEV"]);

/**
 * Write a new file, never over one that exists: the text goes to a temporary file beside it, which is then linked to
 * its name, and a link to a name that exists fails (EEXIST) with nothing written, so no check can race the write. On a
 * disk with no hard links the target is made with an exclusive create, which fails the same way on a name that exists;
 * there a write that fails part way removes the file it made, which was no one else's. `link` is the system's, and a
 * test names one that fails.
 */
export function writeNew(target: string, data: string, link: (from: string, to: string) => void = linkSync): void {
  const temporary = join(dirname(target), `.${randomBytes(6).toString("hex")}.tmp`);
  let handle: number;
  try {
    handle = openSync(temporary, "wx", 0o644);
  } catch (error) {
    throw forTarget(error, temporary, target);
  }
  let linked = true;
  try {
    try {
      writeSync(handle, Buffer.from(data, "utf8"));
    } finally {
      closeSync(handle);
    }
    try {
      link(temporary, target);
    } catch (error) {
      if (!NO_HARD_LINKS.has(String((error as NodeJS.ErrnoException | null)?.code))) throw error;
      linked = false;
    }
  } catch (error) {
    throw forTarget(error, temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // the temporary file is gone already
    }
  }
  if (!linked) createNew(target, data);
}

/** Make a file that does not exist yet with an exclusive create, and remove it again when its write fails. */
function createNew(target: string, data: string): void {
  const handle = openSync(target, "wx", 0o644);
  try {
    try {
      writeSync(handle, Buffer.from(data, "utf8"));
    } finally {
      closeSync(handle);
    }
  } catch (error) {
    try {
      unlinkSync(target);
    } catch {
      // the file is gone already
    }
    throw error;
  }
}

const SAFE_PART = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/** Whether a name is one the path rule takes for a part of a path: letters, digits, `.`, `_`, and `-`. */
export function isSafeName(name: string): boolean {
  return SAFE_PART.test(name);
}
const MAX_PART_BYTES = 255;
const MAX_PATH_BYTES = 1024;

type PathUse = {
  /** What the path is, as the message names it, such as "a design file" or "the output folder". */
  what: string;
  /** A part may start with `.`, as the output folder `.prototype` does. */
  dotted?: boolean;
};

/** The path as written: its parts, checked as text, before the disk is asked anything. */
export function pathParts(rel: string, use: PathUse): string[] {
  const named = rel === "" ? `${use.what} names no path` : "";
  if (named) throw new Refusal(`${named}: name one inside the project, such as design/cards.html`, "request.path");
  if (rel.includes("\u0000")) throw new Refusal(`${use.what} holds a NUL character: name a path inside the project, such as design/cards.html`, "request.path");
  if (rel.includes("\\")) throw new Refusal(`${use.what} ${JSON.stringify(rel)} holds a backslash: write the path with / between its parts`, "request.path");
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel))
    throw new Refusal(`${use.what} ${rel} is an absolute path: name it by its path inside the project`, "request.path");
  if (Buffer.byteLength(rel) > MAX_PATH_BYTES) throw new Refusal(`${use.what} is longer than ${MAX_PATH_BYTES} bytes: use a shorter path`, "request.path");
  const parts = rel.split("/").filter((part) => part !== "" && part !== ".");
  if (!parts.length) throw new Refusal(`${use.what} ${rel} names the project folder itself: name a path inside it`, "request.path");
  for (const part of parts) {
    if (part === "..") throw new Refusal(`${use.what} ${rel} leaves the project folder: name a path inside it`, "request.path");
    if (Buffer.byteLength(part) > MAX_PART_BYTES)
      throw new Refusal(`${use.what} has a part longer than ${MAX_PART_BYTES} bytes: use a shorter name`, "request.path");
    const body = use.dotted && part.startsWith(".") ? part.slice(1) : part;
    if (!SAFE_PART.test(body)) {
      throw new Refusal(
        `${use.what} ${JSON.stringify(rel)}: each part takes letters, digits, \`.\`, \`_\`, and \`-\`, never a space, and starts with a letter, a digit, or \`_\``,
        "request.path",
      );
    }
  }
  return parts;
}

/** The path with every link followed, as far as the path exists; the rest is joined as written. */
function realPath(path: string): string {
  const rest: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...rest.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return path;
      rest.push(basename(current));
      current = parent;
    }
  }
}

/** A path inside the project as a message writes it: its parts joined by `/`, with no empty part and no `.`. */
export function writtenPath(rel: string): string {
  return rel
    .split("/")
    .filter((part) => part !== "" && part !== ".")
    .join("/");
}

/**
 * The path of `rel` below the project's `root`, as the root is given joined with `rel`, or a refusal that names the
 * part at fault. Every part below the root that exists is asked with `lstat`, and a link is refused, for a read and
 * for a write alike.
 */
export function projectPath(root: string, rel: string, use: PathUse): string {
  const parts = pathParts(rel, use);
  realpathSync.native(root);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let link = false;
    try {
      link = lstatSync(current).isSymbolicLink();
    } catch {
      break;
    }
    if (link)
      throw new Refusal(
        `${parts.slice(0, index + 1).join("/")} is a link: the tool reads and writes only real files and folders inside the project; replace the link with what it points to`,
        "request.path",
      );
  }
  return join(root, ...parts);
}

/** The first part of `rel` below `folder` that is a link, or "". */
export function linkBelow(folder: string, rel: string): string {
  const parts = rel.split("/").filter((part) => part !== "" && part !== ".");
  for (let index = 1; index <= parts.length; index++) {
    const part = parts.slice(0, index).join("/");
    try {
      if (lstatSync(join(folder, part)).isSymbolicLink()) return part;
    } catch {
      return "";
    }
  }
  return "";
}

/** A file below an already checked folder, refused when a part of its path is a link, for a read and for a write alike. */
export function pathInside(folder: string, rel: string, what: string): string {
  if (linkBelow(folder, rel))
    throw new Refusal(`${what} is a link: the tool reads and writes only real files inside the project; replace the link with the file`, "request.path");
  return join(folder, rel);
}

export function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return lstatSync(realPath(path)).isFile();
  } catch {
    return false;
  }
}

export function isFolder(path: string): boolean {
  try {
    return lstatSync(realPath(path)).isDirectory();
  } catch {
    return false;
  }
}
