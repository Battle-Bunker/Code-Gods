/**
 * `bid.*`: the room's bid phase (integration plan §5.9). Sealed: a player sees only their own bids. Practice partners
 * and AI players do not bid. The phase closes and the game is dealt when every human player is done, or at the
 * deadline (bids.ts closeAtDeadline).
 */
import { OpFailure } from "@workspace/v2-affordances";
import { BID_MAX_PERCENT, BID_MIN_PERCENT } from "@workspace/v2-economy";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { bidders, closeIfAllDone } from "../lobby";
import { MAX_MEMBERS } from "../access";
import { defineOp, inRoom } from "./define";

function openPhase(room: Doc<"v2Rooms">) {
  if (!room.bidding) throw new OpFailure("There is no bid phase open.");
  return room.bidding;
}
function bidder(member: Doc<"v2Members">) {
  if (bidders([member]).length === 0) throw new OpFailure("Only seated human players bid.");
  return member;
}
async function rowOf(ctx: MutationCtx, room: Doc<"v2Rooms">, member: Doc<"v2Members">) {
  return await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id).eq("memberId", member._id)).unique();
}
async function save(ctx: MutationCtx, room: Doc<"v2Rooms">, member: Doc<"v2Members">, f: (r: { bids: { family: string; percent: number }[]; done: boolean }) => { bids: { family: string; percent: number }[]; done: boolean }) {
  const row = await rowOf(ctx, room, member);
  const next = f({ bids: row?.bids ?? [], done: row?.done ?? false });
  if (row) await ctx.db.patch(row._id, next);
  else await ctx.db.insert("v2RoomBids", { roomId: room._id, memberId: member._id, ...next });
  // Everyone done: the phase ends now.
  if (next.done) await closeIfAllDone(ctx, room._id);
}

export const { op: state, as: stateAs } = defineOp("bid.state", "query", async env => {
  const { room, member } = inRoom(env);
  const phase = openPhase(room);
  const rows = await env.ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
  const members = await env.ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
  const mine = rows.find(r => r.memberId === member._id);
  return {
    deadline: phase.deadline, pricing: phase.pricing,
    families: phase.families.map(f => ({ family: f.family, card: f.card, top: f.top })),
    mine: mine?.bids ?? [],
    done: rows.filter(r => r.done).map(r => ({ memberId: r.memberId, name: members.find(m => m._id === r.memberId)?.name ?? "" })),
  };
});

export const { op: place, as: placeAs } = defineOp("bid.place", "mutation", async (env, a) => {
  const { room, member } = inRoom(env);
  const phase = openPhase(room);
  bidder(member);
  if (!phase.families.some(f => f.family === a.family)) throw new OpFailure(`${a.family} is not on offer.`, "bid.state");
  if (a.percent < BID_MIN_PERCENT || a.percent > BID_MAX_PERCENT) throw new OpFailure(`A bid is ${BID_MIN_PERCENT}–${BID_MAX_PERCENT} percent.`);
  await save(env.ctx, room, member, r => ({ bids: [...r.bids.filter(b => b.family !== a.family), { family: a.family, percent: a.percent }], done: false }));
  return { ok: true as const };
});

export const { op: withdraw, as: withdrawAs } = defineOp("bid.withdraw", "mutation", async (env, a) => {
  const { room, member } = inRoom(env);
  openPhase(room);
  bidder(member);
  await save(env.ctx, room, member, r => ({ bids: r.bids.filter(b => b.family !== a.family), done: false }));
  return { ok: true as const };
});

export const { op: done, as: doneAs } = defineOp("bid.done", "mutation", async env => {
  const { room, member } = inRoom(env);
  openPhase(room);
  bidder(member);
  await save(env.ctx, room, member, r => ({ ...r, done: true }));
  return { ok: true as const };
});
