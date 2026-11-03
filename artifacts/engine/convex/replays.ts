/**
 * Stored replays (docs/convex-read-architecture.md §4.4): an ended game never changes, so its whole replay log is
 * built once (every page player.replay serves, without the caller's place) and kept in file storage. The replay page
 * then fetches one URL instead of paging the log with queries.
 *
 * - `build` (internal action): scheduled by endGame (engine/loop.ts) and by migrations:backfillReplays for games ended
 *   before this existed. Idempotent: a game that has its file is left alone; a build that loses a race deletes its copy.
 * - `url` (query): the file's URL for whoever may watch the replay (the same check as player.replay), with the caller's
 *   place in the roster; `url: null` until it is built (the page pages the log meanwhile). The URL is a capability:
 *   access is checked when it is handed out, as for any stored file; the replay it holds is what player.replay shows
 *   that viewer. A build that fails (nothing retries it) leaves the game on the paged replay.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { replayPage, replayableGame } from "./player";

/** The stored file's shape (written in the file); a page that reads another version pages the log instead. */
export const STORED_REPLAY_VERSION = 1;

export const url = query({
  args: { roomId: v.string(), gameId: v.string() },
  handler: async (ctx, { roomId, gameId }) => {
    const { game, viewer } = await replayableGame(ctx, await requireViewer(ctx), roomId, gameId);
    return { url: game.replayStorageId ? await ctx.storage.getUrl(game.replayStorageId) : null, viewer };
  },
});

/** One page of an ended game's replay for the builder (no caller: the builder is the engine itself). */
export const page = internalQuery({
  args: { gameId: v.id("games"), afterSeq: v.optional(v.number()), chatAfter: v.optional(v.number()), eventOffset: v.optional(v.number()) },
  handler: async (ctx, { gameId, ...cursor }) => {
    const game = await ctx.db.get(gameId);
    const room = game && await ctx.db.get(game.roomId);
    if (!game || !room || game.phase !== "ended" || game.replayStorageId) return null;
    return replayPage(ctx, room, game, cursor);
  },
});

export const build = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }): Promise<{ stored: boolean }> => {
    const pages: unknown[] = [];
    for (let cursor: { afterSeq: number; chatAfter: number; eventOffset?: number } | undefined; ;) {
      const page: Awaited<ReturnType<typeof replayPage>> | null = await ctx.runQuery(internal.replays.page, { gameId, ...cursor });
      if (!page) return { stored: false }; // not ended, gone, or already stored
      pages.push(page);
      if (page.done) break;
      cursor = { afterSeq: page.nextCursor, chatAfter: page.chatCursor, ...(page.eventOffset !== undefined ? { eventOffset: page.eventOffset } : {}) };
    }
    const storageId = await ctx.storage.store(new Blob([JSON.stringify({ version: STORED_REPLAY_VERSION, pages })], { type: "application/json" }));
    const kept: boolean = await ctx.runMutation(internal.replays.attach, { gameId, storageId });
    if (!kept) await ctx.storage.delete(storageId);
    return { stored: kept };
  },
});

/** Keep the file on the game unless another build got there first (then the caller deletes its copy). */
export const attach = internalMutation({
  args: { gameId: v.id("games"), storageId: v.id("_storage") },
  handler: async (ctx, { gameId, storageId }: { gameId: Id<"games">; storageId: Id<"_storage"> }): Promise<boolean> => {
    const game = await ctx.db.get(gameId);
    if (!game || game.replayStorageId) return false;
    await ctx.db.patch(gameId, { replayStorageId: storageId });
    return true;
  },
});
