/**
 * Auth, device approval, credentials, JWKS and static hosting against the LIVE local backend.
 * Run with: pnpm --filter @workspace/engine test:auth   (scripts/test-auth.mjs starts everything)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createLocalJWKSet, jwtVerify } from "jose";
import {
  SITE, OIDC, POLL_GAP_MS, admin, authorize, browserJwt, browserToken, callback, client, decodeJwt, deviceRequest,
  errorCode, login, poll, post, rawSetCookies, setCookies, sleep, startLogin,
} from "./helpers.ts";

const fixtures = admin();
const newRoom = async (ownerId: string) => {
  const shortCode = randomBytes(4).toString("hex").toUpperCase();
  const roomId = await fixtures.mutation("auth/testing:createRoom", { shortCode, ownerId }) as string;
  return { roomId, shortCode };
};

test("a device request names its room the way the rest of the engine does: any case, O for 0, L for 1, dashes, or the GUID", async () => {
  const shortCode = `Q0${randomBytes(2).toString("hex").toUpperCase()}1`, guid = crypto.randomUUID();
  const roomId = await fixtures.mutation("auth/testing:createRoom", { shortCode, ownerId: "test-alice", guid }) as string;
  const challenge = "x".repeat(43);
  for (const room of [shortCode.toLowerCase().replace("0", "o").replace(/1$/, "l"), `${shortCode.slice(0, 3)}-${shortCode.slice(3)}`, guid]) {
    const result = await post("/api/device/request", { room, challenge });
    assert.equal(result.status, 200, `room reference ${room}: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.roomId, roomId);
  }
});

/** Approve a request as `session`'s human and claim the credential. */
async function grant(jwt: string, room: string, permission: string, label = "Test assistant") {
  const request = await deviceRequest(room, permission, label);
  await client(jwt).mutation("auth/device:approve", { userCode: request.userCode, ...(permission === "owner" ? { ownerConsent: true } : {}) });
  const claimed = await poll(request);
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  return claimed.body as { credential: string; credentialId: string; roomId: string; permission: string; expiresAt: number };
}
async function playerJwt(credential: string) {
  const result = await post("/api/device/token", { credential });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.token as string;
}

// ---------------------------------------------------------------------------------------------
test("browser login: fake OIDC → cookie → JWT → requireViewer with the full verified name", async () => {
  const { session, location, response } = await login("alice", "/rooms/ABC?x=1");
  assert.equal(location, "/rooms/ABC?x=1");
  const raw = rawSetCookies(response).find(c => c.startsWith("cg_session="))!;
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);
  assert.doesNotMatch(raw, /Secure/, "plain-http loopback site: Secure is omitted only here");
  assert.ok(rawSetCookies(response).some(c => c.startsWith("cg_oidc=;")), "flow cookie cleared");

  const tokenResponse = await browserToken(session);
  assert.equal(tokenResponse.status, 200);
  assert.equal(tokenResponse.headers.get("cache-control"), "no-store");
  const { token, expiresAt } = await tokenResponse.json() as { token: string; expiresAt: number };
  const { header, payload } = decodeJwt(token);
  assert.equal(header.alg, "RS256");
  assert.equal(payload.sub, "test-alice");
  assert.equal(payload.scope, "browser");
  assert.equal(payload.iss, SITE);
  assert.equal(payload.aud, "code-gods");
  assert.equal((payload.exp as number) - (payload.iat as number), 600);
  assert.ok(Math.abs(expiresAt - (payload.exp as number) * 1000) < 1000);

  const viewer = await client(token).query("auth/testing:probe", {}) as Record<string, unknown>;
  assert.equal(viewer.name, "Alice Liddell");
  assert.equal(viewer.subject, "test-alice");
  assert.equal(viewer.scope, "browser");
  assert.equal(viewer.isAdmin, false);
  assert.deepEqual(await client(token).query("auth/user:me"), { subject: "test-alice", name: "Alice Liddell", scope: "browser", isAdmin: false });
  assert.equal(await client().query("auth/user:me"), null);
  assert.equal(await errorCode(client().query("auth/testing:probe", {})), "UNAUTHENTICATED");

  const user = await fetch(`${SITE}/api/auth/user`, { headers: { cookie: `cg_session=${session}` } });
  assert.deepEqual(await user.json(), { user: { id: "test-alice", name: "Alice Liddell", isAdmin: false } });
  assert.deepEqual(await (await fetch(`${SITE}/api/auth/user`)).json(), { user: null });
});

