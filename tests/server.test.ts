// The server: its one route, every header, the Host rule, the token under --lan, HEAD, and the refusals of serve.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, renameSync, symlinkSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { listen } from "../src/index.ts";
import { DEFAULT_PORT, DEFAULT_PORTS, lanHosts, listenFirst, OFFLINE_SWITCH, ownNames, portsToTry } from "../src/server.ts";
import { FLOW_DESIGN, flowDesign, single } from "./cases.ts";
import { cli, project } from "./helpers.ts";

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

function ask(port: number, path: string, options: { method?: string; host?: string; headers?: Record<string, string> } = {}): Promise<Answer> {
  return new Promise((done, fail) => {
    const sent = request(
      { host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: { Host: options.host ?? `127.0.0.1:${port}`, ...options.headers } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      },
    );
    sent.on("error", fail);
    sent.end();
  });
}

const folder = project({ ...flowDesign(), "design/.env": "secret", "outside.txt": "out" });
symlinkSync(join(folder, "outside.txt"), join(folder, "design/leak.txt"));
let pageBuilds = 0;
const started = await listen({ page: () => `<p>page ${++pageBuilds}</p>`, lan: false, port: 0, token: "", hosts: [] });
const lan = await listen({ page: () => "<p>lan</p>", lan: false, port: 0, token: "TOKEN1234567890abcdefg", hosts: ["192.168.1.5"] });
if ("error" in started || "error" in lan) throw new Error("the test server did not start");
afterAll(() => {
  started.server.close();
  lan.server.close();
});

describe("the routes", () => {
  test("the page is built again on each request", async () => {
    const first = await ask(started.port, "/");
    const second = await ask(started.port, "/");
    expect([first.status, first.headers["content-type"], first.body]).toEqual([200, "text/html; charset=utf-8", "<p>page 1</p>"]);
    expect(second.body).toBe("<p>page 2</p>");
    expect(first.headers["content-security-policy"]).toBeUndefined();
  });

  test("the page carries every header", async () => {
    const answer = await ask(started.port, "/");
    expect(answer.headers).toMatchObject({
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      server: "open-prototype",
    });
  });

  test.each([
    "/sitemap.json",
    "/shell.html",
    "/flows/items.html",
    "/../outside.txt",
    "/flows/../../../outside.txt",
    "/%2e%2e/outside.txt",
    "/.env",
    "/flows",
    "/nope",
    "/leak.txt",
    "/a%00b",
    "/flows%5citems.html",
    "/c:x",
    "/flows/",
    "/%2f",
  ])("%s is a 404: the server shares no file of the design's folder", async (path) => {
    const answer = await ask(started.port, path);
    expect([answer.status, answer.body]).toEqual([404, "no such page: this server answers only the design's page, at the address serve printed"]);
  });

  test("a Host that is not this server's own is refused", async () => {
    for (const host of ["evil.example:80", `evil.example:${started.port}`, "127.0.0.1"]) expect((await ask(started.port, "/", { host })).status).toBe(421);
    expect((await ask(started.port, "/", { host: `localhost:${started.port}` })).status).toBe(200);
  });

  test("HEAD answers as GET does, with no body; other methods are not implemented", async () => {
    const head = await ask(lan.port, "/TOKEN1234567890abcdefg/", { method: "HEAD" });
    expect([head.status, head.body, head.headers["content-length"]]).toEqual([
      200,
      "",
      String(Buffer.byteLength((await ask(lan.port, "/TOKEN1234567890abcdefg/")).body)),
    ]);
    const post = await ask(started.port, "/", { method: "POST" });
    expect([post.status, post.headers.allow]).toEqual([405, "GET, HEAD"]);
  });

  test("under --lan every path starts with the token, and the network address is a Host", async () => {
    expect((await ask(lan.port, "/")).status).toBe(404);
    expect((await ask(lan.port, "/TOKEN1234567890abcdefgx/")).status).toBe(404);
    expect((await ask(lan.port, "/TOKEN1234567890abcdefg/")).body).toBe("<p>lan</p>");
    expect((await ask(lan.port, "/TOKEN1234567890abcdefg", { host: `192.168.1.5:${lan.port}` })).status).toBe(200);
    expect((await ask(lan.port, "/TOKEN1234567890abcdefg/sitemap.json", { host: `192.168.1.5:${lan.port}` })).status).toBe(404);
  });
});

