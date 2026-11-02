/**
 * Player clients on foreign origins (docs/external-clients.md) against the LIVE local backend
 * (`pnpm --filter @workspace/engine test:mcp`, with `pnpm --filter @workspace/engine dev` running).
 *
 * A client "served" from https://xyz.replit.dev or http://localhost:5173 sends that Origin on every request, as a
 * browser would, and must get CORS answers it can read: no cookies, no Access-Control-Allow-Credentials. Each
 * one signs in (OAuth + PKCE with a room hint, or the device flow), subscribes over the WebSocket, acts, and is
 * revoked. The human's side (/connect, /device, the credential list) is the engine site's browser session,
 * impersonated as in every engine suite (game-helpers.ts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConvexClient } from "convex/browser";
import { api, envelope, gods, roomWith, SITE_ as SITE, touch, URL_, waitFor, type God } from "./game-helpers.ts";

const ORIGINS = ["https://xyz.replit.dev", "http://localhost:5173"];
const FOREIGN = ORIGINS[0];

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
/** A cross-origin request as the browser on `origin` sends it. */
const from = (origin: string, init: RequestInit = {}) => ({ ...init, headers: { ...(init.headers as Record<string, string> ?? {}), origin } });
const form = (body: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });

/** A browser can read this response from `origin`, and it carries no ambient credentials. */
function assertCors(response: Response, label: string) {
  assert.equal(response.headers.get("access-control-allow-origin"), "*", `${label}: Access-Control-Allow-Origin`);
  assert.equal(response.headers.get("access-control-allow-credentials"), null, `${label}: never Allow-Credentials`);
  assert.equal(response.headers.get("set-cookie"), null, `${label}: no cookies`);
}

async function lobby() {
  const [host, ada] = await gods("Ext Host", "Ext Ada");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada]);
  return { host, ada, roomId, shortCode };
}

