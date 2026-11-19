// The shipped viewer is what its sources build: a change under viewer/ without a new build fails here.
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { buildViewer, driftLines } from "../../tools/build-viewer.ts";

test("assets/viewer.html and assets/viewer.css are what viewer/ builds", async () => {
  const built = await buildViewer();
  expect(Object.keys(built)).toEqual(["assets/viewer.html", "assets/viewer.css"]);
  for (const [path, text] of Object.entries(built))
    expect([path, text === (await Bun.file(join(resolve(import.meta.dir, "../.."), path)).text())]).toEqual([path, true]);
  expect(built["assets/viewer.html"]?.match(/<script>/g)?.length).toBe(1);
});

test("the drift check names only the file that differs, each compared on its own", () => {
  const built = { "a.html": "a", "b.css": "b" };
  expect(driftLines(built, { "a.html": "old", "b.css": "b" })).toEqual({ lines: ["a.html: not what viewer/ builds", "b.css: up to date"], stale: 1 });
  expect(driftLines(built, { "a.html": "a", "b.css": null }).lines).toEqual(["a.html: up to date", "b.css: not what viewer/ builds"]);
});
