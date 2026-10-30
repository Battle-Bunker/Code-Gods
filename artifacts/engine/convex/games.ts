/** Public game pages: one game's own world, standings and chat (live while it runs, final once ended). */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { fail } from "./lib/errors";
import { objectsOf } from "./lib/load";
import { activeGameRef, gameRecord, publicGame } from "./lib/projection";
import { findGame, getCatalog, recentChat } from "./lib/rooms";

async function readable(ctx: Parameters<typeof requireViewer>[0], code: string) {
  const viewer = await requireViewer(ctx);
  const game = await findGame(ctx, code);
  if (!game) fail("NOT_FOUND", "Game not found");
  if (viewer.scope !== "browser" && viewer.roomId !== game.roomId) fail("FORBIDDEN", "Wrong room scope");
  return game;
}

/** Resolve a game link: its canonical codes and whether it is the room's current game or a historical one. */
export const resolve = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const game = await readable(ctx, code);
    const room = await ctx.db.get(game.roomId);
    return {
      id: game._id, guid: game.guid, shortCode: game.shortCode, roomId: game.roomId, roomShortCode: room?.shortCode ?? null,
      status: !room ? "unavailable" as const : room.currentGameId === game._id ? "current" as const : "historical" as const,
    };
  },
});

/** The public game view: salience, leaderboard, roster, settings, chat of the game, winners when ended. */
export const view = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const game = await readable(ctx, code);
    const room = await ctx.db.get(game.roomId);
    const objects = await objectsOf(ctx, game._id);
    const record = gameRecord(game, objects);
    const active = room?.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    const chat = room ? await recentChat(ctx, room._id, 100, game.createdAt, game.endedAt ?? Infinity) : [];
    return {
      ...publicGame(game, objects, game.agentCount ?? 0),
      roomId: room?._id ?? null, roomShortCode: room?.shortCode ?? null, ownerId: room?.ownerId ?? null,
      status: game.phase === "ended" ? "ended" as const : "active" as const,
      winners: game.phase === "ended" ? record.winners : [],
      chat: chat.map(m => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp })),
      roomActiveGame: activeGameRef(active),
      utilityCatalog: await getCatalog(ctx, `game:${game._id}`),
      stats: game.stats,
      serverTime: Date.now(),
    };
  },
});
