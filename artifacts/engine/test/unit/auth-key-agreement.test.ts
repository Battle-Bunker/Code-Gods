/**
 * convex/auth/keyAgreement.ts (the deploy's post-push check, auth/keysCheck:deployed): the JWKS the pushed auth config
 * inlined must verify tokens signed with the deployment's current keys.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportJWK, generateKeyPair, importPKCS8 } from "jose";
import { symmetricEncrypt } from "better-auth/crypto";
import { deployedKeyProblems } from "../../convex/auth/keyAgreement.ts";
import { generateJwtKey } from "../../scripts/gen-jwt-key.mjs";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef", SITE = "https://dep.convex.site";
const dataUri = (jwks: unknown) => `data:text/plain;charset=utf-8;base64,${btoa(JSON.stringify(jwks))}`;

async function setup() {
  const player = await generateJwtKey();
  const key = await importPKCS8(player.privateKey, "RS256");
  const kid = JSON.parse(player.jwks).keys[0].kid;
  const playerToken = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid }).setIssuer(`${SITE}/api/device`).setAudience("code-gods").setExpirationTime("1m").sign(key);
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const pub = await exportJWK(publicKey);
  const BETTER_AUTH_JWKS = JSON.stringify([{ id: "k1", alg: "RS256", publicKey: JSON.stringify(pub),
    privateKey: JSON.stringify(await symmetricEncrypt({ key: SECRET, data: JSON.stringify(await exportJWK(privateKey)) })) }]);
  const providers = (browserJwks: string, playerJwks: string) => [
    { applicationID: "convex", issuer: SITE, algorithm: "RS256", jwks: browserJwks },
    { applicationID: "code-gods", issuer: `${SITE}/api/device`, algorithm: "RS256", jwks: playerJwks },
  ];
  return { player, playerToken, pub, BETTER_AUTH_JWKS, providers, browserSet: dataUri({ keys: [{ ...pub, alg: "RS256", kid: "k1" }] }) };
}

test("a config that inlined the current keys passes", async () => {
  const s = await setup();
  assert.deepEqual(await deployedKeyProblems(s.providers(s.browserSet, dataUri(JSON.parse(s.player.jwks))), s.playerToken, { BETTER_AUTH_JWKS: s.BETTER_AUTH_JWKS, BETTER_AUTH_SECRET: SECRET }), []);
});

test("a player key changed after the push, a JWKS fetched by URL, and a changed secret each fail", async () => {
  const s = await setup(), other = await generateJwtKey();
  const env = { BETTER_AUTH_JWKS: s.BETTER_AUTH_JWKS, BETTER_AUTH_SECRET: SECRET };
  const stale = await deployedKeyProblems(s.providers(s.browserSet, dataUri(JSON.parse(other.jwks))), s.playerToken, env);
  assert.equal(stale.length, 1); assert.match(stale[0], /PLAYER_JWT_JWKS/);
  const byUrl = await deployedKeyProblems(s.providers(`${SITE}/api/auth/convex/jwks`, dataUri(JSON.parse(s.player.jwks))), s.playerToken, env);
  assert.equal(byUrl.length, 1); assert.match(byUrl[0], /BETTER_AUTH_JWKS/);
  const secret = await deployedKeyProblems(s.providers(s.browserSet, dataUri(JSON.parse(s.player.jwks))), s.playerToken, { ...env, BETTER_AUTH_SECRET: "another-secret-0123456789abcdef0123" });
  assert.equal(secret.length, 1); assert.match(secret[0], /BETTER_AUTH_SECRET/);
});
