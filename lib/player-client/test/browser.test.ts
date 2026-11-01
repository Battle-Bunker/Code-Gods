/**
 * The browser SDK (src/browser.ts) without an engine: a scripted stand-in for the engine's HTTP API, a Map-backed
 * Storage and a fake clock. What would break: the PKCE pair or state not checked, a session stored under the wrong
 * room, two tabs refreshing with one rotating refresh token (the engine then revokes the connection), a dead
 * connection retried forever instead of reported, or a secret left in the URL after the redirect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPlayerAuth, PlayerAuthError, type PlayerSession } from "../src/browser.ts";

const ENGINE = "https://dep.convex.site";
const APP = "https://xyz.replit.dev/";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; }, clear: () => map.clear(), key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); },
  };
}

type Call = { url: URL; method: string; body: Record<string, string>; headers: Headers };
/** A stand-in engine: DCR, authorize (not fetched: the browser navigates), token (code + refresh), revoke, device. */
function fakeEngine() {
  const calls: Call[] = [];
  const state = { clients: new Map<string, string>(), exchanges: 0, registrations: 0, refreshes: 0, refreshDelayMs: 0, refreshValid: new Set<string>(["cgr_1"]), revoked: false, deviceStatus: "pending" as string, challenge: "" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const text = typeof init.body === "string" ? init.body : "";
    const headers = new Headers(init.headers);
    const body = headers.get("content-type")?.includes("json") ? JSON.parse(text || "{}") : Object.fromEntries(new URLSearchParams(text));
    calls.push({ url, method: init.method ?? "GET", body, headers });
    const tokens = (n: number) => ({ access_token: `jwt_${n}`, token_type: "Bearer", expires_in: 3600, refresh_token: `cgr_${n}`, scope: "act",
      room_id: "room_1", room_code: "ABCD1234", credential_id: `cred_${state.exchanges}` });
    switch (url.pathname) {
      case "/api/config": return json({ convexUrl: "https://dep.convex.cloud", siteUrl: ENGINE, version: "x" });
      case "/api/oauth/register": {
        // Like the engine: the same metadata gets the same client back.
        const meta = JSON.stringify([(body as any).client_name, (body as any).redirect_uris]);
        if (!state.clients.has(meta)) state.clients.set(meta, `cgo_${state.clients.size + 1}`);
        state.registrations++;
        return json({ client_id: state.clients.get(meta), redirect_uris: (body as any).redirect_uris }, 201);
      }
      case "/api/oauth/token":
        if (body.grant_type === "authorization_code") {
          const challenge = createHash("sha256").update(body.code_verifier).digest("base64url");
          if (body.code !== "the-code" || challenge !== state.challenge) return json({ error: "invalid_grant" }, 400);
          state.exchanges++;
          return json(tokens(1));
        }
        if (state.refreshDelayMs) await new Promise(r => setTimeout(r, state.refreshDelayMs));
        if (state.revoked || !state.refreshValid.has(body.refresh_token)) { state.revoked = true; return json({ error: "invalid_grant" }, 400); }
        state.refreshValid.delete(body.refresh_token);
        state.refreshes++;
        state.refreshValid.add(`cgr_${state.refreshes + 1}`);
        return json(tokens(state.refreshes + 1));
      case "/api/oauth/revoke": state.revoked = true; return json({});
      case "/api/device/request": state.challenge = (body as any).challenge;
        return json({ deviceId: "dev_1", deviceSecret: "cgd_secret", userCode: "ABCD-EFGH", verificationUrl: `${ENGINE}/device?code=ABCD-EFGH`,
          roomId: "room_1", roomCode: "ABCD1234", permission: "read", label: "x", expiresIn: 300, interval: 2 });
      case "/api/device/poll":
        if (createHash("sha256").update((body as any).verifier).digest("base64url") !== state.challenge) return json({ status: "invalid" }, 400);
        if (state.deviceStatus === "pending") return json({ status: "pending" }, 202);
        if (state.deviceStatus === "denied") return json({ status: "denied" }, 403);
        return json({ status: "approved", credential: "cgc_" + "C".repeat(43), credentialId: "cred_2", roomId: "room_1", permission: "read", expiresAt: 9e15 });
      case "/api/device/token":
        if (state.revoked) return json({ error: "revoked" }, 401);
        return json({ token: `devjwt_${calls.length}`, expiresAt: Date.now() + 600_000, roomId: "room_1", permission: "read", credentialId: "cred_2", credentialExpiresAt: 9e15 });
      case "/api/device/revoke": state.revoked = true; return json({ status: "revoked" });
    }
    return json({ error: "not found" }, 404);
  };
  return { calls, state, fetch: fetcher as typeof fetch };
}

