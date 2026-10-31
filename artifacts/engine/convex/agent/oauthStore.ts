/**
 * Internal state of the MCP OAuth 2.1 authorization server (HTTP routes in agent/oauth.ts, the human's
 * decision in agent/connect.ts). The HTTP actions generate every secret (real randomness) and pass only
 * hashes here; codes and request keys are single use and expire after 10 minutes.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { credentialProblem } from "../auth/principal";
import { constantTimeEqual } from "../auth/crypto";

export const OAUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
/** An OAuth grant expires after 30 days without a refresh. */
export const OAUTH_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CIMD_CACHE_MS = 60 * 60 * 1000;
const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

export const getClient = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => ctx.db.query("oauthClients").withIndex("by_client", q => q.eq("clientId", clientId)).unique(),
});

export const registerClient = internalMutation({
  args: { clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthClients", { ...args, kind: "dcr", createdAt: Date.now() });
  },
});

/** Cache a fetched client ID metadata document (CIMD). */
export const putCimd = internalMutation({
  args: { clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db.query("oauthClients").withIndex("by_client", q => q.eq("clientId", args.clientId)).unique();
    if (row) await ctx.db.patch(row._id, { clientName: args.clientName, redirectUris: args.redirectUris, fetchedAt: now });
    else await ctx.db.insert("oauthClients", { ...args, kind: "cimd", createdAt: now, fetchedAt: now });
  },
});

async function sweep(ctx: MutationCtx) {
  for (const old of await ctx.db.query("oauthRequests").withIndex("by_expires", q => q.lt("expiresAt", Date.now() - OAUTH_REQUEST_TTL_MS)).take(20)) {
    await ctx.db.delete(old._id);
  }
}

export const createRequest = internalMutation({
  args: {
    keyHash: v.string(), clientId: v.string(), clientName: v.string(), redirectUri: v.string(), state: v.optional(v.string()),
    codeChallenge: v.string(), permission, resource: v.string(),
  },
  handler: async (ctx, args) => {
    await sweep(ctx);
    await ctx.db.insert("oauthRequests", { ...args, status: "pending", expiresAt: Date.now() + OAUTH_REQUEST_TTL_MS });
  },
});

/**
 * GET /oauth/authorize/complete: an approved request gets its one-time code (by hash); a denied one an
 * access_denied redirect. Anything else (unknown, pending, expired, already completed) is null.
 */
export const issueCode = internalMutation({
  args: { keyHash: v.string(), codeHash: v.string() },
  handler: async (ctx, { keyHash, codeHash }) => {
    const request = await ctx.db.query("oauthRequests").withIndex("by_key", q => q.eq("keyHash", keyHash)).unique();
    if (!request || request.expiresAt <= Date.now()) return null;
    const back = { redirectUri: request.redirectUri, state: request.state ?? null };
    if (request.status === "denied") {
      await ctx.db.delete(request._id);
      return { ...back, outcome: "denied" as const };
    }
    if (request.status !== "approved") return request.status === "pending" ? { ...back, outcome: "pending" as const } : null;
    await ctx.db.patch(request._id, { status: "issued", codeHash });
    return { ...back, outcome: "code" as const };
  },
});

async function revoke(ctx: MutationCtx, id: Id<"credentials">) {
  const row = await ctx.db.get(id);
  if (row && row.revokedAt === undefined) await ctx.db.patch(id, { revokedAt: Date.now() });
}
async function roomOf(ctx: MutationCtx, roomId: string) {
  const id = ctx.db.normalizeId("rooms", roomId);
  return id ? await ctx.db.get(id) : null;
}

