// The local server, which a person starts with `serve` so a design opens on a real phone or shows an edit on reload.
// It listens on 127.0.0.1 unless the person asks for the local network with `--lan`, and stops with Ctrl-C. `/` is the
// design's page, built again on each request, and every other path is a 404: the page carries every file it shows, so
// the server shares no file. It answers GET and HEAD alone, and only a request addressed to it by name (the Host
// header), so a web page that rebinds a domain to 127.0.0.1 reads nothing. Under `--lan` every path starts with a
// random token the printed address carries.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createSocket } from "node:dgram";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { EXIT, Refusal } from "./errors.ts";
import { PROGRAM } from "./format.ts";
import { shown } from "./text.ts";

const LOOPBACK = "127.0.0.1";
const ALL_INTERFACES = "0.0.0.0";
export const DEFAULT_PORT = 8765;
/**
 * The ports `serve` tries in order when no port is named: 8765, then the next 19. A browser keeps the comments not yet
 * downloaded for each address, port and all, so the first free one of a short, fixed list keeps a design's address
 * the same from one run to the next, where any free port would change it each time.
 */
export const DEFAULT_PORTS = 20;
export const OFFLINE_SWITCH = "PROTOTYPE_OFFLINE";
// What every answer says: no caching, no sniffing, no referrer, and the page never framed by another site.
const HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const PAGE_POLICY = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;

/** Why the server will not start, or "": the offline switch stops it. */
function offlineProblem(): string {
  if (process.env[OFFLINE_SWITCH] === "1") {
    return `${OFFLINE_SWITCH}=1 is set, so the prototype server does not start: unset it to serve the page, or open the written page as a file`;
  }
  return "";
}

function pathOf(target: string): string {
  const withoutQuery = target.split("#")[0]?.split("?")[0] ?? "";
  const absolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]*/.exec(withoutQuery);
  return absolute ? withoutQuery.slice(absolute[0].length) : withoutQuery;
}

// The path starts with the token, compared in time that does not depend on where it differs.
function tokenMatches(path: string, prefix: string): boolean {
  const head = Buffer.from(path.slice(0, prefix.length));
  const want = Buffer.from(prefix);
  const next = path.charAt(prefix.length);
  return head.length === want.length && timingSafeEqual(head, want) && (next === "" || next === "/");
}

function newToken(): string {
  return randomBytes(16).toString("base64url");
}

export type ServeOptions = { page: () => string; lan: boolean; port: number; token: string; hosts: string[] };

function answer(response: ServerResponse, code: number, body: string, type: string, extra: Record<string, string> = {}): void {
  const data = Buffer.from(body, "utf8");
  response.writeHead(code, { ...HEADERS, ...extra, Server: PROGRAM, "Content-Type": type, "Content-Length": String(data.length) });
  // A HEAD request gets the same status and headers as a GET, and no body.
  response.end(response.req.method === "HEAD" ? undefined : data);
}

const TEXT = "text/plain; charset=utf-8";
const NOT_THE_PAGE = "no such page: this server answers only the design's page, at the address serve printed";

/**
 * The names a request may give this server by, in its Host header and its Origin: each of its addresses with the port,
 * and on port 80, which a browser leaves out of both, each address alone too.
 */
export function ownNames(hosts: readonly string[], port: number): Set<string> {
  const all = [LOOPBACK, "localhost", ...hosts];
  return new Set([...all.map((host) => `${host}:${port}`), ...(port === 80 ? all : [])]);
}

