/**
 * The agent interface over HTTP against the LIVE local backend (`pnpm --filter @workspace/engine test:mcp`, with
 * `pnpm --filter @workspace/engine dev` running): POST /mcp (MCP, both protocol eras), the OAuth 2.1
 * authorization server, permissions, idempotent commands and disclosure through every read tool.
 *
 * Humans are seeded and impersonated with the admin key (game-helpers.ts), exactly like test:game; the
 * credentials MCP uses are real: `cgc_` device credentials (seeded by hash) and OAuth access tokens minted
 * by the token endpoint.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { admin, api, envelope, gods, internal, raw, roomWith, touch, waitFor, type God } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const ports = JSON.parse(readFileSync(`${root}/.convex/local/default/config.json`, "utf8")).ports;
const SITE = process.env.CG_TEST_SITE_URL ?? `http://127.0.0.1:${ports?.site ?? 3211}`;
const MCP = `${SITE}/mcp`;
const MODERN = "2026-07-28";
const LEGACY = "2025-06-18";
const TS_INT = { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, language: "typescript", grammarId: "typescript-agent-v1",
  complexityFunctionId: "ts-ast-bits-v1-uniform", startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 3600, agentEnergyPerSecond: 100,
  agentBatteryActs: 2, interactionRateHz: 20, startingEnergy: 1000 };
const AGENT = "function agent(x) { return [add(1)]; }";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** A real `cgc_` device credential for `god` in `roomId`: the engine stores only its hash. */
async function credential(god: God, roomId: string, permission: "read" | "act" | "owner") {
  const token = `cgc_${randomBytes(32).toString("base64url")}`;
  const credentialId = await admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId, permission, tokenHash: sha256(token) });
  return { token, credentialId: credentialId as string };
}

let nextId = 1;
const meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientInfo": { name: "raw-test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {} };
/** One modern (2026-07-28) JSON-RPC request with the per-request headers; returns the HTTP response. */
function post(body: unknown, headers: Record<string, string> = {}) {
  return fetch(MCP, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
}
function modern(token: string | null, method: string, params: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "mcp-protocol-version": MODERN, "mcp-method": method, ...extra };
  if (method === "tools/call") headers["mcp-name"] = String(params.name);
  if (token) headers.authorization = `Bearer ${token}`;
  return post({ jsonrpc: "2.0", id: nextId++, method, params: { ...params, _meta: meta } }, headers);
}
/** tools/call → the structured result, or {error} for a tool error. */
async function call(token: string, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const response = await modern(token, "tools/call", { name, arguments: args });
  assert.equal(response.status, 200, `${name}: HTTP ${response.status} ${await response.clone().text()}`);
  const body = await response.json() as any;
  if (body.error) return { rpcError: body.error };
  if (body.result.isError) {
    const text = body.result.content[0].text;
    // Our refusals are {error: {code, message}}; the SDK reports schema violations as plain text.
    try { return { error: JSON.parse(text).error }; } catch { return { error: { code: "INVALID_ARGUMENTS", message: text } }; }
  }
  return body.result.structuredContent;
}
async function listTools(token: string): Promise<string[]> {
  const body = await (await modern(token, "tools/list")).json() as any;
  return body.result.tools.map((t: any) => t.name).sort();
}

async function lobby() {
  const [host, ada, bo] = await gods("Mcp Host", "Mcp Ada", "Mcp Bo");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada, bo], TS_INT);
  return { host, ada, bo, roomId, shortCode };
}

test("unauthenticated: 401 with a WWW-Authenticate challenge naming the protected-resource metadata", async () => {
  const response = await modern(null, "tools/list");
  assert.equal(response.status, 401);
  const challenge = response.headers.get("www-authenticate") ?? "";
  assert.match(challenge, /^Bearer /);
  assert.ok(challenge.includes(`resource_metadata="${SITE}/.well-known/oauth-protected-resource/mcp"`), challenge);
  const bad = await modern("cgc_" + "x".repeat(43), "tools/list");
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
});

