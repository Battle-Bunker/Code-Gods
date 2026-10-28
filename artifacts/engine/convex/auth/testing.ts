/**
 * TEST FIXTURES ONLY (artifacts/engine/test/auth.test.ts). Every function refuses to run unless the
 * deployment env var CODE_GODS_TEST_FIXTURES=1 is set, which only scripts/dev.mjs does on the local
 * backend. Production must never set it.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireRoomPermission, requireViewer } from "./access";
import { normalizeUserCode, sha256Hex } from "./crypto";
import { DEFAULT_SETTINGS, defaultSettingsFor } from "@workspace/game-core";

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

/** A schema-valid room row with default settings, plus the owner's membership (what rooms.create writes). */
export const createRoom = internalMutation({
  args: { shortCode: v.string(), ownerId: v.string() },
  handler: async (ctx, { shortCode, ownerId }) => {
    guard();
    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      shortCode, guid: crypto.randomUUID(), encoded: shortCode, ownerId, createdAt: now, revision: 0, seq: 0,
      settings: defaultSettingsFor(DEFAULT_SETTINGS.objectType),
      aiBudget: 0, aiUsed: 0, aiReservedUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCalls: [],
    });
    await ctx.db.insert("members", { roomId, godId: ownerId, userId: ownerId, name: ownerId, kind: "human", ready: false, joinedAt: now });
    return roomId;
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
