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
import { EVENT_LOG_SCHEMA, viewOfNet } from "./lib/world";
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
      gameId: game._id, events: projectBatches(batches, viewer.subject, index, game.phase !== "ended"),
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
    return { gameId: game!._id, events: projectBatches(batches, viewer.subject, index, game!.phase !== "ended"), nextCursor: batches.at(-1)?.seq ?? after, latestCursor: game!.nextBatch - 1 };
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
    batches: replayBatches(batches, viewer.subject, index, game.phase !== "ended", !!game.scoreboard),
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
    return { gameId: game._id, objects: trajectoriesOf(batches, index, game.phase !== "ended"), nextCursor: batches.at(-1)?.seq ?? after, latestCursor: game.nextBatch - 1 };
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

// ------------------------------------------------------------------------------------------------
// the utility series (docs/public-log-design.md §2, §4): every spawn and transform of a game, per viewer
// ------------------------------------------------------------------------------------------------

/** A page of the series holds at most this many rows (default and maximum). */
export const SERIES_PAGE = 1000, SERIES_PAGE_MAX = 4000;
type Wire = number | string;

/** The viewer's own bits, the others' sum and own payoff from a stored per-deity vector (never the vector itself). */
/** Live (`noise` given), the others' sum carries the version's disclosure noise; ended, it is exact. */
const viewAt = (net: readonly number[], index: number, noise = 0) => { const v = viewOfNet(net, index, noise); return { own: v.netBits, others: v.peerNetBits, payoff: v.payoff }; };

async function seatedGame(ctx: QueryCtx, caller: Viewer, roomId: string, gameRef?: string) {
  const { game, index, viewer } = await gameFor(ctx, caller, roomId, gameRef);
  if (!game) return fail("NOT_FOUND", "There is no game in this room yet");
  if (index < 0) return fail("FORBIDDEN", "The utility series is for the game's players; you are not seated in this game");
  return { game, index, viewer };
}

/**
 * Whether the game's per-object history is incomplete: it started before objectEvents rows were written (event log
 * schema 3), so its early spawns and transformations have no rows. One read (the game's first batch).
 */
async function partialSeries(ctx: QueryCtx, gameId: Doc<"games">["_id"]) {
  const first = await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).first();
  return !first || (first.schema ?? 1) < 3;
}

/**
 * One page of the caller's utility series: every spawn and transform of the game in world-time order, in columns, with
 * the object's value before and after and the caller's OWN bits and the OTHER gods' summed bits before and after
 * (while live, the others' sums carry the game's disclosure noise, fixed per value; exact after the end). Another god's transformation is unattributed while the
 * game is live; `mine` marks the caller's own. Page with `cursor` until `pageDone` (`done`: and the game has ended); a
 * live game's series keeps growing (poll with the last cursor). `objectId` reads one object's history. `partial`: the
 * game started before these rows were written, so its early events are missing. Never another god's individual bits.
 */
