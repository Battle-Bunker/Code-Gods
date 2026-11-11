/**
 * The preview-only sign-in (convex/auth/preview.ts, identity.ts previewSignInCode): pure rules, no backend.
 * Each test names the break it catches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isAdminUser, previewSignInCode } from "../../convex/auth/identity.ts";
import { pkceChallenge } from "../../convex/auth/crypto.ts";
import { issueTicket, previewProfile, redeemTicket, safeReturnTo, ticketSecret } from "../../convex/auth/preview.ts";

test("the preview sign-in is off unless the deployment has a real passphrase (dev and production have none)", () => {
  assert.equal(previewSignInCode({}), null);
  assert.equal(previewSignInCode({ PREVIEW_SIGN_IN_CODE: "" }), null);
  assert.equal(previewSignInCode({ PREVIEW_SIGN_IN_CODE: "short" }), null, "a guessable passphrase does not switch it on");
  assert.equal(previewSignInCode({ PREVIEW_SIGN_IN_CODE: "  correct horse battery  " }), "correct horse battery");
});

test("admin: the preview player on ADMIN_EMAILS is an admin only where the preview sign-in is on", () => {
  const user = { email: "admin@preview.test", emailVerified: true, provider: "preview" };
  const env = { ADMIN_EMAILS: "admin@preview.test" };
  assert.equal(isAdminUser(user, env), false, "production: a 'preview' account is never admin");
  assert.equal(isAdminUser(user, { ...env, PREVIEW_SIGN_IN_CODE: "correct horse battery" }), true);
  assert.equal(isAdminUser({ ...user, email: "alice@preview.test" }, { ...env, PREVIEW_SIGN_IN_CODE: "correct horse battery" }), false);
});

test("a ticket signs in only with the right key, redirect URI and PKCE verifier, and only for a minute", async () => {
  const secret = ticketSecret("better-auth-secret", "correct horse battery");
  const verifier = "v".repeat(43), redirect = "https://x.convex.site/api/auth/oauth2/callback/preview";
  const now = 1_000_000;
  const code = await issueTicket(secret, { id: "alice", challenge: await pkceChallenge(verifier), redirect }, now);
  const ok = { redirectURI: redirect, codeVerifier: verifier };
  assert.equal(await redeemTicket(secret, code, ok, now + 1000), "alice");
  assert.equal(await redeemTicket(secret, code, ok, now + 61_000), null, "expired");
  assert.equal(await redeemTicket(ticketSecret("better-auth-secret", "another passphrase"), code, ok, now), null, "signed under another passphrase");
  assert.equal(await redeemTicket(ticketSecret("other-deployment", "correct horse battery"), code, ok, now), null, "another deployment's ticket");
  assert.equal(await redeemTicket(secret, code, { ...ok, codeVerifier: "w".repeat(43) }, now), null, "another browser's sign-in (PKCE)");
  assert.equal(await redeemTicket(secret, code, { redirectURI: redirect }, now), null, "no verifier at all");
  assert.equal(await redeemTicket(secret, code, { ...ok, redirectURI: "https://evil.example/cb" }, now), null);
  const [body, signature] = code.split(".");
  const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), id: "admin" })).toString("base64url")}.${signature}`;
  assert.equal(await redeemTicket(secret, forged, ok, now), null, "an edited ticket (alice → admin) fails its signature");
  assert.equal(await redeemTicket(secret, "garbage", ok, now), null);
});

test("preview players carry a verified email and a full name", () => {
  assert.deepEqual(previewProfile("admin"), { id: "preview-admin", email: "admin@preview.test", emailVerified: true, name: "Ada Admin", given_name: "Ada", family_name: "Admin" });
});

test("sign-in returns only to a path on the same site", () => {
  assert.equal(safeReturnTo("/room/abc?x=1"), "/room/abc?x=1");
  for (const bad of [null, "", "https://evil.example/", "//evil.example", "/\\evil.example", "room"]) assert.equal(safeReturnTo(bad), "/");
});
