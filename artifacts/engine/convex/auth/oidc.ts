/**
 * Minimal OIDC relying party for Replit (authorization code + PKCE + nonce + state), used from HTTP
 * actions. The issuer is https://replit.com/oidc unless REPLIT_OIDC_ISSUER overrides it, which is
 * for LOCAL TESTING ONLY (scripts/fake-oidc.mjs); production must leave it unset.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { oidcClientId, oidcIssuer } from "./config";
import { constantTimeEqual } from "./crypto";

type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
const discoveries = new Map<string, Promise<Discovery>>();
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function fetchDiscovery(issuer: string): Promise<Discovery> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
  const doc = await response.json() as Partial<Discovery>;
  if (doc.issuer?.replace(/\/+$/, "") !== issuer) throw new Error("OIDC discovery issuer mismatch");
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof doc[key] !== "string") throw new Error(`OIDC discovery lacks ${key}`);
  }
  return doc as Discovery;
}

export function discovery(): Promise<Discovery> {
  const issuer = oidcIssuer();
  let found = discoveries.get(issuer);
  if (!found) {
    found = fetchDiscovery(issuer);
    found.catch(() => discoveries.delete(issuer));
    discoveries.set(issuer, found);
  }
  return found;
}

export async function authorizationUrl(input: { redirectUri: string; state: string; nonce: string; challenge: string }) {
  const { authorization_endpoint } = await discovery();
  const url = new URL(authorization_endpoint);
  for (const [key, value] of Object.entries({
    response_type: "code", client_id: oidcClientId(), redirect_uri: input.redirectUri, scope: "openid profile email",
    state: input.state, nonce: input.nonce, code_challenge: input.challenge, code_challenge_method: "S256",
  })) url.searchParams.set(key, value);
  return url.toString();
}

/** Exchange the code (public client + PKCE) and verify the ID token: signature, iss, aud, exp, nonce. */
export async function redeemCode(input: { code: string; redirectUri: string; verifier: string; nonce: string }): Promise<JWTPayload> {
  const doc = await discovery();
  const response = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri,
      client_id: oidcClientId(), code_verifier: input.verifier,
    }),
  });
  if (!response.ok) throw new Error(`Token endpoint refused the code (${response.status})`);
  const body = await response.json() as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new Error("No ID token");
  let keys = keySets.get(doc.jwks_uri);
  if (!keys) { keys = createRemoteJWKSet(new URL(doc.jwks_uri)); keySets.set(doc.jwks_uri, keys); }
  const { payload } = await jwtVerify(body.id_token, keys, {
    issuer: doc.issuer, audience: oidcClientId(), requiredClaims: ["sub", "exp", "iat"], clockTolerance: 30,
  });
  if (typeof payload.nonce !== "string" || !constantTimeEqual(payload.nonce, input.nonce)) throw new Error("ID token nonce mismatch");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256) throw new Error("ID token subject invalid");
  return payload;
}
