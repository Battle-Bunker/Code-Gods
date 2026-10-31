/**
 * Auth, device approval, credentials, JWKS and static hosting against the LIVE local backend.
 * Run with: pnpm --filter @workspace/engine test:auth   (scripts/test-auth.mjs starts everything)
 *
 * Humans sign in with Better Auth (convex/auth/betterAuth.ts). Production offers Google only; these tests use
 * the generic OAuth provider "fake" (scripts/fake-oidc.mjs), which exists only while test fixtures are on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";
import {
  SITE, OIDC, POLL_GAP_MS, SESSION_COOKIE, admin, authorize, browserJwt, browserToken, callback, client, decodeJwt, deviceRequest,
  errorCode, login, poll, post, rawSetCookies, signInRequest, sleep, startLogin,
} from "./helpers.ts";

const fixtures = admin();
const newRoom = async (ownerId: string) => {
  const shortCode = randomBytes(4).toString("hex").toUpperCase();
  const roomId = await fixtures.mutation("auth/testing:createRoom", { shortCode, ownerId }) as string;
  return { roomId, shortCode };
};

test("a device request names its room the way the rest of the engine does: any case, O for 0, L for 1, dashes, or the GUID", async () => {
  const shortCode = `Q0${randomBytes(2).toString("hex").toUpperCase()}1`, guid = crypto.randomUUID();
  const roomId = await fixtures.mutation("auth/testing:createRoom", { shortCode, ownerId: "someone", guid }) as string;
  const challenge = "x".repeat(43);
  for (const room of [shortCode.toLowerCase().replace("0", "o").replace(/1$/, "l"), `${shortCode.slice(0, 3)}-${shortCode.slice(3)}`, guid]) {
    const result = await post("/api/device/request", { room, challenge });
    assert.equal(result.status, 200, `room reference ${room}: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.roomId, roomId);
  }
});

/** Approve a request as `jwt`'s human and claim the credential. */
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

/** Set (or with undefined, remove) an environment variable on the local test deployment. */
function deploymentEnv(name: string, value: string | undefined) {
  const args = value === undefined ? ["convex", "env", "remove", name] : ["convex", "env", "set", name];
  const result = spawnSync("npx", args, { input: value, stdio: ["pipe", "ignore", "inherit"], env: process.env });
  assert.equal(result.status, 0, `convex env ${args[2]} ${name}`);
}

// ---------------------------------------------------------------------------------------------
test("browser sign-in: fake provider → Better Auth session cookie → Convex JWT → requireViewer with the full name", async () => {
  const first = await login("alice", "/rooms/ABC?x=1");
  assert.equal(first.location, "/rooms/ABC?x=1");
  const raw = rawSetCookies(first.response).find(c => c.startsWith(`${SESSION_COOKIE}=`))!;
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Lax/i);
  assert.doesNotMatch(raw, /Secure/, "plain-http loopback site: Secure is omitted only here");
  assert.match(raw, /Max-Age=86400/, "24-hour browser sessions");

  const { header, payload } = decodeJwt(first.jwt);
  assert.equal(header.alg, "RS256");
  assert.equal(payload.iss, SITE, "Better Auth's issuer is the site itself");
  assert.equal(payload.aud, "convex");
  assert.equal((payload.exp as number) - (payload.iat as number), 600);
  assert.equal(typeof payload.sessionId, "string");
  assert.doesNotMatch(String(payload.sub), /^test-/, "the god id is the Better Auth user id, not the provider's sub");

  const viewer = await client(first.jwt).query("auth/testing:probe", {}) as Record<string, unknown>;
  assert.deepEqual(viewer, { subject: first.subject, name: "Alice Liddell", scope: "browser", isAdmin: false });
  assert.deepEqual(await client(first.jwt).query("auth/user:me"), { subject: first.subject, name: "Alice Liddell", scope: "browser", isAdmin: false });
  assert.equal(await client().query("auth/user:me"), null);
  assert.equal(await errorCode(client().query("auth/testing:probe", {})), "UNAUTHENTICATED");

  const user = await fixtures.query("auth/testing:userRow", { subject: first.subject }) as Record<string, unknown>;
  assert.deepEqual(user, { subject: first.subject, name: "Alice Liddell", email: "alice@example.test", emailVerified: true, provider: "fake" });
  assert.equal((await login("alice")).subject, first.subject, "signing in again is the same god");
  assert.notEqual((await login("bob")).subject, first.subject);
});

test("admin needs a verified allowlisted email", async () => {
  assert.equal((await client((await login("admin")).jwt).query("auth/user:me") as { isAdmin: boolean }).isAdmin, true);
  // "unverified" has an allowlisted email (dev.mjs) that the provider does not vouch for.
  assert.equal((await client((await login("unverified")).jwt).query("auth/user:me") as { isAdmin: boolean }).isAdmin, false);
});

