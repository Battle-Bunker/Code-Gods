/**
 * Convex verifies every client JWT against one of two providers, told apart by issuer
 * (convex/auth/identity.ts tokenKind; access.ts routes on it):
 *
 *   1. Better Auth (signed-in browsers): issuer CONVEX_SITE_URL, audience "convex", minted at
 *      /api/auth/convex/token. Its JWKS is inlined from BETTER_AUTH_JWKS (betterAuth.ts rotateKeys), else
 *      fetched from /api/auth/convex/jwks.
 *   2. Player JWTs (room credentials, convex/auth/jwt.ts): issuer CONVEX_SITE_URL/api/device, audience
 *      "code-gods". JWKS inlined from PLAYER_JWT_JWKS (scripts/gen-jwt-key.mjs), else fetched from
 *      /api/.well-known/jwks.json.
 *
 * Docs: https://docs.convex.dev/auth/advanced/custom-jwt: `jwks` may be a URL or a `data:` URI; `issuer` must
 * equal `iss` and `applicationID` must equal `aud`. Auth config is evaluated at push time: after changing
 * these variables, push again (dev.mjs does).
 */
import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

const site = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
/**
 * An env var, or undefined while it is unset (a brand-new deployment's first push, before the keys exist: the URL
 * fallbacks below). Read directly: in Convex's runtime `process.env` lists no keys (`Object.keys` is empty and `in` is
 * false, so a key-list check never found these and the JWKS was always fetched by URL: an HTTP request before every
 * function call a signed-in browser made, nested calls included; test/game-auth-jwks.test.ts). Reading an unset
 * variable here throws, which fails the push unless it is caught.
 */
const optional = (name: string): string | undefined => {
  try { return process.env[name] || undefined; } catch { return undefined; }
};
const playerJwks = optional("PLAYER_JWT_JWKS");

export default {
  providers: [
    getAuthConfigProvider({ jwks: optional("BETTER_AUTH_JWKS") }),
    {
      type: "customJwt" as const,
      applicationID: "code-gods",
      issuer: `${site}/api/device`,
      jwks: playerJwks
        ? `data:text/plain;charset=utf-8;base64,${btoa(playerJwks)}`
        : `${site}/api/.well-known/jwks.json`,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
