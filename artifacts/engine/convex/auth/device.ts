/**
 * Device approval: a player app or room assistant asks for a scoped credential for ONE room; the human
 * approves it in their signed-in browser (engine UI `/device`).
 *
 *   HTTP POST /api/device/request  → internal.auth.device.createRequest
 *   query     auth/device:pending  ({userCode})                         browser scope
 *   mutation  auth/device:approve  ({userCode, ownerConsent?})          browser scope
 *   mutation  auth/device:deny     ({userCode})                         browser scope
 *   HTTP POST /api/device/poll     → internal.auth.device.poll (one-time claim of the credential)
 *
 * Kept from the Express implementation: only hashes are stored; proofs are compared in constant time;
 * inputs are bounded; requests expire after 5 minutes; a claim is single use; polling is throttled
 * and repeated bad proofs kill the request; approval needs room membership; an owner grant needs the
 * room's CURRENT owner plus explicit consent, and ownership is re-checked when the credential is
 * claimed; read/act grants are never upgraded (a new owner grant is a new request).
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireViewer, type Viewer } from "./access";
import { CREDENTIAL_TTL_MS, DEVICE_POLL_INTERVAL_S, DEVICE_TTL_MS } from "./config";
import { constantTimeEqual, formatUserCode, normalizeUserCode, sha256Hex } from "./crypto";
import { isRoomMember, resolveRoom } from "./rooms";

/** Bounded opportunistic cleanup of expired device requests, run from the unauthenticated request path. */
async function sweepExpired(ctx: MutationCtx, limit = 16) {
  const rows = await ctx.db.query("devices").withIndex("by_expires", q => q.lt("expiresAt", Date.now())).take(limit);
  for (const row of rows) await ctx.db.delete(row._id);
}

const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));
const MAX_PENDING_PER_ROOM = 20;
const MAX_PROOF_FAILURES = 5;

const fail = (code: string, message: string): never => { throw new ConvexError({ code, message }); };

async function requireBrowser(ctx: QueryCtx): Promise<Viewer> {
  const viewer = await requireViewer(ctx);
  if (viewer.scope !== "browser") fail("FORBIDDEN", "Approval must come from a signed-in browser");
  return viewer;
}

async function deviceByCode(ctx: QueryCtx, userCode: unknown): Promise<Doc<"devices"> | null> {
  const code = normalizeUserCode(userCode);
  if (!code) return null;
  const hash = await sha256Hex(code);
  return await ctx.db.query("devices").withIndex("by_user_code", q => q.eq("userCodeHash", hash)).first();
}

// ---------------------------------------------------------------------------------------------
// Request (unauthenticated; called by the HTTP action, which generated the secrets)
// ---------------------------------------------------------------------------------------------
export const createRequest = internalMutation({
  args: {
    deviceSecretHash: v.string(), userCodeHash: v.string(), challenge: v.string(), room: v.string(), permission, label: v.string(),
  },
  handler: async (ctx, args) => {
    await sweepExpired(ctx);
    const room = await resolveRoom(ctx, args.room);
    if (!room) return { error: "room_not_found" as const };
    const now = Date.now();
    const pending = await ctx.db.query("devices").withIndex("by_room", q => q.eq("roomId", room.roomId).gt("expiresAt", now))
      .take(MAX_PENDING_PER_ROOM + 1);
    if (pending.filter(d => d.status === "pending").length >= MAX_PENDING_PER_ROOM) return { error: "too_many_requests" as const };
    const clash = await ctx.db.query("devices").withIndex("by_user_code", q => q.eq("userCodeHash", args.userCodeHash)).first();
    if (clash) return { error: "retry" as const };
    const deviceId = await ctx.db.insert("devices", {
      deviceSecretHash: args.deviceSecretHash, userCodeHash: args.userCodeHash, challenge: args.challenge, roomId: room.roomId,
      permission: args.permission, label: args.label, status: "pending", expiresAt: now + DEVICE_TTL_MS, failures: 0,
    });
    return { deviceId, roomId: room.roomId, roomCode: room.shortCode, expiresAt: now + DEVICE_TTL_MS };
  },
});

// ---------------------------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------------------------
/**
 * What the human checks before deciding. Null when the code is unknown, or the request is not
 * visible to this human (not a member of the room, or already decided by someone else).
 */