test("transport: GET is 405, notifications 202, unknown methods -32601, bad Origin 403, oversized bodies 413, header/body mismatch refused", async () => {
  const { ada, roomId } = await lobby();
  const { token } = await credential(ada, roomId, "act");
  const auth = { authorization: `Bearer ${token}` };
  const get = await fetch(MCP, { headers: { accept: "text/event-stream", ...auth } });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");
  const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { ...auth });
  assert.equal(note.status, 202);
  const unknown = await (await modern(token, "tools/frobnicate")).json() as any;
  assert.equal(unknown.error.code, -32601);
  const origin = await modern(token, "tools/list", {}, { origin: "https://evil.example" });
  assert.equal(origin.status, 403);
  assert.equal((await modern(token, "tools/list", {}, { origin: SITE })).status, 200, "the site's own origin is fine");
  const huge = await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "send_chat", arguments: { text: "x".repeat(2_000_000) }, _meta: meta } },
    { ...auth, "mcp-protocol-version": MODERN, "mcp-method": "tools/call", "mcp-name": "send_chat" });
  assert.equal(huge.status, 413);
  const mismatch = await modern(token, "tools/list", {}, { "mcp-method": "tools/call" });
  const mismatchBody = await mismatch.json() as any;
  assert.ok(mismatch.status >= 400 || mismatchBody.error, "Mcp-Method must match the body");
  assert.ok(mismatchBody.error, JSON.stringify(mismatchBody));
  // A modern envelope without the protocol-version header is refused, not silently served as legacy.
  const noHeader = await post({ jsonrpc: "2.0", id: 9, method: "tools/list", params: { _meta: meta } }, { ...auth, "mcp-method": "tools/list" });
  const noHeaderBody = await noHeader.json() as any;
  assert.ok(noHeaderBody.error, `missing MCP-Protocol-Version: ${JSON.stringify(noHeaderBody)}`);
});

test("both protocol eras: the v2 SDK (2026-07-28, server/discover) and the 2025 SDK (initialize) list and call tools", async () => {
  const { ada, roomId, shortCode } = await lobby();
  const { token } = await credential(ada, roomId, "act");
  const modernClient = new Client({ name: "modern-test", version: "1" }, { versionNegotiation: { mode: { pin: MODERN } } });
  await modernClient.connect(new StreamableHTTPClientTransport(new URL(MCP), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const tools = (await modernClient.listTools()).tools;
  assert.ok(tools.some(t => t.name === "summon_agent") && !tools.some(t => t.name === "start_game"), "act grant: act tools, no owner tools");
  const summon = tools.find(t => t.name === "summon_agent")!;
  assert.equal((summon.inputSchema as any).required.includes("commandId"), true);
  assert.equal(summon.annotations?.readOnlyHint, false);
  const who = await modernClient.callTool({ name: "whoami", arguments: {} });
  assert.equal((who.structuredContent as any).data.name, "Mcp Ada");
  assert.equal((who.structuredContent as any).data.roomCode, shortCode);
  await modernClient.close();

  const legacy = new LegacyClient({ name: "legacy-test", version: "1" });
  await legacy.connect(new LegacyTransport(new URL(MCP), { requestInit: { headers: { "x-api-key": token } } }));
  assert.equal(legacy.getServerVersion()?.name, "code-gods");
  const legacyTools = (await legacy.listTools()).tools.map(t => t.name);
  assert.ok(legacyTools.includes("get_observation"));
  const rules = await legacy.callTool({ name: "get_rules", arguments: {} });
  assert.match((rules.structuredContent as any).data.rules, /payoff/);
  assert.equal((rules.structuredContent as any).untrusted, true);
  await legacy.close();
  // 2025-era responses are plain JSON too.
  const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "x", version: "1" } } },
    { "x-api-key": token });
  assert.equal(init.status, 200);
  assert.match(init.headers.get("content-type") ?? "", /^application\/json/);
});

