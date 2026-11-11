/**
 * Pure identity rules (no Convex imports, unit-tested in test/unit/identity.test.ts). Every input that
 * comes from the deployment's environment is passed in, so production and test settings are explicit.
 */
type Env = Record<string, string | undefined>;

/** Local deployments only: scripts/dev.mjs sets one of these; production never does. */
export const fixturesOn = (env: Env) => env.TEST_FIXTURES === "1" || env.DEV === "1";

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * Admin = a verified email on ADMIN_EMAILS, asserted by Google. The fake test provider
 * (scripts/fake-oidc.mjs) counts only while test fixtures are on, so the local tests can sign in as an admin; the
 * preview provider (auth/preview.ts) only while the deployment has a preview passphrase.
 */
export function isAdminUser(user: { email?: string; emailVerified: boolean; provider?: string }, env: Env): boolean {
  if (!user.emailVerified || !user.email) return false;
  if (user.provider !== "google" && !(user.provider === "fake" && fixturesOn(env))
    && !(user.provider === "preview" && previewSignInCode(env))) return false;
  const allowed = (env.ADMIN_EMAILS ?? "").split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(user.email.trim().toLowerCase());
}

export const PREVIEW_CODE_MIN_LENGTH = 12;
/**
 * The passphrase of the preview-only sign-in (auth/preview.ts), or null: that sign-in exists only on a deployment whose
 * env var PREVIEW_SIGN_IN_CODE holds at least PREVIEW_CODE_MIN_LENGTH characters. Only the preview workflow sets it;
 * the dev and production deploys refuse to run while it is set.
 */
export function previewSignInCode(env: Env): string | null {
  const code = env.PREVIEW_SIGN_IN_CODE?.trim() ?? "";
  return code.length >= PREVIEW_CODE_MIN_LENGTH ? code : null;
}

export const FAKE_CLIENT_ID = "code-gods-local";

/**
 * The fake OIDC provider (Better Auth genericOAuth, id "fake"): offered ONLY when test fixtures are on AND
 * FAKE_OIDC_URL names the local stand-in server. Otherwise null, and the provider does not exist.
 */
export function fakeProvider(env: Env): { providerId: "fake"; discoveryUrl: string; clientId: string } | null {
  const url = env.FAKE_OIDC_URL?.trim();
  if (!fixturesOn(env) || !url) return null;
  return { providerId: "fake", discoveryUrl: `${trimSlash(url)}/.well-known/openid-configuration`, clientId: FAKE_CLIENT_ID };
}

/** The issuer of our own player JWTs (device credentials), beside Better Auth's issuer (the site itself). */
export const playerIssuerFor = (convexSiteUrl: string) => `${trimSlash(convexSiteUrl)}/api/device`;

/**
 * Which kind of Convex JWT this is, from its issuer alone: Better Auth's (`CONVEX_SITE_URL`) is a signed-in
 * browser, ours (`CONVEX_SITE_URL/api/device`) a player credential. Anything else is not ours.
 */
export function tokenKind(issuer: string | undefined, convexSiteUrl: string): "browser" | "player" | null {
  if (!issuer) return null;
  const iss = trimSlash(issuer);
  if (iss === trimSlash(convexSiteUrl)) return "browser";
  if (iss === playerIssuerFor(convexSiteUrl)) return "player";
  return null;
}
