/**
 * The bid screen's live query (integration plan §5.9): the open phase, the caller's own bids and who is done. Other
 * players' bids are returned only when the room bids in the open (v1's bidVisibility "open"); sealed, never. Writes are
 * the `bid.*` affordances (ops/bid.ts). Kept light (no lobby or dealer import): it is a page query (R8's cold time).
 */
import { v, type Infer } from "convex/values";
import { query } from "../_generated/server";
import { MAX_MEMBERS, requireMember } from "./access";
import { bidStateV } from "./validators";
import type { Doc, Id } from "../_generated/dataModel";

/** No bid phase open: the same shape, empty (typed, so the screen's array calls see one element type). */
const CLOSED: Infer<typeof bidStateV> = { open: false, deadline: null, families: [], mine: [], done: false, players: [], visibility: "sealed", others: [], pricing: "first", bidder: false };

export const state = query({
  args: { roomId: v.string() },
  returns: bidStateV,
  handler: async (ctx, { roomId }) => {
    const { room, member } = await requireMember(ctx, roomId);
    if (!room.bidding) return CLOSED;
    const rows = await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
    const members = await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
    const mine = rows.find(r => r.memberId === member._id);
    const visibility = room.bidding.visibility ?? "sealed", others = openBids(room.bidding, rows, members, member._id);
    return {
      visibility, others, pricing: room.bidding.pricing,
      // Whether the caller bids (a seated human); a spectator or an AI's owner watches the clock (v1).
      bidder: member.kind === "human" && !member.spectator,
      open: true, deadline: room.bidding.deadline, families: room.bidding.families, mine: mine?.bids ?? [], done: mine?.done ?? false,
      players: members.filter(m => m.kind === "human" && !m.spectator)
        .map(m => ({ memberId: m._id, name: m.name, done: rows.some(r => r.memberId === m._id && r.done) })),
    };
  },
});

/** The humans who bid: seated (not spectating) and human (practice partners and AI players do not bid). */
export const bidders = (members: readonly Doc<"v2Members">[]) => members.filter(m => m.kind === "human" && !m.spectator);

/**
 * v1's open bidding: the other seated bidders' bids as they stand, for the bid screen and `bid.state` alike; none when
 * the room bids sealed (the default). A bid of a member who now watches or has left is not shown: it no longer counts.
 */
export function openBids(bidding: NonNullable<Doc<"v2Rooms">["bidding"]>, rows: readonly Doc<"v2RoomBids">[], members: readonly Doc<"v2Members">[], me: Id<"v2Members">) {
  if ((bidding.visibility ?? "sealed") !== "open") return [];
  const seated = new Map(bidders(members).map(m => [m._id as string, m.name]));
  return rows.filter(r => r.memberId !== me && r.bids.length > 0 && seated.has(r.memberId)).map(r => ({ memberId: r.memberId, name: seated.get(r.memberId)!, bids: r.bids }));
}