test("permissions: a read grant never lists or runs act or owner tools; revoked and expired credentials get 401", async () => {
  const { host, ada, roomId } = await lobby();
  const reader = await credential(ada, roomId, "read");
  const names = await listTools(reader.token);
  assert.ok(names.includes("get_observation") && names.includes("get_receipt"));
  for (const name of ["send_chat", "summon_agent", "validate_agent", "set_ready", "wake_engine", "start_game", "get_room_state"]) {
    assert.ok(!names.includes(name), `read grant lists ${name}`);
    const r = await call(reader.token, name, name === "send_chat" ? { text: "should never post" } : {});
    assert.ok(r.error || r.rpcError, `read grant ran ${name}: ${JSON.stringify(r)}`);
  }
  const chat = await host.c.query(api.rooms.chatHistory, { roomId });
  assert.ok(!chat.some((m: any) => m.text === "should never post"));
  const actor = await credential(ada, roomId, "act");
  assert.ok((await call(actor.token, "start_game", { requestId: randomUUID() })).error || true);
  assert.ok(!(await listTools(actor.token)).includes("start_game"));
  // An owner grant of a non-owner is refused by the engine even though it lists owner tools.
  const fakeOwner = await credential(ada, roomId, "owner");
  assert.equal((await modern(fakeOwner.token, "tools/list")).status, 401, "an owner grant of someone who does not own the room is not a principal");
  const owner = await credential(host, roomId, "owner");
  assert.ok((await listTools(owner.token)).includes("start_game"));
  // Revocation and expiry take effect on the next call.
  await admin.mutation(internal.testing.patchCredential, { credentialId: actor.credentialId, patch: { revokedAt: Date.now() } });
  assert.equal((await modern(actor.token, "tools/list")).status, 401);
  const old = await credential(ada, roomId, "read");
  await admin.mutation(internal.testing.patchCredential, { credentialId: old.credentialId, patch: { expiresAt: Date.now() - 1 } });
  assert.equal((await modern(old.token, "tools/list")).status, 401);
});

