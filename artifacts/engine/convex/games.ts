/**
 * Game pages (docs/convex-read-architecture.md §4.2): one query per component, each reading one document or one index
 * page, never the world. The room's current game is open to any signed-in viewer (and a credential of its room); a past
 * one, which the room no longer runs, only to the gods who played in it or watched it, and the room owner
 * (lib/rooms requireHistoricReaderAs). Sign-in is required for everything (owner decision 2026-11-02): every query
 * keeps its viewer check, so each execution is per viewer and stays a few documents.
 *
 *   header          the cold game document (+ its room): routing, status, roster, settings, deadlines. A tick never
 *                   writes it, so it re-runs only on phase or roster changes.
 *   standings       the published scoreboard, ranked (≤ 8 rows, rewritten when published), with the live counts
 *   standingsHistory  one row per publication, cursor-paged
 *   instance        the object type and the utility catalog: static for the game
 *   objectIds       a page of object ids by disclosed salience (the spectator's skeleton)
 *   object          one object as disclosed
 */
import { v } from "convex/values";
import { gameNotice } from "./lib/engineErrors";
import { paginationOptsValidator } from "convex/server";
import { rankTotals, type GameSettings } from "@workspace/game-core";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { actsAsHuman, requireViewer } from "./auth/access";
import { fail } from "./lib/errors";
import { objectsOf } from "./lib/load";
import { activeGameRef, gameRecord, gameSetup, objectInstance, publicGame, rosterEntry, type Standing } from "./lib/projection";
import { clockDoc, clockFrom, withClock } from "./game/state";
import { publicSalienceOf } from "./game/readModel";
import { findGame, getCatalog, isHistoric, recentChat, requireHistoricReaderAs } from "./lib/rooms";

/** The game a signed-in viewer may read, by id, GUID or short code, with its room (null once the room is deleted). */
export async function readable(ctx: QueryCtx, code: string) {
  const viewer = await requireViewer(ctx);
  const game = await findGame(ctx, code);
  if (!game) fail("NOT_FOUND", "Game not found");
  if (!actsAsHuman(viewer) && viewer.roomId !== game.roomId) fail("FORBIDDEN", "Wrong room scope");
  const room = await ctx.db.get(game.roomId);
  if (room && isHistoric(room, game)) requireHistoricReaderAs(viewer, room, game);
  // A deleted room's games are past games with no owner left: their players only.
  if (!room && !game.roster.some(m => m.id === viewer.subject)) fail("FORBIDDEN", "Only the gods who played in it and the room owner can open a past game");
  return { game, room, viewer };
}

/**
 * One game's public world (final once ended), standings, winners and its chat, with its room's codes and the room's
 * newer live game: the dock's view of an ended game (player.game). Reads every object: the spectator page reads the
 * narrow queries below instead.
 */
export async function publicGameView(ctx: QueryCtx, header: Doc<"games">, room: Doc<"rooms"> | null) {
  const [game, objects] = await Promise.all([withClock(ctx, header), objectsOf(ctx, header._id)]);
  const ended = game.phase === "ended";
  const active = room?.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  const chat = room ? await recentChat(ctx, room._id, 100, game.createdAt, game.endedAt ?? Infinity) : [];
  return {
    ...publicGame(game, objects),
    roomId: room?._id ?? null, roomShortCode: room?.shortCode ?? null, ownerId: room?.ownerId ?? null,
    status: ended ? "ended" as const : "active" as const,
    winners: ended ? gameRecord(game, objects).winners : [],
    chat: chat.map(m => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp })),
    roomActiveGame: activeGameRef(active),
    utilityCatalog: await getCatalog(ctx, `game:${game._id}`),
  };
}

/** Resolve a game link: its canonical codes, whether it is the room's current game or a historical one, and whether it has ended (its replay is open). */
export const resolve = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { game, room } = await readable(ctx, code);
    return {
      id: game._id, guid: game.guid, shortCode: game.shortCode, roomId: game.roomId, roomShortCode: room?.shortCode ?? null,
      status: !room ? "unavailable" as const : isHistoric(room, game) ? "historical" as const : "current" as const,
      ended: game.phase === "ended",
    };
  },
});

type Winner = { deityId: string; name: string; kind: "human" | "ai" };

/**
 * The game's cold header: what the game page routes on (play, watch or replay) and what its header shows. Reads the
 * games doc, its room and the room's active game: none is written by a tick, so it stays cached while the game runs.
 */
export const header = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { game, room } = await readable(ctx, code);
    const ended = game.phase === "ended";
    const active = room?.activeGameId && room.activeGameId !== game._id ? await ctx.db.get(room.activeGameId) : null;
    return {
      id: game._id, guid: game.guid, shortCode: game.shortCode,
      roomId: room?._id ?? null, roomShortCode: room?.shortCode ?? null, ownerId: room?.ownerId ?? null,
      phase: game.phase, status: ended ? "ended" as const : "active" as const,
      startedAt: game.createdAt, planningEndsAt: game.planningEndsAt, pauseEndsAt: game.pauseEndsAt,
      endedAt: game.endedAt ?? null, endReason: game.endReason ?? null, recoveryReason: game.recoveryReason ?? null,
      notice: gameNotice(game) ?? null,
      settings: game.settings as GameSettings, setup: gameSetup(game), roster: game.roster.map(rosterEntry), spectators: game.spectators,
      seasonCommitment: game.seasonCommitment,
      // The ended game's result was stored by the commit that ended it.
      winners: ended ? ((game.summary as { winners?: Winner[] } | undefined)?.winners ?? []) : [],
      roomActiveGame: activeGameRef(active ?? (room?.activeGameId === game._id ? game : null)),
    };
  },
});

