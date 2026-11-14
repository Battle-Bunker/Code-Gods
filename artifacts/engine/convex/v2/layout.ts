/** The caller's dock layout in a room (client affordances' state lives in it: integration plan §2.5). */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireMember } from "./access";
import { layoutV } from "./validators";

export const current = query({
  args: { roomId: v.string() },
  returns: layoutV,
  handler: async (ctx, { roomId }) => {
    const { user, room } = await requireMember(ctx, roomId);
    const row = await ctx.db.query("v2Layouts").withIndex("by_user_room", q => q.eq("userId", user.userId).eq("roomId", room._id)).unique();
    return row ? { layout: row.layout, view: row.view ?? null, revision: row.revision } : null;
  },
});