describe("the addresses under --lan", () => {
  const nic = (address: string, internal = false, family: "IPv4" | "IPv6" = "IPv4") =>
    ({ address, family, internal, netmask: "", mac: "", cidr: null }) as unknown as import("node:os").NetworkInterfaceInfo;
  // A laptop on Wi-Fi with a VPN that takes the route, and one on a network with no way out, where the route finds none.
  test("each network's IPv4 address is a Host, the routed one printed first, or the first one when no route is found", () => {
    const interfaces = { lo0: [nic("127.0.0.1", true)], en0: [nic("192.168.1.5"), nic("fe80::1", false, "IPv6")], utun4: [nic("10.8.0.2")] };
    expect(lanHosts("10.8.0.2", interfaces)).toEqual({ address: "10.8.0.2", hosts: ["10.8.0.2", "192.168.1.5"] });
    expect(lanHosts("127.0.0.1", interfaces)).toEqual({ address: "192.168.1.5", hosts: ["192.168.1.5", "10.8.0.2"] });
    expect(lanHosts("127.0.0.1", { lo0: [nic("127.0.0.1", true)] })).toEqual({ address: "127.0.0.1", hosts: ["127.0.0.1"] });
  });
  test("a server with two networks answers a phone on either, and refuses every other name", async () => {
    const both = await listen({ page: () => "<p>both</p>", lan: false, port: 0, token: "TOKEN1234567890abcdefg", hosts: ["10.8.0.2", "192.168.1.5"] });
    if ("error" in both) throw new Error("the test server did not start");
    const path = "/TOKEN1234567890abcdefg/";
    const codes = [];
    for (const host of ["10.8.0.2", "192.168.1.5", "192.168.1.6", "evil.example"])
      codes.push((await ask(both.port, path, { host: `${host}:${both.port}` })).status);
    both.server.close();
    expect(codes).toEqual([200, 200, 421, 421]);
  });
  test("on port 80 a Host and an Origin with no port are this server's, as a browser writes them there", () => {
    expect([...ownNames(["192.168.1.5"], 80)].filter((name) => !name.includes(":"))).toEqual(["127.0.0.1", "localhost", "192.168.1.5"]);
    expect([...ownNames(["192.168.1.5"], 8765)].every((name) => name.endsWith(":8765"))).toBe(true);
  });
});

describe("requests from another site", () => {
  test.each([[{ "Sec-Fetch-Site": "cross-site" }], [{ "Sec-Fetch-Site": "same-site" }], [{ Origin: "http://evil.example" }]])(
    "%p are refused with 403",
    async (headers) => {
      expect((await ask(started.port, "/", { headers })).status).toBe(403);
    },
  );
  test("the server's own origin and a request a person types are answered", async () => {
    expect((await ask(started.port, "/", { headers: { Origin: `http://127.0.0.1:${started.port}`, "Sec-Fetch-Site": "same-origin" } })).status).toBe(200);
    expect((await ask(started.port, "/", { headers: { "Sec-Fetch-Site": "none" } })).status).toBe(200);
  });
  test("every answer keeps its resources to this origin", async () => {
    for (const path of ["/", "/nope"]) {
      const answer = await ask(started.port, path);
      expect([answer.headers["cross-origin-resource-policy"], answer.headers["cross-origin-opener-policy"]]).toEqual(["same-origin", "same-origin"]);
    }
  });
});

/** `serve` started in its own process on a free port, with what it prints on the terminal. */
async function served(folder: string, ...args: string[]) {
  const child = Bun.spawn(["bun", join(import.meta.dir, "../src/cli.ts"), "serve", ...args, "--port", "0"], { cwd: folder, stdout: "pipe", stderr: "pipe" });
  const reader = child.stdout.getReader();
  let said = "";
  while (!/127\.0\.0\.1:(\d+)/.test(said)) said += new TextDecoder().decode((await reader.read()).value ?? new Uint8Array());
  return { child, port: Number(/127\.0\.0\.1:(\d+)/.exec(said)?.[1]) };
}

