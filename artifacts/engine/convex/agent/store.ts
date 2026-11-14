/**
 * Internal reads of the agent interface: principal resolution for POST /mcp.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { viewerForCredential, type Viewer } from "../auth/access";

const LAST_USED_RESOLUTION_MS = 60_000;

/** What the registry needs to know about its principal (never a secret). */
export type Who = {
  credentialId: string; subject: string; name: string; roomId: string; roomCode: string | null; permission: "read" | "act" | "owner";
  kind: "device" | "oauth" | "assistant"; label: string; expiresAt: number;
};

/** Who for a room credential; null for an account grant, which the agent interface never accepts (it acts per room). */
async function whoOf(ctx: QueryCtx, viewer: Viewer): Promise<Who | null> {
  const credential = (await ctx.db.get(ctx.db.normalizeId("credentials", viewer.credentialId!)!))!;
  if (credential.permission === "account" || credential.roomId === undefined) return null;
  const roomId = ctx.db.normalizeId("v2Rooms", credential.roomId);
  const room = roomId ? await ctx.db.get(roomId) : null;
  return {
    credentialId: credential._id, subject: viewer.subject, name: viewer.name, roomId: credential.roomId, roomCode: room?.code ?? null,
    permission: credential.permission, kind: viewer.credentialKind ?? "device", label: credential.label,
    expiresAt: Math.min(credential.expiresAt, credential.refreshExpiresAt ?? Infinity),
  };
}

/** A principal → Who, or null when the credential is unknown, revoked, expired or its owner grant is stale. */
export const principalInfo = internalQuery({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }): Promise<Who | null> => {
    const viewer = await viewerForCredential(ctx, credentialId);
    return viewer ? whoOf(ctx, viewer) : null;
  },
});

/**
 * POST /mcp's authentication: a `cgc_` credential (by hash) or a verified player JWT (credential id and
 * subject) → Who, recording last use (at most once a minute). Null when unusable.
 */
export const authenticate = internalMutation({
  args: { tokenHash: v.optional(v.string()), credentialId: v.optional(v.string()), subject: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Who | null> => {
    let id = args.credentialId ? ctx.db.normalizeId("credentials", args.credentialId) : null;
    if (args.tokenHash) id = (await ctx.db.query("credentials").withIndex("by_token", q => q.eq("tokenHash", args.tokenHash!)).unique())?._id ?? null;
    if (!id) return null;
    const viewer = await viewerForCredential(ctx, id);
    if (!viewer || (args.subject !== undefined && viewer.subject !== args.subject)) return null;
    const row = (await ctx.db.get(id))!;
    // An OAuth credential is used only through its access tokens, never as a `cgc_` bearer.
    if (args.tokenHash && (row.kind ?? "device") !== "device") return null;
    // An account grant is for apps; MCP, the CLI and assistants act through room credentials only.
    if (row.permission === "account") return null;
    const now = Date.now();
    if (row.lastUsedAt === undefined || now - row.lastUsedAt > LAST_USED_RESOLUTION_MS) await ctx.db.patch(id, { lastUsedAt: now });
    return whoOf(ctx, viewer);
  },
});
