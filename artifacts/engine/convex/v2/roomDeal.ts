/**
 * A room's members and the deal its next game would get (the rotation), read from the documents and the deal alone:
 * its own module so the room page's queries (rooms.ts) do not load the world or the value curves
 * (test/unit/v2-values-load.test.ts). lobby.ts re-exports these.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { MAX_MEMBERS } from "./access";
import { dealablePool, dealKeyOf, rotatedDeal, type DealtRule, type PastDeal } from "./deal.ts";
import { presetOf } from "./presets.ts";

export async function membersOf(ctx: QueryCtx, roomId: Id<"v2Rooms">) {
  return await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", roomId)).take(MAX_MEMBERS);
}

/** The rules a room deals: its preset's dealable pool less the families the room never deals (v1's excludedFamilies). */
export function roomPool(room: Pick<Doc<"v2Rooms">, "preset" | "overrides">) {
  const pool = dealablePool(presetOf(room.preset)), out = room.overrides.excludedFamilies;
  return out?.length ? pool.filter(r => !out.includes(r.family)) : pool;
}

/**
 * The room's last games (newest first) as rotation history: roster order and each seat's rule key, from the headers
 * alone. As many games as a room has seats at most, which is the longest a rotation can run.
 */
export async function dealHistory(ctx: QueryCtx, roomId: Id<"v2Rooms">): Promise<PastDeal[]> {
  const games = await ctx.db.query("v2Games").withIndex("by_room", q => q.eq("roomId", roomId)).order("desc").take(MAX_MEMBERS);
  return games.map(g => {
    const keys = new Map(g.artefacts.map(a => [a.memberId, a.ruleKey]));
    return { members: g.roster.map(s => s.memberId), rules: g.roster.map(s => keys.get(s.memberId) ?? ""), dealKey: g.dealKey, bid: !g.rotates };
  });
}

/** The rotated deal the next game would get, or null when it would be dealt fresh. */
export async function rotationFor(ctx: QueryCtx, room: Doc<"v2Rooms">, seats: readonly Doc<"v2Members">[]) {
  const preset = presetOf(room.preset), pool = roomPool(room), dealKey = dealKeyOf(preset, pool);
  // Rules rotate round the same seats in every room, a practice room too (v1's rotation; playtest round 9): its first
  // game is the practice deal (practiceDeal), and the games after pass those rules on.
  const rotated = rotatedDeal(seats.map(s => s._id), dealKey, await dealHistory(ctx, room._id));
  const byKey = new Map(pool.map(r => [r.ruleKey, r]));
  const rules = rotated?.rules.map(k => byKey.get(k));
  return { pool, dealKey, rotated: rules && rules.every(r => r) ? { rules: rules as DealtRule[], round: rotated!.round, of: rotated!.of } : null };
}
