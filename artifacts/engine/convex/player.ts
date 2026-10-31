/**
 * Player-facing projections (plan §6). Every result is the caller's OWN projection: its own utility card and
 * descriptor, its own scores and peer aggregates (peerNetBits, peerCare, payoff), its own agents (with
 * sources). Never another god's descriptor, per-object score, agent source or seed, and never endAtWorld.
 * History, events and trajectories are projected from the event log with the same rules, so history leaks
 * nothing that live state would not.
 */
import { v } from "convex/values";
import type { GameSettings } from "@workspace/game-core";
import { instantiationOf } from "@workspace/game-core";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireViewer, type Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { buildObservation, currentGame, deityOf } from "./lib/load";
import { projectBatches, trajectories as trajectoriesOf } from "./lib/projection";
import { findGame, principalV, requireMemberAs, requireRoom, viewerOf } from "./lib/rooms";

/*
 * Each projection is a function of (ctx, viewer, args). The public query resolves the viewer from ctx.auth;
 * its internal twin `<name>As` takes a principal {credentialId} (the agent registry, scheduled commands).
 */

/**
 * Protocol v3 observation of the caller in this room (parses with lib/player-client observationSchema).
 * Time-derived fields (god energy, agent energy and eligibility, world seconds) are computed when the
 * query runs. Convex re-runs a subscribed query whenever its data changes (each engine commit), but not
 * merely because time passes: a poller that needs fresh clocks while nothing changes (planning, pause)
 * passes `at` (e.g. its wall clock, rounded to the second). `at` is only a cache key; its value is not used.
 */
export async function observationFor(ctx: QueryCtx, viewer: Viewer, { roomId }: { roomId: string }) {
  const room = await requireRoom(ctx, roomId);
  await requireMemberAs(ctx, viewer, room, "read");
  return (await buildObservation(ctx, room, viewer.subject))!;
}
const observationArgs = { roomId: v.string(), at: v.optional(v.number()) };
export const observation = query({ args: observationArgs, handler: async (ctx, args) => observationFor(ctx, await requireViewer(ctx), args) });
export const observationAs = internalQuery({
  args: { principal: principalV, ...observationArgs },
  handler: async (ctx, { principal, ...args }) => observationFor(ctx, await viewerOf(ctx, principal), args),
});

/** The game a request is about (current slot by default, or an explicit game of this room) and the caller's roster index. */
async function gameFor(ctx: QueryCtx, viewer: Viewer, roomRef: string, gameRef?: string) {
  const room = await requireRoom(ctx, roomRef);
  await requireMemberAs(ctx, viewer, room, "read");
  let game: Doc<"games"> | null;
  if (gameRef) {
    game = await findGame(ctx, gameRef);
    if (!game || game.roomId !== room._id) fail("NOT_FOUND", "Game not found in this room");
  } else game = await currentGame(ctx, room);
  return { room, viewer, game, index: game ? game.roster.findIndex(m => m.id === viewer.subject) : -1 };
}

/**
 * The caller's projected event log of a game (default: the room's current game slot), by batch cursor.
 * `after` is the last seq the caller has; omit it for the latest `limit` batches.
 * Returns {events (each with its seq), nextCursor, latestCursor, gap}.
 */
const eventsArgs = { roomId: v.string(), gameId: v.optional(v.string()), after: v.optional(v.number()), limit: v.optional(v.number()) };
export const events = query({ args: eventsArgs, handler: async (ctx, args) => eventsFor(ctx, await requireViewer(ctx), args) });
export const eventsAs = internalQuery({
  args: { principal: principalV, ...eventsArgs },
  handler: async (ctx, { principal, ...args }) => eventsFor(ctx, await viewerOf(ctx, principal), args),
});
export const eventsFor = async (ctx: QueryCtx, caller: Viewer, args: { roomId: string; gameId?: string; after?: number; limit?: number }) => {
    const { viewer, game, index } = await gameFor(ctx, caller, args.roomId, args.gameId);
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)));
    if (!game) return { gameId: null, events: [], nextCursor: args.after ?? -1, latestCursor: -1, gap: false };
    const after = args.after;
    const batches = after === undefined
      ? (await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", game._id)).order("desc").take(limit)).reverse()
      : await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", game._id).gt("seq", after)).take(limit);
    const latestCursor = game.nextBatch - 1;
    return {
      gameId: game._id, events: projectBatches(batches, viewer.subject, index),
      nextCursor: batches.at(-1)?.seq ?? after ?? latestCursor, latestCursor,
      gap: after !== undefined && batches.length > 0 && batches[0].seq > after + 1,
    };
};

