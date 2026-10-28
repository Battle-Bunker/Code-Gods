/**
 * The deployment's own RS256 issuer (used from HTTP actions). Tokens last 10 minutes and carry:
 *   sub   the human's Replit subject (god id)
 *   scope "browser" | "player"
 *   sid   browser tokens only: the session id, re-checked on every call so logout is immediate
 *   cred  player tokens only: the credential id, re-checked for revocation on every call (access.ts)
 *   room, perm  player tokens only: informational copies; access.ts reads the credential row instead
 */
import { SignJWT, importPKCS8, exportJWK, calculateJwkThumbprint, type JWK, type CryptoKey } from "jose";
import { JWT_AUDIENCE, JWT_TTL_SECONDS, jwtIssuer, jwtPrivateKey } from "./config";

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

export type MintInput =
  | { subject: string; scope: "browser"; sessionId: string }
  | { subject: string; scope: "player"; credentialId: string; roomId: string; permission: string };

export async function mintJwt(input: MintInput): Promise<{ token: string; expiresAt: number }> {
  const { key, publicJwk } = await signer();
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, string> = { scope: input.scope };
  if (input.scope === "browser") claims.sid = input.sessionId;
  if (input.scope === "player") Object.assign(claims, { cred: input.credentialId, room: input.roomId, perm: input.permission });
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid, typ: "JWT" })
    .setIssuer(jwtIssuer()).setAudience(JWT_AUDIENCE).setSubject(input.subject)
    .setIssuedAt(now).setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(key);
  return { token, expiresAt: (now + JWT_TTL_SECONDS) * 1000 };
}