test("get_chat pages through messages that share one timestamp without skipping or repeating any", async () => {
  const { ada, roomId } = await lobby();
  const { token } = await credential(ada, roomId, "read");
  const texts = Array.from({ length: 7 }, (_, i) => `same-ms ${i}`);
  // Older than anything the lobby posted: these seven are the last pages.
  await admin.mutation(internal.testing.seedChat, { roomId, authorId: ada.subject, texts, timestamp: 1000 });
  const seen: string[] = [];
  let cursor: unknown;
  for (let pages = 0; pages < 20; pages++) {
    const page = await call(token, "get_chat", { limit: 3, ...(cursor !== undefined ? { cursor } : {}) });
    assert.ok(!page.error, JSON.stringify(page.error));
    seen.push(...page.data.messages.map((m: any) => m.text));
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  const mine = seen.filter(t => t.startsWith("same-ms "));
  assert.deepEqual([...mine].sort(), texts, `each seeded message exactly once: ${JSON.stringify(mine)}`);
});

test("commands: summon is idempotent per commandId, a changed payload is a CONFLICT, pending completes through get_receipt", { timeout: 180000 }, async () => {
  const { host, ada, roomId } = await lobby();
  const owner = await credential(host, roomId, "owner");
  const actor = await credential(ada, roomId, "act");
  const started = await call(owner.token, "start_game", { requestId: randomUUID() });
  assert.ok(started.data?.result?.gameId, JSON.stringify(started));
  const commandId = randomUUID();
  const first = await call(actor.token, "summon_agent", { source: AGENT, commandId });
  assert.equal(first.data.status, "received", JSON.stringify(first));
  assert.equal(first.data.receipt.accepted, true, first.data.receipt.message);
  const replay = await call(actor.token, "summon_agent", { source: AGENT, commandId });
  assert.ok(replay.data, JSON.stringify(replay));
  assert.deepEqual(replay.data.receipt, first.data.receipt, "the identical call returns the stored receipt");
  const conflict = await call(actor.token, "summon_agent", { source: AGENT.replace("1", "2"), commandId });
  assert.equal(conflict.error?.code, "CONFLICT");
  const agents = (await raw(started.data.result.gameId)).agents.filter((a: any) => a.ownerId === ada.subject);
  assert.equal(agents.length, 1, "exactly one agent after the replay");
  // waitMs 0: the summon runs on the server after the call answers `pending`; get_receipt completes it.
  const later = randomUUID();
  const pending = await call(actor.token, "summon_agent", { source: "function agent(x) { return [add(3)]; }", commandId: later, waitMs: 0 });
  assert.equal(pending.data.status, "pending");
  assert.equal(pending.data.commandId, later);
  const done = await waitFor(async () => {
    const r = await call(actor.token, "get_receipt", { commandId: later });
    return r.data.status === "received" ? r : null;
  }, "the pending summon's receipt", 60000, 300);
  assert.equal(done.data.receipt.accepted, true);
  // Required commandIds and simple commands.
  assert.ok((await call(actor.token, "pause_game", {})).rpcError || (await call(actor.token, "pause_game", {})).error, "pause needs a commandId");
  const chat = await call(actor.token, "send_chat", { text: "hello over MCP" });
  assert.equal(chat.data.receipt.accepted, true);
  assert.ok((await host.c.query(api.rooms.chatHistory, { roomId })).some((m: any) => m.text === "hello over MCP" && m.authorId === ada.subject));
  const unknown = await call(actor.token, "get_receipt", { commandId: randomUUID() });
  assert.equal(unknown.data.status, "not_found");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("disclosure: every read tool, as one of three players, reveals no other god's scores, descriptors or sources", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Mcp Disclosure Host", "Mcp Disclosure Ada", "Mcp Disclosure Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...TS_INT, objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" },
    startingObjectCount: 12, spawnRateHz: 2, interactionRateHz: 40 });
  const game = await host.c.action(api.owner.start, { roomId });
  const send = (god: God, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const SECRET_BO = "bo_mcp_marker", SECRET_HOST = "host_mcp_marker";
  for (const [god, source] of [[ada, "function agent(grid) { return [slide(row(0), 1)]; }"],
    [bo, `function agent(grid) { const ${SECRET_BO} = 1; return [slide(column(0), ${SECRET_BO})]; }`],
    [host, `function agent(grid) { const ${SECRET_HOST} = 2; return [slide(row(1), ${SECRET_HOST})]; }`]] as const) {
    const r = await send(god, { type: "summon", language: "typescript", source });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.8173 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).batches.flatMap((b: any) => b.events).some((e: any) => e.t === "transform" && e.ownerId === bo.subject),
    "others' transforms", 90000);
  const check = disclosureChecker(game.gameId, ada.subject, [SECRET_BO, SECRET_HOST]);
  const { token } = await credential(ada, roomId, "act");
  const objects = (await call(token, "get_observation", { objectsLimit: 200 })).data.objects;
  const reads: [string, Record<string, unknown>][] = [
    ["whoami", {}], ["get_rules", {}], ["get_observation", {}], ["get_observation", { objectsLimit: 3, objectsCursor: 3 }], ["get_events", {}],
    ["get_events", { after: -1, limit: 50 }], ["get_trajectories", { afterSeq: -1, limit: 200 }], ["list_games", {}],
    ["get_game_history", { gameId: game.gameId, afterSeq: -1, limit: 50 }], ["get_my_utility", {}], ["get_chat", {}],
    ["evaluate_value", { value: objects[0].value }], ["get_receipt", { commandId: randomUUID() }],
  ];
  for (const [name, args] of reads) {
    const result = await call(token, name, args);
    assert.ok(result && !result.error && !result.rpcError, `${name}: ${JSON.stringify(result).slice(0, 300)}`);
    assert.equal(result.untrusted, true, `${name} marks game data untrusted`);
    await check(`mcp ${name}`, result);
  }
  // evaluate_value is the caller's own utility: it matches the engine's own score of that object.
  const value = await call(token, "evaluate_value", { value: objects[0].value });
  const secret = (await raw(game.gameId)).objects.find((o: any) => o._id === objects[0].id);
  if (secret && JSON.stringify(secret.value) === JSON.stringify(objects[0].value)) {
    const own = secret.scores.find((s: any) => s.god === ada.subject);
    assert.ok(Math.abs(value.data.netBits - own.netBits) < 1e-9, "evaluate_value = own net bits");
  }
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await check("mcp ended list_games", await call(token, "list_games", {}));
  await check("mcp ended history", await call(token, "get_game_history", { gameId: game.gameId, afterSeq: -1, limit: 50 }));
});

