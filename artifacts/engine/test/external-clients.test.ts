/**
 * Player clients on foreign origins (docs/external-clients.md) against the LIVE local backend
 * (`pnpm --filter @workspace/engine test:mcp`, with `pnpm --filter @workspace/engine dev` running).
 *
 * A client "served" from https://xyz.replit.dev or http://localhost:5173 sends that Origin on every request, as a
 * browser would, and must get CORS answers it can read: no cookies, no Access-Control-Allow-Credentials. Each
 * one signs in (OAuth + PKCE with a room hint, or the device flow), subscribes over the WebSocket, acts, and is
 * revoked. The human's side (/connect, /device, the credential list) is the engine UI's browser session,
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
    assert.equal(pending.firstParty, false);
    assert.equal(pending.autoApprove, null, "a foreign origin is always the human's decision");
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

test("first-party approval: only the engine's own origin, only for a member, at most act; joining stays the human's click", async () => {
  const { host, roomId, shortCode } = await lobby();
  const [newcomer] = await gods("Ext Newcomer");
  const hosted = `${SITE}/client/`;

  const own = await startOAuth(SITE, hosted, shortCode, "owner");
  const asOwner = await host.c.query(api.agent.connect.pending, { request: own.request });
  assert.equal(asOwner.firstParty, true);
  assert.equal(asOwner.autoApprove, null, "an owner grant always needs the owner's consent");

  const joining = await startOAuth(SITE, hosted, shortCode, "owner");
  const before = await newcomer.c.query(api.agent.connect.pending, { request: joining.request });
  assert.deepEqual({ member: before.roomHint.member, autoApprove: before.autoApprove }, { member: false, autoApprove: null }, "not in the room: no silent approval");
  await newcomer.c.mutation(api.rooms.join, { room: shortCode });
  const after = await newcomer.c.query(api.agent.connect.pending, { request: joining.request });
  assert.equal(after.autoApprove, "act", "a non-owner's owner request is lowered to act");
  const tokens = await finishOAuth(newcomer, SITE, hosted, joining, roomId, after.autoApprove);
  assert.equal(tokens.scope, "act");

  const foreign = await startOAuth(FOREIGN, `${FOREIGN}/`, shortCode, "act");
  assert.equal((await newcomer.c.query(api.agent.connect.pending, { request: foreign.request })).autoApprove, null);
  const lookalike = await startOAuth(FOREIGN, `${SITE.replace("127.0.0.1", "127.0.0.1.nip.io")}/client/`.replace("http://", "https://"), shortCode, "act");
  assert.equal((await newcomer.c.query(api.agent.connect.pending, { request: lookalike.request })).autoApprove, null, "a look-alike host is not the site");

  const otherPage = await startOAuth(SITE, `${SITE}/connect`, shortCode, "act");
  assert.equal((await newcomer.c.query(api.agent.connect.pending, { request: otherPage.request })).autoApprove, null, "another page of the site is not the hosted client");

  const unknown = await startOAuth(FOREIGN, `${FOREIGN}/`, "NOSUCHROOM", "act");
  const none = await newcomer.c.query(api.agent.connect.pending, { request: unknown.request });
  assert.deepEqual({ roomHint: none.roomHint, roomHintUnknown: none.roomHintUnknown }, { roomHint: null, roomHintUnknown: true });
});
