// The viewer's pure modules: each function reads only its arguments, so each rule is a row of a table.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Comment,
  commentBoxOf,
  commentLength,
  commentLine,
  commentSound,
  commentStoreKey,
  designVersion,
  exportJson,
  exportPrompt,
  visibleText,
} from "../../viewer/comments.ts";
import { besideFit, type Fit, fitScale, pinSpot, placeholderFit } from "../../viewer/geometry.ts";
import { keyAction, type Open, type Press } from "../../viewer/keys.ts";
import { type Known, linkFor, parseLink, resolveLink, type View } from "../../viewer/link.ts";
import { COMMENT_CONTROL, flowOf, testIdOf } from "../../viewer/names.ts";
import { earlierOpen, roundsBefore, roundsOf } from "../../viewer/rounds.ts";
import { nextUnseen, placesOf, type StateRef, seenKey } from "../../viewer/seen.ts";
import { readTokens, TOKEN_GROUPS, tokenSources } from "../../viewer/tokens.ts";
import { commentsText, humanize, label, listed, placeLabel, placesText, TOKEN_GROUP_LABEL } from "../../viewer/words.ts";

const known: Known = {
  tabs: ["prototype", "board", "system"],
  screens: ["items:list", "items:detail"],
  statesOf: (screen) => (screen === "items:list" ? ["populated", "empty"] : ["ready"]),
  initialOf: (screen) => (screen === "items:list" ? "populated" : "ready"),
  frames: ["320", "1024", "ios", "fill"],
  flows: ["items"],
  windowFrame: "1024",
};
const base: View = {
  screen: "items:list",
  state: "populated",
  theme: "system",
  frame: "1024",
  round: 1,
  zoom: "fit",
  text: "100",
  dir: "",
  panels: "both",
  tab: "prototype",
  show: "all",
  flow: "all",
  safe: false,
  comments: false,
  compare: false,
  side: "comments",
};

describe("the deep link", () => {
  test.each<[string, Partial<View>, string]>([
    ["the plain view names its screen and state", {}, "#items%3Alist/populated"],
    ["a theme, a frame and a round are written", { theme: "dark", frame: "ios", round: 2 }, "#items%3Alist/populated?theme=dark&frame=ios&round=2"],
    ["the Board writes its filter and its flow", { tab: "board", show: "unseen", flow: "items" }, "#items%3Alist/populated?tab=board&show=unseen&flow=items"],
    ["a right-to-left design shown left to right writes its direction", { dir: "ltr" }, "#items%3Alist/populated?dir=ltr"],
    [
      "each switch is written once",
      { zoom: "actual", text: "200", dir: "rtl", panels: "none", safe: true, comments: true, compare: true, side: "build" },
      "#items%3Alist/populated?zoom=actual&text=200&dir=rtl&panels=none&safe=1&comments=1&compare=1&side=build",
    ],
  ])("%s", (_name, change, link) => {
    const view = { ...base, ...change };
    expect(linkFor(view)).toBe(link);
    expect(resolveLink(parseLink(link, ""), known)).toEqual(view);
  });
  test("a filter outside the Board is left out", () => {
    expect(linkFor({ ...base, show: "unseen", flow: "items" })).toBe("#items%3Alist/populated");
  });
  test("the base frame is the one a link leaves out", () => {
    expect(linkFor({ ...base, frame: "ios" }, "ios")).toBe("#items%3Alist/populated");
    expect(linkFor(base, "")).toBe("#items%3Alist/populated?frame=1024");
  });
  test("a link leaves out the theme a design opens in, and with none left out it writes the theme shown", () => {
    const light = { ...known, themes: ["light"] as const };
    expect(linkFor({ ...base, theme: "light" }, "1024", "light")).toBe("#items%3Alist/populated");
    expect(linkFor({ ...base, theme: "dark" }, "1024", "")).toBe("#items%3Alist/populated?theme=dark");
    expect([
      resolveLink(parseLink("#items%3Alist/populated?theme=dark", ""), light).theme,
      resolveLink(parseLink("#items%3Alist/populated", ""), light).theme,
    ]).toEqual(["light", "light"]);
  });
  test("the page's own query fills what the fragment lacks, and the fragment wins", () => {
    expect(parseLink("#a/b?theme=light", "?theme=dark&round=3")).toMatchObject({ screen: "a", state: "b", theme: "light", round: "3" });
  });
  test.each<[string, string, Partial<View>]>([
    ["an unknown screen opens the first", "#nope/ready", { screen: "items:list", state: "populated" }],
    ["an unknown state opens the screen's own", "#items%3Adetail/nope", { screen: "items:detail", state: "ready" }],
    ["an unknown value falls back", "#items%3Alist/empty?theme=pink&frame=tv&round=-4&tab=x&panels=x&show=x&flow=x&side=x", { state: "empty" }],
    ["a broken escape is no screen", "#%E0%A4%A/x", {}],
    ["a round past the last one a save takes is the last", "#items%3Alist/populated?round=10000", { round: 9999 }],
  ])("%s", (_name, link, change) => {
    expect(resolveLink(parseLink(link, ""), known)).toEqual({ ...base, ...change });
  });
});