test("sign-out ends the session at once, even for an unexpired browser JWT", async () => {
  const { session, jwt } = await login("carol");
  assert.equal((await client(jwt).query("auth/testing:probe", {}) as { name: string }).name, "Carol Nguyen");
  const out = await fetch(`${SITE}/api/auth/sign-out`, { method: "POST", headers: { cookie: session, origin: SITE, "content-type": "application/json" }, body: "{}" });
  assert.equal(out.status, 200, await out.clone().text());
  assert.ok(decodeJwt(jwt).payload.exp as number > Date.now() / 1000 + 60, "JWT itself still unexpired");
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", {})), "UNAUTHENTICATED");
  assert.equal(await client(jwt).query("auth/user:me"), null);
  assert.equal((await browserToken(session)).status, 401, "no new JWTs for the old cookie");
});

test("an expired session stops an unexpired browser JWT at once", async () => {
  const { session, jwt } = await login("carol");
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", {})), "no error");
  await fixtures.mutation("auth/testing:expireSession", { sessionId: decodeJwt(jwt).payload.sessionId as string });
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", {})), "UNAUTHENTICATED");
  assert.equal((await browserToken(session)).status, 401, "no new JWTs for an expired session");
});

test("browser and player JWTs are both accepted and told apart by issuer", async () => {
  const alice = await login("alice");
  const room = await newRoom(alice.subject);
  const player = await playerJwt((await grant(alice.jwt, room.shortCode, "read")).credential);
  const p = decodeJwt(player).payload;
  assert.deepEqual({ iss: p.iss, aud: p.aud, sub: p.sub }, { iss: `${SITE}/api/device`, aud: "code-gods", sub: alice.subject });
  assert.equal(decodeJwt(alice.jwt).payload.iss, SITE);
  assert.equal((await client(player).query("auth/testing:probe", {}) as { scope: string }).scope, "player");
  assert.equal((await client(alice.jwt).query("auth/testing:probe", {}) as { scope: string }).scope, "browser");
});

test("Google: sign-in sends the browser to accounts.google.com with our callback and account chooser", async () => {
  const response = await signInRequest("/api/auth/sign-in/social", { provider: "google", callbackURL: "/" });
  assert.equal(response.status, 200, await response.clone().text());
  const url = new URL((await response.json() as { url: string }).url);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("redirect_uri"), `${SITE}/api/auth/callback/google`);
  assert.equal(url.searchParams.get("client_id"), "local-google-client-id.apps.googleusercontent.com");
  assert.equal(url.searchParams.get("prompt"), "select_account");
  assert.deepEqual(url.searchParams.get("scope")!.split(" ").sort(), ["email", "openid", "profile"]);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("state")!.length >= 16);
});

test("a callback with a forged state is refused and opens no session", async () => {
  const { authorize: url, jar } = await startLogin();
  assert.equal(url.origin, OIDC);
  const back = await authorize(url, "alice");
  back.searchParams.set("state", "forged-state");
  const response = await callback(back, jar);
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location")!, /error/);
  assert.equal(jar.jar[SESSION_COOKIE], undefined, "no session");
});

test("sign-in refuses a callback URL on another origin", async () => {
  const response = await signInRequest("/api/auth/sign-in/oauth2", { providerId: "fake", callbackURL: "https://evil.example/" });
  assert.equal(response.status, 403, await response.clone().text());
});

test("the fake provider does not exist once test fixtures are off", async () => {
  deploymentEnv("CODE_GODS_TEST_FIXTURES", undefined);
  try {
    const response = await signInRequest("/api/auth/sign-in/oauth2", { providerId: "fake", callbackURL: "/" });
    assert.equal(response.status, 404, `fixtures off: the generic OAuth endpoint is not even mounted (${await response.clone().text()})`);
    const callback = await fetch(`${SITE}/api/auth/oauth2/callback/fake?code=x&state=y`, { redirect: "manual" });
    assert.equal(callback.status, 404, "nor its callback");
  } finally { deploymentEnv("CODE_GODS_TEST_FIXTURES", "1"); }
  await startLogin(); // and back on
});

