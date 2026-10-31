/**
 * Pure identity rules (no Convex imports, unit-tested in test/unit/identity.test.ts). Every input that
 * comes from the deployment's environment is passed in, so production and test settings are explicit.
 */
type Env = Record<string, string | undefined>;

/** Local deployments only: scripts/dev.mjs sets one of these; production never does. */
export const fixturesOn = (env: Env) => env.CODE_GODS_TEST_FIXTURES === "1" || env.CODE_GODS_DEV === "1";

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * Admin = a verified email on CODE_GODS_ADMIN_EMAILS, asserted by Google. The fake test provider
 * (scripts/fake-oidc.mjs) counts only while test fixtures are on, so the local tests can sign in as an admin.
 */
export function isAdminUser(user: { email?: string; emailVerified: boolean; provider?: string }, env: Env): boolean {
  if (!user.emailVerified || !user.email) return false;
  if (user.provider !== "google" && !(user.provider === "fake" && fixturesOn(env))) return false;
  const allowed = (env.CODE_GODS_ADMIN_EMAILS ?? "").split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(user.email.trim().toLowerCase());
}

export const FAKE_CLIENT_ID = "code-gods-local";

/**
 * The fake OIDC provider (Better Auth genericOAuth, id "fake"): offered ONLY when test fixtures are on AND
 * CODE_GODS_FAKE_OIDC_URL names the local stand-in server. Otherwise null, and the provider does not exist.
 */
export function fakeProvider(env: Env): { providerId: "fake"; discoveryUrl: string; clientId: string } | null {
  const url = env.CODE_GODS_FAKE_OIDC_URL?.trim();
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
