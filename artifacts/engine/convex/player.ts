/**
 * Player-facing projections (plan §6). Every result is the caller's OWN projection: its own utility card and
 * descriptor, its own scores and peer aggregates (peerNetBits, peerCare, payoff), its own agents (with
 * sources). Never another god's descriptor, per-object score, agent source or seed, and never endAtWorld.
 * History, events and trajectories are projected from the event log with the same rules, so history leaks
 * nothing that live state would not.
 */
import { v } from "convex/values";
import type { GameSettings } from "@workspace/game-core";
import { allowedLanguages, instantiationOf } from "@workspace/game-core";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireRoomPermission, requireViewer, type Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { buildObservation, currentGame, deityOf } from "./lib/load";
import { objectInstance, projectBatches, replayBatches, trajectories as trajectoriesOf } from "./lib/projection";
import { EVENT_LOG_SCHEMA } from "./lib/world";
import { findGame, isHistoric, principalV, requireHistoricReaderAs, requireMemberAs, requireRoom, viewerOf } from "./lib/rooms";
import { publicGameView } from "./games";

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

/**
 * The game a request is about (current slot by default, or an explicit game of this room) and the caller's roster index.
 * The room's active or current game is for its members; a historic one (lib/rooms isHistoric) only for the gods who
 * played in it and the room owner.
 */
async function gameFor(ctx: QueryCtx, viewer: Viewer, roomRef: string, gameRef?: string) {
  const room = await requireRoom(ctx, roomRef);
  let game: Doc<"games"> | null;
  if (gameRef) {
    requireRoomPermission(viewer, room._id, "read");   // before the lookup: a credential never probes another room
    game = await findGame(ctx, gameRef);
    if (!game || game.roomId !== room._id) fail("NOT_FOUND", "Game not found in this room");
    if (isHistoric(room, game)) requireHistoricReaderAs(viewer, room, game);
    else await requireMemberAs(ctx, viewer, room, "read");
  } else {
    await requireMemberAs(ctx, viewer, room, "read");
    game = await currentGame(ctx, room);
  }
  return { room, viewer, game, index: game ? game.roster.findIndex(m => m.id === viewer.subject) : -1 };
}

/**
 * One game of the room as the caller may see it, by id, GUID or short code: its public world (live, or final once
 * ended: the recorded standings, winners, last objects) and its chat, with whether it is the room's current game and
 * whether the caller was seated. The player client's /rooms/:room/games/:game page; a historic game is read-only
 * and readable only by its participants and the room owner (gameFor).
 */
