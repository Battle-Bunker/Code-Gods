/** Live game queries every member reads: the header, the scoreboard and its history (integration plan §2.2). */
import { standingsFor } from "./disclose";
import { durationModeOf, scoreIntervalOf, timeScaleOf } from "./duration";
import { peerNoiseSigmaOf, peerNoiseVarianceOf } from "./disclose";
import { readPriceWeightOf } from "./knowledge";
import { priceScaleOf } from "./pricing";
import { driftSecondsOf } from "./drift";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requireGameMember, ruleOf } from "./access";
import { gameDetailsV, headerV, standingsHistoryV, standingsV } from "./validators";
import { locksOn, ratesOf } from "./locks.ts";

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
    roster: game.roster, pausedBy: game.pausedBy ?? null, pauseEndsAt: game.pauseEndsAt ?? null, me, summary: game.summary ?? null,
    // The variance of each reading of the others' sums while live (disclose.ts, decision 32), and its σ; 0: exact.
    peerNoiseVariance: peerNoiseVarianceOf(game), peerNoiseBits: peerNoiseSigmaOf(game),
    // Whether a seated player sees objects as last told and pays to look (knowledge.ts).
    // The weight on a look's read price (decision 35): 0 reads the live world free.
    readPriceWeight: readPriceWeightOf(game),
    // The factor on summon and edit prices (power ÷ 64): the app scales the prices it quotes by it.
    priceScale: priceScaleOf(game),
    locks: locksOn(game) ? ratesOf(game) : null,
    // Time dilation (decision 37): the game's settings are already dilated by it (simulations and local playtests).
    timeScale: timeScaleOf(game.settings),
    // Parameter drift (drift.ts): drift k at world second k × driftSeconds, so the app counts down from the clock.
    driftSeconds: driftSecondsOf(game),
    // Line turnover (retirement-design.md): at most liveCap live lines, a birth every birthSeconds, the oldest retiring
    // with its points kept in the totals (banked) or not; null: every line stays live.
    turnover: game.settings.turnover ? {
      liveCap: game.settings.turnover.liveCap, banked: game.settings.turnover.retiredPoints === "banked",
      birthSeconds: game.settings.regularBirths && game.settings.economy.birthsPerSecond > 0 ? 1 / game.settings.economy.birthsPerSecond : null,
    } : null,
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
    const { game, member } = await requireGameMember(ctx, gameId);
    const s = await ctx.db.query("v2Standings").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
    // v1's private bid results: another player's handicap is not told while the game runs (disclose.ts standingsFor).
    return s ? { seq: s.seq, worldSeconds: s.worldSeconds, ...standingsFor(game, s.rows, member._id) } : null;
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

/**
 * "Game details" (v1's section on the game page): the settings and timings, and after the end every seat's rule with
 * its holder (one index page, ≤ 16). While live no rule is named: a player reads their own with v2/play:myRule, and
 * the rules any seat could hold with rule.candidates (which never says who holds which). Cold: changes with the phase.
 */
export const details = query({
  args: { gameId: v.string() },
  returns: gameDetailsV,
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    const ended = game.phase === "ended";
    const rules = ended
      ? (await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id)).take(16)).map(r => {
        const seat = game.roster.find(s => s.memberId === r.memberId);
        return {
          memberId: r.memberId, name: seat?.name ?? "", kind: seat?.kind ?? "human", family: r.family, params: r.params, tieBreaker: r.tieBreaker,
          title: r.title, card: r.card, bid: r.bid ?? null, handicap: r.handicap ?? null, drifts: r.drifts ?? 0,
        };
      })
      : null;
    return {
      gameId: game._id, phase: game.phase, preset: game.preset, variant: game.variant, settings: game.settings,
      createdAt: game.createdAt, startedAt: game.startedAt ?? null, planningEndsAt: game.planningEndsAt ?? null,
      endsAt: durationModeOf(game) === "halfLife" && !ended ? null : game.endsAt ?? null, endedAt: game.endedAt ?? null,
      endWorld: ended ? game.endAtWorld ?? game.settings.worldSeconds : null,
      endReason: ended ? game.endReason ?? null : null,
      rules,
    };
  },
});

/**
 * Who is ready (v1's "Who is here" roster: a ✓ beside each seat that is ready): one index page of the game's seats
 * (≤ 16), each seat's ready flag only. A player row holds no tick-written field (energy is v2AgentEnergy's), so this
 * read reruns when someone marks ready, a pause is used or an agent is summoned, never on a tick.
 */
export const readiness = query({
  args: { gameId: v.string() },
  returns: v.array(v.object({ memberId: v.id("v2Members"), ready: v.boolean() })),
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
    return players.map(p => ({ memberId: p.memberId, ready: p.ready }));
  },
});