// ---------------------------------------------------------------------------------------------
test("device flow end to end, with wrong proofs, slow-down, replay, expiry and denial", async () => {
  const A = await login("alice"), alice = A.jwt;
  const B = await login("bob"), bob = B.jwt;
  const room = await newRoom(A.subject);

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
    { sub: A.subject, scope: "player", cred: claimed.body.credentialId, room: room.roomId, perm: "act" });
  assert.equal((payload.exp as number) - (payload.iat as number), 600);
  const viaHeader = await post("/api/device/token", {}, { authorization: `Bearer ${claimed.body.credential}` });
  assert.equal(viaHeader.status, 200);
  const viewer = await client(exchanged.body.token).query("auth/testing:probe", {}) as Record<string, unknown>;
  assert.deepEqual(viewer, {
    subject: A.subject, name: "Alice Liddell", scope: "player", roomId: room.roomId, permission: "act",
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
  const A = await login("alice"), alice = A.jwt;
  const room = await newRoom(A.subject), other = await newRoom(A.subject);
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
  const A = await login("alice"), alice = A.jwt;
  const B = await login("bob"), bob = B.jwt;
  const room = await newRoom(A.subject);
  const granted = await grant(alice, room.shortCode, "act", "Revocable assistant");
  const jwt = await playerJwt(granted.credential);
  assert.equal(await errorCode(client(jwt).query("auth/testing:probe", { roomId: room.roomId, need: "act" })), "no error");

  const listed = await client(alice).query("auth/credentials:list") as Array<Record<string, unknown>>;
  const mine = listed.find(c => c.credentialId === granted.credentialId)!;
  assert.deepEqual({ ...mine, createdAt: typeof mine.createdAt, expiresAt: typeof mine.expiresAt, lastUsedAt: typeof mine.lastUsedAt }, {
    credentialId: granted.credentialId, roomId: room.roomId, roomCode: room.shortCode, permission: "act", label: "Revocable assistant",
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
  const A = await login("alice"), alice = A.jwt;
  const B = await login("bob"), bob = B.jwt;
  const room = await newRoom(A.subject);

  const request = await deviceRequest(room.shortCode, "owner", "Owner assistant");
  const seen = await client(alice).query("auth/device:pending", { userCode: request.userCode }) as Record<string, unknown>;
  assert.equal(seen.ownerConsentRequired, true);
  assert.equal(seen.canApprove, true);
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode })), "OWNER_CONSENT_REQUIRED");
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode, ownerConsent: false })), "OWNER_CONSENT_REQUIRED");

  // Ownership moves to bob: alice can no longer decide; bob (the current owner) can.
  await fixtures.mutation("auth/testing:setRoomOwner", { roomId: room.roomId, ownerId: B.subject });
  assert.equal(await errorCode(client(alice).mutation("auth/device:approve", { userCode: request.userCode, ownerConsent: true })), "FORBIDDEN");
  assert.equal(await errorCode(client(bob).mutation("auth/device:approve", { userCode: request.userCode, ownerConsent: true })), "no error");
  const claimed = await poll(request);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.permission, "owner");
  const ownerJwt = await playerJwt(claimed.body.credential);
  assert.equal(decodeJwt(ownerJwt).payload.sub, B.subject, "the grant acts as the approving human");
  assert.equal(await errorCode(client(ownerJwt).query("auth/testing:probe", { roomId: room.roomId, need: "owner" })), "no error");

  // Approved while owner, but ownership changed before the claim: no credential is issued.
  const changed = await deviceRequest(room.shortCode, "owner");
  await client(bob).mutation("auth/device:approve", { userCode: changed.userCode, ownerConsent: true });
  await fixtures.mutation("auth/testing:setRoomOwner", { roomId: room.roomId, ownerId: A.subject });
  const refused = await poll(changed);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.status, "forbidden");
  assert.equal(refused.body.credential, undefined);
});

// ---------------------------------------------------------------------------------------------
test("JWKS verify both kinds of JWT", async () => {
  const response = await fetch(`${SITE}/api/.well-known/jwks.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /application\/json/);
  const jwks = await response.json() as { keys: Array<Record<string, string>> };
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kty, "RSA");
  assert.ok(!("d" in jwks.keys[0]), "no private parameters");
  const alice = await login("alice");
  const room = await newRoom(alice.subject);
  const player = await playerJwt((await grant(alice.jwt, room.shortCode, "read")).credential);
  assert.equal(decodeJwt(player).header.kid, jwks.keys[0].kid);
  const verified = await jwtVerify(player, createLocalJWKSet(jwks as never), { issuer: `${SITE}/api/device`, audience: "code-gods" });
  assert.equal(verified.payload.sub, alice.subject);

  const browser = await jwtVerify(alice.jwt, createRemoteJWKSet(new URL(`${SITE}/api/auth/convex/jwks`)), { issuer: SITE, audience: "convex" });
  assert.equal(browser.payload.sub, alice.subject);
  await assert.rejects(jwtVerify(alice.jwt, createLocalJWKSet(jwks as never)), "the player key does not sign browser JWTs");
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