/** Code + PKCE verifier (already hashed to its S256 challenge) → a new `kind: "oauth"` credential. */
export const redeemCode = internalMutation({
  args: { codeHash: v.string(), clientId: v.string(), redirectUri: v.optional(v.string()), challenge: v.string(), tokenHash: v.string(), refreshHash: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("oauthRequests").withIndex("by_code", q => q.eq("codeHash", args.codeHash)).unique();
    if (!request) return { error: "invalid_grant" as const };
    if (request.status === "redeemed") {
      // A replayed code: the grant it produced may have leaked with it.
      if (request.credentialId) await revoke(ctx, request.credentialId);
      return { error: "invalid_grant" as const };
    }
    const now = Date.now();
    if (request.status !== "issued" || request.expiresAt <= now || request.clientId !== args.clientId ||
        (args.redirectUri !== undefined && args.redirectUri !== request.redirectUri) || !constantTimeEqual(request.codeChallenge, args.challenge)) {
      return { error: "invalid_grant" as const };
    }
    const subject = request.subject!, roomId = request.roomId!, granted = request.grantedPermission!;
    const room = await roomOf(ctx, roomId);
    const member = room ? await ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", room._id).eq("godId", subject)).unique() : null;
    const facts = { subject, roomId, permission: granted, expiresAt: now + OAUTH_IDLE_TTL_MS };
    if (!member || credentialProblem(facts, room, now)) {
      await ctx.db.patch(request._id, { status: "redeemed" });
      return { error: "invalid_grant" as const };
    }
    const credentialId = await ctx.db.insert("credentials", {
      tokenHash: args.tokenHash, ...facts, label: request.clientName, createdAt: now, lastUsedAt: now,
      kind: "oauth", clientId: request.clientId, refreshHash: args.refreshHash, refreshExpiresAt: now + OAUTH_IDLE_TTL_MS,
    });
    await ctx.db.patch(request._id, { status: "redeemed", credentialId });
    return { credentialId, subject, roomId, permission: granted };
  },
});

/**
 * Rotate a refresh token. The presented token must be the credential's current one, from the same client;
 * a retired token is a reuse: the credential is revoked (OAuth 2.1 §4.3.1).
 */
export const refresh = internalMutation({
  args: { refreshHash: v.string(), newRefreshHash: v.string(), clientId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("credentials").withIndex("by_refresh", q => q.eq("refreshHash", args.refreshHash)).unique();
    if (!row) {
      const retired = await ctx.db.query("oauthRetiredRefresh").withIndex("by_hash", q => q.eq("hash", args.refreshHash)).unique();
      if (retired) await revoke(ctx, retired.credentialId);
      return { error: "invalid_grant" as const };
    }
    const now = Date.now();
    if (row.kind !== "oauth" || row.clientId !== args.clientId || credentialProblem(row, await roomOf(ctx, row.roomId), now)) return { error: "invalid_grant" as const };
    await ctx.db.insert("oauthRetiredRefresh", { hash: args.refreshHash, credentialId: row._id, retiredAt: now });
    await ctx.db.patch(row._id, { refreshHash: args.newRefreshHash, refreshExpiresAt: now + OAUTH_IDLE_TTL_MS, expiresAt: now + OAUTH_IDLE_TTL_MS, lastUsedAt: now });
    return { credentialId: row._id, subject: row.subject, roomId: row.roomId, permission: row.permission };
  },
});

/** RFC 7009: revoke the grant behind a refresh token (current or retired) or an access token's credential. */
export const revokeToken = internalMutation({
  args: { refreshHash: v.optional(v.string()), credentialId: v.optional(v.string()), clientId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let row: Doc<"credentials"> | null = null;
    if (args.refreshHash) {
      row = await ctx.db.query("credentials").withIndex("by_refresh", q => q.eq("refreshHash", args.refreshHash!)).unique();
      if (!row) {
        const retired = await ctx.db.query("oauthRetiredRefresh").withIndex("by_hash", q => q.eq("hash", args.refreshHash!)).unique();
        row = retired ? await ctx.db.get(retired.credentialId) : null;
      }
    } else if (args.credentialId) {
      const id = ctx.db.normalizeId("credentials", args.credentialId);
      row = id ? await ctx.db.get(id) : null;
    }
    if (!row || row.kind !== "oauth" || (args.clientId !== undefined && row.clientId !== args.clientId)) return false;
    await revoke(ctx, row._id);
    return true;
  },
});