function setup(over: Partial<Parameters<typeof createPlayerAuth>[0]> = {}) {
  const engine = fakeEngine();
  const storage = memoryStorage();
  let assigned: string | undefined;
  const auth = createPlayerAuth({ engineUrl: `${ENGINE}/`, clientName: "Hello client", redirectUri: APP, storage, fetch: engine.fetch,
    navigate: url => { assigned = url; }, ...over });
  return { engine, storage, auth, assigned: () => assigned };
}

/** Follow the redirect the SDK started: record the challenge the engine would store and come back with a code. */
async function signIn(s: ReturnType<typeof setup>, room = "abcd1234") {
  await s.auth.signInWithRedirect({ room, permission: "owner", returnTo: "/rooms/ABCD1234?tab=chat" });
  const url = new URL(s.assigned()!);
  s.engine.state.challenge = url.searchParams.get("code_challenge")!;
  const back = new URL(APP);
  back.searchParams.set("code", "the-code");
  back.searchParams.set("state", url.searchParams.get("state")!);
  back.searchParams.set("iss", ENGINE);
  return { authorize: url, back: back.toString() };
}

test("redirect sign-in: one registration per browser, PKCE S256, the state and room hint, a session per room", async () => {
  const s = setup();
  const { authorize, back } = await signIn(s);
  assert.equal(authorize.origin + authorize.pathname, `${ENGINE}/oauth/authorize`);
  const q = Object.fromEntries(authorize.searchParams);
  assert.deepEqual({ ...q, state: typeof q.state, code_challenge: q.code_challenge.length }, {
    response_type: "code", client_id: "cgo_1", redirect_uri: APP, code_challenge: 43, code_challenge_method: "S256",
    state: "string", scope: "owner", resource: ENGINE, room: "abcd1234",
  });
  const done = await s.auth.completeSignIn(back);
  assert.ok(done);
  assert.equal(done.returnTo, "/rooms/ABCD1234?tab=chat", "the page the human started from");
  const session = done.session;
  assert.deepEqual({ ...session, expiresAt: typeof session.expiresAt }, {
    kind: "oauth", engineUrl: ENGINE, convexUrl: "https://dep.convex.cloud", clientId: "cgo_1", roomId: "room_1", roomCode: "ABCD1234",
    permission: "act", credentialId: "cred_1", accessToken: "jwt_1", refreshToken: "cgr_1", expiresAt: "number",
  });
  const exchange = s.engine.calls.find(c => c.url.pathname === "/api/oauth/token")!;
  assert.equal(exchange.body.redirect_uri, APP);
  assert.equal(exchange.headers.get("content-type"), "application/x-www-form-urlencoded");
  for (const ref of ["ABCD1234", "abcd-1234", "room_1"]) assert.equal(s.auth.session(ref)?.credentialId, "cred_1", ref);
  assert.equal(s.auth.session("OTHER999"), null, "another room has no session");
  assert.equal(await s.auth.completeSignIn(back), null, "a state is used once");

  // Every sign-in registers (the engine dedupes), so a client the engine forgot is registered again.
  await s.auth.signInWithRedirect({ room: "OTHER999" });
  assert.equal(new URL(s.assigned()!).searchParams.get("client_id"), "cgo_1", "the same client for the same metadata");
  assert.equal(s.engine.state.registrations, 2);
  s.engine.state.clients.clear();   // the engine swept it, or was reset
  await s.auth.signInWithRedirect({ room: "OTHER999" });
  assert.equal(new URL(s.assigned()!).searchParams.get("client_id"), "cgo_1", "registered again, never a stale id");
  // A new redirect URI (the app moved) is another client.
  const moved = createPlayerAuth({ engineUrl: ENGINE, clientName: "Hello client", redirectUri: "https://abc.replit.dev/", storage: s.storage, fetch: s.engine.fetch, navigate: url => { s.engine.calls.push({ url: new URL(url), method: "NAV", body: {}, headers: new Headers() }); } });
  await moved.signInWithRedirect({ room: "X" });
  assert.equal(s.engine.calls.at(-1)!.url.searchParams.get("client_id"), "cgo_2");
});

