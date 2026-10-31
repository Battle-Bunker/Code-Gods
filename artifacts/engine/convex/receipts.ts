/** Receipt lookup for idempotent commands (the room assistant's `receipt`). */
import { v } from "convex/values";
import type { CommandResult } from "@workspace/player-client";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireViewer, type Viewer } from "./auth/access";
import { findReceipt } from "./game/commands";
import { principalV, requireMemberAs, requireRoom, viewerOf } from "./lib/rooms";

async function receiptFor(ctx: QueryCtx, viewer: Viewer, { roomId, commandId }: { roomId: string; commandId: string }) {
  const room = await requireRoom(ctx, roomId);
  await requireMemberAs(ctx, viewer, room, "read");
  const r = await findReceipt(ctx, room._id, viewer.subject, commandId);
  return r ? (r.result as CommandResult) : null;
}

/** The stored receipt of one of the caller's commands in this room, or null if the engine never received it. */
export const get = query({
  args: { roomId: v.string(), commandId: v.string() },
  handler: async (ctx, args) => receiptFor(ctx, await requireViewer(ctx), args),
});
export const getAs = internalQuery({
  args: { principal: principalV, roomId: v.string(), commandId: v.string() },
  handler: async (ctx, { principal, ...args }) => receiptFor(ctx, await viewerOf(ctx, principal), args),
});
