// The one public entry: the stages and their types, so a test, a script, or another tool composes them without the
// command line. `readFiles` reads the disk; `load`, `check`, the manifests, and `page` are pure; `captureShots` and
// `serve` act on the world, `listen` serves a page until its server is closed, `writePage` writes a page where the
// command line writes it, and `writeExample` writes an example. A refused request throws
// `Refusal`, with its `request.*` id; a file that cannot be read as text throws `Unreadable`; any other error is a fault.
// The command line runs every stage through this entry, so what it does, a composer can do.
export { type Devices, EXAMPLE, EXAMPLE_FILE, type Frame, shippedDevices, viewerAssets } from "./assets.ts";
export { type CaptureResult, captureShots } from "./capture.ts";
export { shotFrames } from "./checks/devices.ts";
export { readRounds } from "./checks/rounds.ts";
export { check, findingData, levelOf, pageStops, problemsOf, RULES, type Rule, rulesOff } from "./checks/rules.ts";
export { type EarlierRound, type PageConfig, ROUND_LIMITS } from "./contract.ts";
export type { Facts } from "./design/facts.ts";
export { type Files, readFiles } from "./design/files.ts";
export { type Design, load } from "./design/load.ts";
export { countsOf } from "./design/read.ts";
export { EXIT, Refusal, Unreadable } from "./errors.ts";
export { type Counts, type Finding, family, findingLine, type Level, type RequestRule, type RuleId } from "./finding.ts";
export { FORMAT, OUTPUT_VERSION, PROGRAM, READ_LIMITS, ROUND_VERSION, SYSTEM_NAMES } from "./format.ts";
export { guideData, guideText } from "./guide.ts";
export { type Contract, componentContract, type ScreenData, screensOf } from "./manifest.ts";
export { outputFolder, removePage, writePage } from "./output.ts";
export { buildCommand, type PageInput, page, pageConfig, type Viewer } from "./page.ts";
export { exampleFolder, loadProject, type Project, settingsFor } from "./project.ts";
export { type ProjectFacts, projectFacts } from "./project-facts.ts";
export { readSource, saveRound } from "./save.ts";
export { newDesign, newDesignMd, writeExample } from "./scaffold.ts";
export { DEFAULT_PORT, listen, type ServeOptions, serve } from "./server.ts";
export { type Shot, type ShotRequest, shotList } from "./shots.ts";
export { missingStories, storiesOf } from "./stories.ts";
export { readStoryIndex } from "./story-index.ts";
