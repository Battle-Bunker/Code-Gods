/**
 * AI seats (plan §9): a scheduled action chain per (game, seat) (ai/turn.ts). This module holds the
 * transactional parts: starting chains (a generation number per seat, so a stale scheduled turn exits),
 * the turn context, seat status, and the budgets. Reservations (room tokens, $2 per game, $5 per UTC day
 * across rooms, 6 calls per minute per room) are taken here BEFORE each provider call and never refunded
 * on failure; after a trustworthy provider usage report the unused TOKEN allowance is returned (USD never).
 * The same reserve/settle serve the in-client assistant's separate pool (`pool: "assistant"`): an allowance per
 * human per game, the room's assistant USD per game, a daily assistant ceiling and per-player/per-room call rates.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  ASSISTANT_CALLS_PER_MINUTE, ASSISTANT_GAME_USD, ASSISTANT_ROOM_CALLS_PER_MINUTE, CALLS_PER_MINUTE, DAILY_ASSISTANT_USD, DAILY_HOST_USD, GAME_USD,
} from "../lib/aiModels";
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
    const seat = await ctx.db.query("deities").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", godId)).unique();
    if (!room || !member || member.aiChain !== chain || !seat?.aiAgent) return { stop: "stale chain" as const };
    if (game.phase === "ended" || game.phase === "recovery") return { stop: game.phase };
    if (isIdle(await lastHumanActivity(ctx))) return { stop: "idle" as const };
    if (game.phase === "paused") return { waitUntil: game.pauseEndsAt };
    return { roomId: room._id, agent: seat.aiAgent, failures: member.aiFailures ?? 0 };
  },
});

/**
 * Record a turn's outcome and schedule the next one (backoff on failure; stop after five failures). A failed turn's
 * status says when the seat retries. A turn that finishes after its game ended leaves the lobby status alone.
 */
export const afterTurn = internalMutation({
  args: { gameId: v.id("games"), godId: v.string(), chain: v.number(), ok: v.boolean(), status: v.string(), waitUntil: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;
    const member = await ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", game.roomId).eq("godId", args.godId)).unique();
    if (!member || member.aiChain !== args.chain || game.phase === "ended") return;
    const failures = args.ok ? 0 : (member.aiFailures ?? 0) + 1;
    const stopped = failures >= MAX_FAILURES;
    const delay = args.waitUntil !== undefined ? Math.max(0, args.waitUntil - Date.now()) + 500 : Math.min(60_000, TURN_MS * 2 ** failures);
    const status = stopped ? `Stopped after ${MAX_FAILURES} failed turns (${args.status})`
      : args.ok || game.phase === "recovery" ? args.status : `${args.status}; retrying in ${Math.round(delay / 1000)} s`;
    await ctx.db.patch(member._id, { aiFailures: failures, status });
    if (stopped || game.phase === "recovery") return;
    await ctx.scheduler.runAfter(delay, internal.ai.turn.run, { gameId: args.gameId, godId: args.godId, chain: args.chain });
  },
});

/** Which budget a reservation draws on: the AI seats' room pool, or the in-client assistant's per-human pool. */
const pool = v.optional(v.union(v.literal("seats"), v.literal("assistant")));

export type Reservation =
  | { ok: true; reservedTokens: number; reservedUsd: number; epoch: string }
  | { ok: false; reason: "off" | "allowance" | "usd" | "daily" | "rate"; message: string; retryAfterMs?: number };

/**
 * Reserve a provider call before making it. `pool: "seats"` (default) throws RATE_LIMITED past the room's token
 * budget, $2 per game, $5 per day or 6 calls a minute. `pool: "assistant"` (assistant/step.ts) answers
 * {ok: false, reason, message} instead, so the turn can end with a clear reason or wait out a rate limit.
 */