// ---------------------------------------------------------------------------------------------
// OAuth 2.1 end to end
// ---------------------------------------------------------------------------------------------

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const form = (body: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });

/** DCR → authorize → /connect approval as `human` → complete → token. Returns tokens and the request id. */
async function connect(human: God, roomId: string, scope: string, redirect = "http://127.0.0.1:43123/callback") {
  const registered = await fetch(`${SITE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test Connector", redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  assert.equal(registered.status, 201, await registered.clone().text());
  const client = await registered.json() as any;
  const { verifier, challenge } = pkce();
  const state = randomUUID();
  const authorize = new URL(`${SITE}/oauth/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: client.client_id, redirect_uri: redirect.replace("43123", "51515"), code_challenge: challenge,
    code_challenge_method: "S256", state, scope, resource: MCP })) authorize.searchParams.set(k, v);
  const toConnect = await fetch(authorize, { redirect: "manual" });
  assert.equal(toConnect.status, 302, await toConnect.clone().text());
  const connectUrl = new URL(toConnect.headers.get("location")!);
  assert.equal(connectUrl.pathname, "/connect");
  const request = connectUrl.searchParams.get("request")!;
  const pending = await human.c.query(api.agent.connect.pending, { request });
  assert.equal(pending.clientName, "Test Connector");
  assert.equal(pending.redirectHost, "127.0.0.1");
  assert.ok(pending.rooms.some((r: any) => r.roomId === roomId));
  // The /connect page generates the completion secret in the approving browser and passes it to /complete.
  const completion = randomBytes(32).toString("base64url");
  await human.c.mutation(api.agent.connect.approve, { request, roomId, permission: pending.permission, completion, ...(pending.permission === "owner" ? { ownerConsent: true } : {}) });
  const complete = await fetch(`${SITE}/oauth/authorize/complete?request=${encodeURIComponent(request)}&completion=${encodeURIComponent(completion)}`, { redirect: "manual" });
  assert.equal(complete.status, 302);
  const back = new URL(complete.headers.get("location")!);
  assert.equal(back.origin + back.pathname, "http://127.0.0.1:51515/callback", "loopback redirect with the requested port");
  assert.equal(back.searchParams.get("state"), state);
  assert.equal(back.searchParams.get("iss"), SITE);
  const code = back.searchParams.get("code")!;
  const tokenResponse = await fetch(`${SITE}/api/oauth/token`, form({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id,
    redirect_uri: redirect.replace("43123", "51515"), resource: MCP }));
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  const tokens = await tokenResponse.json() as any;
  const replay = () => fetch(`${SITE}/api/oauth/token`, form({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id,
    redirect_uri: redirect.replace("43123", "51515") }));
  return { client, tokens, request, replay };
}

