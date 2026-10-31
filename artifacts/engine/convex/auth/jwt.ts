/**
 * Player JWTs: the deployment's own RS256 issuer `<CONVEX_SITE_URL>/api/device` (used from HTTP actions), for
 * holders of a room credential. Browser JWTs come from Better Auth instead (betterAuth.ts). Tokens last
 * 10 minutes and carry:
 *   sub   the human's god id (Better Auth user id)
 *   scope "player"
 *   cred  the credential id, re-checked for revocation on every call (access.ts)
 *   room, perm  informational copies; access.ts reads the credential row instead
 */
import { SignJWT, importPKCS8, exportJWK, calculateJwkThumbprint, type JWK, type CryptoKey } from "jose";
import { JWT_TTL_SECONDS, PLAYER_JWT_AUDIENCE, jwtPrivateKey, playerIssuer } from "./config";

type Signer = { pem: string; key: CryptoKey; publicJwk: JWK & { kid: string } };
let cached: Promise<Signer> | undefined;
let cachedPem: string | undefined;

async function load(pem: string): Promise<Signer> {
  const key = await importPKCS8(pem, "RS256", { extractable: true });
  const { n, e, kty } = await exportJWK(key);
  const base = { kty: kty!, n: n!, e: e! };
  const kid = await calculateJwkThumbprint(base);
  return { pem, key, publicJwk: { ...base, kid, alg: "RS256", use: "sig" } };
}
function signer(): Promise<Signer> {
  const pem = jwtPrivateKey().replace(/\\n/g, "\n");
  if (!cached || cachedPem !== pem) { cachedPem = pem; cached = load(pem); }
  return cached;
}

export async function jwks(): Promise<{ keys: JWK[] }> {
  return { keys: [(await signer()).publicJwk] };
}

export type MintInput = { subject: string; credentialId: string; roomId: string; permission: string };

/** `ttlSeconds` (default 10 minutes): MCP OAuth access tokens last 60 minutes (convex/agent/oauth.ts). */
export async function mintPlayerJwt(input: MintInput, ttlSeconds = JWT_TTL_SECONDS): Promise<{ token: string; expiresAt: number }> {
  const { key, publicJwk } = await signer();
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ scope: "player", cred: input.credentialId, room: input.roomId, perm: input.permission })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid, typ: "JWT" })
    .setIssuer(playerIssuer()).setAudience(PLAYER_JWT_AUDIENCE).setSubject(input.subject)
    .setIssuedAt(now).setExpirationTime(now + ttlSeconds)
    .sign(key);
  return { token, expiresAt: (now + ttlSeconds) * 1000 };
}