test("admin needs a verified allowlisted email from the configured issuer", async () => {
  const adminJwt = await browserJwt((await login("admin")).session);
  assert.equal((await client(adminJwt).query("auth/user:me") as { isAdmin: boolean }).isAdmin, true);
  const unverified = await browserJwt((await login("unverified")).session);
  assert.equal((await client(unverified).query("auth/user:me") as { isAdmin: boolean }).isAdmin, false);
});

test("token endpoint: exact same origin and a live session are required", async () => {
  const { session } = await login("alice");
  assert.equal((await browserToken(session, null)).status, 403, "no Origin");
  assert.equal((await browserToken(session, "http://evil.example")).status, 403, "foreign Origin");
  assert.equal((await browserToken(session, `${SITE}.evil.example`)).status, 403, "prefix trick");
  assert.equal((await browserToken("A".repeat(43))).status, 401, "unknown session");
  const noCookie = await fetch(`${SITE}/api/auth/token`, { method: "POST", headers: { origin: SITE } });
  assert.equal(noCookie.status, 401);
});

test("logout ends the session at once, even for an unexpired browser JWT", async () => {
  const { session } = await login("carol");
  const jwt = await browserJwt(session);
  assert.equal((await client(jwt).query("auth/testing:probe", {}) as { name: string }).name, "Carol Nguyen");
  const out = await fetch(`${SITE}/api/logout`, { redirect: "manual", headers: { cookie: `cg_session=${session}` } });
  assert.equal(out.status, 302);
  assert.equal(out.headers.get("location"), "/");
  assert.equal(setCookies(out).cg_session, "");
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", {})), "UNAUTHENTICATED");
  assert.equal((await browserToken(session)).status, 401);
});