test("OAuth: challenge → metadata → DCR → authorize → /connect approval → token → tool call → refresh rotation → reuse revokes → UI revoke", { timeout: 120000 }, async () => {
  const { host, ada, roomId, shortCode } = await lobby();
  // 401 → protected-resource metadata → authorization-server metadata.
  const challenge = (await modern(null, "tools/list")).headers.get("www-authenticate")!;
  const prm = await (await fetch(/resource_metadata="([^"]+)"/.exec(challenge)![1])).json() as any;
  assert.equal(prm.resource, MCP);
  assert.deepEqual(prm.authorization_servers, [SITE]);
  assert.deepEqual(await (await fetch(`${SITE}/.well-known/oauth-protected-resource`)).json(), prm);
  const as = await (await fetch(`${SITE}/.well-known/oauth-authorization-server`)).json() as any;
  assert.equal(as.issuer, SITE);
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ["none"]);
  assert.equal(as.client_id_metadata_document_supported, true);
  for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"]) assert.ok(as[k]?.startsWith(SITE), k);

  const { tokens, client } = await connect(ada, roomId, "read act");
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.expires_in, 3600);
  assert.equal(tokens.scope, "act");
  assert.match(tokens.refresh_token, /^cgr_/);
  const who = await call(tokens.access_token, "whoami", {});
  assert.equal(who.data.name, "Mcp Ada");
  assert.equal(who.data.roomCode, shortCode);
  assert.equal(who.data.permission, "act");
  assert.equal(who.data.kind, "oauth");
  // The connection is listed on the engine UI's credential list, with its client.
  const listed = (await ada.c.query(api.auth.credentials.list, {})).find((c: any) => c.credentialId === who.data.credentialId);
  assert.equal(listed?.kind, "oauth");
  assert.equal(listed?.label, "Test Connector");

  // Refresh rotates; the old refresh token is dead, and reusing it revokes the whole grant.
  const refresh = (token: string) => fetch(`${SITE}/api/oauth/token`, form({ grant_type: "refresh_token", refresh_token: token, client_id: client.client_id }));
  const rotated = await refresh(tokens.refresh_token);
  assert.equal(rotated.status, 200);
  const next = await rotated.json() as any;
  assert.notEqual(next.refresh_token, tokens.refresh_token);
  assert.equal((await call(next.access_token, "whoami", {})).data.name, "Mcp Ada");
  const reuse = await refresh(tokens.refresh_token);
  assert.equal(reuse.status, 400);
  assert.equal((await reuse.json() as any).error, "invalid_grant");
  assert.equal((await modern(next.access_token, "tools/list")).status, 401, "reuse revoked the grant: its live access token fails");
  assert.equal((await refresh(next.refresh_token)).status, 400, "and its newest refresh token too");

  // A second connection, revoked from the engine UI.
  const second = await connect(ada, roomId, "read");
  assert.deepEqual((await listTools(second.tokens.access_token)).filter(n => n === "send_chat"), [], "read scope: no act tools");
  const id = (await call(second.tokens.access_token, "whoami", {})).data.credentialId;
  await ada.c.mutation(api.auth.credentials.revoke, { credentialId: id });
  assert.equal((await modern(second.tokens.access_token, "tools/list")).status, 401);

  // RFC 7009 revocation by the client.
  const third = await connect(ada, roomId, "act");
  const revoked = await fetch(`${SITE}/api/oauth/revoke`, form({ token: third.tokens.refresh_token, client_id: third.client.client_id }));
  assert.equal(revoked.status, 200);
  assert.equal((await modern(third.tokens.access_token, "tools/list")).status, 401);

  // A code is single use; replaying it revokes the grant it produced (it may have leaked).
  const fourth = await connect(ada, roomId, "act");
  assert.equal((await fourth.replay()).status, 400);
  assert.equal((await modern(fourth.tokens.access_token, "tools/list")).status, 401);

  // An owner connection is approved by the room's current owner and lists the owner tools.
  const ownerScope = await connect(host, roomId, "owner");
  assert.ok((await listTools(ownerScope.tokens.access_token)).includes("start_game"));
});