// The shot list writes its links through the contract's writer, and the viewer reads them: each shot's link, read by the
// viewer, gives the shot's own screen, state, frame, theme, text size, and direction, so a renamed key cannot shoot a view
// the viewer never shows.
test("every recorded shot's link reads back, in the viewer, as the shot's own view", () => {
  for (const name of ["starter"]) {
    const { shots } = JSON.parse(readFileSync(join(import.meta.dir, `../golden/${name}-shots.json`), "utf8")) as {
      shots: { screen: string; state: string; frame: string; theme: string; text: string; dir: string; link: string }[];
    };
    for (const shot of shots) {
      const read = parseLink(shot.link, "");
      const view = { screen: read.screen, state: read.state, frame: read.frame, theme: read.theme, text: read.text || "100", dir: read.dir || "ltr" };
      expect(view).toEqual({ screen: shot.screen, state: shot.state, frame: shot.frame, theme: shot.theme, text: shot.text, dir: shot.dir });
    }
  }
});

describe("names", () => {
  test("a name reads as a person says it", () => {
    expect([
      label("permission-denied"),
      humanize("item-card_2"),
      humanize(undefined),
      testIdOf("screen", "start:home"),
      flowOf("items:detail"),
      flowOf("start"),
    ]).toEqual(["Permission denied", "Item card 2", "", "proto-screen-start-home", "items", ""]);
    expect([listed([]), listed(["web"]), listed(["web", "phone"]), listed(["web", "phone", "desktop"])]).toEqual([
      "",
      "web",
      "web and phone",
      "web, phone and desktop",
    ]);
    expect([commentsText(0), commentsText(1), commentsText(2)]).toEqual(["0 comments", "1 comment", "2 comments"]);
  });
});

describe("where a review looks", () => {
  test("the places are each platform the design declares in each theme it declares, in its order", () => {
    expect(placesOf(["web"], ["light"]).places).toEqual(["web-light"]);
    const places = placesOf(["web", "ios"], ["light", "dark"]);
    expect(places.places).toEqual(["web-light", "web-dark", "ios-light", "ios-dark"]);
    expect([placesText(places), placeLabel("ios-dark"), placesText(placesOf(["web", "ios", "android"], ["dark"]))]).toEqual([
      "web and iOS, in light and dark",
      "iOS, dark",
      "web, iOS and Android, in dark",
    ]);
  });
  const all: StateRef[] = [
    ["a", "one"],
    ["a", "two"],
    ["b", "one"],
  ];
  const places = ["web-light", "web-dark"];
  test.each<[string, StateRef, string, string[], ReturnType<typeof nextUnseen>]>([
    [
      "the next state after the one on screen, in the place on screen",
      ["a", "one"],
      "web-light",
      [seenKey("a", "one", "web-light")],
      { screen: "a", state: "two", place: "web-light", left: 4 },
    ],
    ["it wraps to the start", ["b", "one"], "web-light", [seenKey("b", "one", "web-light")], { screen: "a", state: "one", place: "web-light", left: 4 }],
    [
      "a place that is all seen gives way to the next, starting with the state on screen",
      ["a", "two"],
      "web-light",
      all.map(([screen, state]) => seenKey(screen, state, "web-light")),
      { screen: "a", state: "two", place: "web-dark", left: 2 },
    ],
    ["a place outside the review starts at the first place", ["a", "one"], "ios-light", [], { screen: "a", state: "one", place: "web-light", left: 5 }],
    [
      "nothing is left once every place has seen every state",
      ["a", "one"],
      "web-light",
      places.flatMap((place) => all.map(([screen, state]) => seenKey(screen, state, place))),
      null,
    ],
  ])("%s", (_name, current, here, seen, next) => {
    expect(nextUnseen(all, current, here, places, new Set(seen))).toEqual(next);
  });
});