test("login rejects a bad state, nonce, PKCE, signature, audience, issuer, expiry, missing or replayed flow", async () => {
  const expectRejected = async (label: string, response: Response) => {
    assert.equal(response.status, 400, label);
    assert.equal(setCookies(response).cg_session, undefined, `${label}: no session`);
    const body = await response.text();
    assert.doesNotMatch(body, /verifier|nonce=|code=|state=/i, `${label}: no secrets echoed`);
  };
  {
    const { authorize: url, flowCookie } = await startLogin();
    const back = await authorize(url, "alice");
    back.searchParams.set("state", "forged-state");
    await expectRejected("bad state", await callback(back, flowCookie));
    back.searchParams.set("state", url.searchParams.get("state")!);
    await expectRejected("flow is single use after a failure", await callback(back, flowCookie));
  }
  for (const tamper of ["nonce", "sig", "aud", "iss", "exp"]) {
    const { authorize: url, flowCookie } = await startLogin();
    await expectRejected(`tampered ${tamper}`, await callback(await authorize(url, "alice", { tamper }), flowCookie));
  }
  {
    const { authorize: url, flowCookie } = await startLogin();
    url.searchParams.set("code_challenge", "A".repeat(43)); // provider will expect a different verifier
    await expectRejected("bad PKCE", await callback(await authorize(url, "alice"), flowCookie));
  }
  {
    const { authorize: url } = await startLogin();
    await expectRejected("no flow cookie", await callback(await authorize(url, "alice"), undefined));
  }
  {
    const { authorize: url, flowCookie } = await startLogin();
    const back = await authorize(url, "alice");
    assert.equal((await callback(back, flowCookie)).status, 302);
    await expectRejected("replayed callback", await callback(back, flowCookie));
  }
  {
    // Another flow's cookie cannot complete this flow's code.
    const first = await startLogin(), second = await startLogin();
    await expectRejected("cross-flow", await callback(await authorize(first.authorize, "alice"), second.flowCookie));
  }
  const login = await startLogin();
  assert.equal(login.authorize.origin, OIDC);
  for (const key of ["state", "nonce", "code_challenge"]) assert.ok(login.authorize.searchParams.get(key)!.length >= 43, key);
  assert.equal(login.authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(login.authorize.searchParams.get("redirect_uri"), `${SITE}/api/callback`);
});

/** Set (or with undefined, remove) an environment variable on the local test deployment. */
function deploymentEnv(name: string, value: string | undefined) {
  const args = value === undefined ? ["convex", "env", "remove", name] : ["convex", "env", "set", name];
  const result = spawnSync("npx", args, { input: value, stdio: ["pipe", "ignore", "inherit"], env: process.env });
  assert.equal(result.status, 0, `convex env ${args[2]} ${name}`);
}

test("a relay callback on the engine Repl's domain (Replit accepts no other) completes the login", async () => {
  // Replit's OIDC only redirects to the client Repl's own domains, so a page there forwards code and state
  // to /api/callback. The login and the token exchange must both name that relay URL.
  const relay = "https://code-gods-engine.example/convex-callback";
  deploymentEnv("REPLIT_OIDC_REDIRECT_URI", relay);
  try {
    const { authorize: url, flowCookie } = await startLogin();
    assert.equal(url.searchParams.get("redirect_uri"), relay);
    const back = await authorize(url, "alice");
    assert.equal(back.origin + back.pathname, relay, "the provider returns to the relay");
    const forwarded = new URL(`${SITE}/api/callback${back.search}`);
    const done = await callback(forwarded, flowCookie);
    assert.equal(done.status, 302, await done.text());
    assert.ok(setCookies(done).cg_session, "signed in");
  } finally { deploymentEnv("REPLIT_OIDC_REDIRECT_URI", undefined); }
});

test("unsafe returnTo values are neutralised to /", async () => {
  for (const returnTo of ["//evil.example/x", "https://evil.example/", "/\\evil.example", "javascript:alert(1)", "/ok\r\nSet-Cookie: x=1", "evil"]) {
    assert.equal((await login("alice", returnTo)).location, "/", returnTo);
  }
  assert.equal((await login("alice", "/device?code=ABCD-EFGH")).location, "/device?code=ABCD-EFGH");
});

// ---------------------------------------------------------------------------------------------
test("device flow end to end, with wrong proofs, slow-down, replay, expiry and denial", async () => {
  const alice = await browserJwt((await login("alice")).session);
  const bob = await browserJwt((await login("bob")).session);
  const room = await newRoom("test-alice");

  // Bounded, validated inputs.
  const { challenge } = { challenge: "x".repeat(43) };
  assert.equal((await post("/api/device/request", { room: room.shortCode, challenge: "short" })).status, 400);
  assert.equal((await post("/api/device/request", { room: room.shortCode, challenge, permission: "admin" })).status, 400);
  assert.equal((await post("/api/device/request", { room: room.shortCode, challenge, label: "x".repeat(121) })).status, 400);
  assert.equal((await post("/api/device/request", { room: room.shortCode, challenge, label: "bad\u0007label" })).status, 400);
  assert.equal((await post("/api/device/request", { room: "NOPE0000", challenge })).status, 404);
  const huge = await fetch(`${SITE}/api/device/request`, { method: "POST", body: JSON.stringify({ pad: "x".repeat(20_000) }) });
  assert.equal(huge.status, 400);

  const request = await deviceRequest(room.shortCode.toLowerCase(), "act", "Replit Agent (self-reported)");
  assert.deepEqual(Object.keys(request).sort(), ["deviceId", "deviceSecret", "expiresIn", "interval", "label", "permission", "roomCode", "roomId",
    "userCode", "verificationUri", "verificationUrl", "verifier"].sort());
  assert.equal(request.roomId, room.roomId);
  assert.equal(request.expiresIn, 300);
  assert.equal(request.interval, 2);
  assert.match(request.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(request.verificationUrl, `${SITE}/device?code=${request.userCode}`);

  assert.equal((await poll(request)).status, 202, "pending");
  assert.equal((await poll(request)).status, 429, "polling faster than the interval is throttled");

  // Only members of the room see or decide it; it must come from a browser.
  assert.equal(await client(bob).query("auth/device:pending", { userCode: request.userCode }), null);
  assert.equal(await errorCode(client(bob).mutation("auth/device:approve", { userCode: request.userCode })), "FORBIDDEN");
  assert.equal(await errorCode(client().query("auth/device:pending", { userCode: request.userCode })), "UNAUTHENTICATED");
  const details = await client(alice).query("auth/device:pending", { userCode: request.userCode.toLowerCase().replace("-", "") }) as Record<string, unknown>;
  assert.deepEqual({ ...details, expiresAt: typeof details.expiresAt }, {
    roomId: room.roomId, roomCode: room.shortCode, permission: "act", label: "Replit Agent (self-reported)", expiresAt: "number",
    userCode: request.userCode, status: "pending", isRoomOwner: true, ownerConsentRequired: false, canApprove: true,
  });

  assert.deepEqual(await client(alice).mutation("auth/device:approve", { userCode: request.userCode }), { status: "approved" });
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode })), "INVALID", "decided once");
  assert.equal(await errorCode(client(alice).mutation("auth/device:deny", { userCode: request.userCode })), "INVALID");

  await sleep(POLL_GAP_MS);
  const wrongVerifier = await poll(request, { verifier: "v".repeat(43) });
  assert.deepEqual(wrongVerifier, { status: 400, body: { status: "invalid" } });
  const wrongSecret = await poll(request, { deviceSecret: "cgd_wrong" });
  assert.deepEqual(wrongSecret, { status: 400, body: { status: "invalid" } });
  assert.doesNotMatch(JSON.stringify([wrongVerifier, wrongSecret]), /cgd_|cgc_/, "no secrets in errors");

  const claimed = await poll(request);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.status, "approved");
  assert.match(claimed.body.credential, /^cgc_[A-Za-z0-9_-]{43}$/);
  assert.equal(claimed.body.roomId, room.roomId);
  assert.equal(claimed.body.permission, "act");
  assert.ok(Math.abs(claimed.body.expiresAt - (Date.now() + 7 * 86400_000)) < 60_000, "7-day default");
  await sleep(POLL_GAP_MS);
  assert.deepEqual(await poll(request), { status: 400, body: { status: "invalid" } }, "single use: replay fails");

  const exchanged = await post("/api/device/token", { credential: claimed.body.credential });
  assert.equal(exchanged.status, 200);
  const { payload } = decodeJwt(exchanged.body.token);
  assert.deepEqual({ sub: payload.sub, scope: payload.scope, cred: payload.cred, room: payload.room, perm: payload.perm },
    { sub: "test-alice", scope: "player", cred: claimed.body.credentialId, room: room.roomId, perm: "act" });
  assert.equal((payload.exp as number) - (payload.iat as number), 600);
  const viaHeader = await post("/api/device/token", {}, { authorization: `Bearer ${claimed.body.credential}` });
  assert.equal(viaHeader.status, 200);
  const viewer = await client(exchanged.body.token).query("auth/testing:probe", {}) as Record<string, unknown>;
  assert.deepEqual(viewer, {
    subject: "test-alice", name: "Alice Liddell", scope: "player", roomId: room.roomId, permission: "act",
    credentialId: claimed.body.credentialId, label: "Replit Agent (self-reported)", isAdmin: false,
  });
  assert.equal((await post("/api/device/token", { credential: "cgc_" + "A".repeat(43) })).status, 401);
  assert.equal((await post("/api/device/token", { credential: "nope" })).status, 400);

  // Expiry: neither approval nor claim works after five minutes.
  const late = await deviceRequest(room.shortCode, "read");
  await fixtures.mutation("auth/testing:expireDevice", { userCode: late.userCode });
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: late.userCode })), "INVALID");
  assert.equal((await client(alice).query("auth/device:pending", { userCode: late.userCode }) as { status: string }).status, "expired");
  assert.deepEqual(await poll(late), { status: 410, body: { status: "expired" } });

  // Denial.
  const denied = await deviceRequest(room.shortCode, "read");
  assert.deepEqual(await client(alice).mutation("auth/device:deny", { userCode: denied.userCode }), { status: "denied" });
  assert.deepEqual(await poll(denied), { status: 403, body: { status: "denied" } });

  // Repeated bad proofs kill the request.
  const guessed = await deviceRequest(room.shortCode, "read");
  for (let i = 0; i < 5; i++) await poll(guessed, { verifier: `${i}`.repeat(43) });
  await client(alice).mutation("auth/device:approve", { userCode: guessed.userCode }).catch(() => undefined);
  assert.deepEqual(await poll(guessed), { status: 403, body: { status: "denied" } });
});

