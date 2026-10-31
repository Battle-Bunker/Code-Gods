/**
 * Environment-derived settings for auth. Read lazily (Convex env vars are only available at run time).
 *
 *   CONVEX_SITE_URL            built in: https://<dep>.convex.site. Better Auth's JWT issuer is this URL;
 *                              our player JWTs use `<it>/api/device` (identity.ts tokenKind tells them apart)
 *   SITE_URL                   optional: the public site origin if it differs (custom domain); Better Auth's
 *                              baseURL, redirects and trusted origin use it
 *   PLAYER_JWT_PRIVATE_KEY     RS256 PKCS#8 PEM for player JWTs (scripts/gen-jwt-key.mjs)
 *   PLAYER_JWT_JWKS            its public JWKS (same script); auth.config.ts inlines it as a data URI
 * Better Auth's own variables (GOOGLE_*, BETTER_AUTH_*) are listed in betterAuth.ts.
 */
import { playerIssuerFor } from "./identity";

export const PLAYER_JWT_AUDIENCE = "code-gods";
export const JWT_TTL_SECONDS = 600;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const DEVICE_TTL_MS = 5 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_S = 2;
export const CREDENTIAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Server misconfigured: ${name} is not set`);
  return value;
}
const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** This deployment's own site URL: Better Auth's JWT issuer. */
export const convexSiteUrl = () => trimSlash(required("CONVEX_SITE_URL"));
/** The issuer of player JWTs (must equal auth.config.ts). */
export const playerIssuer = () => playerIssuerFor(convexSiteUrl());
/** The public origin browsers use (Better Auth baseURL, device verification links). Empty only before deployment. */
export const siteUrl = () => trimSlash(process.env.SITE_URL || process.env.CONVEX_SITE_URL || "");
export const siteOrigin = () => new URL(siteUrl()).origin;
export const jwtPrivateKey = () => required("PLAYER_JWT_PRIVATE_KEY");
