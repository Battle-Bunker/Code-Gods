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
/** Unauthenticated DCR is capped for the whole deployment: at most this many registrations per window. */
export const DCR_WINDOW_MS = 10 * 60 * 1000;
export const DCR_MAX_PER_WINDOW = 50;
/** A DCR client that has not redeemed a code this long after registering is deleted. */
export const DCR_UNUSED_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * A retired refresh token is kept for reuse detection this long: as long as the grant it belonged to could have
 * stayed idle. Presented later, it is merely invalid (it no longer revokes the grant).
 */
export const RETIRED_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 200;
const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

export const getClient = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => ctx.db.query("oauthClients").withIndex("by_client", q => q.eq("clientId", clientId)).unique(),
});

/** Register a DCR client, unless the deployment-wide rate limit is reached (then {ok: false}). */
export const registerClient = internalMutation({
  args: { clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const recent = await ctx.db.query("oauthClients").withIndex("by_kind_created", q => q.eq("kind", "dcr").gt("createdAt", now - DCR_WINDOW_MS))
      .take(DCR_MAX_PER_WINDOW);
    if (recent.length >= DCR_MAX_PER_WINDOW) return { ok: false as const };
    await ctx.db.insert("oauthClients", { ...args, kind: "dcr", createdAt: now });
    return { ok: true as const };
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

async function sweepRequests(ctx: MutationCtx) {
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
    await sweepRequests(ctx);
    await ctx.db.insert("oauthRequests", { ...args, status: "pending", expiresAt: Date.now() + OAUTH_REQUEST_TTL_MS });
  },
});

/**
 * GET /oauth/authorize/complete: an approved request gets its one-time code (by hash), but only for the
 * completion secret of the browser that approved it (agent/connect.ts); any other caller gets "wrong_browser"
 * and consumes nothing. A denied request gets an access_denied redirect. Anything else (unknown, expired,
 * already completed) is null.
 */
export const issueCode = internalMutation({
  args: { keyHash: v.string(), codeHash: v.string(), completionHash: v.union(v.string(), v.null()) },
  handler: async (ctx, { keyHash, codeHash, completionHash }) => {
    const request = await ctx.db.query("oauthRequests").withIndex("by_key", q => q.eq("keyHash", keyHash)).unique();
    if (!request || request.expiresAt <= Date.now()) return null;
    const back = { redirectUri: request.redirectUri, state: request.state ?? null };
    if (request.status === "denied") {
      await ctx.db.delete(request._id);
      return { ...back, outcome: "denied" as const };
    }
    if (request.status !== "approved") return request.status === "pending" ? { ...back, outcome: "pending" as const } : null;
    if (!request.completionHash || !completionHash || !constantTimeEqual(request.completionHash, completionHash)) return { ...back, outcome: "wrong_browser" as const };
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
    const client = await ctx.db.query("oauthClients").withIndex("by_client", q => q.eq("clientId", request.clientId)).unique();
    if (client) await ctx.db.patch(client._id, { usedAt: now });
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

/**
 * The hourly sweep (crons.ts) that keeps the OAuth tables bounded: retired refresh tokens past
 * RETIRED_REFRESH_TTL_MS, DCR clients that never redeemed a code within DCR_UNUSED_TTL_MS, client metadata
 * documents past their cache time (fetched again on next use) and expired authorization requests. Each kind
 * deletes at most SWEEP_BATCH rows per run. `now` defaults to the current time.
 */
export const sweep = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const retired = await ctx.db.query("oauthRetiredRefresh").withIndex("by_retired", q => q.lt("retiredAt", now - RETIRED_REFRESH_TTL_MS)).take(SWEEP_BATCH);
    const unused = await ctx.db.query("oauthClients")
      .withIndex("by_kind_used_created", q => q.eq("kind", "dcr").eq("usedAt", undefined).lt("createdAt", now - DCR_UNUSED_TTL_MS)).take(SWEEP_BATCH);
    const stale = await ctx.db.query("oauthClients").withIndex("by_kind_fetched", q => q.eq("kind", "cimd").lt("fetchedAt", now - CIMD_CACHE_MS)).take(SWEEP_BATCH);
    const requests = await ctx.db.query("oauthRequests").withIndex("by_expires", q => q.lt("expiresAt", now - OAUTH_REQUEST_TTL_MS)).take(SWEEP_BATCH);
    for (const row of [...retired, ...unused, ...stale, ...requests]) await ctx.db.delete(row._id);
    return { retiredRefresh: retired.length, dcrClients: unused.length, cimdClients: stale.length, requests: requests.length };
  },
});
