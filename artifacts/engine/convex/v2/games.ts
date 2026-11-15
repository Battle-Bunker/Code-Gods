/** Live game queries every member reads: the header, the scoreboard and its history (integration plan §2.2). */
import { durationModeOf, scoreIntervalOf, timeScaleOf } from "./duration";
import { peerNoiseSigmaOf, peerNoiseVarianceOf } from "./disclose";
import { readPriceWeightOf } from "./knowledge";
import { priceScaleOf } from "./pricing";
import { driftSecondsOf } from "./drift";
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
    // In halfLife mode the end is hidden while live (v1): no deadline, only the mode and the half-life.
    planningEndsAt: game.planningEndsAt ?? null, endsAt: durationModeOf(game) === "halfLife" && game.phase !== "ended" ? null : game.endsAt ?? null,
    durationMode: durationModeOf(game), scoreIntervalSeconds: scoreIntervalOf(game),
    // Paused for idleness (activity.ts): any human activity (account.touch) resumes it.
    parked: !!game.parked, startedAt: game.startedAt ?? null, endedAt: game.endedAt ?? null,
    roster: game.roster, pausedBy: game.pausedBy ?? null, me, summary: game.summary ?? null,
    // The variance of each reading of the others' sums while live (disclose.ts, decision 32), and its σ; 0: exact.
    peerNoiseVariance: peerNoiseVarianceOf(game), peerNoiseBits: peerNoiseSigmaOf(game),
    // Whether a seated player sees objects as last told and pays to look (knowledge.ts).
    // The weight on a look's read price (decision 35): 0 reads the live world free.
    readPriceWeight: readPriceWeightOf(game),
    // The factor on summon and edit prices (power ÷ 64): the app scales the prices it quotes by it.
    priceScale: priceScaleOf(game),
    // Time dilation (decision 37): the game's settings are already dilated by it (simulations and local playtests).
    timeScale: timeScaleOf(game.settings),
    // Parameter drift (drift.ts): drift k at world second k × driftSeconds, so the app counts down from the clock.
    driftSeconds: driftSecondsOf(game),
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
