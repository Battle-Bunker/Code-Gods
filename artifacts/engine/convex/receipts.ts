/** Receipt lookup for idempotent commands (the room assistant's `receipt`). */
import { v } from "convex/values";
import type { CommandResult } from "@workspace/player-client";
import { query } from "./_generated/server";
import { findReceipt } from "./game/commands";
import { requireMember, requireRoom } from "./lib/rooms";

/** The stored receipt of one of the caller's commands in this room, or null if the engine never received it. */
export const get = query({
  args: { roomId: v.string(), commandId: v.string() },
  handler: async (ctx, { roomId, commandId }) => {
    const room = await requireRoom(ctx, roomId);
    const { viewer } = await requireMember(ctx, room, "read");
    const r = await findReceipt(ctx, room._id, viewer.subject, commandId);
    return r ? (r.result as CommandResult) : null;
  },
});