function handle(options: ServeOptions, port: () => number, request: IncomingMessage, response: ServerResponse): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    answer(response, 405, `this server answers GET and HEAD only, not ${shown(request.method ?? "")}`, TEXT, { Allow: "GET, HEAD" });
    return;
  }
  const names = ownNames(options.hosts, port());
  if (!names.has(String(request.headers.host ?? "").toLowerCase())) {
    answer(response, 421, "this server answers only its own address", TEXT);
    return;
  }
  // Another web site's request, which a browser marks or names, reads nothing: a page cannot read this server.
  const site = String(request.headers["sec-fetch-site"] ?? "");
  const origin = request.headers.origin;
  if (site === "cross-site" || site === "same-site" || (origin !== undefined && !names.has(origin.replace(/^https?:\/\//, "").toLowerCase()))) {
    answer(response, 403, "this server answers only its own pages", TEXT);
    return;
  }
  // Under --lan the page is at the token's path; with or without it, every other path is a 404.
  const prefix = options.token ? `/${options.token}` : "";
  const path = pathOf(request.url ?? "/");
  if ((prefix && !tokenMatches(path, prefix)) || (path.slice(prefix.length) || "/") !== "/") {
    answer(response, 404, NOT_THE_PAGE, TEXT);
    return;
  }
  let body: string;
  try {
    body = options.page();
  } catch {
    // The reason, with its file names, is printed on the terminal that runs serve, never sent to the network.
    answer(response, 500, "the page could not be built: see the terminal that runs serve", TEXT);
    return;
  }
  const policy = PAGE_POLICY.exec(body)?.[1];
  answer(response, 200, body, "text/html; charset=utf-8", policy ? { "Content-Security-Policy": policy } : {});
}

/** A server, listening, or the reason it could not listen, with `busy` when another program holds the port. */
export function listen(options: ServeOptions): Promise<{ server: Server; port: number } | { error: string; busy: boolean }> {
  return new Promise((done) => {
    let port = options.port;
    const server = createServer((request, response) => handle(options, () => port, request, response));
    server.on("error", (error: NodeJS.ErrnoException) =>
      done(error.code === "EADDRINUSE" ? { error: "Address already in use", busy: true } : { error: error.message, busy: false }),
    );
    server.listen(options.port, options.lan ? ALL_INTERFACES : LOOPBACK, () => {
      port = (server.address() as { port: number }).port;
      done({ server, port });
    });
  });
}

/** This machine's address on the local network, as a phone would reach it, or 127.0.0.1. A UDP socket picks the route and sends nothing. */
function lanAddress(): Promise<string> {
  return new Promise((done) => {
    const probe = createSocket("udp4");
    probe.on("error", () => {
      probe.close();
      done(LOOPBACK);
    });
    // TEST-NET-1, which is never routed: no packet leaves.
    probe.connect(9, "192.0.2.1", () => {
      const address = probe.address().address;
      probe.close();
      done(address);
    });
  });
}

/**
 * The addresses a phone may reach this machine by under `--lan`: each IPv4 address of a network interface that is not
 * the machine's own loopback, so a machine on two networks, or one whose route goes through a VPN, answers on each.
 * The address the route picked is printed first; with no route, as on a network with no way out, the first address.
 */
export function lanHosts(routed: string, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): { address: string; hosts: string[] } {
  const own = Object.values(interfaces)
    .flat()
    .filter((info): info is NetworkInterfaceInfo => Boolean(info) && info?.family === "IPv4" && !info.internal)
    .map((info) => info.address);
  const address = routed !== LOOPBACK ? routed : (own[0] ?? LOOPBACK);
  return { address, hosts: [...new Set([address, ...own])] };
}

/** The ports to try, in order: the one a person named, alone, or with none named the default list. */
export function portsToTry(port: number | null): number[] {
  return port === null ? Array.from({ length: DEFAULT_PORTS }, (_, index) => DEFAULT_PORT + index) : [port];
}

/** Listen on the first of `ports` that no other program holds; any other error stops the search. */
export async function listenFirst(options: Omit<ServeOptions, "port">, ports: number[]): ReturnType<typeof listen> {
  let started: Awaited<ReturnType<typeof listen>> = { error: "no port to try", busy: false };
  for (const port of ports) {
    started = await listen({ ...options, port });
    if (!("error" in started) || !started.busy) break;
  }
  return started;
}

/**
 * Serve until a signal stops it: 130 after Ctrl-C, 143 after a stop request. A refused request throws a `Refusal`
 * before the server listens: the offline switch, a port out of range, or a port that cannot be used. With no port
 * named, it takes the first free port of `portsToTry(null)`; a port a person names is used or refused.
 */
export async function serve(page: () => string, lan: boolean, port: number | null, say: (line: string) => void): Promise<number> {
  const offline = offlineProblem();
  // The offline switch is a setting of the environment, as the settings file's are of the project.
  if (offline) throw new Refusal(offline, "request.settings");
  // A port below 1024 is accepted: a system that lets a person listen there serves on it, and one that does not
  // refuses it as it listens, which is the refusal below.
  if (port !== null && (!Number.isInteger(port) || port < 0 || port > 65535))
    throw new Refusal(`--port ${port} is no port: pick one from 1 to 65535, or 0 for any free one`, "request.value");
  const { address, hosts } = lan ? lanHosts(await lanAddress()) : { address: LOOPBACK, hosts: [] };
  const token = lan ? newToken() : "";
  const ports = portsToTry(port);
  const started = await listenFirst({ page, lan, token, hosts }, ports);
  if ("error" in started) {
    const first = ports[0] ?? DEFAULT_PORT;
    const last = ports.at(-1) ?? first;
    throw new Refusal(
      port === null && started.busy
        ? `ports ${first} to ${last} are all in use: pick another with --port, or --port 0 for any free one`
        : `port ${port ?? first} cannot be used (${started.error}): pick another with --port`,
      "request.value",
    );
  }
  if (port === null && started.port !== DEFAULT_PORT) {
    say(
      `port ${DEFAULT_PORT} is in use, so this serves on ${started.port}. The browser keeps comments not yet downloaded for each address, so open this one again to see them`,
    );
  }
  const where = `http://${address}:${started.port}/${token ? `${token}/` : ""}`;
  const reach = lan
    ? "the token keeps out devices that do not have this address; the link is plain HTTP, so anyone who can watch this network can read the page and the token"
    : "only this machine can open it; add --lan to open it on a phone on the same network";
  say(`serving ${where}: ${reach}. Reload after an edit. Ctrl-C stops it`);
  // A machine on more than one network answers on each: a phone on another of them opens its address.
  const others = hosts.filter((host) => host !== address).map((host) => `http://${host}:${started.port}/${token}/`);
  if (others.length) say(`this machine also answers on its other networks, at ${others.join(", ")}`);
  const code = await new Promise<number>((done) => {
    process.once("SIGINT", () => done(EXIT.interrupted));
    process.once("SIGTERM", () => done(EXIT.stopped));
  });
  say("stopped");
  started.server.closeAllConnections();
  started.server.close();
  return code;
}
