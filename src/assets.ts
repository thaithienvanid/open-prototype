// The files the tool ships beside its code. Each is imported as a file, so a compiled single binary carries it too.
import { readFileSync } from "node:fs";
import designMdFile from "../assets/DESIGN.md" with { type: "file" };
import devicesFile from "../assets/devices.json" with { type: "file" };
import appFile from "../assets/examples/app.html" with { type: "file" };
import devonAvatarFile from "../assets/examples/avatars/devon.svg" with { type: "file" };
import mayaAvatarFile from "../assets/examples/avatars/maya.svg" with { type: "file" };
import priyaAvatarFile from "../assets/examples/avatars/priya.svg" with { type: "file" };
import tomasAvatarFile from "../assets/examples/avatars/tomas.svg" with { type: "file" };
import emptyStateBlockFile from "../assets/examples/blocks/empty-state.html" with { type: "file" };
import memberRowBlockFile from "../assets/examples/blocks/member-row.html" with { type: "file" };
import noticeBlockFile from "../assets/examples/blocks/notice.html" with { type: "file" };
import planCardBlockFile from "../assets/examples/blocks/plan-card.html" with { type: "file" };
import projectRowBlockFile from "../assets/examples/blocks/project-row.html" with { type: "file" };
import projectSummaryBlockFile from "../assets/examples/blocks/project-summary.html" with { type: "file" };
import statCardBlockFile from "../assets/examples/blocks/stat-card.html" with { type: "file" };
import authFlowFile from "../assets/examples/flows/auth.html" with { type: "file" };
import backofficeFlowFile from "../assets/examples/flows/backoffice.html" with { type: "file" };
import billingFlowFile from "../assets/examples/flows/billing.html" with { type: "file" };
import developersFlowFile from "../assets/examples/flows/developers.html" with { type: "file" };
import projectsFlowFile from "../assets/examples/flows/projects.html" with { type: "file" };
import teamFlowFile from "../assets/examples/flows/team.html" with { type: "file" };
import starterFile from "../assets/starter.html" with { type: "file" };
import stylesheetFile from "../assets/viewer.css" with { type: "file" };
import viewerFile from "../assets/viewer.html" with { type: "file" };
import { isPlatform, type Platform } from "./format.ts";
import { isObject, readJson } from "./json.ts";

// A file import gives the file's path; the type files of the runtime declare some kinds as other shapes, so each path
// is checked to be text before it is read.
function pathOf(imported: unknown): string {
  if (typeof imported !== "string") throw new Error("the tool's files changed: an asset has no path");
  return imported;
}

export function assetText(imported: unknown): string {
  return readFileSync(pathOf(imported), "utf8");
}

export const ASSETS = {
  designMd: designMdFile,
  devices: devicesFile,
  starter: starterFile,
  stylesheet: stylesheetFile,
  viewer: viewerFile,
} as const;

/** The shipped example's entry file name, inside `<out-dir>/example/`. */
export const EXAMPLE_FILE = "app.html";

/** The shipped example: each file by its path in the example's folder, and the shipped file it is. */
export const EXAMPLE: ReadonlyMap<string, string> = new Map([
  [EXAMPLE_FILE, pathOf(appFile)],
  ["flows/projects.html", pathOf(projectsFlowFile)],
  ["flows/billing.html", pathOf(billingFlowFile)],
  ["flows/team.html", pathOf(teamFlowFile)],
  ["flows/developers.html", pathOf(developersFlowFile)],
  ["flows/backoffice.html", pathOf(backofficeFlowFile)],
  ["flows/auth.html", pathOf(authFlowFile)],
  ["blocks/stat-card.html", pathOf(statCardBlockFile)],
  ["blocks/notice.html", pathOf(noticeBlockFile)],
  ["blocks/empty-state.html", pathOf(emptyStateBlockFile)],
  ["blocks/project-summary.html", pathOf(projectSummaryBlockFile)],
  ["blocks/project-row.html", pathOf(projectRowBlockFile)],
  ["blocks/plan-card.html", pathOf(planCardBlockFile)],
  ["blocks/member-row.html", pathOf(memberRowBlockFile)],
  ["avatars/maya.svg", pathOf(mayaAvatarFile)],
  ["avatars/devon.svg", pathOf(devonAvatarFile)],
  ["avatars/priya.svg", pathOf(priyaAvatarFile)],
  ["avatars/tomas.svg", pathOf(tomasAvatarFile)],
]);

/** A device frame: its name, platform, and size in CSS px, and a phone's system bars. */
export type Frame = { name: string; platform: Platform; width: number; height: number; safe_area?: { top: number; bottom: number } };

/** The device table: each frame by the id a link names, and the frames a full pass takes for each platform, in order. */
export type Devices = { frames: Map<string, Frame>; shots: Partial<Record<Platform, string[]>> };

function goodFrame(value: unknown): value is Frame {
  if (!isObject(value)) return false;
  if (typeof value.name !== "string" || typeof value.platform !== "string" || !isPlatform(value.platform)) return false;
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height)) return false;
  const bars = value.safe_area ?? { top: 0, bottom: 0 };
  const half = Math.floor(Number(value.height) / 2);
  return isObject(bars) && [bars.top, bars.bottom].every((side) => Number.isInteger(side) && Number(side) >= 0 && Number(side) < half);
}

let devices: Devices | null = null;

/** The tool's own device table, `assets/devices.json`, read once. */
export function shippedDevices(): Devices {
  if (devices) return devices;
  const read = readJson(assetText(ASSETS.devices));
  const value = read.ok && isObject(read.value) ? read.value : {};
  const frames = value.frames;
  if (!Array.isArray(frames) || !frames.length || !frames.every((frame) => isObject(frame) && typeof frame.id === "string" && goodFrame(frame))) {
    throw new Error("the tool's devices.json is not a list of device frames: the tool's files changed");
  }
  // The table's own keys, such as `$description`, name no platform, so the shots hold only the platforms.
  const shots: Devices["shots"] = {};
  for (const [platform, listed] of Object.entries(isObject(value.shots) ? value.shots : {}))
    if (isPlatform(platform)) shots[platform] = Array.isArray(listed) ? listed.filter((id): id is string => typeof id === "string") : [];
  devices = { frames: new Map(frames.map((frame): [string, Frame] => [String((frame as { id?: unknown }).id), frame as unknown as Frame])), shots };
  return devices;
}

/** The viewer's two files, as the page takes them. */
export function viewerAssets(): { html: string; css: string } {
  return { html: assetText(ASSETS.viewer), css: assetText(ASSETS.stylesheet) };
}
