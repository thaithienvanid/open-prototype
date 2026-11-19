// Image fields: `<img data-proto-image="<field>">` shows the image its fixture names, a data:image URI or a file beside the
// design. The page carries each file as a data URI. This step is pure: `readFiles` read each file the fixtures name.
import { extname } from "node:path";
import { fixtureHolder } from "../contract.ts";
import type { ImageFile } from "../design/files.ts";
import { DATA_IMAGE, IMAGE_TYPES, READ_LIMITS } from "../format.ts";
import { isObject, type Json, type JsonObject } from "../json.ts";
import { quoted } from "../text.ts";

function imageUri(images: ReadonlyMap<string, ImageFile>, rel: string): { uri: string; why: string } {
  const mime = IMAGE_TYPES[extname(rel).toLowerCase()];
  if (mime === undefined)
    return { uri: "", why: `names \`${quoted(rel)}\`, which is no image file: use ${Object.keys(IMAGE_TYPES).sort().join(", ")}, or a data:image URI` };
  const read = images.get(rel);
  if (read === undefined) return { uri: "", why: `names \`${quoted(rel)}\`, which is no file in the design's folder` };
  if ("why" in read) return { uri: "", why: read.why };
  return { uri: `data:${mime};base64,${Buffer.from(read.bytes).toString("base64")}`, why: "" };
}

/** The fixtures with each image field's file in as a data URI, and what could not be shown. */
export function withImages(fixtures: Json, fields: ReadonlySet<string>, images: ReadonlyMap<string, ImageFile>): { fixtures: Json; problems: string[] } {
  if (!fields.size || !isObject(fixtures)) return { fixtures, problems: [] };
  const problems: string[] = [];
  const out = structuredClone(fixtures);
  const holders: [JsonObject, string][] = [[out, ""]];
  const stack: [JsonObject, string][] = [[out, ""]];
  while (stack.length) {
    const [current, prefix] = stack.pop() ?? [out, ""];
    for (const [name, value] of Object.entries(current).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const path = prefix ? `${prefix}.${name}` : name;
      if (isObject(value)) stack.push([value, path]);
      else if (Array.isArray(value))
        value.forEach((item, index) => {
          if (isObject(item)) holders.push([item, `${quoted(path)}[${index}].`]);
        });
    }
  }
  let total = 0;
  for (const [holder, prefix] of holders) {
    for (const key of [...fields].sort()) {
      const found = fixtureHolder(holder, key);
      if (!found) continue;
      const [node, leaf] = found;
      const value = node[leaf];
      const where = `\`${prefix}${quoted(key)}\``;
      if (value === null || value === undefined || value === "") continue;
      if (typeof value === "string" && value.startsWith("data:")) {
        if (!DATA_IMAGE.test(value)) {
          problems.push(`the fixture ${where} is a data URI of no image type: use data:image/<png, jpeg, gif, webp, avif, or svg+xml>;base64,`);
          node[leaf] = "";
        }
        continue;
      }
      const read = typeof value === "string" ? imageUri(images, value) : { uri: "", why: "is no text: name a file beside the design, or a data:image URI" };
      total += read.uri.length;
      if (!read.why && total > (READ_LIMITS.images * 4) / 3 + READ_LIMITS.image) {
        problems.push(`the fixture ${where} names \`${quoted(String(value))}\`, past the ${READ_LIMITS.images / 1_000_000} MB a page may take`);
        node[leaf] = "";
        continue;
      }
      if (read.why) problems.push(`the fixture ${where} ${read.why}`);
      node[leaf] = read.uri;
    }
  }
  return { fixtures: out, problems: [...new Set(problems)] };
}

const ascii = (bytes: Uint8Array, from: number, length: number): string => String.fromCharCode(...bytes.subarray(from, from + length));
const big32 = (bytes: Uint8Array, at: number): number =>
  (((bytes[at] ?? 0) << 24) >>> 0) + ((bytes[at + 1] ?? 0) << 16) + ((bytes[at + 2] ?? 0) << 8) + (bytes[at + 3] ?? 0);
const little32 = (bytes: Uint8Array, at: number): number =>
  (bytes[at] ?? 0) + ((bytes[at + 1] ?? 0) << 8) + ((bytes[at + 2] ?? 0) << 16) + (((bytes[at + 3] ?? 0) << 24) >>> 0);

/** A GIF of more than one frame whose loop count is 0, the count that plays for ever. */
function gifForever(bytes: Uint8Array): boolean {
  const flags = bytes[10] ?? 0;
  let at = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  let frames = 0;
  let loop: number | null = null;
  const skipBlocks = () => {
    while (at < bytes.length && (bytes[at] ?? 0) !== 0) at += (bytes[at] ?? 0) + 1;
    at++;
  };
  while (at < bytes.length) {
    const kind = bytes[at];
    if (kind === 0x21) {
      const label = bytes[at + 1];
      at += 2;
      if (label === 0xff && (bytes[at] ?? 0) === 11 && ["NETSCAPE2.0", "ANIMEXTS1.0"].includes(ascii(bytes, at + 1, 11)) && bytes[at + 13] === 1)
        loop = (bytes[at + 14] ?? 0) + ((bytes[at + 15] ?? 0) << 8);
      skipBlocks();
    } else if (kind === 0x2c) {
      frames++;
      const local = bytes[at + 9] ?? 0;
      at += 10 + (local & 0x80 ? 3 * (1 << ((local & 7) + 1)) : 0) + 1;
      skipBlocks();
    } else break;
  }
  return frames > 1 && loop === 0;
}

/** An APNG whose `acTL` has more than one frame and plays 0 times, which is for ever. */
function apngForever(bytes: Uint8Array): boolean {
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = big32(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    if (type === "acTL") return big32(bytes, at + 8) > 1 && big32(bytes, at + 12) === 0;
    if (type === "IDAT" || type === "IEND") return false;
    at += 12 + length;
  }
  return false;
}

/** A WebP whose `ANIM` loops 0 times, with more than one `ANMF` frame. */
function webpForever(bytes: Uint8Array): boolean {
  let loop: number | null = null;
  let frames = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const type = ascii(bytes, at, 4);
    const size = little32(bytes, at + 4);
    if (type === "ANIM") loop = (bytes[at + 12] ?? 0) + ((bytes[at + 13] ?? 0) << 8);
    if (type === "ANMF") frames++;
    at += 8 + size + (size % 2);
  }
  return frames > 1 && loop === 0;
}

/** An AVIF whose brands include `avis`: an image sequence. */
function avifSequence(bytes: Uint8Array): boolean {
  const size = big32(bytes, 0);
  for (let at = 8; at + 4 <= Math.min(size, bytes.length); at += 4) if (ascii(bytes, at, 4) === "avis") return true;
  return false;
}

/**
 * Whether an image plays without end: a GIF, an APNG, or a WebP of more than one frame that loops for ever, an AVIF
 * image sequence, or an SVG that repeats indefinitely. A fixed count of plays passes. The bytes say which kind it is.
 */
export function playsForever(bytes: Uint8Array): boolean {
  if (ascii(bytes, 0, 4) === "GIF8") return gifForever(bytes);
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return apngForever(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpForever(bytes);
  if (ascii(bytes, 4, 4) === "ftyp") return avifSequence(bytes);
  const text = new TextDecoder().decode(bytes.subarray(0, READ_LIMITS.image));
  return /<svg[\s>]/i.test(text) && (/repeatCount\s*=\s*["']\s*indefinite/i.test(text) || /<style[^>]*>[^<]*\binfinite\b/i.test(text));
}
