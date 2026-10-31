/**
 * Environment-derived settings for auth. Read lazily (Convex env vars are only available at run time).
 *
 *   CONVEX_SITE_URL            built in: https://<dep>.convex.site, the JWT issuer
 *   CODE_GODS_SITE_URL         optional: the public site origin if it differs (custom domain); cookies,
 *                              redirects and the same-origin check use it
 *   CODE_GODS_JWT_PRIVATE_KEY  RS256 PKCS#8 PEM (scripts/gen-jwt-key.mjs)
 *   CODE_GODS_JWT_JWKS         its public JWKS (same script); auth.config.ts inlines it as a data URI
 *   REPLIT_OIDC_CLIENT_ID      the Replit OIDC client id (the engine Repl's REPL_ID)
 *   REPLIT_OIDC_REDIRECT_URI   the callback relay on that Repl's domain (Replit accepts no other), which
 *                              forwards to /api/callback. Unset: /api/callback itself (local tests).
 *   REPLIT_OIDC_ISSUER         LOCAL TESTING ONLY: points login at scripts/fake-oidc.mjs.
 *                              Production must leave it unset (issuer = https://replit.com/oidc).
 */
export const REPLIT_ISSUER = "https://replit.com/oidc";
export const JWT_AUDIENCE = "code-gods";
export const JWT_TTL_SECONDS = 600;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;
export const DEVICE_TTL_MS = 5 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_S = 2;
export const CREDENTIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "cg_session";
export const FLOW_COOKIE = "cg_oidc";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Server misconfigured: ${name} is not set`);
  return value;
}
const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The JWT issuer: this deployment's own site URL (must equal auth.config.ts). */
export const jwtIssuer = () => trimSlash(required("CONVEX_SITE_URL"));
/** The public origin browsers use (cookies, OIDC redirect URI, same-origin checks). */
export const siteUrl = () => trimSlash(process.env.CODE_GODS_SITE_URL || required("CONVEX_SITE_URL"));
export const siteOrigin = () => new URL(siteUrl()).origin;
export const oidcIssuer = () => trimSlash(process.env.REPLIT_OIDC_ISSUER || REPLIT_ISSUER);
export const oidcClientId = () => required("REPLIT_OIDC_CLIENT_ID");
export const jwtPrivateKey = () => required("CODE_GODS_JWT_PRIVATE_KEY");

/**
 * Browsers drop `Secure` cookies set over plain http, so the local backend (http://127.0.0.1:<port>)
 * could never keep a session. Omit `Secure` ONLY for a loopback http site URL; everything else
 * (every real deployment is https) gets `Secure`.
 */
export function cookieSecure(): boolean {
  const url = new URL(siteUrl());
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  return !(url.protocol === "http:" && loopback);
}