test("permissions are enforced through requireRoomPermission; read/act never reach owner", async () => {
  const alice = await browserJwt((await login("alice")).session);
  const room = await newRoom("test-alice"), other = await newRoom("test-alice");
  const read = await playerJwt((await grant(alice, room.shortCode, "read")).credential);
  const act = await playerJwt((await grant(alice, room.roomId, "act")).credential);
  const probe = (jwt: string, roomId: string, need: string) => errorCode(client(jwt).query("auth/testing:probe", { roomId, need }));

  assert.equal(await probe(read, room.roomId, "read"), "no error");
  assert.equal(await probe(read, room.roomId, "act"), "FORBIDDEN");
  assert.equal(await probe(read, room.roomId, "owner"), "FORBIDDEN");
  assert.equal(await probe(act, room.roomId, "act"), "no error");
  assert.equal(await probe(act, room.roomId, "owner"), "FORBIDDEN");
  assert.equal(await probe(act, other.roomId, "read"), "FORBIDDEN", "room-bound");
  assert.equal(await probe(alice, other.roomId, "owner"), "no error", "browser scope passes (game checks membership)");

  // A player credential is not a browser: no approvals, no credential management.
  const nested = await deviceRequest(room.shortCode, "owner");
  assert.equal(await errorCode(client(act).mutation("auth/device:approve", { userCode: nested.userCode, ownerConsent: true })), "FORBIDDEN");
  assert.equal(await errorCode(client(act).query("auth/device:pending", { userCode: nested.userCode })), "FORBIDDEN");
  assert.equal(await errorCode(client(act).query("auth/credentials:list")), "FORBIDDEN");
});