describe("sizes and positions", () => {
  const fit: Fit = {
    zoom: "fit",
    fill: false,
    phone: false,
    stacked: false,
    present: false,
    room: { w: 800, h: 600 },
    placeholder: 0,
    width: 1024,
    frameHeight: 768,
  };
  test.each<[string, Partial<Fit>, number]>([
    ["a web frame fits by the smaller of width and height", {}, 600 / 768],
    ["a frame that fits is never enlarged", { room: { w: 2000, h: 2000 } }, 1],
    ["100% is 100%", { zoom: "actual" }, 1],
    ["the full-width frame is never scaled", { fill: true }, 1],
    ["on a narrow window a web frame fits by its width only", { stacked: true, room: { w: 304, h: 100 } }, 304 / 1024],
    ["a phone on a narrow window fits by its width", { phone: true, stacked: true, width: 412, frameHeight: 915, room: { w: 304, h: 300 } }, 304 / 412],
    [
      "a phone in full screen fits its height",
      { phone: true, stacked: true, present: true, width: 412, frameHeight: 915, room: { w: 304, h: 300 } },
      300 / 915,
    ],
    ["a frame is never fitted under a quarter by its height", { room: { w: 800, h: 10 } }, 0.25],
    ["a placeholder beside the frame takes its room", { placeholder: 300, room: { w: 800, h: 5000 } }, 500 / 1024],
  ])("%s", (_name, change, scale) => {
    expect(fitScale({ ...fit, ...change })).toBeCloseTo(scale, 6);
  });
  // Compare's picture: a phone's sits beside it, a wide frame's goes under it, and the caption's room is always counted.
  const beside = { room: { w: 780, h: 690 }, shell: { w: 1024, h: 808 }, picture: { w: 1024, h: 768 }, gap: 32, caption: 40 };
  test.each<[string, Partial<typeof beside>, { scale: number; stack: boolean; height: number }]>([
    ["a wide frame's picture goes under it, and the frame shows whole at its width", {}, { scale: 780 / 1024, stack: true, height: (780 / 1024) * 1608 + 40 }],
    [
      "a phone's picture stays beside it, both whole, with the caption under the picture",
      { shell: { w: 390, h: 844 }, picture: { w: 390, h: 844 } },
      { scale: 650 / 844, stack: false, height: (650 / 844) * 844 + 40 },
    ],
  ])("%s", (_name, change, want) => {
    const got = besideFit({ ...beside, ...change });
    expect([got.stack, got.scale, got.height]).toEqual([want.stack, expect.closeTo(want.scale, 6), expect.closeTo(want.height, 6)]);
  });
  // Compare's placeholder keeps the viewer's size, so beside the frame it takes the artboard's width; under it the frame fits as alone.
  const placeholder = { room: { w: 672, h: 700 }, shell: { w: 1024, h: 808 }, placeholder: { w: 300, h: 160 }, gap: 32 };
  test.each<[string, Partial<typeof placeholder>, { scale: number; stack: boolean; height: number }]>([
    ["a wide frame's placeholder goes under it, and the frame fits as it does alone", {}, { scale: 672 / 1024, stack: true, height: (672 / 1024) * 840 + 160 }],
    [
      "a placeholder too wide for any room beside the frame goes under it too",
      { placeholder: { w: 700, h: 300 } },
      { scale: 672 / 1024, stack: true, height: (672 / 1024) * 840 + 300 },
    ],
    ["a phone's placeholder stays beside it where the height limits the frame", { shell: { w: 390, h: 844 } }, { scale: 700 / 844, stack: false, height: 700 }],
  ])("%s", (_name, change, want) => {
    const got = placeholderFit({ ...placeholder, ...change });
    expect([got.stack, got.scale, got.height]).toEqual([want.stack, expect.closeTo(want.scale, 6), expect.closeTo(want.height, 6)]);
  });
  test.each<
    [string, { x: number; y: number; width: number; height: number }, { left: number; top: number; right: number; bottom: number }[], [number, number]]
  >([
    ["after the element's right end, at its top", { x: 100, y: 100, width: 80, height: 30 }, [], [196, 100]],
    ["before its left end when text is on the right", { x: 100, y: 100, width: 80, height: 30 }, [{ left: 185, top: 90, right: 300, bottom: 110 }], [84, 100]],
    [
      "above it when both sides hold text",
      { x: 100, y: 100, width: 80, height: 30 },
      [
        { left: 185, top: 90, right: 300, bottom: 110 },
        { left: 0, top: 90, right: 95, bottom: 110 },
      ],
      [114, 84],
    ],
    ["below it when the frame's edge leaves no other room", { x: 330, y: 2, width: 60, height: 30 }, [], [344, 48]],
  ])("a pin goes %s", (_name, box, text, spot) => {
    expect(pinSpot(box, { text, icons: [] }, 1, 400, 800)).toEqual(spot);
  });
  test("a pin's distances divide by the scale", () => {
    expect(pinSpot({ x: 100, y: 100, width: 80, height: 30 }, { text: [], icons: [] }, 0.5, 1000, 1000)).toEqual([212, 100]);
  });
});

