/**
 * scripts/check-auth-keys.mjs: the deploy refuses to push when the auth key env vars disagree. auth.config.ts inlines
 * BETTER_AUTH_JWKS and PLAYER_JWT_JWKS (since 13 Nov); before that no deployment ever verified a token with them, so
 * a stale value would only show as broken sign-in after the push. Each case is one way a stored value can be wrong.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair } from "jose";
import { symmetricEncrypt } from "better-auth/crypto";
import { authKeyProblems } from "../../scripts/check-auth-keys.mjs";
import { generateJwtKey } from "../../scripts/gen-jwt-key.mjs";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

/** BETTER_AUTH_JWKS as `auth/betterAuth:rotateKeys` prints it: one row, its private key encrypted with the secret. */
async function betterAuthJwks(secret = SECRET, over: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const row = {
    id: "k1", alg: "RS256", createdAt: Date.now(),
    publicKey: JSON.stringify(await exportJWK(publicKey)),
    privateKey: JSON.stringify(await symmetricEncrypt({ key: secret, data: JSON.stringify(await exportJWK(privateKey)) })),
    ...over,
  };
  return JSON.stringify([row]);
}
async function env(over: Record<string, string | undefined> = {}) {
  const player = await generateJwtKey();
  return {
    BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_JWKS: await betterAuthJwks(),
    PLAYER_JWT_PRIVATE_KEY: player.privateKey, PLAYER_JWT_JWKS: player.jwks, ...over,
  };
}

test("consistent keys pass; a PEM stored with escaped newlines passes", async () => {
  assert.deepEqual(await authKeyProblems(await env()), []);
  const e = await env();
  assert.deepEqual(await authKeyProblems({ ...e, PLAYER_JWT_PRIVATE_KEY: e.PLAYER_JWT_PRIVATE_KEY.replace(/\n/g, "\\n") }), []);
});

test("BETTER_AUTH_JWKS unset (a brand-new deployment's first push) is not a problem; the workflow sets it next", async () => {
  assert.deepEqual(await authKeyProblems(await env({ BETTER_AUTH_JWKS: undefined })), []);
});

test("PLAYER_JWT_JWKS from another key fails, naming the variables and no value", async () => {
  const other = await generateJwtKey();
  const e = await env({ PLAYER_JWT_JWKS: other.jwks });
  const problems = await authKeyProblems(e);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PLAYER_JWT_JWKS/);
  for (const value of Object.values(e)) if (value) assert.ok(!problems[0].includes(value), "a problem never quotes a value");
});

test("BETTER_AUTH_JWKS encrypted with another secret fails (BETTER_AUTH_SECRET changed after rotateKeys)", async () => {
  const problems = await authKeyProblems(await env({ BETTER_AUTH_JWKS: await betterAuthJwks("another-secret-0123456789abcdef0123") }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /BETTER_AUTH_SECRET/);
});

test("BETTER_AUTH_JWKS whose public key is not its private key's fails", async () => {
  const { publicKey } = await generateKeyPair("RS256", { extractable: true });
  const problems = await authKeyProblems(await env({ BETTER_AUTH_JWKS: await betterAuthJwks(SECRET, { publicKey: JSON.stringify(await exportJWK(publicKey)) }) }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /BETTER_AUTH_JWKS/);
});

test("BETTER_AUTH_JWKS that is malformed, empty, has several keys or an expired key fails", async () => {
  for (const bad of ["not json", "[]", JSON.stringify({ keys: [] })]) {
    assert.equal((await authKeyProblems(await env({ BETTER_AUTH_JWKS: bad }))).length, 1, bad);
  }
  const one = JSON.parse(await betterAuthJwks());
  assert.equal((await authKeyProblems(await env({ BETTER_AUTH_JWKS: JSON.stringify([...one, { ...one[0], id: "k2" }]) }))).length, 1, "two keys");
  assert.equal((await authKeyProblems(await env({ BETTER_AUTH_JWKS: await betterAuthJwks(SECRET, { expiresAt: Date.now() - 1000 }) }))).length, 1, "expired");
});

test("a missing PLAYER_JWT_PRIVATE_KEY or PLAYER_JWT_JWKS fails", async () => {
  assert.equal((await authKeyProblems(await env({ PLAYER_JWT_JWKS: undefined }))).length, 1);
  assert.equal((await authKeyProblems(await env({ PLAYER_JWT_PRIVATE_KEY: undefined }))).length, 1);
});
