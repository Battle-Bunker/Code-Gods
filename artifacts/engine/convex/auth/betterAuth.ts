/**
 * Human sign-in: Better Auth served by this deployment (component `betterAuth`, routes under /api/auth/*).
 *
 *   Google is the only production provider. Its profile's given + family name become the user's full name
 *   (profileName.ts). The god id (`subject` in our `users` table and every game table) is the Better Auth
 *   user id; Google's `sub` is kept on the `users` row for audit.
 *   The session is an HttpOnly cookie on the site's own origin (24 h); both SPAs exchange it for 10-minute
 *   Convex JWTs at GET /api/auth/convex/token (issuer = CONVEX_SITE_URL, audience "convex").
 *   LOCAL TESTS ONLY: a generic OAuth provider "fake" (scripts/fake-oidc.mjs) exists while test fixtures are
 *   on and CODE_GODS_FAKE_OIDC_URL is set (identity.ts fakeProvider); production sets neither.
 *
 * Environment (Convex deployment env vars):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   the Google Cloud "Web application" OAuth client (PILOT.md)
 *   BETTER_AUTH_SECRET                       random secret (cookies, and encryption of the JWT signing key)
 *   BETTER_AUTH_JWKS                         static JWKS from `npx convex run auth/betterAuth:rotateKeys`
 *                                            (auth.config.ts inlines it, so Convex never fetches it)
 *   CODE_GODS_SITE_URL                       optional public origin when it differs from CONVEX_SITE_URL
 */
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { internalAction, type MutationCtx } from "../_generated/server";
import authConfig from "../auth.config";
import { SESSION_TTL_MS, siteUrl } from "./config";
import { fakeProvider } from "./identity";
import { profileName } from "./profileName";

const authFunctions: AuthFunctions = internal.auth.betterAuth;

const userBySubject = (ctx: MutationCtx, subject: string) =>
  ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", subject)).unique();

/** Our `users` row mirrors the Better Auth user (name, email, verification) plus the provider that vouched for it. */
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        await ctx.db.insert("users", {
          subject: doc._id, name: doc.name, email: doc.email, emailVerified: doc.emailVerified, updatedAt: Date.now(),
        });
      },
      onUpdate: async (ctx, doc) => {
        const row = await userBySubject(ctx, doc._id);
        const fields = { name: doc.name, email: doc.email, emailVerified: doc.emailVerified, updatedAt: Date.now() };
        if (row) await ctx.db.patch(row._id, fields);
        else await ctx.db.insert("users", { subject: doc._id, ...fields });
      },
      onDelete: async (ctx, doc) => {
        const row = await userBySubject(ctx, doc._id);
        if (row) await ctx.db.delete(row._id);
      },
    },
    account: {
      // Linking is off, so a user has exactly one account: the provider that created it.
      onCreate: async (ctx, doc) => {
        const row = await userBySubject(ctx, doc.userId);
        if (row) {
          await ctx.db.patch(row._id, { provider: doc.providerId, ...(doc.providerId === "google" ? { googleSub: doc.accountId } : {}) });
        }
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

/**
 * The static JWKS, exactly when auth.config.ts inlined it (the plugin must agree with the auth config, and
 * auth.config.ts can only see BETTER_AUTH_JWKS where Convex lists env vars). Otherwise the plugin reads the
 * same key from the component's `jwks` table, where rotateKeys also stored it.
 */
const betterAuthProvider = authConfig.providers.find(p => p.applicationID === "convex");
const staticJwks = () => betterAuthProvider && "jwks" in betterAuthProvider && betterAuthProvider.jwks?.startsWith("data:")
  ? process.env.BETTER_AUTH_JWKS : undefined;

const profileToUser =(profile: Record<string, unknown>) => ({ name: profileName(profile) });

export function createAuth(ctx: GenericCtx<DataModel>, { optionsOnly } = { optionsOnly: false }) {
  const base = siteUrl();
  const fake = fakeProvider(process.env);
  const options = {
    logger: { disabled: optionsOnly },
    baseURL: base,
    trustedOrigins: base ? [new URL(base).origin] : [],
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    session: { expiresIn: SESSION_TTL_MS / 1000 },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        prompt: "select_account",
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: profile => profileToUser(profile as unknown as Record<string, unknown>),
      },
    },
    plugins: [
      convex({ authConfig, jwks: staticJwks(), jwt: { expirationSeconds: 600, definePayload: () => ({}) } }),
      ...(fake ? [genericOAuth({
        config: [{
          ...fake, clientSecret: "fake-oidc-local", scopes: ["openid", "profile", "email"], pkce: true, overrideUserInfo: true,
          mapProfileToUser: profile => profileToUser(profile as Record<string, unknown>),
        }],
      })] : []),
    ],
  } satisfies BetterAuthOptions;
  return betterAuth(options);
}

/**
 * Generates a fresh signing key and returns it as the static JWKS for BETTER_AUTH_JWKS:
 *   npx convex run auth/betterAuth:rotateKeys | npx convex env set BETTER_AUTH_JWKS
 * Then push again so auth.config.ts inlines it. Rotating signs every browser out of Convex until their
 * next token fetch (at most 10 minutes); sessions themselves survive.
 */
export const rotateKeys = internalAction({
  args: {},
  handler: async (ctx) => await createAuth(ctx).api.rotateKeys(),
});
