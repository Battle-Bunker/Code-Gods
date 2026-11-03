/**
 * The read models the engine writes for the pages (docs/convex-read-architecture.md §4.1, R4): small documents written
 * by the writer that already holds the data, so a page component reads one document or one index page.
 *
 *   standings         one row per roster god: the published scoreboard, ranked (rewritten when it is published)
 *   standingsHistory  one row per publication (the race's series, cursor-paged by seq)
 *   objects.publicSalience  each object's salience as disclosed now (the spectator's skeleton orders by it)
 */
import { v } from "convex/values";
import { rankTotals } from "@workspace/game-core";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

type Scoreboard = { totals: number[]; world: number; at: number };

/** The salience as disclosed: with the value's live disclosure noise while the game runs, exact once it has ended. */
export const publicSalienceOf = (o: { salience: number; noise?: number }, live: boolean) => o.salience + (live ? o.noise ?? 0 : 0);

/**
 * Publish a scoreboard to the read model: every roster god's standings row (ranked as the leaderboard ranks them) and
 * one history row with the live counts. Called by the write that publishes it (game/state.ts writeGame, the start).
 */
export async function publishStandings(ctx: MutationCtx, game: { _id: Id<"games">; roster: readonly { id: string }[] }, board: Scoreboard,
  counts: { agentCount: number; objectCount: number }) {
  const ranked = rankTotals(game.roster.map(m => m.id), board.totals);
  // bounded: one row per roster god (≤ 8).
  const stored = new Map((await ctx.db.query("standings").withIndex("by_game", q => q.eq("gameId", game._id)).take(16)).map(r => [r.godId, r]));
  for (const r of ranked) {
    const row = { gameId: game._id, godId: r.godId, rank: r.rank, total: r.totalPayoff, world: board.world, at: board.at };
    const old = stored.get(r.godId);
    if (old) await ctx.db.patch(old._id, row);
    else await ctx.db.insert("standings", row);
  }
  const last = await ctx.db.query("standingsHistory").withIndex("by_game_seq", q => q.eq("gameId", game._id)).order("desc").first();
  await ctx.db.insert("standingsHistory", {
    gameId: game._id, seq: last ? last.seq + 1 : 0, world: board.world, at: board.at, totals: board.totals,
    agentCount: counts.agentCount, objectCount: counts.objectCount,
  });
}

/**
 * The live agent count changed between publications (a summon or a destroy): the latest publication's row carries the
 * count since, so games.standings shows it at once. Earlier rows keep the count they were published with.
 */
export async function recountAgents(ctx: MutationCtx, gameId: Id<"games">, agentCount: number) {
  const last = await ctx.db.query("standingsHistory").withIndex("by_game_seq", q => q.eq("gameId", gameId)).order("desc").first();
  if (last && last.agentCount !== agentCount) await ctx.db.patch(last._id, { agentCount });
}

/** Whether a game already has its standings (a game stored before them has none until migrations:backfillStandings). */
export async function hasStandings(ctx: MutationCtx, gameId: Id<"games">) {
  return !!await ctx.db.query("standings").withIndex("by_game", q => q.eq("gameId", gameId)).first();
}

const FINAL_PAGE = 200;

/**
 * An ended game's disclosure is exact: its objects' public salience loses the live noise, a page at a time (scheduled
 * by engine/loop.ts endGame, after the commit that ends the game, so the end itself stays light).
 */
export const finalizeObjects = internalMutation({
  args: { gameId: v.id("games"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { gameId, cursor }) => {
    const page = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: FINAL_PAGE });
    for (const o of page.page as Doc<"objects">[]) {
      const exact = publicSalienceOf(o, false);
      if (o.publicSalience !== exact) await ctx.db.patch(o._id, { publicSalience: exact });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.game.readModel.finalizeObjects, { gameId, cursor: page.continueCursor });
  },
});
