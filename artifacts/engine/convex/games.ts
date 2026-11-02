/**
 * Public game pages: one game's own world, standings and chat (live while it runs, final once ended). The room's
 * current game is open to any signed-in viewer (and a credential of its room); a past one, which the room no longer
 * runs, only to the gods who played in it and the room owner (lib/rooms requireHistoricReaderAs).
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { fail } from "./lib/errors";
import { objectsOf } from "./lib/load";
import { activeGameRef, gameRecord, publicGame } from "./lib/projection";
import { findGame, getCatalog, isHistoric, recentChat, requireHistoricReaderAs } from "./lib/rooms";

async function readable(ctx: QueryCtx, code: string) {
  const viewer = await requireViewer(ctx);
  const game = await findGame(ctx, code);
  if (!game) fail("NOT_FOUND", "Game not found");
  if (viewer.scope !== "browser" && viewer.roomId !== game.roomId) fail("FORBIDDEN", "Wrong room scope");
  const room = await ctx.db.get(game.roomId);
  if (room && isHistoric(room, game)) requireHistoricReaderAs(viewer, room, game);
  // A deleted room's games are past games with no owner left: their players only.
  if (!room && !game.roster.some(m => m.id === viewer.subject)) fail("FORBIDDEN", "Only the gods who played in it and the room owner can open a past game");
  return { game, room };
}

/**
 * One game's public world (final once ended), standings, winners and its chat, with its room's codes and the room's
 * newer live game. Shared by games.view (the engine UI's game page) and player.game (the player client's).
 */
export async function publicGameView(ctx: QueryCtx, game: Doc<"games">, room: Doc<"rooms"> | null) {
  const objects = await objectsOf(ctx, game._id);
  const ended = game.phase === "ended";
  const active = room?.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  const chat = room ? await recentChat(ctx, room._id, 100, game.createdAt, game.endedAt ?? Infinity) : [];
  return {
    ...publicGame(game, objects, game.agentCount ?? 0),
    roomId: room?._id ?? null, roomShortCode: room?.shortCode ?? null, ownerId: room?.ownerId ?? null,
    status: ended ? "ended" as const : "active" as const,
    winners: ended ? gameRecord(game, objects).winners : [],
    chat: chat.map(m => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp })),
    roomActiveGame: activeGameRef(active),
    utilityCatalog: await getCatalog(ctx, `game:${game._id}`),
    stats: game.stats,
    serverTime: Date.now(),
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

/** The public game view: salience, leaderboard, roster, settings, chat of the game, winners when ended. */
export const view = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const { game, room } = await readable(ctx, code);
    return publicGameView(ctx, game, room);
  },
});