test("a custom domain: the resource and issuer are the engine's public site URL from /api/config", async () => {
  const engine = fakeEngine();
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname === "/api/config") return new Response(JSON.stringify({ convexUrl: "https://dep.convex.cloud", siteUrl: "https://play.example" }), { status: 200 });
    return engine.fetch(input, init);
  }) as typeof fetch;
  let assigned = "";
  const auth = createPlayerAuth({ engineUrl: ENGINE, clientName: "x", redirectUri: APP, storage: memoryStorage(), fetch: fetcher, navigate: u => { assigned = u; } });
  await auth.signInWithRedirect({ room: "ABCD1234" });
  const url = new URL(assigned);
  assert.equal(url.searchParams.get("resource"), "https://play.example");
  engine.state.challenge = url.searchParams.get("code_challenge")!;
  const back = new URL(APP);
  for (const [k, v] of Object.entries({ code: "the-code", state: url.searchParams.get("state")!, iss: "https://play.example" })) back.searchParams.set(k, v);
  assert.ok(await auth.completeSignIn(back.toString()), "the public site is an accepted issuer");
});

test("completeSignIn refuses a forged state, an error answer and a wrong issuer, and strips the code from the URL", async () => {
  const s = setup();
  const { back } = await signIn(s);
  const forged = new URL(back); forged.searchParams.set("state", "forged");
  await assert.rejects(s.auth.completeSignIn(forged.toString()), (e: PlayerAuthError) => e.code === "STATE_MISMATCH");
  const wrongIss = new URL(back); wrongIss.searchParams.set("iss", "https://evil.example");
  await assert.rejects(s.auth.completeSignIn(wrongIss.toString()), (e: PlayerAuthError) => e.code === "STATE_MISMATCH");
  const denied = new URL(APP); denied.searchParams.set("error", "access_denied"); denied.searchParams.set("state", new URL(back).searchParams.get("state")!);
  await assert.rejects(s.auth.completeSignIn(denied.toString()), (e: PlayerAuthError) => e.code === "DENIED");
  assert.equal(await s.auth.completeSignIn(APP), null, "nothing to complete");
  assert.equal(s.auth.cleanUrl(`${APP}?code=x&state=y&iss=z&room=AB`), `${APP}?room=AB`);
});

test("fetchToken: cached until a minute before expiry, refreshed once across tabs, and null for a dead connection", async () => {
  let now = 1_000_000;
  const s = setup({ now: () => now });
  const { session } = (await s.auth.completeSignIn((await signIn(s)).back))!;
  const fetchToken = s.auth.fetchToken(session);
  assert.equal(await fetchToken({ forceRefreshToken: false }), "jwt_1");
  assert.equal(s.engine.state.refreshes, 0, "a fresh token is not refreshed");
  now += 3600_000 - 30_000;
  // Two tabs (two SDK instances over one storage) refresh at once: one rotation, both get the new token.
  const other = createPlayerAuth({ engineUrl: ENGINE, clientName: "Hello client", redirectUri: APP, storage: s.storage, fetch: s.engine.fetch, now: () => now, navigate: () => {} });
  s.engine.state.refreshDelayMs = 20;
  const [a, b] = await Promise.all([fetchToken({ forceRefreshToken: false }), other.fetchToken(session)({ forceRefreshToken: false })]);
  assert.equal(s.engine.state.refreshes, 1, "one refresh: a second use of the old refresh token would revoke the connection");
  assert.equal(a, "jwt_2");
  assert.equal(b, "jwt_2");
  assert.equal(s.auth.session("ABCD1234")?.refreshToken, "cgr_2", "the rotated token is stored");
  // Convex asks for a forced refresh after the server rejected the token.
  assert.equal(await fetchToken({ forceRefreshToken: true }), "jwt_3");
  // Revoked on the engine UI: the refresh fails, the session is dropped, null tells Convex the auth is lost.
  s.engine.state.revoked = true;
  const changes: Array<PlayerSession | null> = [];
  s.auth.onChange(room => changes.push(s.auth.session(room)));
  assert.equal(await fetchToken({ forceRefreshToken: true }), null);
  assert.equal(s.auth.session("ABCD1234"), null);
  assert.deepEqual(changes, [null]);
});

