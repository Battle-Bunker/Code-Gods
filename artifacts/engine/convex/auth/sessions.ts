/**
 * Internal functions behind the browser login HTTP actions (convex/auth/routes.ts). Every argument
 * that would be a secret arrives already hashed; the HTTP action generated it.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { OIDC_FLOW_TTL_MS, SESSION_TTL_MS } from "./config";
import { isAdminUser } from "./access";

/** Bounded opportunistic cleanup of expired rows, run from unauthenticated write paths. */
export async function sweepExpired(ctx: MutationCtx, limit = 16) {
  const now = Date.now();
  for (const table of ["oidcFlows", "sessions", "devices"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_expires", q => q.lt("expiresAt", now)).take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

export const createFlow = internalMutation({
  args: { keyHash: v.string(), verifier: v.string(), state: v.string(), nonce: v.string(), returnTo: v.string() },
  handler: async (ctx, args) => {
    await sweepExpired(ctx);
    await ctx.db.insert("oidcFlows", { ...args, expiresAt: Date.now() + OIDC_FLOW_TTL_MS });
  },
});

/** Single use: the flow row is deleted whether or not the rest of the callback succeeds. */
export const consumeFlow = internalMutation({
  args: { keyHash: v.string() },
  handler: async (ctx, { keyHash }) => {
    const flow = await ctx.db.query("oidcFlows").withIndex("by_key", q => q.eq("keyHash", keyHash)).unique();
    if (!flow) return null;
    await ctx.db.delete(flow._id);
    if (flow.expiresAt <= Date.now()) return null;
    return { verifier: flow.verifier, state: flow.state, nonce: flow.nonce, returnTo: flow.returnTo };
  },
});

/** Upsert the user with the full verified name and open a browser session. */
export const completeLogin = internalMutation({
  args: {
    subject: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.boolean(), issuer: v.string(),
    sessionHash: v.string(),
  },
  handler: async (ctx, { sessionHash, ...profile }) => {
    const now = Date.now();
    const existing = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", profile.subject)).unique();
    if (existing) await ctx.db.replace(existing._id, { ...profile, updatedAt: now });
    else await ctx.db.insert("users", { ...profile, updatedAt: now });
    const sessionId = await ctx.db.insert("sessions", { tokenHash: sessionHash, subject: profile.subject, expiresAt: now + SESSION_TTL_MS });
    return { sessionId, expiresAt: now + SESSION_TTL_MS };
  },
});

export const sessionUser = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("tokenHash", tokenHash)).unique();
    if (!session || session.expiresAt <= Date.now()) return null;
    const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", session.subject)).unique();
    if (!user) return null;
    return { sessionId: session._id, id: user.subject, name: user.name, isAdmin: isAdminUser(user) };
  },
});

export const deleteSession = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("tokenHash", tokenHash)).unique();
    if (session) await ctx.db.delete(session._id);
  },
});
