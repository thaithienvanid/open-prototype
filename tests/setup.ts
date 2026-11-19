// Loaded before every test file, by `bunfig.toml`. A hook here runs once for the whole run, so after the last file,
// whichever files ran, the browser tests' shared Chrome stops, then the temporary folders the tests made are removed.
import { afterAll } from "bun:test";
import { removeAll } from "./temp.ts";
import { stopBrowsers } from "./viewer/page.ts";

afterAll(async () => {
  await stopBrowsers();
  removeAll();
});