export const pending = query({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    const viewer = await requireBrowser(ctx);
    const device = await deviceByCode(ctx, userCode);
    if (!device) return null;
    if (device.subject && device.subject !== viewer.subject) return null;
    const room = await resolveRoom(ctx, device.roomId);
    if (!room || !(await isRoomMember(ctx, room, viewer.subject))) return null;
    const expired = device.expiresAt <= Date.now();
    const status = expired && device.status === "pending" ? "expired" as const : device.status;
    const isOwner = room.ownerId === viewer.subject;
    return {
      roomId: room.roomId, roomCode: room.shortCode, permission: device.permission,
      /** Self-reported by the requesting app: NOT a verified identity. */
      label: device.label,
      expiresAt: device.expiresAt,
      /** The comparison code: must match what the requesting app printed. */
      userCode: formatUserCode(normalizeUserCode(userCode)!),
      status,
      isRoomOwner: isOwner,
      ownerConsentRequired: device.permission === "owner",
      canApprove: status === "pending" && (device.permission !== "owner" || isOwner),
    };
  },
});

async function decide(ctx: QueryCtx, userCode: string, ownerDecision: boolean) {
  const viewer = await requireBrowser(ctx);
  const device = await deviceByCode(ctx, userCode);
  if (!device || device.status !== "pending" || device.subject || device.expiresAt <= Date.now()) {
    fail("INVALID", "Invalid or expired approval code");
  }
  const room = await resolveRoom(ctx, device!.roomId);
  if (!room) return fail("INVALID", "Invalid or expired approval code");
  if (!(await isRoomMember(ctx, room, viewer.subject))) fail("FORBIDDEN", "Join this room first");
  if (ownerDecision && device!.permission === "owner" && room.ownerId !== viewer.subject) {
    fail("FORBIDDEN", "Only the room's current owner can decide an owner grant");
  }
  return { viewer, device: device! };
}

export const approve = mutation({
  args: { userCode: v.string(), ownerConsent: v.optional(v.boolean()) },
  handler: async (ctx, { userCode, ownerConsent }) => {
    const { viewer, device } = await decide(ctx, userCode, true);
    if (device.permission === "owner" && ownerConsent !== true) {
      fail("OWNER_CONSENT_REQUIRED", "An owner grant needs explicit consent: it can configure the room, spend its AI budget, start and end games and play as you");
    }
    await ctx.db.patch(device._id, { status: "approved", subject: viewer.subject });
    return { status: "approved" as const };
  },
});

export const deny = mutation({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    const { viewer, device } = await decide(ctx, userCode, true);
    await ctx.db.patch(device._id, { status: "denied", subject: viewer.subject });
    return { status: "denied" as const };
  },
});

// ---------------------------------------------------------------------------------------------
// Poll (unauthenticated; proof = deviceSecret + PKCE verifier, hashed by the HTTP action)
// ---------------------------------------------------------------------------------------------
export const poll = internalMutation({
  args: { deviceId: v.string(), deviceSecretHash: v.string(), challenge: v.string(), credentialHash: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("devices", args.deviceId);
    const device = id ? await ctx.db.get(id) : null;
    if (!device) return { status: "invalid" as const };
    const secretOk = constantTimeEqual(device.deviceSecretHash, args.deviceSecretHash);
    const challengeOk = constantTimeEqual(device.challenge, args.challenge);
    if (!secretOk || !challengeOk) {
      const failures = (device.failures ?? 0) + 1;
      await ctx.db.patch(device._id, { failures, ...(failures >= MAX_PROOF_FAILURES && device.status !== "claimed" ? { status: "denied" as const } : {}) });
      return { status: "invalid" as const };
    }
    const now = Date.now();
    if (device.status === "claimed") return { status: "invalid" as const };
    if (device.status === "denied") return { status: "denied" as const };
    if (device.expiresAt <= now) return { status: "expired" as const };
    if (device.lastPolledAt !== undefined && now - device.lastPolledAt < DEVICE_POLL_INTERVAL_S * 1000 - 250) {
      await ctx.db.patch(device._id, { lastPolledAt: now });
      return { status: "slow_down" as const };
    }
    await ctx.db.patch(device._id, { lastPolledAt: now });
    if (device.status === "pending") return { status: "pending" as const };
    // Approved: claim once. An owner grant cannot outlive the approver's ownership of the room.
    const subject = device.subject!;
    if (device.permission === "owner") {
      const room = await resolveRoom(ctx, device.roomId);
      if (!room || room.ownerId !== subject) {
        await ctx.db.patch(device._id, { status: "denied" });
        return { status: "forbidden" as const };
      }
    }
    const expiresAt = now + CREDENTIAL_TTL_MS;
    const credentialId = await ctx.db.insert("credentials", {
      tokenHash: args.credentialHash, subject, roomId: device.roomId, permission: device.permission, label: device.label,
      createdAt: now, expiresAt,
    });
    await ctx.db.patch(device._id, { status: "claimed", credentialId });
    return { status: "ok" as const, credentialId, roomId: device.roomId, permission: device.permission, expiresAt };
  },
});
