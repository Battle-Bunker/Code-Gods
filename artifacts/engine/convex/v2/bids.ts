/**
 * The bid screen's live query (integration plan §5.9): the open phase, the caller's own sealed bids and who is done.
 * Other players' bids are never returned. Writes are the `bid.*` affordances (ops/bid.ts).
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { MAX_MEMBERS, requireMember } from "./access";
import { bidStateV } from "./validators";

export const state = query({
  args: { roomId: v.string() },
  returns: bidStateV,
  handler: async (ctx, { roomId }) => {
    const { room, member } = await requireMember(ctx, roomId);
    if (!room.bidding) return { open: false, deadline: null, families: [], mine: [], done: false, players: [] };
    const rows = await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
    const members = await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
    const mine = rows.find(r => r.memberId === member._id);
    return {
      open: true, deadline: room.bidding.deadline, families: room.bidding.families, mine: mine?.bids ?? [], done: mine?.done ?? false,
      players: members.filter(m => m.kind === "human" && !m.spectator)
        .map(m => ({ memberId: m._id, name: m.name, done: rows.some(r => r.memberId === m._id && r.done) })),
    };
  },
});
