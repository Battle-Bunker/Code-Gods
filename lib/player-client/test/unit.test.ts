/** Unit tests without an engine: protocol schemas, configuration, env files, redaction, the token middleware. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VERSION, commandSchema, observationSchema, ownerActionSchema } from "../src/protocol.ts";
import { PlayerClient } from "../src/client.ts";
import { Engine, EngineError, TOKEN_PATH, isSameOriginRequest, loadConfig, normalizeEngineUrl, parseEnvFile, redact, tokenHandler } from "../src/engine.ts";
import { updateEnvFile } from "../src/connect.ts";

const CREDENTIAL = "cgc_" + "A".repeat(43);
const raw = {version:VERSION,roomId:"room",revision:1,phase:"running",language:"python",self:{godId:"god",label:"Human",isAI:false,energy:100,ready:true,utility:{familyId:"zebra",emoji:"🦓",name:"Zebra",theme:"stripes",summary:"stripes",language:"python",source:"own"}},objects:[{id:"o",value:1,own:{ordinal:1,rewardBits:1,netBits:1},peerNetBits:2,peerCare:2,payoff:2,opponentUtilities:[1,1],peerScores:{a:1}}],agents:[{id:"a",source:"def agent(x):\n    return [add(1)]",language:"python",summonCost:11,decisionBits:0.5,expectedActCost:5,breakdown:{decision:0.5,erasure:0,motion:4.5,floor:0},randomized:false,energy:-1,eligible:false,acts:2,spent:9}],transformations:[],leaderboard:[],chat:[],adminToken:"NEVER"};

test("protocol: projection strips hidden fields and bounds commands", () => {
  const text = JSON.stringify(observationSchema.parse(raw));
  for (const hidden of ["NEVER", "opponentUtilities", "peerScores"]) assert.equal(text.includes(hidden), false);
  assert.equal(VERSION, "code-gods.player.v3");
  assert.throws(() => observationSchema.parse({ ...raw, version: "code-gods.player.v2" }));
  assert.deepEqual(commandSchema.parse({ type: "destroy", agentId: "a" }), { type: "destroy", agentId: "a" });
  for (const command of [{ type: "dm", text: "hi" }, { type: "start" }, { type: "chat", text: "hi", recipient: "god" }, { type: "summon", language: "python", source: "x".repeat(16385) }]) assert.throws(() => commandSchema.parse(command));
  assert.throws(() => commandSchema.parse({ type: "validate", language: "python", source: "é".repeat(9000) }));
  const extended = observationSchema.parse({ ...raw, gameId: "game" });
  const client = new PlayerClient({} as never);
  assert.equal(client.prepare({ type: "pause" }, extended).gameId, "game");
  assert.equal(client.prepare({ type: "chat", text: "Public" }, extended).gameId, undefined);
  assert.ok(ownerActionSchema.safeParse({ action: "start", requestId: crypto.randomUUID() }).success);
  assert.equal(ownerActionSchema.safeParse({ action: "start" }).success, false, "owner actions need a requestId");
  assert.equal(ownerActionSchema.safeParse({ action: "mintGrant", requestId: crypto.randomUUID() }).success, false);
});

test("config: Secrets first, then the env file; clear errors that never echo the credential", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-unit-"));
  const file = join(dir, ".env.local");
  assert.throws(() => loadConfig({ env: {}, envFile: file }), (e: EngineError) => e.code === "NOT_CONFIGURED" && /CODE_GODS_ENGINE_URL and CODE_GODS_CREDENTIAL/.test(e.message));
  writeFileSync(file, `# local\nexport CODE_GODS_ENGINE_URL="http://127.0.0.1:3211/"\nCODE_GODS_CREDENTIAL=${CREDENTIAL}\n`);
  const fromFile = loadConfig({ env: {}, envFile: file });
  assert.deepEqual({ ...fromFile, credential: "x" }, { engineUrl: "http://127.0.0.1:3211", credential: "x", source: { engineUrl: "file", credential: "file" }, envFile: file });
  const fromEnv = loadConfig({ env: { CODE_GODS_ENGINE_URL: "https://dep-1.convex.cloud", CODE_GODS_CREDENTIAL: CREDENTIAL }, envFile: file });
  assert.equal(fromEnv.engineUrl, "https://dep-1.convex.site", "a client URL maps to its site URL");
  assert.deepEqual(fromEnv.source, { engineUrl: "env", credential: "env" });
  assert.equal(fromEnv.envFile, undefined);
  const bad = "cgc_short!";
  assert.throws(() => loadConfig({ env: { CODE_GODS_ENGINE_URL: "https://x.example", CODE_GODS_CREDENTIAL: bad }, envFile: false }),
    (e: EngineError) => e.code === "INVALID_CONFIG" && !e.message.includes(bad));
  for (const url of ["http://example.com", "https://u:p@x.example", "https://x.example/?a=1", "nope"]) assert.throws(() => normalizeEngineUrl(url), EngineError);
  assert.equal(normalizeEngineUrl("http://localhost:3211/"), "http://localhost:3211");
  assert.deepEqual(parseEnvFile("A=1 # c\nB='x y'\n#C=3\n"), { A: "1", B: "x y" });
  const engine = new Engine({ engineUrl: "https://x.example", credential: CREDENTIAL });
  assert.ok(!JSON.stringify(engine).includes("cgc_"), "an Engine never serialises its credential");
});

test("redaction and env files", () => {
  assert.equal(redact(`a ${CREDENTIAL} b cgd_xyz eyJhbGciOi.eyJzdWIi.c2ln c`), "a [redacted] b [redacted] [redacted] c");
  const dir = mkdtempSync(join(tmpdir(), "cg-unit-"));
  const file = join(dir, "app.env");
  writeFileSync(file, "OTHER=1\nCODE_GODS_CREDENTIAL=old\n", { mode: 0o644 });
  updateEnvFile(file, { CODE_GODS_ENGINE_URL: "https://x.example", CODE_GODS_CREDENTIAL: CREDENTIAL });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(readFileSync(file, "utf8"), `OTHER=1\nCODE_GODS_CREDENTIAL=${CREDENTIAL}\nCODE_GODS_ENGINE_URL=https://x.example\n`);
  updateEnvFile(file, { CODE_GODS_CREDENTIAL: undefined });
  assert.equal(readFileSync(file, "utf8"), "OTHER=1\nCODE_GODS_ENGINE_URL=https://x.example\n");
});

const req = (headers: Record<string, string>) => ({ headers } as unknown as IncomingMessage);
test("same-origin check: Sec-Fetch-Site and Origin against Host", () => {
  const host = { host: "app.example:5173" };
  assert.equal(isSameOriginRequest(req({ ...host, "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOriginRequest(req({ ...host, origin: "https://app.example:5173" })), true);
  assert.equal(isSameOriginRequest(req({ ...host, "sec-fetch-site": "same-origin", origin: "http://app.example:5173" })), true);
  for (const bad of [{}, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "none" },
    { origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "same-origin", origin: "https://evil.example" }] as Record<string, string>[]) {
    assert.equal(isSameOriginRequest(req({ ...host, ...bad })), false, JSON.stringify(bad));
  }
  assert.equal(isSameOriginRequest(req({ "sec-fetch-site": "same-origin" })), false, "no Host");
  assert.equal(isSameOriginRequest(req({ host: "rebind.evil:5173", "sec-fetch-site": "same-origin" }), ["app.example", ".replit.dev"]), false);
  assert.equal(isSameOriginRequest(req({ host: "x.y.replit.dev", "sec-fetch-site": "same-origin" }), ["app.example", ".replit.dev"]), true);
});

/** A fake engine site for the token middleware: config + credential exchange (counted). */
function fakeEngine() {
  const state = { exchanges: 0, revoked: false };
  const fakeFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/api/config")) return Response.json({ convexUrl: "https://dep-1.convex.cloud", siteUrl: "https://dep-1.convex.site", version: "t" });
    if (url.endsWith("/api/device/token")) {
      state.exchanges++;
      if (state.revoked) return Response.json({ error: "revoked" }, { status: 401 });
      return Response.json({ token: `eyJ.${state.exchanges}.sig`, expiresAt: Date.now() + 600_000, roomId: "room1", permission: "act", credentialId: "cred1", credentialExpiresAt: Date.now() + 7 * 86400_000 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { state, engine: new Engine({ engineUrl: "https://dep-1.convex.site", credential: CREDENTIAL }, { fetch: fakeFetch }) };
}

test("token middleware: a token needs the private launch session, not just same-origin headers (which anyone can forge)", async () => {
  const { engine } = fakeEngine();
  const handler = tokenHandler({ engine, launchKey: "k".repeat(32) });
  const server = createServer((rq, rs) => handler(rq, rs, () => { rs.statusCode = 418; rs.end(); }));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const sameOrigin = { "sec-fetch-site": "same-origin" };
  try {
    const forged = await fetch(base + TOKEN_PATH, { headers: sameOrigin });
    assert.equal(forged.status, 401);
    assert.equal((await forged.json()).code, "LAUNCH_REQUIRED");
    assert.equal((await fetch(`${base}/__codegods/launch?key=${"x".repeat(32)}`, { redirect: "manual" })).status, 403, "a wrong key opens nothing");
    const launch = await fetch(`${base}/__codegods/launch?key=${"k".repeat(32)}`, { redirect: "manual" });
    assert.equal(launch.status, 302);
    assert.equal(launch.headers.get("location"), "/");
    const cookie = launch.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.ok(!cookie.includes("k".repeat(32)), "the session cookie is not the launch key");
    const session = cookie.split(";")[0];
    assert.equal((await fetch(base + TOKEN_PATH, { headers: { ...sameOrigin, cookie: session } })).status, 200);
    assert.equal((await fetch(base + TOKEN_PATH, { headers: { ...sameOrigin, cookie: `${session.split("=")[0]}=guessed` } })).status, 401);
    assert.equal((await fetch(`${base}/__codegods/launch?key=${"é".repeat(32)}`, { redirect: "manual" })).status, 403, "same length in characters, not in bytes");
    // Ports share cookies: two apps on one host must not overwrite each other's session.
    const other = tokenHandler({ engine, launchKey: "j".repeat(32) });
    const server2 = createServer((rq, rs) => other(rq, rs));
    await new Promise<void>(r => server2.listen(0, "127.0.0.1", r));
    try {
      const base2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}`;
      const otherCookie = (await fetch(other.launchUrl(base2), { redirect: "manual" })).headers.get("set-cookie")!;
      assert.notEqual(otherCookie.split("=")[0], session.split("=")[0]);
    } finally { server2.closeAllConnections(); server2.close(); }
  } finally { server.closeAllConnections(); server.close(); }
});

test("token middleware: same-origin GET only, no-store, cached JWT, RECONNECT on 401", async () => {
  const { engine, state } = fakeEngine();
  const handler = tokenHandler({ engine, launchKey: "k".repeat(32) });
  const server = createServer((rq, rs) => handler(rq, rs, () => { rs.statusCode = 418; rs.end(); }));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const launch = await fetch(`${base}/__codegods/launch?key=${"k".repeat(32)}`, { redirect: "manual" });
  const cookie = launch.headers.get("set-cookie")!.split(";")[0];
  const get = (headers: Record<string, string> = {}, init: RequestInit = {}) => fetch(base + TOKEN_PATH, { ...init, headers: { cookie, ...headers } });
  try {
    const ok = await get({ "sec-fetch-site": "same-origin" });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const body = await ok.json();
    assert.deepEqual(Object.keys(body).sort(), ["convexUrl", "expiresAt", "permission", "roomId", "token"]);
    assert.equal(body.convexUrl, "https://dep-1.convex.cloud");
    assert.ok(!JSON.stringify(body).includes("cgc_"), "the browser never sees the credential");
    await get({ origin: base });
    assert.equal(state.exchanges, 1, "the JWT is cached until a minute before expiry");
    assert.equal((await get({ "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await get({ origin: "https://evil.example" })).status, 403);
    assert.equal((await get()).status, 403, "neither header: refused");
    assert.equal((await get({ "sec-fetch-site": "same-origin" }, { method: "POST" })).status, 405);
    assert.equal((await fetch(base + "/other")).status, 418, "other paths fall through to next()");
    state.revoked = true; engine.clearToken();
    const lost = await get({ "sec-fetch-site": "same-origin" });
    assert.equal(lost.status, 401);
    assert.match((await lost.json()).error, /^reconnect: /);
  } finally { server.closeAllConnections(); server.close(); }
  const unconfigured = tokenHandler({ engine: () => { throw new EngineError("NOT_CONFIGURED", "Not connected"); }, launchKey: "k".repeat(32) });
  const server2 = createServer((rq, rs) => unconfigured(rq, rs));
  await new Promise<void>(r => server2.listen(0, "127.0.0.1", r));
  try {
    const base2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}`;
    const cookie2 = (await fetch(`${base2}/__codegods/launch?key=${"k".repeat(32)}`, { redirect: "manual" })).headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(base2 + TOKEN_PATH, { headers: { "sec-fetch-site": "same-origin", cookie: cookie2 } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "NOT_CONFIGURED");
  } finally { server2.closeAllConnections(); server2.close(); }
});