const seriesArgs = {
  roomId: v.string(), gameId: v.optional(v.string()), objectId: v.optional(v.string()), fromWorld: v.optional(v.number()),
  cursor: v.optional(v.union(v.string(), v.null())), limit: v.optional(v.number()),
};
export const series = query({ args: seriesArgs, handler: async (ctx, args) => seriesFor(ctx, await requireViewer(ctx), args) });
export const seriesAs = internalQuery({
  args: { principal: principalV, ...seriesArgs },
  handler: async (ctx, { principal, ...args }) => seriesFor(ctx, await viewerOf(ctx, principal), args),
});
export async function seriesFor(ctx: QueryCtx, caller: Viewer, args: { roomId: string; gameId?: string; objectId?: string; fromWorld?: number; cursor?: string | null; limit?: number }) {
  const { game, index, viewer } = await seatedGame(ctx, caller, args.roomId, args.gameId);
  const limit = Math.max(1, Math.min(SERIES_PAGE_MAX, Math.floor(args.limit ?? SERIES_PAGE)));
  const objectId = args.objectId ? ctx.db.normalizeId("objects", args.objectId) : null;
  if (args.objectId && !objectId) return fail("BAD_REQUEST", "Not an object id");
  const from = args.fromWorld ?? -Infinity;
  const rowsOf = objectId
    ? ctx.db.query("objectEvents").withIndex("by_game_object_world", q => q.eq("gameId", game._id).eq("objectId", objectId).gte("world", from))
    : ctx.db.query("objectEvents").withIndex("by_game_world", q => q.eq("gameId", game._id).gte("world", from));
  const page = await rowsOf.paginate({ cursor: args.cursor ?? null, numItems: limit });
  // Each row's "before" is the same object's previous row (version − 1): in this page, or one indexed read per object.
  const live = game.phase !== "ended";
  // A row as the caller sees it: live, the others' sum with that version's disclosure noise (settings.peerNoiseBits).
  const seen = (r: Pick<Doc<"objectEvents">, "net" | "noise">) => viewAt(r.net, index, live ? r.noise ?? 0 : 0);
  const last = new Map<string, Pick<Doc<"objectEvents">, "net" | "noise">>();
  // The rows before this page of each object first seen here, read in parallel (one indexed read each).
  const firstSeen = new Map<string, Doc<"objectEvents">>();
  for (const row of page.page) if (!firstSeen.has(row.objectId)) firstSeen.set(row.objectId, row);
  const priors = new Map((await Promise.all([...firstSeen.values()].filter(r => r.version > 0).map(r =>
    ctx.db.query("objectEvents").withIndex("by_game_object_version", q => q.eq("gameId", game._id).eq("objectId", r.objectId).eq("version", r.version - 1)).first(),
  ))).flatMap(r => (r ? [[r.objectId as string, r] as const] : [])));
  const previous = async (row: Doc<"objectEvents">) => (row.version === 0 ? null : last.get(row.objectId) ?? priors.get(row.objectId) ?? null);
  const c = {
    world: [] as number[], seq: [] as number[], objectId: [] as string[], kind: [] as ("spawn" | "transform")[], version: [] as number[],
    before: [] as (Wire | null)[], value: [] as Wire[], ownBefore: [] as (number | null)[], othersBefore: [] as (number | null)[],
    own: [] as number[], others: [] as number[], payoff: [] as number[], mine: [] as boolean[],
  };
  for (const row of page.page) {
    const before = await previous(row), after = seen(row), was = before ? seen(before) : null;
    last.set(row.objectId, row);
    c.world.push(row.world); c.seq.push(row.seq); c.objectId.push(row.objectId); c.kind.push(row.kind); c.version.push(row.version);
    c.before.push(row.before ?? null); c.value.push(row.value); c.ownBefore.push(was?.own ?? null); c.othersBefore.push(was?.others ?? null);
    c.own.push(after.own); c.others.push(after.others); c.payoff.push(after.payoff); c.mine.push(row.ownerId === viewer.subject);
  }
  return {
    gameId: game._id, phase: game.phase, live: game.phase !== "ended", self: { godId: viewer.subject, index }, others: game.roster.length - 1,
    partial: await partialSeries(ctx, game._id), rows: page.page.length, columns: c, cursor: page.continueCursor, done: page.isDone && game.phase === "ended", pageDone: page.isDone,
  };
}

/**
 * The board at world time `world` (default: now) as the caller saw it: every object that existed then, with its value,
 * version and the caller's own bits, the others' sum and own payoff, from each object's last row at or before `world`
 * (one indexed read per object). `partial`: the game predates the per-object history, so objects untouched since then are
 * missing.
 */
const boardArgs = { roomId: v.string(), gameId: v.optional(v.string()), world: v.optional(v.number()) };
export const board = query({ args: boardArgs, handler: async (ctx, args) => boardFor(ctx, await requireViewer(ctx), args) });
export const boardAs = internalQuery({
  args: { principal: principalV, ...boardArgs },
  handler: async (ctx, { principal, ...args }) => boardFor(ctx, await viewerOf(ctx, principal), args),
});
export async function boardFor(ctx: QueryCtx, caller: Viewer, args: { roomId: string; gameId?: string; world?: number }) {
  const { game, index } = await seatedGame(ctx, caller, args.roomId, args.gameId);
  const world = args.world ?? game.worldSeconds;
  const objects = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", game._id)).take(2100);
  const rows = await Promise.all(objects.map(o => ctx.db.query("objectEvents")
    .withIndex("by_game_object_world", q => q.eq("gameId", game._id).eq("objectId", o._id).lte("world", world)).order("desc").first()));
  return {
    gameId: game._id, world, partial: await partialSeries(ctx, game._id),
    objects: rows.flatMap(r => (r ? [{ objectId: r.objectId as string, value: r.value, version: r.version, changedAt: r.world, ...viewAt(r.net, index, game.phase !== "ended" ? r.noise ?? 0 : 0) }] : [])),
  };
}
