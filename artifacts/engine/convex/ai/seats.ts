/**
 * AI seats (plan §9): a scheduled action chain per (game, seat) (ai/turn.ts). This module holds the
 * transactional parts: starting chains (a generation number per seat, so a stale scheduled turn exits),
 * the turn context, seat status, and the budgets. Reservations (room tokens, $2 per game, $5 per UTC day
 * across rooms, 6 calls per minute per room) are taken here BEFORE each provider call and never refunded
 * on failure; after a trustworthy provider usage report the unused TOKEN allowance is returned (USD never).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { CALLS_PER_MINUTE, DAILY_HOST_USD, GAME_USD } from "../lib/aiModels";
import { fail } from "../lib/errors";
import { isIdle, lastHumanActivity, membersOf } from "../lib/rooms";
import { utcDay } from "../lib/world";

/** Turn interval and backoff. */
export const TURN_MS = 12_000;
export const MAX_FAILURES = 5;

/** (Re)start every AI seat's chain of a game: on start and on resume. */
export const startAll = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.phase === "ended" || game.phase === "recovery") return;
    const members = await membersOf(ctx, game.roomId);
    let i = 0;
    for (const member of members) {
      if (member.kind !== "ai" || !game.roster.some(r => r.id === member.godId)) continue;
      const chain = (member.aiChain ?? 0) + 1;
      await ctx.db.patch(member._id, { aiChain: chain, aiFailures: 0 });
      await ctx.scheduler.runAfter(1000 + 2500 * i++, internal.ai.turn.run, { gameId, godId: member.godId, chain });
    }
  },
});

/** What a turn needs, or why it must not run now. */
export const turnContext = internalQuery({
  args: { gameId: v.id("games"), godId: v.string(), chain: v.number() },
  handler: async (ctx, { gameId, godId, chain }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return { stop: "game gone" as const };
    const room = await ctx.db.get(game.roomId);
    const member = room ? await ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", room._id).eq("godId", godId)).unique() : null;
    const seat = game.roster.find(r => r.id === godId);
    if (!room || !member || member.aiChain !== chain || !seat?.aiAgent) return { stop: "stale chain" as const };
    if (game.phase === "ended" || game.phase === "recovery") return { stop: game.phase };
    if (isIdle(await lastHumanActivity(ctx))) return { stop: "idle" as const };
    if (game.phase === "paused") return { waitUntil: game.pauseEndsAt };
    return { roomId: room._id, agent: seat.aiAgent, failures: member.aiFailures ?? 0 };
  },
});

/** Record a turn's outcome and schedule the next one (backoff on failure; stop after five failures). */
export const afterTurn = internalMutation({
  args: { gameId: v.id("games"), godId: v.string(), chain: v.number(), ok: v.boolean(), status: v.string(), waitUntil: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    const member = await ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", game.roomId).eq("godId", args.godId)).unique();
    if (!member || member.aiChain !== args.chain) return;
    const failures = args.ok ? 0 : (member.aiFailures ?? 0) + 1;
    const stopped = failures >= MAX_FAILURES;
    await ctx.db.patch(member._id, { aiFailures: failures, status: stopped ? `Stopped after ${MAX_FAILURES} failed turns (${args.status})` : args.status });
    if (stopped || game.phase === "ended" || game.phase === "recovery") return;
    const delay = args.waitUntil !== undefined ? Math.max(0, args.waitUntil - Date.now()) + 500 : Math.min(60_000, TURN_MS * 2 ** failures);
    await ctx.scheduler.runAfter(delay, internal.ai.turn.run, { gameId: args.gameId, godId: args.godId, chain: args.chain });
  },
});

export const reserve = internalMutation({
  args: { roomId: v.id("rooms"), gameId: v.id("games"), tokens: v.number(), usd: v.number() },
  handler: async (ctx, { roomId, gameId, tokens, usd }) => {
    const room = await ctx.db.get(roomId);
    const game = await ctx.db.get(gameId);
    if (!room || !game || room.currentGameId !== gameId || game.phase === "ended" || game.phase === "recovery") fail("CONFLICT", "AI game inactive");
    const now = Date.now(), day = utcDay(now);
    const daily = await ctx.db.query("aiUsage").withIndex("by_day", q => q.eq("day", day)).unique();
    const calls = room.aiCalls.filter(t => now - t < 60_000);
    if (!Number.isSafeInteger(tokens) || tokens < 1 || !Number.isFinite(usd) || usd <= 0 ||
        room.aiUsed + tokens > room.aiBudget || room.aiReservedUsd + usd > GAME_USD + 1e-12 ||
        (daily?.usd ?? 0) + usd > DAILY_HOST_USD + 1e-12 || calls.length >= CALLS_PER_MINUTE) fail("RATE_LIMITED", "AI budget or rate limit reached");
    await ctx.db.patch(room._id, { aiUsed: room.aiUsed + tokens, aiReservedUsd: room.aiReservedUsd + usd, aiCalls: [...calls, now] });
    if (daily) await ctx.db.patch(daily._id, { usd: daily.usd + usd, calls: daily.calls + 1 });
    else await ctx.db.insert("aiUsage", { day, usd, calls: 1 });
    return { reservedTokens: tokens, reservedUsd: usd };
  },
});

/** Return the unused token allowance after a trustworthy usage report (USD reservations are kept). */
export const settle = internalMutation({
  args: { roomId: v.id("rooms"), gameId: v.id("games"), reservedTokens: v.number(), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, args) => {
    const actual = args.inputTokens + args.outputTokens;
    if (![args.inputTokens, args.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0) || actual > args.reservedTokens) fail("BAD_REQUEST", "Invalid AI usage");
    const room = await ctx.db.get(args.roomId);
    if (!room || room.currentGameId !== args.gameId) return; // a later game has its own counters
    await ctx.db.patch(room._id, {
      aiUsed: room.aiUsed - (args.reservedTokens - actual),
      aiInputTokens: room.aiInputTokens + args.inputTokens, aiOutputTokens: room.aiOutputTokens + args.outputTokens,
    });
  },
});