test("revocation is immediate: the next call fails although the JWT is still valid", async () => {
  const alice = await browserJwt((await login("alice")).session);
  const bob = await browserJwt((await login("bob")).session);
  const room = await newRoom("test-alice");
  const granted = await grant(alice, room.shortCode, "act", "Revocable assistant");
  const jwt = await playerJwt(granted.credential);
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", { roomId: room.roomId, need: "act" })), "no error");

  const listed = await client(alice).query("auth/credentials:list") as Array<Record<string, unknown>>;
  const mine = listed.find(c => c.credentialId === granted.credentialId)!;
  assert.deepEqual({ ...mine, createdAt: typeof mine.createdAt, expiresAt: typeof mine.expiresAt, lastUsedAt: typeof mine.lastUsedAt }, {
    credentialId: granted.credentialId, roomId: room.roomId, roomCode: room.shortCode, permission: "act", kind: "device", label: "Revocable assistant",
    createdAt: "number", expiresAt: "number", lastUsedAt: "number",
  });
  assert.ok(!JSON.stringify(listed).includes("cgc_"), "no credential secrets listed");
  assert.equal((await client(bob).query("auth/credentials:list") as unknown[]).some(c => (c as { credentialId: string }).credentialId === granted.credentialId), false);
  assert.equal(await errorCode(client(bob).mutation("auth/credentials:revoke", { credentialId: granted.credentialId })), "NOT_FOUND");
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", {})), "no error", "bob's attempt changed nothing");

  assert.deepEqual(await client(alice).mutation("auth/credentials:revoke", { credentialId: granted.credentialId }), { status: "revoked" });
  assert.ok(decodeJwt(jwt).payload.exp as number > Date.now() / 1000 + 60, "JWT itself still unexpired");
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", {})), "UNAUTHENTICATED");
  assert.equal(await client(jwt).query("auth/user:me"), null);
  assert.equal((await post("/api/device/token", { credential: granted.credential })).status, 401);
  assert.equal((await client(alice).query("auth/credentials:list") as Array<{ credentialId: string }>).some(c => c.credentialId === granted.credentialId), false);

  // The credential can revoke itself (`player disconnect`).
  const self = await grant(alice, room.shortCode, "read");
  const selfJwt = await playerJwt(self.credential);
  assert.deepEqual(await post("/api/device/revoke", { credential: self.credential }), { status: 200, body: { status: "revoked" } });
  assert.equal(await errorCode(client(selfJwt).query("auth/testing:probe", {})), "UNAUTHENTICATED");
  assert.equal((await post("/api/device/revoke", { credential: self.credential })).status, 401);
  assert.equal(await errorCode(client(alice).query("auth/testing:probe", {})), "no error", "the browser session is unaffected");
});