describe("tokens", () => {
  test("each token has its value in each theme, and a repeated dark block adds nothing", () => {
    const css = `/* c */ :root { --space-1: 4px; --color-text: #111; } :root[data-proto-theme="dark"] { --color-text: #eee; }
      @media (prefers-color-scheme: dark) { :root:not([data-proto-theme]) { --color-text: #fff; } } @media (prefers-reduced-motion: reduce) { :root { --duration-fast: 0ms; } }`;
    expect(readTokens(css)).toEqual([
      { name: "--space-1", themes: { light: "4px" }, light: "4px", dark: "" },
      { name: "--color-text", themes: { light: "#111", dark: "#eee" }, light: "#111", dark: "#eee" },
    ]);
  });
  test("each name falls in its first group", () => {
    const group = (name: string) => TOKEN_GROUP_LABEL[TOKEN_GROUPS.find(([, names]) => names.test(name))?.[0] ?? ""];
    expect(
      ["--color-text", "--colour-illustration-sky", "--space-2", "--radius-sm", "--font-sans", "--duration-fast", "--size-icon", "--shadow"].map(group),
    ).toEqual(["Color", "Illustration", "Spacing", "Radius", "Typography", "Motion", "Size", "Other"]);
    expect(["--spacing-3", "--leading-body", "--tracking-body", "--motion-state-change-duration", "--component-button-primary-rounded"].map(group)).toEqual([
      "Spacing",
      "Typography",
      "Typography",
      "Motion",
      "Component",
    ]);
  });
  test("the sources come in the build's order, the document's tokens from its shape, and a role names its two members", () => {
    const document = {
      file: "DESIGN.md",
      version: "alpha",
      components: [],
      tokens: [
        { path: "colors.light.surface", name: "--color-light-surface", line: 5, light: "#fafafb", dark: "#fafafb" },
        { path: "colors.dark.surface", name: "--color-dark-surface", line: 7, light: "#111317", dark: "#111317" },
        { path: "colors.surface", name: "--color-surface", line: 5, light: "#fafafb", dark: "#111317" },
      ],
    };
    const found = tokenSources(
      [
        { file: "DESIGN.md", css: ":root { --color-surface: x; }" },
        { file: "tokens/brand.css", css: ":root { --color-promo: #b91c1c; }" },
      ],
      document,
      ":root { --ring: 2px; }",
    );
    expect(found.map((source) => [source.kind, source.file, source.tokens.map((token) => token.name)])).toEqual([
      ["design-md", "DESIGN.md", ["--color-light-surface", "--color-dark-surface", "--color-surface"]],
      ["file", "tokens/brand.css", ["--color-promo"]],
      ["design", "", ["--ring"]],
    ]);
    expect(found[0]?.paths["--color-surface"]).toEqual({ path: "colors.surface", line: 5, joins: ["--color-light-surface", "--color-dark-surface"] });
    expect(found[0]?.tokens[2]).toEqual({ name: "--color-surface", themes: { light: "#fafafb", dark: "#111317" }, light: "#fafafb", dark: "#111317" });
    expect(tokenSources([], null, "").length).toBe(0);
  });
});

