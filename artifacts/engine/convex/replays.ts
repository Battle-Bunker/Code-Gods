/**
 * Stored replays (docs/convex-read-architecture.md §4.4): an ended game never changes, so its whole replay log is
 * built once (every page player.replay serves, without the caller's place) and kept in file storage. The replay page
 * then fetches one URL instead of paging the log with queries.
 *
 * - `build` (internal action): scheduled by endGame (engine/loop.ts) and by migrations:backfillReplays for games ended
 *   before this existed, and rebuilt after a migration rewrites what the file embeds (`rebuildAfterMigration`). Idempotent: a game that has its file is left alone; a build that loses a race deletes its copy.
 * - `stored` (query): whether the file is there, for whoever may watch the replay (the same check as player.replay), with
 *   the caller's place in the roster; `stored: false` until it is built (the page pages the log meanwhile). A build
 *   that fails (nothing retries it) leaves the game on the paged replay.
 * - GET /api/replay/<roomId>/<gameId> (`download`, registered by convex/http.ts): the file itself, checked on every
 *   request against the caller's Convex JWT (`Authorization: Bearer`, the token the app's Convex client holds) with the
 *   same rule. Never a storage URL: that is a bearer capability anyone holding the link could download, and sign-in is
 *   required for everything (owner decision 2026-11-02).
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { BEARER_CORS } from "./auth/routes";
import { json, pathSegments, refusal } from "./lib/http";
import { replayPage, replayableGame } from "./player";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import { paramsKey, upgradeDescriptor, type UtilityDescriptor } from "@workspace/game-utilities";

/** The stored file's shape (written in the file); a page that reads another version pages the log instead. */
export const STORED_REPLAY_VERSION = 1;

export const stored = query({
  args: { roomId: v.string(), gameId: v.string() },
  handler: async (ctx, { roomId, gameId }) => {
    const { game, viewer } = await replayableGame(ctx, await requireViewer(ctx), roomId, gameId);
    return { stored: !!game.replayStorageId, viewer };
  },
});

/** The stored file of a replay the caller may watch (the download's check; the caller is the request's JWT). */
export const fileFor = internalQuery({
  args: { roomId: v.string(), gameId: v.string() },
  handler: async (ctx, { roomId, gameId }) => (await replayableGame(ctx, await requireViewer(ctx), roomId, gameId)).game.replayStorageId ?? null,
});

const reply = (body: unknown, status: number) => json(body, status, BEARER_CORS);

/** GET /api/replay/<roomId>/<gameId>: the stored replay file, for a caller the replay admits. */
export const download = httpAction(async (ctx, request) => {
  const parts = pathSegments(request);
  if (!parts || parts.length !== 2 || !parts[0] || !parts[1]) return reply({ error: "GET /api/replay/<roomId>/<gameId>" }, 400);
  let storageId: Id<"_storage"> | null;
  try {
    storageId = await ctx.runQuery(internal.replays.fileFor, { roomId: parts[0], gameId: parts[1] });
  } catch (error) {
    const refused = refusal(error);
    if (refused) return reply(refused.body, refused.status);
    console.error("replay download failed", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Internal error" }, 500);
  }
  const file = storageId && await ctx.storage.get(storageId);
  if (!file) return reply({ error: "This game's replay is not stored (yet): page it with player.replay", code: "NOT_FOUND" }, 404);
  return new Response(file, { headers: { ...BEARER_CORS, "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
});
export const downloadPreflight = httpAction(async () => new Response(null, { status: 204, headers: BEARER_CORS }));

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

/**
 * After migrations:typedParamsDeities dropped a game's file: build it again once every god of the game has today's
 * params (a god still waiting for its batch reschedules the build), so the new file never embeds a legacy descriptor.
 */
export const rebuildAfterMigration = internalMutation({
  args: { gameId: v.id("games"), attempt: v.optional(v.number()) },
  handler: async (ctx, { gameId, attempt = 0 }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.phase !== "ended" || game.replayStorageId) return;
    const deities = await ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).take(16);
    let inst;
    try { inst = instantiationOf(game.settings as GameSettings); } catch { inst = null; }
    const pending = inst && deities.some(d => {
      const u = d.utility as UtilityDescriptor | null;
      try {
        return !!u && paramsKey(upgradeDescriptor(u, inst)) !== paramsKey({ familyId: u.familyId, params: u.params, ...(u.penalty ? { penalty: u.penalty } : {}) });
      } catch { return false; }
    });
    // Wait (backing off up to 10 minutes) until the migration reaches this game's last god, however long that takes.
    if (pending) await ctx.scheduler.runAfter(Math.min(600_000, 20_000 * 2 ** Math.min(attempt, 5)), internal.replays.rebuildAfterMigration, { gameId, attempt: attempt + 1 });
    else await ctx.scheduler.runAfter(0, internal.replays.build, { gameId });
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
