// Font files: each `url()` of an `@font-face` in a design's styles or in a tokens file names a font file inside the
// project, which the build writes into the page as a `data:` URL. A path in a design is read from the design's folder;
// a path in a tokens file is read from that file's folder. This step is
// pure: `readFiles` read each file, and here each `url()` that names no file the page can carry is a finding.
import { type FontFault, type FontFile, type FontUrl, fontPath, fontUrls, markupFontUrls, tokensFolder } from "../css/fonts.ts";
import type { Issue } from "../design/facts.ts";
import type { Design } from "../design/load.ts";
import { type Finding, finding } from "../finding.ts";
import { FONT_TYPES } from "../format.ts";
import { lineFinder, quoted } from "../text.ts";

const KINDS = Object.keys(FONT_TYPES);
const KIND_LIST = `${KINDS.slice(0, -1).join(", ")}, or ${KINDS.at(-1)}`;

const FAULTS: Record<FontFault, (from: string) => string> = {
  scheme: (from) => `names no file of the project: keep the font file in the project, and name it by its path from ${from}`,
  absolute: (from) => `is an absolute path: name the font file by its path from ${from}`,
  outside: (from) => `leaves the project: keep the font file in the project, and name it by its path from ${from}`,
  type: () => `names no font file the page can carry: use a ${KIND_LIST} file`,
};

/** Why the page cannot carry the font file a `url()` names, with the step that works, or null when it can, or when the `url()` names no file. */
function fontProblem(url: string, folder: string, from: string, fonts: ReadonlyMap<string, FontFile>): string | null {
  const target = fontPath(folder, url);
  if (target === null) return null;
  const named = `url(${quoted(url)}) in @font-face`;
  if ("fault" in target) return `${named} ${FAULTS[target.fault](from)}`;
  const file = fonts.get(target.path);
  if (file === undefined) return `${named} names ${quoted(target.path)}, which does not exist: put the font file there, or name it by its path from ${from}`;
  return "why" in file ? `${named} names ${quoted(target.path)}, ${file.why}` : null;
}

/** Each problem of a `url()` in the design's own styles, at its line of the walked text. */
export function fontIssues(design: Design): Issue[] {
  const from = "the design's folder";
  const line = lineFinder(design.text);
  return markupFontUrls(design.text).flatMap((found: FontUrl): Issue[] => {
    const message = fontProblem(found.url, design.folder, from, design.fonts);
    return message ? [{ rule: "integrity.font", line: line(found.start), at: found.start, message }] : [];
  });
}

/** Each problem of a `url()` in a tokens file, at that file's own line. */
export function tokenFontFindings(design: Design): Finding[] {
  return design.tokens
    .filter((token) => !token.generated)
    .flatMap((token) => {
      const line = lineFinder(token.css);
      return fontUrls(token.css).flatMap((found) => {
        const message = fontProblem(found.url, tokensFolder(token.file), "the tokens file's folder", design.fonts);
        return message ? [finding("integrity.font", message, token.file, line(found.start))] : [];
      });
    });
}