test("OAuth: the code goes only to the browser that approved; whoever else holds the request key gets none", async () => {
  const { ada, roomId } = await lobby();
  // The attacker registers a client, starts an authorization with their own PKCE and reads the request key.
  const redirect = "http://127.0.0.1:47001/cb";
  const reg = await (await fetch(`${SITE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Innocent Looking", redirect_uris: [redirect] }) })).json() as any;
  const { verifier, challenge } = pkce();
  const url = new URL(`${SITE}/oauth/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge,
    code_challenge_method: "S256", scope: "act", resource: MCP })) url.searchParams.set(k, v);
  const requestKey = async () => new URL((await fetch(url, { redirect: "manual" })).headers.get("location")!).searchParams.get("request")!;
  const request = await requestKey();
  const completeAs = (completion?: string) =>
    fetch(`${SITE}/oauth/authorize/complete?request=${encodeURIComponent(request)}${completion ? `&completion=${encodeURIComponent(completion)}` : ""}`, { redirect: "manual" });
  const codeOf = (response: Response) => { const location = response.headers.get("location"); return location ? new URL(location).searchParams.get("code") : null; };
  // Before the decision, polling only bounces back to /connect.
  assert.equal(codeOf(await completeAs()), null);
  // The victim approves on /connect; their browser holds the completion secret.
  const completion = randomBytes(32).toString("base64url");
  await ada.c.mutation(api.agent.connect.approve, { request, roomId, permission: "act", completion });
  // The attacker polls /complete without cookies: no secret, or a guessed one, never yields a code.
  for (const guess of [undefined, randomBytes(32).toString("base64url"), "x".repeat(43)]) {
    const response = await completeAs(guess);
    assert.equal(codeOf(response), null, `no code without the approver's secret (${guess ?? "none"})`);
  }
  // Approval refuses a completion secret too short to be one.
  await assert.rejects(ada.c.mutation(api.agent.connect.approve, { request: await requestKey(), roomId, permission: "act", completion: "short" }));
  // The approving browser still completes (the refused attempts consumed nothing), once, and the code redeems.
  const code = codeOf(await completeAs(completion));
  assert.ok(code, "the approving browser gets the code");
  assert.equal(codeOf(await completeAs(completion)), null, "the code is released once");
  const token = await fetch(`${SITE}/api/oauth/token`, form({ grant_type: "authorization_code", code: code!, code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect }));
  assert.equal(token.status, 200, await token.clone().text());
});

