/** Live game queries every member reads: the header, the scoreboard and its history (integration plan §2.2). */
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireGameMember, ruleOf } from "./access";
import { headerV, standingsHistoryV, standingsV } from "./validators";

export function headerView(game: Doc<"v2Games">, me: Doc<"v2Members">["_id"] | null) {
  return {
    gameId: game._id, roomId: game.roomId, number: game.number, code: game.code, phase: game.phase,
    preset: game.preset, variant: game.variant,
    planningSeconds: game.settings.planningSeconds, worldSeconds: game.settings.worldSeconds, startingEnergy: game.settings.startingEnergy,
    planningEndsAt: game.planningEndsAt ?? null, endsAt: game.endsAt ?? null, startedAt: game.startedAt ?? null, endedAt: game.endedAt ?? null,
    roster: game.roster, pausedBy: game.pausedBy ?? null, me, summary: game.summary ?? null,
  };
}

/** Cold: changes with the phase only. */
export const header = query({
  args: { gameId: v.string() },
  returns: headerV,
  handler: async (ctx, { gameId }) => {
    const { game, member } = await requireGameMember(ctx, gameId);
    const seat = await ruleOf(ctx, game._id, member._id);
    return headerView(game, seat ? member._id : null);
  },
});

/** One document, rewritten on the scoreboard's cadence. Null before the first scoreboard. */
export const standings = query({
  args: { gameId: v.string() },
  returns: v.union(standingsV, v.null()),
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    const s = await ctx.db.query("v2Standings").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
    return s ? { seq: s.seq, worldSeconds: s.worldSeconds, rows: s.rows } : null;
  },
});

/** Up to 100 scoreboard snapshots after `after` (append-only: a client asks again from its last seq). */
export const standingsHistory = query({
  args: { gameId: v.string(), after: v.number() },
  returns: standingsHistoryV,
  handler: async (ctx, { gameId, after }) => {
    const { game } = await requireGameMember(ctx, gameId);
    const rows = await ctx.db.query("v2StandingsHistory").withIndex("by_game_seq", q => q.eq("gameId", game._id).gt("seq", after)).take(100);
    return rows.map(r => ({ seq: r.seq, worldSeconds: r.worldSeconds, totals: r.totals }));
  },
});