describe("the keyboard map", () => {
  const press: Press = { key: "", alt: false, ctrl: false, meta: false, altGraph: false, inField: false, inCommentForm: false };
  const open: Open = { sheet: false, keysOn: true, checks: false, present: false, commenting: false, screensDrawer: false, inspectorDrawer: false };
  test.each<[string, Partial<Press>, Partial<Open>, ReturnType<typeof keyAction>]>([
    ["N opens the next state not seen", { key: "n" }, {}, "next-unseen"],
    ["a capital acts as its small letter", { key: "J" }, {}, "next-state"],
    ["K, C, F, T, D and ? each have one action", { key: "k" }, {}, "previous-state"],
    ["a digit picks a state by its number", { key: "9" }, {}, { state: 9 }],
    ["zero picks nothing", { key: "0" }, {}, null],
    ["a key typed in a field does nothing", { key: "n", inField: true }, {}, null],
    ["a key with a modifier does nothing", { key: "n", meta: true }, {}, null],
    ["[ acts with AltGr, which reports Ctrl and Alt", { key: "[", ctrl: true, alt: true, altGraph: true }, {}, "toggle-screens"],
    ["] does nothing with Ctrl alone", { key: "]", ctrl: true }, {}, null],
    ["with the shortcuts off no single key acts", { key: "n" }, { keysOn: false }, null],
    ["with the shortcuts off Escape still closes", { key: "Escape" }, { keysOn: false, checks: true }, "close-checks"],
    ["Escape closes the menu before it leaves full screen", { key: "Escape" }, { checks: true, present: true }, "close-checks"],
    [
      "Escape leaves the comment form only from inside it",
      { key: "Escape", inCommentForm: true },
      { commenting: true, inspectorDrawer: true },
      "leave-comment-form",
    ],
    ["Escape outside the form closes the drawer", { key: "Escape" }, { commenting: true, inspectorDrawer: true }, "close-inspector"],
    ["Escape with nothing open does nothing", { key: "Escape" }, {}, null],
    ["V does nothing in full screen", { key: "v" }, { present: true }, null],
    ["the open sheet takes every key but ?", { key: "n" }, { sheet: true }, null],
    ["? closes the open sheet", { key: "?" }, { sheet: true }, "close-sheet"],
    ["? opens the sheet", { key: "?" }, {}, "open-sheet"],
  ])("%s", (_name, key, state, action) => {
    expect(keyAction({ ...press, ...key }, { ...open, ...state })).toEqual(action);
  });
});

describe("a round's comments", () => {
  const design = {
    frames: ["1024", "ios"],
    designName: "the design TASK-12",
    commentsFile: "comments.json",
    saveCommand: "open-prototype save-comments comments.json design/items.html",
    roundsPath: "design/rounds/items",
    shotsCommand: (folder: string) => `open-prototype shots design/items.html --capture --out ${folder}`,
  };
  const { type: _type, ...untyped } = {
    id: "r1-1",
    type: "question",
    screen: "items:list",
    state: "empty",
    testid: "open-item",
    comment: "Why two?",
    frame: "ios",
    theme: "dark",
  };
  const one: Comment = {
    id: "r1-1",
    type: "question",
    screen: "items:list",
    state: "empty",
    testid: "open-item",
    index: 1,
    count: 2,
    box: { x: 1, y: 2, width: 3, height: 4, extra: 5 },
    comment: "Why two?",
    frame: "ios",
    theme: "dark",
  };
  test.each<[string, Partial<Comment>, boolean]>([
    ["a whole comment", {}, true],
    ["an id of another shape", { id: "a-r1-1" }, false],
    ["a shown theme that is no theme", { shown_theme: "system" }, false],
    ["a state that is no name", { state: "Empty state" }, false],
    ["a frame the page lacks", { frame: "tv" }, false],
    ["a type the form lacks", { type: "praise" }, false],
    ["a negative index", { index: -1 }, false],
  ])("%s is sound or not", (_name, change, sound) => {
    expect(commentSound({ ...one, ...change }, design)).toBe(sound);
  });
  test("a comment with no type is a change", () => {
    expect([commentSound(untyped, design), commentLine({ ...untyped, shown_theme: "dark" })]).toEqual([
      true,
      "[r1-1] change: items:list/empty open-item (ios, dark): Why two?",
    ]);
  });
  test("an id names the round of its file, so a comment of another round is left out of this one", () => {
    expect([commentSound(one, design, 1), commentSound(one, design, 2)]).toEqual([true, false]);
  });
  test("the export holds only what was checked, with the theme the reviewer saw and the link made again", () => {
    const json = JSON.parse(exportJson([one, { ...one, id: "bad" }, { ...one, id: "r1-2", theme: "system", shown_theme: "light" }], 1, design)) as {
      schema_version: string;
      round: number;
      items: unknown[];
    };
    const item = {
      id: "r1-1",
      type: "question",
      screen: "items:list",
      state: "empty",
      testid: "open-item",
      index: 1,
      box: { x: 1, y: 2, width: 3, height: 4 },
      comment: "Why two?",
      frame: "ios",
      theme: "dark",
      shown_theme: "dark",
      link: "#items%3Alist/empty?theme=dark&frame=ios",
    };
    expect(json).toEqual({
      schema_version: "1",
      round: 1,
      items: [item, { ...item, id: "r1-2", theme: "system", shown_theme: "light", link: "#items%3Alist/empty?theme=light&frame=ios" }],
    });
    expect([
      commentBoxOf({ x: 1, y: 2, width: 3 }),
      commentBoxOf({ x: 1, y: 2, width: 3, height: "4" }),
      commentBoxOf({ x: 1, y: 2, width: 3, height: Number.NaN }),
      commentBoxOf(null),
    ]).toEqual([null, null, null, null]);
  });
  test("the prompt names the save, the round's folder, each comment as a line, and ends with the JSON", () => {
    const two = { ...one, id: "r2-1" };
    const prompt = exportPrompt([two], 2, design);
    expect(prompt.startsWith("Round 2 comments on the design TASK-12. ")).toBe(true);
    expect(prompt).toContain(
      "Save the JSON below as comments.json and run open-prototype save-comments comments.json design/items.html, which keeps it as design/rounds/items/2/comments.json. In round 3,",
    );
    expect(prompt).toContain("write design/rounds/items/3/changes.json");
    // The screenshots go into the next round's folder by the one command that takes them there.
    expect(prompt).toContain("with open-prototype shots design/items.html --capture --out design/rounds/items/3 and --changed-screen or --changed-component");
    expect(prompt).toContain("\n[r2-1] question: items:list/empty open-item (2) (ios, dark): Why two?\n\n{");
    expect(prompt.endsWith(exportJson([two], 2, design))).toBe(true);
  });
  test("a direction control shows as a visible mark, and other text as it is", () => {
    expect([visibleText("abc\u202Edef\u2066g"), visibleText("plain, tab\tand\nline")]).toEqual(["abc[U+202E]def[U+2066]g", "plain, tab\tand\nline"]);
  });
  test("a record's key holds the design's id and the round, and a design's version follows its markup", () => {
    expect(commentStoreKey("abc", 2)).toBe("prototype-comments:abc:round-2");
    expect([designVersion(""), designVersion("a") === designVersion("b"), designVersion("<p>x</p>")]).toEqual(["45h", false, designVersion("<p>x</p>")]);
  });
});