test("an owner grant needs explicit consent from the room's CURRENT owner, re-checked at claim", async () => {
  const alice = await browserJwt((await login("alice")).session);
  const bob = await browserJwt((await login("bob")).session);
  const room = await newRoom("test-alice");

  const request = await deviceRequest(room.shortCode, "owner", "Owner assistant");
  const seen = await client(alice).query("auth/device:pending", { userCode: request.userCode }) as Record<string, unknown>;
  assert.equal(seen.ownerConsentRequired, true);
  assert.equal(seen.canApprove, true);
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode })), "OWNER_CONSENT_REQUIRED");
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode, ownerConsent: false })), "OWNER_CONSENT_REQUIRED");

  // Ownership moves to bob: alice can no longer decide; bob (the current owner) can.
  await fixtures.mutation("auth/testing:setRoomOwner", { roomId: room.roomId, ownerId: "test-bob" });
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode, ownerConsent: true })), "FORBIDDEN");
  assert.equal(await errorCode(client(bob).mutation("auth/device:approve", { userCode: request.userCode, ownerConsent: true })), "no error");
  const claimed = await poll(request);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.permission, "owner");
  const ownerJwt = await playerJwt(claimed.body.credential);
  assert.equal(decodeJwt(ownerJwt).payload.sub, "test-bob", "the grant acts as the approving human");
  assert.equal(await errorCode(client(ownerJwt).query("auth/testing:probe", { roomId: room.roomId, need: "owner" })), "no error");

  // Approved while owner, but ownership changed before the claim: no credential is issued.
  const changed = await deviceRequest(room.shortCode, "owner");
  await client(bob).mutation("auth/device:approve", { userCode: changed.userCode, ownerConsent: true });
  await fixtures.mutation("auth/testing:setRoomOwner", { roomId: room.roomId, ownerId: "test-alice" });
  const refused = await poll(changed);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.status, "forbidden");
  assert.equal(refused.body.credential, undefined);
});

// ---------------------------------------------------------------------------------------------
test("JWKS verifies the minted JWTs", async () => {
  const response = await fetch(`${SITE}/api/.well-known/jwks.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /application\/json/);
  const jwks = await response.json() as { keys: Array<Record<string, string>> };
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kty, "RSA");
  assert.ok(!("d" in jwks.keys[0]), "no private parameters");
  const token = await browserJwt((await login("alice")).session);
  assert.equal(decodeJwt(token).header.kid, jwks.keys[0].kid);
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks as never), { issuer: SITE, audience: "code-gods" });
  assert.equal(payload.sub, "test-alice");
});

test("health, /api 404s and both static sites with SPA fallback and asset caching", async () => {
  const health = await fetch(`${SITE}/api/health`);
  const healthBody = await health.json() as { ok: boolean; version: string };
  assert.equal(healthBody.ok, true);
  assert.equal(typeof healthBody.version, "string");
  const missing = await fetch(`${SITE}/api/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Not found" });

  const page = async (path: string) => {
    const response = await fetch(`${SITE}${path}`);
    return { status: response.status, type: response.headers.get("content-type") ?? "", cache: response.headers.get("cache-control") ?? "", body: await response.text() };
  };
  for (const path of ["/", "/rooms/ABCD", "/device"]) {
    const result = await page(path);
    assert.equal(result.status, 200, path);
    assert.match(result.type, /text\/html/, path);
    assert.match(result.body, /id="engine-fixture"|<div id="root"|<html/i, path);
    assert.doesNotMatch(result.body, /player-fixture/, path);
  }
  for (const path of ["/player/", "/player", "/player/rooms/ABCD"]) {
    const result = await page(path);
    assert.equal(result.status, 200, path);
    assert.match(result.type, /text\/html/, path);
    assert.doesNotMatch(result.body, /engine-fixture/, path);
  }
  const engineIndex = (await page("/")).body;
  const playerIndex = (await page("/player/")).body;
  const engineAsset = engineIndex.match(/src="(\/assets\/[^"]+\.js)"/)![1];
  const playerAsset = playerIndex.match(/src="(\/player\/assets\/[^"]+\.js)"/)![1];
  for (const asset of [engineAsset, playerAsset]) {
    const result = await page(asset);
    assert.equal(result.status, 200, asset);
    assert.match(result.type, /javascript/, asset);
    assert.equal(result.cache, "public, max-age=31536000, immutable", asset);
  }
  assert.match((await page("/")).cache, /max-age=0, must-revalidate/);
  assert.equal((await page("/assets/missing-abc123.js")).status, 404);
});
