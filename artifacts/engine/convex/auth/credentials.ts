/**
 * Scoped player credentials: list and revoke (browser scope), plus the internal exchange and
 * self-revocation behind POST /api/device/token and POST /api/device/revoke.
 *
 *   query    auth/credentials:list   ({})              → the signed-in human's active credentials
 *   mutation auth/credentials:revoke ({credentialId})  → immediate: access.ts checks `revokedAt` on every call
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireViewer } from "./access";

const LAST_USED_RESOLUTION_MS = 60_000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.scope !== "browser") throw new ConvexError({ code: "FORBIDDEN", message: "Sign in with a browser to manage credentials" });
    const now = Date.now();
    const rows = await ctx.db.query("credentials").withIndex("by_subject", q => q.eq("subject", viewer.subject)).order("desc").take(200);
    const active = rows.filter(row => row.revokedAt === undefined && row.expiresAt > now);
    return await Promise.all(active.map(async row => {
      const roomId = ctx.db.normalizeId("rooms", row.roomId);
      const room = roomId ? await ctx.db.get(roomId) : null;
      return {
        credentialId: row._id, roomId: row.roomId, roomCode: room?.shortCode ?? null, permission: row.permission,
        /** Self-reported by the app that requested it: NOT a verified identity. */
        label: row.label,
        createdAt: row.createdAt, expiresAt: row.expiresAt, lastUsedAt: row.lastUsedAt ?? null,
      };
    }));
  },
});

export const revoke = mutation({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }) => {
    const viewer = await requireViewer(ctx);
    if (viewer.scope !== "browser") throw new ConvexError({ code: "FORBIDDEN", message: "Sign in with a browser to manage credentials" });
    const id = ctx.db.normalizeId("credentials", credentialId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.subject !== viewer.subject) throw new ConvexError({ code: "NOT_FOUND", message: "Credential not found" });
    if (row.revokedAt === undefined) await ctx.db.patch(row._id, { revokedAt: Date.now() });
    return { status: "revoked" as const };
  },
});

/** Credential → the facts a player JWT needs, or null when unknown, revoked or expired. */
export const exchange = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db.query("credentials").withIndex("by_token", q => q.eq("tokenHash", tokenHash)).unique();
    const now = Date.now();
    if (!row || row.revokedAt !== undefined || row.expiresAt <= now) return null;
    const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", row.subject)).unique();
    if (!user) return null;
    if (row.lastUsedAt === undefined || now - row.lastUsedAt > LAST_USED_RESOLUTION_MS) await ctx.db.patch(row._id, { lastUsedAt: now });
    return { credentialId: row._id, subject: row.subject, roomId: row.roomId, permission: row.permission, expiresAt: row.expiresAt };
  },
});

/** A credential revokes itself (`player disconnect`). */
export const revokeSelf = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db.query("credentials").withIndex("by_token", q => q.eq("tokenHash", tokenHash)).unique();
    if (!row || row.revokedAt !== undefined) return false;
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
    return true;
  },
});