/**
 * The published standings: the scoreboard as last published (every scoreIntervalSeconds of world time, at the start
 * and at the end), ranked, with its world and wall time and the live agent and object counts published with it. Reads
 * ≤ 8 standings rows and the latest history row; re-runs only when the scoreboard is published.
 */
export const standings = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const { game } = await readable(ctx, gameId);
    const member = new Map(game.roster.map(m => [m.id, m]));
    const named = (rows: { godId: string; rank: number; total: number }[]): Standing[] => rows
      .filter(r => member.has(r.godId))
      .map(r => ({ deityId: r.godId, name: member.get(r.godId)!.name, kind: member.get(r.godId)!.kind, totalPayoff: r.total, rank: r.rank }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    // bounded: one row per roster god (≤ 8).
    const rows = await ctx.db.query("standings").withIndex("by_game", q => q.eq("gameId", gameId)).take(16);
    if (rows.length) {
      const latest = await ctx.db.query("standingsHistory").withIndex("by_game_seq", q => q.eq("gameId", gameId)).order("desc").first();
      return { rows: named(rows), world: rows[0].world, at: rows[0].at, agentCount: latest?.agentCount ?? null, objectCount: latest?.objectCount ?? null };
    }
    // A game stored before standings (until migrations:backfillStandings has run): its clock's scoreboard.
    const clock = clockFrom(game, await clockDoc(ctx, gameId));
    if (!clock.scoreboard) return { rows: [], world: null, at: null, agentCount: clock.agentCount, objectCount: clock.objectCount };
    const ranked = rankTotals(game.roster.map(m => m.id), clock.scoreboard.totals).map(r => ({ godId: r.godId, rank: r.rank, total: r.totalPayoff }));
    return { rows: named(ranked), world: clock.scoreboard.world, at: clock.scoreboard.at, agentCount: clock.agentCount, objectCount: clock.objectCount };
  },
});

export const HISTORY_PAGE = 100;

/**
 * The scoreboard's publications after seq `after` (all of them from the start when omitted), oldest first, at most
 * HISTORY_PAGE: a client pages on with the last row's seq. `totals` are in roster order (the header's roster).
 */
export const standingsHistory = query({
  args: { gameId: v.id("games"), after: v.optional(v.number()) },
  handler: async (ctx, { gameId, after }) => {
    await readable(ctx, gameId);
    const rows = await ctx.db.query("standingsHistory")
      .withIndex("by_game_seq", q => (after === undefined ? q.eq("gameId", gameId) : q.eq("gameId", gameId).gt("seq", after))).take(HISTORY_PAGE);
    return {
      rows: rows.map(r => ({ seq: r.seq, world: r.world, at: r.at, totals: r.totals, agentCount: r.agentCount, objectCount: r.objectCount })),
      more: rows.length === HISTORY_PAGE,
    };
  },
});

/** The game's object type and the utility functions its gods might have drawn (never who drew which): static. */
export const instance = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const { game } = await readable(ctx, gameId);
    return { objectInstance: objectInstance(game.settings as GameSettings), utilityCatalog: await getCatalog(ctx, `game:${game._id}`) };
  },
});

/** The most objects one skeleton page returns: a virtualised list asks for a screenful or two at a time. */
export const OBJECT_PAGE_MAX = 50;

/**
 * The spectator's objects skeleton: one page of the game's objects by disclosed salience, highest first (the index
 * objects.by_game_salience), as ids and the sort key only. Each visible row reads its object with games.object.
 */
export const objectIds = query({
  args: { gameId: v.id("games"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { gameId, paginationOpts }) => {
    await readable(ctx, gameId);
    const page = await ctx.db.query("objects").withIndex("by_game_salience", q => q.eq("gameId", gameId)).order("desc")
      .paginate({ ...paginationOpts, numItems: Math.max(1, Math.min(OBJECT_PAGE_MAX, Math.floor(paginationOpts.numItems))) });
    return { ...page, page: page.page.map(o => ({ id: o._id, salience: o.publicSalience })) };
  },
});

/** One object as disclosed: its value and its salience (live with its value's disclosure noise, exact once ended). */
export const object = query({
  args: { objectId: v.string() },
  handler: async (ctx, { objectId }) => {
    const id = ctx.db.normalizeId("objects", objectId);
    const o = id ? await ctx.db.get(id) : null;
    if (!o) { await requireViewer(ctx); return null; }
    const { game } = await readable(ctx, o.gameId);
    // Exact once the game has ended, before game/readModel.ts finalizeObjects reaches this object too.
    const live = game.phase !== "ended";
    return { id: o._id, value: o.value, version: o.version, salience: live ? o.publicSalience : publicSalienceOf(o, false) };
  },
});
