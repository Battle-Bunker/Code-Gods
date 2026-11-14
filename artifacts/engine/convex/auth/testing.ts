/**
 * TEST FIXTURES ONLY (artifacts/engine/test/auth.test.ts). Every function refuses to run unless the
 * deployment env var TEST_FIXTURES=1 is set, which only scripts/dev.mjs does on the local
 * backend. Production must never set it.
 */
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { requireRoomPermission, requireViewer } from "./access";
import { normalizeUserCode, sha256Hex } from "./crypto";

function guard() {
  if (process.env.TEST_FIXTURES !== "1") throw new ConvexError({ code: "NOT_FOUND", message: "Not available" });
}
const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

/** Calls requireViewer (and requireRoomPermission when `roomId`+`need` are given) and echoes the viewer. */
export const probe = query({
  args: { roomId: v.optional(v.string()), need: v.optional(permission) },
  handler: async (ctx, { roomId, need }) => {
    guard();
    const viewer = await requireViewer(ctx);
    if (roomId && need) requireRoomPermission(viewer, roomId, need);
    return viewer;
  },
});

/** A v2 room with its code, plus the owner's membership (what room.create writes: the owner is seated, not a spectator). */
export const createRoom = internalMutation({
  args: { shortCode: v.string(), ownerId: v.string() },
  handler: async (ctx, { shortCode, ownerId }) => {
    guard();
    const now = Date.now();
    const roomId = await ctx.db.insert("v2Rooms", {
      code: shortCode.toUpperCase(), name: "Auth fixture room", ownerId, revision: 0, createdAt: now, preset: "lines-beginner", overrides: {}, games: 0,
    });
    await ctx.db.insert("v2Members", { roomId, kind: "human", name: ownerId, spectator: false, joinedAt: now, userId: ownerId });
    return roomId;
  },
});

export const setRoomOwner = internalMutation({
  args: { roomId: v.id("v2Rooms"), ownerId: v.string() },
  handler: async (ctx, { roomId, ownerId }) => {
    guard();
    // In v2 an owner is always a member: the new owner gets a members row if they had none.
    const member = await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", ownerId)).first();
    if (!member) await ctx.db.insert("v2Members", { roomId, kind: "human", userId: ownerId, name: ownerId, spectator: false, joinedAt: Date.now() });
    await ctx.db.patch(roomId, { ownerId });
  },
});

/** Delete a room row (its members stay): credentials bound to it must stop working. */
export const deleteRoom = internalMutation({
  args: { roomId: v.id("v2Rooms") },
  handler: async (ctx, { roomId }) => {
    guard();
    await ctx.db.delete(roomId);
  },
});

/** Our `users` row for a god id, as the Better Auth triggers wrote it. */
export const userRow = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    guard();
    const row = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", subject)).unique();
    if (!row) return null;
    return { subject: row.subject, name: row.name, email: row.email, emailVerified: row.emailVerified, provider: row.provider };
  },
});

/** Move a Better Auth session's expiry into the past (it is otherwise 24 hours away). */
export const expireSession = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    guard();
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: { model: "session", where: [{ field: "_id", value: sessionId }], update: { expiresAt: Date.now() - 1000 } },
    });
  },
});

export const expireDevice = internalMutation({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    guard();
    const hash = await sha256Hex(normalizeUserCode(userCode)!);
    const device = await ctx.db.query("devices").withIndex("by_user_code", q => q.eq("userCodeHash", hash)).first();
    if (device) await ctx.db.patch(device._id, { expiresAt: Date.now() - 1 });
  },
});

/** A room credential with a known token hash (test/v2-mcp.test.ts presents the token on POST /mcp). */
export const seedCredential = internalMutation({
  args: { subject: v.string(), roomId: v.string(), permission, tokenHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    guard();
    const now = Date.now();
    return ctx.db.insert("credentials", { tokenHash: args.tokenHash ?? crypto.randomUUID(), subject: args.subject, roomId: args.roomId, permission: args.permission,
      label: "test", createdAt: now, expiresAt: now + 3600_000 });
  },
});