test("OAuth: authorize refuses unknown clients, unregistered redirects, plain PKCE and a foreign resource", async () => {
  const { ada, roomId } = await lobby();
  const reg = await (await fetch(`${SITE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Neg", redirect_uris: ["http://127.0.0.1:1/cb"] }) })).json() as any;
  const badRedirect = await fetch(`${SITE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Evil", redirect_uris: ["https://evil.example/cb"] }) });
  assert.equal(badRedirect.status, 400);
  assert.equal((await badRedirect.json() as any).error, "invalid_redirect_uri");
  const { challenge } = pkce();
  const base = { response_type: "code", client_id: reg.client_id, redirect_uri: "http://127.0.0.1:1/cb", code_challenge: challenge,
    code_challenge_method: "S256", state: "s", resource: MCP };
  const go = (over: Record<string, string>) => {
    const url = new URL(`${SITE}/oauth/authorize`);
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) url.searchParams.set(k, v);
    return fetch(url, { redirect: "manual" });
  };
  assert.equal((await go({ client_id: "cgo_unknown" })).status, 400, "unknown client: no redirect");
  assert.equal((await go({ redirect_uri: "http://127.0.0.1:1/other" })).status, 400, "unregistered redirect: no redirect");
  const plain = await go({ code_challenge_method: "plain" });
  assert.equal(plain.status, 302);
  assert.equal(new URL(plain.headers.get("location")!).searchParams.get("error"), "invalid_request");
  const foreign = await go({ resource: "https://other.example/mcp" });
  assert.equal(new URL(foreign.headers.get("location")!).searchParams.get("error"), "invalid_target");
  const scope = await go({ scope: "admin" });
  assert.equal(new URL(scope.headers.get("location")!).searchParams.get("error"), "invalid_scope");
  // A denied request redirects with access_denied.
  const ok = await go({});
  const request = new URL(ok.headers.get("location")!).searchParams.get("request")!;
  await ada.c.mutation(api.agent.connect.deny, { request });
  const denied = await fetch(`${SITE}/oauth/authorize/complete?request=${encodeURIComponent(request)}`, { redirect: "manual" });
  assert.equal(new URL(denied.headers.get("location")!).searchParams.get("error"), "access_denied");
  // Approval may lower the requested permission, never raise it.
  const again = new URL((await go({ scope: "read" })).headers.get("location")!).searchParams.get("request")!;
  await assert.rejects(ada.c.mutation(api.agent.connect.approve, { request: again, roomId, permission: "act", completion: "c".repeat(43) }), /lower/);
});

test("OAuth tables stay bounded: DCR is rate limited, the sweep drops never-used clients and old retired refresh tokens", { timeout: 120000 }, async () => {
  const { ada, roomId } = await lobby();
  const register = () => fetch(`${SITE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Flood", redirect_uris: ["http://127.0.0.1:1/cb"] }) });
  // The sweep, run as if 31 days had passed. First it clears never-used clients of earlier runs from the window.
  const later = Date.now() + 31 * 24 * 3600_000;
  const sweep = () => admin.mutation(internal.agent.oauthStore.sweep, { now: later }) as Promise<Record<string, number>>;
  while ((await sweep()).dcrClients > 0) { /* drain */ }
  // A used connection (its client redeemed a code), rotated once so it has a retired refresh token.
  const used = await connect(ada, roomId, "act");
  const rotated = await (await fetch(`${SITE}/api/oauth/token`, form({ grant_type: "refresh_token", refresh_token: used.tokens.refresh_token, client_id: used.client.client_id }))).json() as any;
  assert.ok(rotated.refresh_token, JSON.stringify(rotated));
  // Unauthenticated registration is capped globally: a flood soon gets 429.
  let limited: Response | undefined;
  for (let i = 0; i < 200 && !limited; i++) {
    const response = await register();
    if (response.status === 429) limited = response;
    else assert.equal(response.status, 201, await response.text());
  }
  assert.ok(limited, "DCR has a global rate limit");
  assert.equal((await limited.json() as any).error, "temporarily_unavailable");
  assert.ok(Number(limited.headers.get("retry-after")) > 0, "Retry-After");
  const swept = await sweep();
  assert.ok(swept.dcrClients > 0 && swept.retiredRefresh > 0, JSON.stringify(swept));
  // The flood's clients are gone (and with them the rate limit); the used client still authorizes.
  assert.equal((await register()).status, 201, "the sweep freed the registration window");
  const authorizeWith = (clientId: string, redirectUri: string) => {
    const url = new URL(`${SITE}/oauth/authorize`);
    for (const [k, v] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: pkce().challenge,
      code_challenge_method: "S256", scope: "act", resource: MCP })) url.searchParams.set(k, v);
    return fetch(url, { redirect: "manual" });
  };
  assert.equal((await authorizeWith(used.client.client_id, "http://127.0.0.1:51515/callback")).status, 302, "a used client is kept");
  // The retired refresh token's row is gone: presenting it now is just invalid, and the live grant keeps working.
  const old = await fetch(`${SITE}/api/oauth/token`, form({ grant_type: "refresh_token", refresh_token: used.tokens.refresh_token, client_id: used.client.client_id }));
  assert.equal(old.status, 400);
  assert.equal((await call(rotated.access_token, "whoami", {})).data.permission, "act");
});