describe("serve writes nothing", () => {
  test("a request builds the page in memory: no output folder appears, and an old page stays", async () => {
    const folder = project(flowDesign());
    const { child, port } = await served(folder, FLOW_DESIGN);
    expect((await ask(port, "/")).status).toBe(200);
    child.kill("SIGINT");
    expect(await child.exited).toBe(130);
    expect(existsSync(join(folder, ".prototype"))).toBe(false);
  });
});

describe("serve says why a page cannot be built", () => {
  test("a design that disappears is a 500 with no reason on the network, and one problem line on the terminal", async () => {
    const folder = project({ "design/b.html": single() });
    const { child, port } = await served(folder, "design/b.html");
    expect((await ask(port, "/")).status).toBe(200);
    renameSync(join(folder, "design/b.html"), join(folder, "design/moved.html"));
    const failed = await ask(port, "/");
    child.kill("SIGINT");
    await child.exited;
    const err = await new Response(child.stderr).text();
    expect([failed.status, failed.body]).toEqual([500, "the page could not be built: see the terminal that runs serve"]);
    expect(err.split("\n").filter((line) => line.startsWith("problem: "))).toEqual([expect.stringMatching(/design\/b\.html.*\[request\.\w+\]$/)]);
  });
});

describe("the port", () => {
  test("with none named, serve tries 8765 and the next ports in order; a named port is tried alone", () => {
    expect(portsToTry(null)).toEqual(Array.from({ length: DEFAULT_PORTS }, (_, index) => DEFAULT_PORT + index));
    expect([portsToTry(9000), portsToTry(0)]).toEqual([[9000], [0]]);
  });

  test("a port another program holds is passed over for the next one", async () => {
    const next = await listenFirst({ page: () => "<p>next</p>", lan: false, token: "", hosts: [] }, [started.port, 0]);
    if ("error" in next) throw new Error(next.error);
    next.server.close();
    expect(next.port === started.port).toBe(false);
  });

  test("with 8765 in use and no port named, serve takes the next free one and says why its address changed", async () => {
    // Hold 8765 for the test, unless another program already does: either way it is in use.
    const held = await listen({ page: () => "<p>held</p>", lan: false, port: DEFAULT_PORT, token: "", hosts: [] });
    const child = Bun.spawn(["bun", join(import.meta.dir, "../src/cli.ts"), "serve", FLOW_DESIGN], { cwd: folder, stdout: "pipe", stderr: "pipe" });
    const reader = child.stdout.getReader();
    let said = "";
    for (;;) {
      const read = await reader.read();
      if (read.done) break;
      said += new TextDecoder().decode(read.value);
      if (/serving http:\/\/127\.0\.0\.1:(\d+)/.test(said)) break;
    }
    child.kill("SIGINT");
    await child.exited;
    if (!("error" in held)) held.server.close();
    const port = Number(/serving http:\/\/127\.0\.0\.1:(\d+)/.exec(said)?.[1]);
    expect([port > DEFAULT_PORT && port < DEFAULT_PORT + DEFAULT_PORTS, said.includes(`port ${DEFAULT_PORT} is in use, so this serves on ${port}`)]).toEqual([
      true,
      true,
    ]);
  });
});

describe("serve refuses", () => {
  test("a port in use, a port out of range, the offline switch, and no design", async () => {
    const taken = await cli(folder, "serve", FLOW_DESIGN, "--port", String(started.port));
    expect(taken.code).toBe(2);
    expect([taken.out, taken.err]).toEqual(["", expect.stringContaining("--port")]);
    expect((await cli(folder, "serve", FLOW_DESIGN, "--port", "65536")).code).toBe(2);
    process.env[OFFLINE_SWITCH] = "1";
    const offline = await cli(folder, "serve", FLOW_DESIGN, "--port", "0");
    delete process.env[OFFLINE_SWITCH];
    expect(offline.code).toBe(2);
    expect(offline.err).toStartWith(`problem: ${OFFLINE_SWITCH}=1 is set`);
    expect((await cli(project(), "serve")).code).toBe(2);
  });
});
