/**
 * The per-god object read model's writers (docs/convex-read-architecture.md §4.1, §4.3; tables objectViews and
 * godTotals in game/tables.ts). The rows are written OFF the tick's commit: the commit schedules `sync` with the ids of
 * the objects it changed or spawned and the totals the tick computed from its snapshot, and `sync` reads those objects
 * as they are when it runs. So the commit pays one small scheduled call, never a read or write per row (the first
 * attempt wrote the rows in the commit and doubled its time; passing the objects' scores instead of their ids made the
 * commit's own write measurably larger). The commit reads no row or total, so a sync never makes a commit retry; a
 * sync runs between commits (about a second apart) and is retried by Convex if one lands while it reads. A row is
 * replaced only by a version at least as new as its own, so a late or out-of-order write never puts an older version
 * back, and an older tick's totals never replace a newer one's (`world`).
 *
 * `fill` brings a whole game's rows and totals in line with its objects as stored, a small page at a time: scheduled at
 * the start, after the hold rescoring (engine/holdData.ts apply: same versions, new scores), once a world minute while
 * the game runs (a sweep: a sync that failed leaves no row stale for longer), at the end (the disclosure becomes exact)
 * and by migrations.backfillObjectViews. Every write is idempotent: a row already equal is left alone.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { godTotalsOf, viewRowOf, type GodTotals } from "../lib/views";
import { clockDoc } from "./state";

export const godTotalsV = v.object({
  godId: v.string(), objectCount: v.number(), score: v.number(), sumOwnNetBits: v.number(), sumPeerNetBits: v.number(),
  contested: v.number(), chips: v.number(), maxOwn: v.number(), maxCare: v.number(), maxPayoff: v.number(), minPayoff: v.number(),
});

type Row = Omit<Doc<"objectViews">, "_id" | "_creationTime">;
const stored = ({ _id, _creationTime, ...row }: Doc<"objectViews">): Row => row;
/** What a row is computed from: an object as stored. */
type ObjectState = Pick<Doc<"objects">, "_id" | "gameId" | "value" | "version" | "scores" | "noise" | "createdAt" | "lastMutatedAt">;


/** Every roster god's row of one object as disclosed now. */
function rowsOf(o: ObjectState, live: boolean): Row[] {
  const rows: Row[] = [];
  for (const { god } of o.scores) {
    const view = viewRowOf(o, god, live)!;
    rows.push({
      gameId: o.gameId, godId: god, objectId: o._id, value: o.value, version: o.version, createdAt: o.createdAt ?? 0,
      ...(o.lastMutatedAt !== undefined ? { lastMutatedAt: o.lastMutatedAt } : {}), ...view,
    });
  }
  return rows;
}

/**
 * Write each roster god's row of these objects where it differs from the stored one (insert the missing), never over a
 * newer version (a late or out-of-order write).
 */
export async function syncRows(ctx: MutationCtx, objects: readonly ObjectState[], live: boolean) {
  for (const o of objects) {
    // bounded: one row per roster god (≤ 8).
    const have = new Map((await ctx.db.query("objectViews").withIndex("by_object_god", q => q.eq("objectId", o._id)).take(16)).map(r => [r.godId, r]));
    for (const row of rowsOf(o, live)) {
      const old = have.get(row.godId);
      if (!old) await ctx.db.insert("objectViews", row);
      else if (old.version <= row.version && JSON.stringify(stored(old)) !== JSON.stringify(row)) await ctx.db.replace(old._id, row);
    }
  }
}

/** Write each god's totals where they changed; `force` (the end, a fill) replaces whatever world the stored one has. */
async function writeTotals(ctx: MutationCtx, gameId: Id<"games">, world: number, totals: readonly GodTotals[], force: boolean) {
  for (const t of totals) {
    const old = await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", t.godId)).first();
    const row = { gameId, world, ...t };
    if (!old) await ctx.db.insert("godTotals", row);
    else if ((force || world >= old.world) && (Object.keys(row) as (keyof typeof row)[]).some(k => old[k] !== row[k])) await ctx.db.replace(old._id, row);
  }
}

/** The read model after one tick commit: the rows of the objects it changed or spawned (as they are now), and its totals. */
export const sync = internalMutation({
  args: { gameId: v.id("games"), objectIds: v.array(v.id("objects")), world: v.number(), totals: v.optional(v.array(godTotalsV)) },
  handler: async (ctx, { gameId, objectIds, world, totals }) => {
    const game = await ctx.db.get(gameId);
    // Once ended, the end's fill writes the exact rows and totals; a late tick's live ones are dropped.
    if (!game || game.phase === "ended") return;
    const objects = (await Promise.all(objectIds.map(id => ctx.db.get(id)))).filter((o): o is Doc<"objects"> => !!o && o.gameId === gameId);
    await syncRows(ctx, objects, true);
    if (totals) await writeTotals(ctx, gameId, world, totals, false);
  },
});

/** Objects per fill page: small, so a page's read of objects the tick is changing rarely conflicts with a commit. */
const FILL_PAGE = 25;

/** A game's rows from every object, a page at a time; the last page schedules its totals (fillTotals). */
export const fill = internalMutation({
  args: { gameId: v.id("games"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { gameId, cursor }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;
    const page = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: FILL_PAGE });
    await syncRows(ctx, page.page, game.phase !== "ended");
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.game.objectViews.fill, { gameId, cursor: page.continueCursor });
    else await ctx.scheduler.runAfter(0, internal.game.objectViews.fillTotals, { gameId });
  },
});

/** A game's totals from every object (internal: bounded by the game's object limit, 2,000). */
export const fillTotals = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;
    const objects = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
    const world = (await clockDoc(ctx, gameId))?.worldSeconds ?? 0;
    await writeTotals(ctx, gameId, world, godTotalsOf(game.roster.map(m => m.id), objects, game.phase !== "ended"), true);
  },
});

/** Schedule a whole game's fill (the start, the hold rescoring, the end, the backfill). */
export const scheduleFill = (ctx: MutationCtx, gameId: Id<"games">) => ctx.scheduler.runAfter(0, internal.game.objectViews.fill, { gameId, cursor: null });

/** Whether a game has any read-model row (one stored before them has none until migrations.backfillObjectViews). */
export async function hasObjectViews(ctx: MutationCtx, game: Doc<"games">) {
  const godId = game.roster[0]?.id;
  return !godId || !!await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", game._id).eq("godId", godId)).first();
}