test("a new connection for a room (an owner upgrade) revokes the one it replaces, so none is left orphaned", async () => {
  const s = setup();
  const first = (await s.auth.completeSignIn((await signIn(s)).back))!.session;
  const second = (await s.auth.completeSignIn((await signIn(s)).back))!.session;
  assert.equal(second.credentialId, "cred_2");
  assert.equal(s.auth.session("ABCD1234")?.credentialId, "cred_2", "the new connection is the room's");
  await new Promise(r => setTimeout(r, 0));
  const revoke = s.engine.calls.find(c => c.url.pathname === "/api/oauth/revoke");
  assert.deepEqual(revoke?.body, { token: first.refreshToken, client_id: "cgo_1" }, "the replaced connection is revoked on the engine");
});

test("signOut revokes the connection and forgets it", async () => {
  const s = setup();
  const { session } = (await s.auth.completeSignIn((await signIn(s)).back))!;
  await s.auth.signOut(session);
  const revoke = s.engine.calls.find(c => c.url.pathname === "/api/oauth/revoke")!;
  assert.deepEqual(revoke.body, { token: "cgr_1", client_id: "cgo_1" });
  assert.equal(s.auth.session("ABCD1234"), null);
});

test("device sign-in (for iframes): PKCE, polling at the interval, a stored credential exchanged for short JWTs", async () => {
  const sleeps: number[] = [];
  const s = setup({ sleep: async ms => { sleeps.push(ms); if (sleeps.length === 2) s.engine.state.deviceStatus = "approved"; } });
  const pending = await s.auth.signInWithDevice({ room: "ABCD1234", permission: "read", label: "Hello client (iframe)" });
  assert.deepEqual({ userCode: pending.userCode, verificationUrl: pending.verificationUrl }, { userCode: "ABCD-EFGH", verificationUrl: `${ENGINE}/device?code=ABCD-EFGH` });
  assert.equal(s.engine.calls.find(c => c.url.pathname === "/api/device/request")!.body.label, "Hello client (iframe)");
  const session = await pending.session;
  assert.deepEqual(sleeps, [2000, 2000, 2000].slice(0, sleeps.length));
  assert.deepEqual({ kind: session.kind, roomCode: session.roomCode, permission: session.permission }, { kind: "device", roomCode: "ABCD1234", permission: "read" });
  assert.match(await s.auth.fetchToken(session)({ forceRefreshToken: false }) ?? "", /^devjwt_/);
  await s.auth.signOut(session);
  assert.equal(s.engine.calls.find(c => c.url.pathname === "/api/device/revoke")!.headers.get("authorization"), `Bearer cgc_${"C".repeat(43)}`);

  const refused = setup({ sleep: async () => { refused.engine.state.deviceStatus = "denied"; } });
  const denied = await refused.auth.signInWithDevice({ room: "ABCD1234" });
  await assert.rejects(denied.session, (e: PlayerAuthError) => e.code === "DENIED");
});

test("the engine URL must be https, or http on loopback; a .convex.cloud URL maps to its site", () => {
  assert.throws(() => createPlayerAuth({ engineUrl: "http://dep.example", clientName: "x" }), (e: PlayerAuthError) => e.code === "BAD_ENGINE_URL");
  assert.equal(createPlayerAuth({ engineUrl: "https://dep.convex.cloud/", clientName: "x", storage: memoryStorage() }).engineUrl, "https://dep.convex.site");
  assert.equal(createPlayerAuth({ engineUrl: "http://127.0.0.1:3211", clientName: "x", storage: memoryStorage() }).engineUrl, "http://127.0.0.1:3211");
});
