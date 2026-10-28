/** Engine-internal reads (admin/engine only; never exposed to clients). */
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { buildObservation } from "../lib/load";

export const roomForEngine = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => ctx.db.get(roomId),
});

/** An AI seat's observation: exactly its own projection, like a human's. */
export const observationAs = internalQuery({
  args: { roomId: v.id("rooms"), godId: v.string() },
  handler: async (ctx, { roomId, godId }) => {
    const room = await ctx.db.get(roomId);
    return room ? buildObservation(ctx, room, godId) : null;
  },
});