export const reserve = internalMutation({
  args: { pool, roomId: v.id("rooms"), gameId: v.optional(v.id("games")), subject: v.optional(v.string()), tokens: v.number(), usd: v.number() },
  handler: async (ctx, { pool, roomId, gameId, subject, tokens, usd }): Promise<Reservation> => {
    if (!Number.isSafeInteger(tokens) || tokens < 1 || !Number.isFinite(usd) || usd <= 0) fail("BAD_REQUEST", "Invalid AI reservation");
    if (pool === "assistant") return reserveAssistant(ctx, roomId, subject ?? fail("BAD_REQUEST", "An assistant reservation names its human"), tokens, usd);
    const room = await ctx.db.get(roomId);
    const game = gameId ? await ctx.db.get(gameId) : null;
    if (!room || !game || room.currentGameId !== gameId || game.phase === "ended" || game.phase === "recovery") fail("CONFLICT", "AI game inactive");
    const now = Date.now(), day = utcDay(now);
    const daily = await ctx.db.query("aiUsage").withIndex("by_day", q => q.eq("day", day)).unique();
    const calls = room.aiCalls.filter(t => now - t < 60_000);
    if (room.aiUsed + tokens > room.aiBudget || room.aiReservedUsd + usd > GAME_USD + 1e-12 ||
        (daily?.usd ?? 0) + usd > DAILY_HOST_USD + 1e-12 || calls.length >= CALLS_PER_MINUTE) fail("RATE_LIMITED", "AI budget or rate limit reached");
    await ctx.db.patch(room._id, { aiUsed: room.aiUsed + tokens, aiReservedUsd: room.aiReservedUsd + usd, aiCalls: [...calls, now] });
    if (daily) await ctx.db.patch(daily._id, { usd: daily.usd + usd, calls: daily.calls + 1 });
    else await ctx.db.insert("aiUsage", { day, usd, calls: 1 });
    return { ok: true, reservedTokens: tokens, reservedUsd: usd, epoch: String(gameId) };
  },
});

/** The assistant allowance's epoch: the room's current game (active, or the latest until the next launch), else "lobby". */
export const assistantEpoch = (room: Doc<"rooms">) => room.currentGameId ? String(room.currentGameId) : ASSISTANT_LOBBY;
/** The assistant epoch before a room's first game. */
export const ASSISTANT_LOBBY = "lobby";
/**
 * The room-wide assistant counters (USD reserved this epoch, calls in the last minute) live in the allowance row of
 * this subject, which no human has, so the hot `rooms` document is not rewritten on every model step.
 */
export const ROOM_POOL = "";
async function poolRow(ctx: QueryCtx, roomId: Id<"rooms">, subject: string, epoch: string) {
  return ctx.db.query("assistantAllowances").withIndex("by_key", q => q.eq("roomId", roomId).eq("subject", subject).eq("epoch", epoch)).unique();
}
/** A human's assistant allowance in this room's current epoch. */
export async function allowanceOf(ctx: QueryCtx, room: Doc<"rooms">, subject: string) {
  const epoch = assistantEpoch(room);
  const doc = await poolRow(ctx, room._id, subject, epoch);
  return { epoch, doc, limit: room.assistantBudget ?? 0, used: doc?.usedTokens ?? 0 };
}

async function reserveAssistant(ctx: MutationCtx, roomId: Id<"rooms">, subject: string, tokens: number, usd: number): Promise<Reservation> {
  const room = await ctx.db.get(roomId) ?? fail("NOT_FOUND", "Room not found");
  const { epoch, doc, limit, used } = await allowanceOf(ctx, room, subject);
  if (limit <= 0) return { ok: false, reason: "off", message: "The room owner has not enabled the assistant (its allowance is 0 tokens)." };
  if (tokens > limit) {
    return { ok: false, reason: "allowance", message: `The room's assistant allowance (${limit} tokens per player per game) is smaller than one step may need (${tokens}); ask the owner to raise it.` };
  }
  if (used + tokens > limit) {
    const n = (x: number) => Math.max(0, x).toLocaleString("en");
    return { ok: false, reason: "allowance", message: `Your assistant allowance for this game is too low for another step: ${n(used)} of ${n(limit)} tokens used (${n(limit - used)} left), and the next step may need up to ${n(tokens)}. The room owner can raise it.` };
  }
  const shared = await poolRow(ctx, roomId, ROOM_POOL, epoch);
  if ((shared?.reservedUsd ?? 0) + usd > ASSISTANT_GAME_USD + 1e-12) {
    return { ok: false, reason: "usd", message: `The room's assistant spending ceiling for this game (USD ${ASSISTANT_GAME_USD}) is reached.` };
  }
  const now = Date.now(), day = utcDay(now);
  const daily = await ctx.db.query("aiUsage").withIndex("by_day", q => q.eq("day", day)).unique();
  if ((daily?.assistantUsd ?? 0) + usd > DAILY_ASSISTANT_USD + 1e-12) {
    return { ok: false, reason: "daily", message: `This deployment's daily assistant ceiling (USD ${DAILY_ASSISTANT_USD}) is reached; it resets at 00:00 UTC.` };
  }
  const mine = (doc?.calls ?? []).filter(t => now - t < 60_000);
  const roomCalls = (shared?.calls ?? []).filter(t => now - t < 60_000);
  if (mine.length >= ASSISTANT_CALLS_PER_MINUTE || roomCalls.length >= ASSISTANT_ROOM_CALLS_PER_MINUTE) {
    const oldest = Math.min(...(mine.length >= ASSISTANT_CALLS_PER_MINUTE ? mine : roomCalls));
    return { ok: false, reason: "rate", message: "Too many assistant calls this minute; waiting.", retryAfterMs: Math.max(1000, oldest + 60_000 - now) };
  }
  if (doc) await ctx.db.patch(doc._id, { usedTokens: used + tokens, calls: [...mine, now] });
  else await ctx.db.insert("assistantAllowances", { roomId, subject, epoch, usedTokens: tokens, calls: [now] });
  if (shared) await ctx.db.patch(shared._id, { reservedUsd: (shared.reservedUsd ?? 0) + usd, calls: [...roomCalls, now] });
  else await ctx.db.insert("assistantAllowances", { roomId, subject: ROOM_POOL, epoch, usedTokens: 0, reservedUsd: usd, calls: [now] });
  if (daily) await ctx.db.patch(daily._id, { assistantUsd: (daily.assistantUsd ?? 0) + usd, assistantCalls: (daily.assistantCalls ?? 0) + 1 });
  else await ctx.db.insert("aiUsage", { day, usd: 0, calls: 0, assistantUsd: usd, assistantCalls: 1 });
  return { ok: true, reservedTokens: tokens, reservedUsd: usd, epoch };
}

