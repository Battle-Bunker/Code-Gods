/**
 * TEST FIXTURES ONLY (artifacts/engine/test/auth.test.ts). Every function refuses to run unless the
 * deployment env var CODE_GODS_TEST_FIXTURES=1 is set, which only scripts/dev.mjs does on the local
 * backend. Production must never set it.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireRoomPermission, requireViewer } from "./access";
import { normalizeUserCode, sha256Hex } from "./crypto";

function guard() {
  if (process.env.CODE_GODS_TEST_FIXTURES !== "1") throw new ConvexError({ code: "NOT_FOUND", message: "Not available" });
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

/** A minimal room row. Uses only the fields auth reads (shortCode, ownerId, createdAt). */
export const createRoom = internalMutation({
  args: { shortCode: v.string(), ownerId: v.string() },
  handler: async (ctx, { shortCode, ownerId }) => {
    guard();
    return await ctx.db.insert("rooms", { shortCode, ownerId, createdAt: Date.now() } as never);
  },
});

export const setRoomOwner = internalMutation({
  args: { roomId: v.id("rooms"), ownerId: v.string() },
  handler: async (ctx, { roomId, ownerId }) => {
    guard();
    await ctx.db.patch(roomId, { ownerId });
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
