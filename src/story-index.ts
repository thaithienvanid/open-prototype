// Storybook's index read from the disk, under the one path rule, for `stories`: the pure reading of its stories is in
// `stories.ts`.
import { Refusal, Unreadable } from "./errors.ts";
import { decodeUtf8, NOT_PLAIN, projectPath, readPlain, reasonOf } from "./fs.ts";
import { type Json, readJson } from "./json.ts";

/**
 * Storybook's index, by its path inside the project, under the one path rule, read strictly as JSON. A file that cannot
 * be read, is not UTF-8, or is not JSON is a refused request, `request.file`, with the step to build the index.
 */
export function readStoryIndex(root: string, index: string): Json {
  const path = projectPath(root, index, { what: "the stories index" });
  const unread = (why: string) => new Refusal(`${index} cannot be read (${why}): run \`storybook build\`, then name its index.json`, "request.file");
  let bytes: Buffer;
  try {
    // A pipe at the index would hold a plain read until something writes to it, so it is opened without waiting.
    bytes = readPlain(path);
  } catch (error) {
    if (error instanceof Unreadable) throw unread(NOT_PLAIN);
    // What the file system said is a refusal; any other error is a fault of the tool.
    if (typeof (error as NodeJS.ErrnoException).code !== "string") throw error;
    throw unread(reasonOf(error));
  }
  const text = decodeUtf8(bytes);
  if (text === null) throw unread("the text is not UTF-8");
  const json = readJson(text);
  if (!json.ok) throw unread(json.error);
  return json.value;
}