const gameArgs = { roomId: v.string(), gameId: v.string() };
export const game = query({ args: gameArgs, handler: async (ctx, args) => gameViewFor(ctx, await requireViewer(ctx), args) });
export const gameAs = internalQuery({
  args: { principal: principalV, ...gameArgs },
  handler: async (ctx, { principal, ...args }) => gameViewFor(ctx, await viewerOf(ctx, principal), args),
});
export async function gameViewFor(ctx: QueryCtx, viewer: Viewer, args: { roomId: string; gameId: string }) {
  const { room, game, index } = await gameFor(ctx, viewer, args.roomId, args.gameId);
  return { ...await publicGameView(ctx, game!, room), current: !isHistoric(room, game!), seated: index >= 0 };
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

/** The replay API's version (docs/replay-design.md §3): bump it when the shape of player.replay changes. */
export const REPLAY_VERSION = 1;
/** A replay page holds at most this many batches, stops early past REPLAY_PAGE_EVENTS events, and carries at most REPLAY_CHAT messages. */
const REPLAY_PAGE_BATCHES = 100, REPLAY_PAGE_EVENTS = 4000, REPLAY_CHAT = 500;

/**
 * One page of a game's replay for one of its PLAYERS (docs/replay-design.md §3): the game's fixed header, the caller's
 * own utility card, the event log as the caller may see it, batch by batch with each batch's wall time, world window
 * and the public leaderboard totals, and the game's chat after `chatAfter` (a wall-clock cursor) up to this page's
 * last batch. Page with `afterSeq: nextCursor, chatAfter: chatCursor` until `done`; a live game's replay is polled the
 * same way. Room members who were not seated in the game get FORBIDDEN.
 */
const replayArgs = { roomId: v.string(), gameId: v.string(), afterSeq: v.optional(v.number()), chatAfter: v.optional(v.number()), limit: v.optional(v.number()) };
export const replay = query({ args: replayArgs, handler: async (ctx, args) => replayFor(ctx, await requireViewer(ctx), args) });
export const replayAs = internalQuery({
  args: { principal: principalV, ...replayArgs },
  handler: async (ctx, { principal, ...args }) => replayFor(ctx, await viewerOf(ctx, principal), args),
});
export async function replayFor(ctx: QueryCtx, caller: Viewer, args: { roomId: string; gameId: string; afterSeq?: number; chatAfter?: number; limit?: number }) {
  const { room, viewer, game, index } = await gameFor(ctx, caller, args.roomId, args.gameId);
  if (!game) return fail("NOT_FOUND", "Game not found in this room");
  if (index < 0) return fail("FORBIDDEN", "Replays are for the game's players; you were not seated in this game");
  const limit = Math.max(1, Math.min(REPLAY_PAGE_BATCHES, Math.floor(args.limit ?? REPLAY_PAGE_BATCHES)));
  const after = args.afterSeq ?? -1;
  // Read batch by batch and stop at the event cap, so a dense game's page never reads docs it would drop.
  const batches: Doc<"tickBatches">[] = [];
  let events = 0;
  for await (const b of ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", game._id).gt("seq", after))) {
    if (batches.length && events + b.events.length > REPLAY_PAGE_EVENTS) break;
    batches.push(b); events += b.events.length;
    if (batches.length >= limit) break;
  }
  const latestCursor = game.nextBatch - 1;
  const nextCursor = batches.at(-1)?.seq ?? after;
  const first = after < 0;
  const done = game.phase === "ended" && nextCursor >= latestCursor;
  const deity = await deityOf(ctx, game._id, viewer.subject);
  const settings = game.settings as GameSettings;
  // Chat: the game's messages (stamped with it, or from before stamps, sent between its start and end) after the
  // caller's chat cursor, up to this page's last batch (to the end once done), so a page's chat never runs ahead of
  // its events and a live replay picks up new messages as its log grows.
  const chatFrom = args.chatAfter ?? game.createdAt - 1;
  const chatTo = done ? (game.endedAt ?? Infinity) : (batches.at(-1)?.at ?? chatFrom);
  const rows = chatTo > chatFrom ? await ctx.db.query("chat").withIndex("by_room", q => {
    const lower = q.eq("roomId", room._id).gt("timestamp", chatFrom);
    return Number.isFinite(chatTo) ? lower.lte("timestamp", chatTo) : lower;
  }).take(REPLAY_CHAT) : [];
  const chatCursor = rows.length === REPLAY_CHAT ? rows.at(-1)!.timestamp : Math.max(chatFrom, Number.isFinite(chatTo) ? chatTo : Date.now());
  const chat = rows.filter(m => m.gameId === game._id || (m.gameId === undefined && m.world === undefined && m.timestamp >= game.createdAt));
  return {
    version: REPLAY_VERSION,
    game: {
      id: game._id, shortCode: game.shortCode, phase: game.phase, startedAt: game.createdAt, planningEndsAt: game.planningEndsAt,
      endedAt: game.endedAt ?? null, endReason: game.endReason ?? null, worldSeconds: game.worldSeconds,
      settings, setup: game.setupId ? { id: game.setupId, name: game.setupName ?? "" } : null,
      roster: game.roster.map(({ id, name, kind }) => ({ id, name, kind })), objectInstance: objectInstance(settings),
      seasonCommitment: game.seasonCommitment,
      // On the first page, the log's schema (its first batch's): below EVENT_LOG_SCHEMA it predates summons, totals and
      // chat stamps (wholly, or up to a deploy during the game), so the replay's agents, leaderboard curve and chat
      // placement are incomplete.
      ...(first ? { logSchema: batches[0]?.schema ?? 1, currentLogSchema: EVENT_LOG_SCHEMA } : {}),
    },
    self: { godId: viewer.subject, index, utility: deity?.card ?? null },
    batches: replayBatches(batches, viewer.subject, index),
    chat: chat.map(m => ({
      id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp,
      ...(m.world !== undefined ? { worldSeconds: m.world } : {}),
    })),
    // `done`: the game has ended and this page reaches the end of its log; a live game's replay keeps growing.
    nextCursor, chatCursor, latestCursor, done,
  };
}

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
      language: allowedLanguages(settings)[0], languages: allowedLanguages(settings), settings,
    };
}