/** Register (DCR), authorize with a room hint, and return the /connect request key plus what the client keeps. */
async function startOAuth(origin: string, redirectUri: string, room: string, scope = "act") {
  const registered = await fetch(`${SITE}/api/oauth/register`, from(origin, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Hello client", redirect_uris: [redirectUri] }) }));
  assert.equal(registered.status, 201, await registered.clone().text());
  assertCors(registered, "register");
  const client = await registered.json() as { client_id: string };
  const { verifier, challenge } = pkce();
  const state = randomUUID();
  const authorize = new URL(`${SITE}/oauth/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: client.client_id, redirect_uri: redirectUri, code_challenge: challenge,
    code_challenge_method: "S256", state, scope, resource: SITE, room })) authorize.searchParams.set(k, v);
  const toConnect = await fetch(authorize, { redirect: "manual" });
  assert.equal(toConnect.status, 302, await toConnect.clone().text());
  const connect = new URL(toConnect.headers.get("location")!);
  assert.equal(connect.pathname, "/connect");
  return { clientId: client.client_id, verifier, state, request: connect.searchParams.get("request")! };
}

/** The human approves on /connect, the browser completes, and the app (on `origin`) redeems its code. */
async function finishOAuth(human: God, origin: string, redirectUri: string, flow: Awaited<ReturnType<typeof startOAuth>>, roomId: string, permission: string) {
  const completion = randomBytes(32).toString("base64url");
  await human.c.mutation(api.agent.connect.approve, { request: flow.request, roomId, permission, completion, ...(permission === "owner" ? { ownerConsent: true } : {}) });
  const complete = await fetch(`${SITE}/oauth/authorize/complete?request=${encodeURIComponent(flow.request)}&completion=${encodeURIComponent(completion)}`, { redirect: "manual" });
  const back = new URL(complete.headers.get("location")!);
  assert.equal(back.origin + back.pathname, new URL(redirectUri).origin + new URL(redirectUri).pathname, "back to the app's own page");
  assert.equal(back.searchParams.get("state"), flow.state);
  const exchanged = await fetch(`${SITE}/api/oauth/token`, from(origin, form({ grant_type: "authorization_code", code: back.searchParams.get("code")!,
    code_verifier: flow.verifier, client_id: flow.clientId, redirect_uri: redirectUri, resource: SITE })));
  assert.equal(exchanged.status, 200, await exchanged.clone().text());
  assertCors(exchanged, "token");
  return await exchanged.json() as Record<string, any>;
}

test("CORS: every bearer endpoint answers any origin without credentials; the cookie session never does", async () => {
  for (const origin of ORIGINS) {
    for (const path of ["/api/device/request", "/api/device/poll", "/api/device/token", "/api/device/revoke", "/api/oauth/register", "/api/oauth/token",
      "/api/oauth/revoke", "/api/config", "/api/.well-known/jwks.json", "/.well-known/oauth-authorization-server"]) {
      const preflight = await fetch(`${SITE}${path}`, from(origin, { method: "OPTIONS",
        headers: { "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" } }));
      assert.equal(preflight.status, 204, `${path} preflight`);
      assertCors(preflight, `${path} preflight`);
      assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /authorization/i, `${path}: Authorization may be sent`);
    }
    assertCors(await fetch(`${SITE}/api/config`, from(origin)), "config");
    assertCors(await fetch(`${SITE}/api/.well-known/jwks.json`, from(origin)), "jwks");
    const refused = await fetch(`${SITE}/api/device/token`, from(origin, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    assert.equal(refused.status, 400);
    assertCors(refused, "an error is readable too");
    // Better Auth's cookie routes stay same-origin: a foreign page may not read the human's session.
    const session = await fetch(`${SITE}/api/auth/get-session`, from(origin));
    assert.notEqual(session.headers.get("access-control-allow-origin"), "*", "get-session");
    assert.notEqual(session.headers.get("access-control-allow-origin"), origin, "get-session");
  }
});

for (const origin of ORIGINS) {
  test(`a client on ${origin} signs in with OAuth, subscribes, acts, and is revoked`, { timeout: 120_000 }, async t => {
    const { host, ada, roomId, shortCode } = await lobby();
    const redirectUri = `${origin}/`;
    const flow = await startOAuth(origin, redirectUri, shortCode.toLowerCase(), "owner");
    const pending = await ada.c.query(api.agent.connect.pending, { request: flow.request });
    assert.deepEqual(pending.roomHint, { roomId, shortCode, isOwner: false, member: true }, "the room hint resolves, in any case");
    assert.equal(pending.redirectHost, new URL(origin).hostname);
    await assert.rejects(ada.c.mutation(api.agent.connect.approve, { request: flow.request, roomId, permission: "owner", completion: "c".repeat(43), ownerConsent: true }),
      /owner/, "a non-owner cannot grant owner");
    const tokens = await finishOAuth(ada, origin, redirectUri, flow, roomId, "act");
    assert.deepEqual({ scope: tokens.scope, room_id: tokens.room_id, room_code: tokens.room_code, token_type: tokens.token_type },
      { scope: "act", room_id: roomId, room_code: shortCode, token_type: "Bearer" });
    assert.match(tokens.refresh_token, /^cgr_/);

    // Realtime: the WebSocket client with the player JWT sees exactly Ada's projection.
    const convex = new ConvexClient(URL_);
    t.after(() => convex.close());
    let authOk: boolean | undefined;
    let token = tokens.access_token as string;
    convex.setAuth(async () => token, ok => { authOk = ok; });
    const seen: any[] = [], errors: Error[] = [];
    const stop = convex.onUpdate(api.player.observation, { roomId }, obs => seen.push(obs), e => errors.push(e));
    const first = await waitFor(async () => seen.at(-1), "first observation");
    assert.equal(first.roomId, roomId);
    assert.equal(first.self.godId, ada.subject, "acts as the human who approved");
    assert.equal(authOk, true);
    const mine = await ada.c.query(api.player.observation, { roomId });
    assert.deepEqual(Object.keys(first).sort(), Object.keys(mine).sort(), "the same projection as the human's own client");

    // Act: a public chat through the public action; the subscription sees it.
    const text = `hello from ${origin} ${randomUUID().slice(0, 6)}`;
    const result = await convex.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text }) });
    assert.equal(result.accepted, true, JSON.stringify(result));
    await waitFor(async () => seen.at(-1)?.chat?.some((m: any) => m.text === text && m.godId === ada.subject), "chat in the subscription");
    // One room, one permission: no owner action, no other room.
    const other = await roomWith([ada]);
    await assert.rejects(convex.query(api.player.observation, { roomId: other.roomId }), /different room|FORBIDDEN/);
    await assert.rejects(convex.mutation(api.rooms.endActiveGame, { roomId }), /owner|FORBIDDEN/);
    await assert.rejects(convex.query(api.auth.credentials.list, {}), /browser/, "no credential management from a player app");

    // Refresh: the token endpoint answers the foreign origin and rotates.
    const refreshed = await fetch(`${SITE}/api/oauth/token`, from(origin, form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: flow.clientId })));
    assert.equal(refreshed.status, 200);
    assertCors(refreshed, "refresh");
    const rotated = await refreshed.json() as Record<string, any>;
    assert.equal(rotated.room_code, shortCode);
    token = rotated.access_token;

    // Listed for the human, revoked there: the live subscription loses its data at once.
    const listed = await ada.c.query(api.auth.credentials.list, {}) as any[];
    const row = listed.find(c => c.kind === "oauth" && c.label === "Hello client" && c.roomId === roomId);
    assert.ok(row, "listed under the human's player apps");
    assert.equal(row.credentialId, tokens.credential_id);
    await ada.c.mutation(api.auth.credentials.revoke, { credentialId: row.credentialId });
    await waitFor(async () => errors.length > 0, "the subscription fails once revoked");
    assert.match(errors[0].message, /UNAUTHENTICATED|revoked|sign in|reconnect/i);
    await assert.rejects(convex.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "after revoke" }) }));
    const dead = await fetch(`${SITE}/api/oauth/token`, from(origin, form({ grant_type: "refresh_token", refresh_token: rotated.refresh_token, client_id: flow.clientId })));
    assert.equal(dead.status, 400, "a revoked connection cannot refresh");
    stop();
    assert.ok(!(await host.c.query(api.rooms.get, { room: roomId })).chat.some((m: any) => m.text === "after revoke"));
  });
}

test("an account grant: the app acts as its human in every room, never on the consent surface or MCP", { timeout: 120_000 }, async t => {
  const { host, ada, roomId, shortCode } = await lobby();
  const redirectUri = `${FOREIGN}/`;
  const flow = await startOAuth(FOREIGN, redirectUri, shortCode, "account");
  const pending = await ada.c.query(api.agent.connect.pending, { request: flow.request });
  assert.equal(pending.permission, "account");
  assert.equal(pending.roomHint, null, "an account grant names no room: the hint is dropped");
  // Catches: an MCP client minting an account grant /mcp would then refuse.
  const mcpAsk = new URL(`${SITE}/oauth/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: flow.clientId, redirect_uri: redirectUri, code_challenge: "x".repeat(43),
    code_challenge_method: "S256", state: "s", scope: "account", resource: `${SITE}/mcp` })) mcpAsk.searchParams.set(k, v);
  const refused = await fetch(mcpAsk, { redirect: "manual" });
  assert.equal(new URL(refused.headers.get("location")!).searchParams.get("error"), "invalid_scope");
  const completion = randomBytes(32).toString("base64url");
  // Catches: an account grant approved without explicit consent, or turned into a room grant (or the reverse).
  await assert.rejects(ada.c.mutation(api.agent.connect.approve, { request: flow.request, permission: "account", completion }), /consent/i);
  await assert.rejects(ada.c.mutation(api.agent.connect.approve, { request: flow.request, roomId, permission: "act", completion }), /every room/);
  const roomFlow = await startOAuth(FOREIGN, redirectUri, shortCode, "act");
  await assert.rejects(ada.c.mutation(api.agent.connect.approve, { request: roomFlow.request, permission: "account", completion, accountConsent: true }), /every room/);

  await ada.c.mutation(api.agent.connect.approve, { request: flow.request, permission: "account", completion, accountConsent: true });
  const complete = await fetch(`${SITE}/oauth/authorize/complete?request=${encodeURIComponent(flow.request)}&completion=${encodeURIComponent(completion)}`, { redirect: "manual" });
  const back = new URL(complete.headers.get("location")!);
  const exchanged = await fetch(`${SITE}/api/oauth/token`, from(FOREIGN, form({ grant_type: "authorization_code", code: back.searchParams.get("code")!,
    code_verifier: flow.verifier, client_id: flow.clientId, redirect_uri: redirectUri, resource: SITE })));
  assert.equal(exchanged.status, 200, await exchanged.clone().text());
  const tokens = await exchanged.json() as Record<string, any>;
  assert.deepEqual([tokens.scope, tokens.room_id, tokens.room_code], ["account", null, null]);

  const convex = new ConvexClient(URL_);
  t.after(() => convex.close());
  let token = tokens.access_token as string;
  convex.setAuth(async () => token);
  // Ada, everywhere: her rooms, a new room, joining another, playing in any of them.
  assert.ok((await convex.query(api.rooms.list, {})).some((r: any) => r.id === roomId), "lists the human's rooms");
  const created = await convex.mutation(api.rooms.create, {});
  const [cara] = await gods("Ext Cara");
  const elsewhere = await cara.c.mutation(api.rooms.create, {});
  await convex.mutation(api.rooms.join, { room: elsewhere.shortCode });
  assert.equal((await convex.query(api.player.observation, { roomId: elsewhere.roomId })).self.godId, ada.subject);
  assert.equal((await convex.query(api.player.observation, { roomId: created.roomId })).self.godId, ada.subject);
  await convex.mutation(api.rooms.setSpectator, { roomId: created.roomId, spectator: false });   // her own room: owner rights
  await assert.rejects(convex.mutation(api.rooms.endActiveGame, { roomId }), /owner/i, "still not the owner of a room she does not own");
  // Catches: the consent surface or admin reachable from an app.
  await assert.rejects(convex.query(api.auth.credentials.list, {}), /browser/);
  await assert.rejects(convex.mutation(api.auth.credentials.revoke, { credentialId: tokens.credential_id }), /browser/);
  const another = await startOAuth(FOREIGN, redirectUri, shortCode, "act");
  await assert.rejects(convex.mutation(api.agent.connect.approve, { request: another.request, roomId, permission: "act", completion: "d".repeat(43) }), /browser/);
  assert.equal((await convex.query(api.auth.user.me, {}))?.isAdmin, false);
  // Catches: an account token accepted by MCP (agents act per room).
  const mcp = await fetch(`${SITE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert.equal(mcp.status, 401);

  // Refresh rotates; revoked by the human, it stops at once and cannot refresh.
  const refreshed = await fetch(`${SITE}/api/oauth/token`, from(FOREIGN, form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: flow.clientId })));
  assert.equal(refreshed.status, 200);
  const rotated = await refreshed.json() as Record<string, any>;
  assert.equal(rotated.scope, "account");
  token = rotated.access_token;
  const row = (await ada.c.query(api.auth.credentials.list, {}) as any[]).find(c => c.credentialId === tokens.credential_id);
  assert.deepEqual([row.permission, row.roomId, row.roomCode], ["account", null, null]);
  await ada.c.mutation(api.auth.credentials.revoke, { credentialId: row.credentialId });
  await assert.rejects(convex.query(api.rooms.list, {}), /UNAUTHENTICATED|sign in|reconnect/i);
  const dead = await fetch(`${SITE}/api/oauth/token`, from(FOREIGN, form({ grant_type: "refresh_token", refresh_token: rotated.refresh_token, client_id: flow.clientId })));
  assert.equal(dead.status, 400);
  void host;
});

test("a client on a foreign origin uses the device flow (iframes, CLIs) and revokes itself", { timeout: 60_000 }, async t => {
  const { ada, roomId, shortCode } = await lobby();
  const post = (path: string, body: unknown) => fetch(`${SITE}${path}`, from(FOREIGN, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const { verifier, challenge } = pkce();
  const requested = await post("/api/device/request", { room: shortCode, permission: "read", label: "Hello client (iframe)", challenge });
  assert.equal(requested.status, 200);
  assertCors(requested, "device/request");
  const device = await requested.json() as Record<string, any>;
  await ada.c.mutation(api.auth.device.approve, { userCode: device.userCode });
  const claimed = await post("/api/device/poll", { deviceId: device.deviceId, deviceSecret: device.deviceSecret, verifier });
  assertCors(claimed, "device/poll");
  const { credential } = await claimed.json() as { credential: string };
  const exchanged = await fetch(`${SITE}/api/device/token`, from(FOREIGN, { method: "POST", headers: { authorization: `Bearer ${credential}` } }));
  assert.equal(exchanged.status, 200);
  assertCors(exchanged, "device/token");
  const { token } = await exchanged.json() as { token: string };
  const convex = new ConvexClient(URL_);
  t.after(() => convex.close());
  convex.setAuth(async () => token);
  assert.equal((await convex.query(api.player.observation, { roomId })).self.godId, ada.subject);
  const chat = await convex.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "read-only?" }) }).catch((e: Error) => e);
  assert.ok(chat instanceof Error && /Read-only|FORBIDDEN/.test(chat.message), "a read grant cannot act");
  const revoked = await post("/api/device/revoke", { credential });
  assert.equal(revoked.status, 200);
  assertCors(revoked, "device/revoke");
  await assert.rejects(convex.query(api.player.observation, { roomId, at: 1 }), /UNAUTHENTICATED|sign in|reconnect/i);
});

test("a room hint the engine does not know asks the human to choose a room", async () => {
  const [newcomer] = await gods("Ext Newcomer");
  const unknown = await startOAuth(FOREIGN, `${FOREIGN}/`, "NOSUCHROOM", "act");
  const none = await newcomer.c.query(api.agent.connect.pending, { request: unknown.request });
  assert.deepEqual({ roomHint: none.roomHint, roomHintUnknown: none.roomHintUnknown }, { roomHint: null, roomHintUnknown: true });
});
