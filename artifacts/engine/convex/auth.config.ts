/**
 * Convex verifies every client JWT against this deployment's own issuer (convex/auth/jwt.ts mints them).
 * Docs: https://docs.convex.dev/auth/advanced/custom-jwt (checked 2026-10-28): `jwks` may be a URL or a
 * `data:` URI; only RS256/ES256; `issuer` must equal `iss` and `applicationID` must equal `aud`.
 *
 * The JWKS is inlined as a data URI from CODE_GODS_JWT_JWKS (written by scripts/gen-jwt-key.mjs next
 * to CODE_GODS_JWT_PRIVATE_KEY), so the deployment never fetches itself. Without that variable it
 * falls back to this deployment's own endpoint `/api/.well-known/jwks.json`.
 * Auth config is evaluated at push time: after changing these variables, push again (dev.mjs does).
 */
import type { AuthConfig } from "convex/server";

const site = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
// Convex refuses a push when auth config reads an UNSET env var; checking the key list first keeps the
// URL fallback usable for a brand-new deployment (first push before the key exists).
const inlineJwks = Object.keys(process.env).includes("CODE_GODS_JWT_JWKS") ? process.env.CODE_GODS_JWT_JWKS : undefined;

export default {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: "code-gods",
      issuer: site,
      jwks: inlineJwks
        ? `data:text/plain;charset=utf-8;base64,${btoa(inlineJwks)}`
        : `${site}/api/.well-known/jwks.json`,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