/**
 * After a trustworthy usage report: return the unused token allowance. Seats keep their USD reservation; the
 * assistant pool (many small steps, each reserved for its worst case) also returns the unused USD of the room's
 * and the day's counters, keeping the actual cost (`usd`, priced at the catalog rate).
 */
export const settle = internalMutation({
  args: {
    pool, roomId: v.id("rooms"), gameId: v.optional(v.id("games")), subject: v.optional(v.string()), epoch: v.optional(v.string()),
    reservedTokens: v.number(), inputTokens: v.number(), outputTokens: v.number(), reservedUsd: v.optional(v.number()), usd: v.optional(v.number()),
    /** The assistant pool: the allowance tokens to keep (cache-weighted, lib/ai-player usageCost); default input + output. */
    tokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const valid = (n: number) => Number.isSafeInteger(n) && n >= 0;
    if (args.pool === "assistant") {
      // The assistant keeps its actual cost even past the reservation (an estimate that was low): the allowance and
      // the USD counters may then end slightly above their limits, and the next reservation is refused.
      const actual = args.tokens ?? args.inputTokens + args.outputTokens;
      if (![args.inputTokens, args.outputTokens, actual].every(valid) || (args.usd !== undefined && !(Number.isFinite(args.usd) && args.usd >= 0))) fail("BAD_REQUEST", "Invalid AI usage");
      const epoch = args.epoch ?? "";
      const doc = await poolRow(ctx, args.roomId, args.subject ?? "", epoch);
      if (doc) await ctx.db.patch(doc._id, { usedTokens: Math.max(0, doc.usedTokens - (args.reservedTokens - actual)) });
      const refund = (args.reservedUsd ?? 0) - (args.usd ?? Infinity);
      if (Number.isFinite(refund) && refund !== 0) {
        const shared = await poolRow(ctx, args.roomId, ROOM_POOL, epoch);
        if (shared) await ctx.db.patch(shared._id, { reservedUsd: Math.max(0, (shared.reservedUsd ?? 0) - refund) });
        const daily = await ctx.db.query("aiUsage").withIndex("by_day", q => q.eq("day", utcDay(Date.now()))).unique();
        if (daily) await ctx.db.patch(daily._id, { assistantUsd: Math.max(0, (daily.assistantUsd ?? 0) - refund) });
      }
      return;
    }
    const actual = args.inputTokens + args.outputTokens;
    if (![args.inputTokens, args.outputTokens].every(valid) || actual > args.reservedTokens) fail("BAD_REQUEST", "Invalid AI usage");
    const room = await ctx.db.get(args.roomId);
    if (!room || room.currentGameId !== args.gameId) return; // a later game has its own counters
    await ctx.db.patch(room._id, {
      aiUsed: room.aiUsed - (args.reservedTokens - actual),
      aiInputTokens: room.aiInputTokens + args.inputTokens, aiOutputTokens: room.aiOutputTokens + args.outputTokens,
    });
  },
});
