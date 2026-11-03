/**
 * The read models the engine writes for the pages (docs/convex-read-architecture.md §4.1, R4): small documents written
 * by the writer that already holds the data, so a page component reads one document or one index page.
 *
 *   standings         one row per roster god: the published scoreboard, ranked (rewritten when it is published)
 *   standingsHistory  one row per publication (the race's series, cursor-paged by seq)
 *   objects.publicSalience  each object's salience as disclosed now (the spectator's skeleton orders by it)
 *   objectViews       PRIVATE per god: one row per roster god per object, as that god sees it (written with the object)
 *   godTotals         PRIVATE per god: that god's totals and quadrant counts (computed by the tick from its snapshot)
 *   objectDigests     PRIVATE per god: the others-care scatter's points (rewritten by the tick at most every few seconds)
 */
import { v } from "convex/values";
import { rankTotals } from "@workspace/game-core";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { digestsOf, godTotalsOf, viewRowOf, type GodTotals, type Scored } from "../lib/views";

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

type Synced = Scored & { _id: Id<"objects">; gameId: Id<"games">; value: number | string; version: number };

/**
 * Write every roster god's objectViews row of one object as disclosed now (insert the missing ones): called by every
 * write of an object (the commit, the fill at the start, the end's finalisation, the backfill). Reads its rows (one
 * index range, ≤ 8) and writes only rows that differ.
 */
export async function syncObjectViews(ctx: MutationCtx, o: Synced, live: boolean) {
  // bounded: one row per roster god (≤ 8).
  const stored = new Map((await ctx.db.query("objectViews").withIndex("by_object_god", q => q.eq("objectId", o._id)).take(16)).map(r => [r.godId, r]));
  for (const { god } of o.scores) {
    const view = viewRowOf(o, god, live)!;
    const row = { gameId: o.gameId, godId: god, objectId: o._id, value: o.value, version: o.version, ...view };
    const old = stored.get(god);
    if (!old) await ctx.db.insert("objectViews", row);
    else if (old.version !== row.version || old.value !== row.value || old.payoff !== row.payoff || old.peerNetBits !== row.peerNetBits || old.netBits !== row.netBits) {
      await ctx.db.replace(old._id, row);
    }
  }
}

/** Write each god's totals (≤ 8 docs), only where they changed. */
export async function writeGodTotals(ctx: MutationCtx, gameId: Id<"games">, totals: readonly GodTotals[]) {
  for (const t of totals) {
    const old = await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", t.godId)).first();
    const row = { gameId, ...t };
    if (!old) await ctx.db.insert("godTotals", row);
    else if ((Object.keys(t) as (keyof GodTotals)[]).some(k => old[k] !== t[k])) await ctx.db.replace(old._id, row);
  }
}

/** Write each god's scatter digest (≤ 8 docs). */
export async function writeDigests(ctx: MutationCtx, gameId: Id<"games">, digests: readonly { godId: string; own: number[]; peer: number[] }[]) {
  for (const d of digests) {
    const old = await ctx.db.query("objectDigests").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", d.godId)).first();
    const row = { gameId, ...d };
    if (!old) await ctx.db.insert("objectDigests", row);
    else await ctx.db.replace(old._id, row);
  }
}

/** A game's totals and digests from every one of its objects (the start, the end, the backfill: not the tick). */
export async function writeGameAggregates(ctx: MutationCtx, game: { _id: Id<"games">; roster: readonly { id: string }[] }, objects: readonly Scored[], live: boolean) {
  const roster = game.roster.map(m => m.id);
  await writeGodTotals(ctx, game._id, godTotalsOf(roster, objects, live));
  await writeDigests(ctx, game._id, digestsOf(roster, objects, live));
}

const VIEW_PAGE = 100;

/**
 * Bring a game's objectViews in line with its objects, a page at a time (each page its own transaction): scheduled at
 * the start (the start's own transaction holds the objects; ≤ 8 rows each would make it too large), by the end (the
 * disclosure becomes exact) and by migrations:backfillObjectViews. The last page writes the totals and digests from
 * every object. Idempotent: a row already equal is left alone.
 */
export const fillObjectViews = internalMutation({
  args: { gameId: v.id("games"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { gameId, cursor }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;
    const live = game.phase !== "ended";
    const page = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: VIEW_PAGE });
    for (const o of page.page as Doc<"objects">[]) await syncObjectViews(ctx, o, live);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.game.readModel.fillObjectViews, { gameId, cursor: page.continueCursor });
    else await ctx.scheduler.runAfter(0, internal.game.readModel.fillAggregates, { gameId });
  },
});

/** A game's totals and digests from every object (bounded by the game's object limit, 2,000). */
export const fillAggregates = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;
    const objects = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
    await writeGameAggregates(ctx, game, objects, game.phase !== "ended");
  },
});

/** Whether a game has any objectViews row (one stored before them has none until migrations:backfillObjectViews). */
export async function hasObjectViews(ctx: MutationCtx, gameId: Id<"games">) {
  return !!await ctx.db.query("objectViews").withIndex("by_game_god_payoff", q => q.eq("gameId", gameId)).first();
}

const FINAL_PAGE = 100;

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
      // Each god's rows become exact too (the end's totals and digests are written by the end itself).
      await syncObjectViews(ctx, o, false);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.game.readModel.finalizeObjects, { gameId, cursor: page.continueCursor });
  },
});