describe("earlier rounds", () => {
  const rounds = roundsOf([{ round: 1, items: [{ id: "r1-1", done: true }, { id: "r1-2" }] }, { round: "2", items: [{ id: "r2-1" }] }, null, { round: 3 }]);
  test("only whole rounds are kept, and the open items of the rounds before count by round", () => {
    expect(rounds.length).toBe(2);
    expect([earlierOpen(rounds, 1), earlierOpen(rounds, 2), earlierOpen(rounds, 3)]).toEqual([[], [1], [1, 2]]);
    expect(roundsBefore(rounds, 2).map((round) => round.round)).toEqual([1]);
    expect(roundsOf("x")).toEqual([]);
  });
});

describe("a link leaves out only the round a page opens in", () => {
  test.each([
    ["round 1, where the page opens in round 1", 1, 1, ""],
    ["round 1, where the page opens in round 3 after two saved rounds", 1, 3, "round=1"],
    ["round 3, where the page opens in round 3", 3, 3, ""],
    ["round 4, where the page opens in round 3", 4, 3, "round=4"],
  ])("%s", (_, round, opening, query) => {
    expect(linkFor({ screen: "items:list", state: "populated", round }, "1024", "system", opening).split("?")[1] ?? "").toBe(query);
  });
});

describe("a comment's length and characters, as the save counts them", () => {
  test.each([
    ["an emoji is one character", "😀".repeat(1500), 1500],
    ["a letter with a combining mark is two", "e\u0301", 2],
    ["plain text", "Make it larger.", 15],
  ])("%s", (_, text, length) => {
    expect(commentLength(text)).toBe(length);
  });
  test.each([
    ["a tab and a line break are kept", "a\tb\nc", false],
    ["a carriage return is refused, as the save refuses it", "a\r\nb", true],
    ["a C0 control is refused", "a\u0007b", true],
    ["a C1 control is refused", "a\u0085b", true],
    ["U+009F, the last of C1, is refused", "a\u009fb", true],
    ["a no-break space is text", "a\u00a0b", false],
  ])("%s", (_, text, refused) => {
    expect(COMMENT_CONTROL.test(text)).toBe(refused);
  });
});