/** Alias of `events` by game id (plan §6 `player.history`): any game of a room the caller belongs to, ended games included. */
const historyArgs = { roomId: v.string(), gameId: v.string(), afterSeq: v.optional(v.number()), limit: v.optional(v.number()) };
export const history = query({ args: historyArgs, handler: async (ctx, args) => historyFor(ctx, await requireViewer(ctx), args) });
export const historyAs = internalQuery({
  args: { principal: principalV, ...historyArgs },
  handler: async (ctx, { principal, ...args }) => historyFor(ctx, await viewerOf(ctx, principal), args),
});
export const historyFor = async (ctx: QueryCtx, caller: Viewer, args: { roomId: string; gameId: string; afterSeq?: number; limit?: number }) => {
    const { viewer, game, index } = await gameFor(ctx, caller, args.roomId, args.gameId);
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)));
    const after = args.afterSeq ?? -1;
    const batches = await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", game!._id).gt("seq", after)).take(limit);
    return { gameId: game!._id, events: projectBatches(batches, viewer.subject, index), nextCursor: batches.at(-1)?.seq ?? after, latestCursor: game!.nextBatch - 1 };
};

/**
 * Per-object series of the caller's own net bits, the peer aggregate and payoff over seq / world time, for
 * the Panel SDK: [{objectId, points: [{seq, worldSeconds, value, ownNetBits, peerNetBits, payoff}]}], from
 * batches after `afterSeq` (at most `limit` batches, default 100, max 200). Spectators get no points.
 */
const trajectoriesArgs = { roomId: v.string(), gameId: v.optional(v.string()), afterSeq: v.optional(v.number()), limit: v.optional(v.number()) };
export const trajectories = query({ args: trajectoriesArgs, handler: async (ctx, args) => trajectoriesFor(ctx, await requireViewer(ctx), args) });
export const trajectoriesAs = internalQuery({
  args: { principal: principalV, ...trajectoriesArgs },
  handler: async (ctx, { principal, ...args }) => trajectoriesFor(ctx, await viewerOf(ctx, principal), args),
});
export const trajectoriesFor = async (ctx: QueryCtx, viewer: Viewer, args: { roomId: string; gameId?: string; afterSeq?: number; limit?: number }) => {
    const { game, index } = await gameFor(ctx, viewer, args.roomId, args.gameId);
    if (!game || index < 0) return { gameId: game?._id ?? null, objects: [], nextCursor: args.afterSeq ?? -1, latestCursor: game ? game.nextBatch - 1 : -1 };
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const after = args.afterSeq ?? -1;
    const batches = await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", game._id).gt("seq", after)).take(limit);
    return { gameId: game._id, objects: trajectoriesOf(batches, index), nextCursor: batches.at(-1)?.seq ?? after, latestCursor: game.nextBatch - 1 };
};

/**
 * The caller's OWN utility descriptor for the current game, with what a client needs to run
 * lib/game-utilities' evaluator(descriptor, inst) and tableFor(...) locally: the instantiation key and the
 * game's (public) settings snapshot. Never another god's descriptor. null when the caller is not seated.
 */
export const myUtility = query({ args: { roomId: v.string() }, handler: async (ctx, args) => myUtilityFor(ctx, await requireViewer(ctx), args) });
export const myUtilityAs = internalQuery({
  args: { principal: principalV, roomId: v.string() },
  handler: async (ctx, { principal, ...args }) => myUtilityFor(ctx, await viewerOf(ctx, principal), args),
});
export async function myUtilityFor(ctx: QueryCtx, viewer: Viewer, { roomId }: { roomId: string }) {
    const room = await requireRoom(ctx, roomId);
    await requireMemberAs(ctx, viewer, room, "read");
    const game = await currentGame(ctx, room);
    const deity = game ? await deityOf(ctx, game._id, viewer.subject) : null;
    if (!game || !deity) return null;
    const settings = game.settings as GameSettings;
    const utility = deity.utility as { familyId: string; params: unknown; penalty?: { familyId: string; params: unknown } };
    return {
      gameId: game._id, godId: viewer.subject,
      utility: { familyId: utility.familyId, params: utility.params, ...(utility.penalty ? { penalty: { familyId: utility.penalty.familyId, params: utility.penalty.params } } : {}) },
      instantiationKey: instantiationOf(settings).key,
      objectType: settings.objectType, typeArgs: settings.typeArgs, priorId: settings.priorId, penaltyWeight: settings.penaltyWeight,
      language: settings.language, settings,
    };
}
