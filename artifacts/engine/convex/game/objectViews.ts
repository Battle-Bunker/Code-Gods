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
import { boardsLive, paidLive } from "../lib/knowledge";
import { clockDoc } from "./state";

const NOBODY: ReadonlySet<string> = new Set();

export const godTotalsV = v.object({
  godId: v.string(), objectCount: v.number(), score: v.number(), sumOwnNetBits: v.number(), sumPeerNetBits: v.number(),
  contested: v.number(), chips: v.number(), maxOwn: v.number(), maxCare: v.number(), maxPayoff: v.number(), minPayoff: v.number(),
});

type Row = Omit<Doc<"objectViews">, "_id" | "_creationTime">;
const stored = ({ _id, _creationTime, ...row }: Doc<"objectViews">): Row => row;
/** What a row is computed from: an object as stored. */
type ObjectState = Pick<Doc<"objects">, "_id" | "gameId" | "value" | "version" | "scores" | "noise" | "createdAt" | "lastMutatedAt">;


/** Every roster god's row of one object as disclosed now (`learnedAt`: paid observation, the world time of this telling). */
function rowsOf(o: ObjectState, live: boolean, learnedAt?: number, boards = false): Row[] {
  const rows: Row[] = [];
  for (const { god } of o.scores) {
    const view = viewRowOf(o, god, live)!;
    rows.push({
      gameId: o.gameId, godId: god, objectId: o._id, value: o.value, version: o.version, createdAt: o.createdAt ?? 0,
      ...(o.lastMutatedAt !== undefined ? { lastMutatedAt: o.lastMutatedAt } : {}), ...view,
      ...(learnedAt !== undefined ? { learnedAt, ...(boards ? { toldVersion: o.version } : {}) } : {}),
    });
  }
  return rows;
}

/**
 * Paid observation (lib/knowledge.ts): which gods a write tells, and when. A row that does not exist yet is always
 * written (the object's birth is public); an existing one only for a god in `told(objectId)` ("all": everyone).
 */
export type Telling = {
  world: number; told: (objectId: string) => ReadonlySet<string> | "all";
  /** "boards" mode (lib/knowledge.ts boardsLive): an untold god's row still follows the board and its own bits. */
  boards?: boolean;
};

/**
 * Write each roster god's row of these objects where it differs from the stored one (insert the missing), never over a
 * newer version (a late or out-of-order write). With `telling` (a paid live game), only the gods told.
 */
export async function syncRows(ctx: MutationCtx, objects: readonly ObjectState[], live: boolean, telling?: Telling) {
  for (const o of objects) {
    // bounded: one row per roster god (≤ 8).
    const have = new Map((await ctx.db.query("objectViews").withIndex("by_object_god", q => q.eq("objectId", o._id)).take(16)).map(r => [r.godId, r]));
    const told = telling?.told(o._id);
    for (const fresh of rowsOf(o, live, telling?.world, telling?.boards)) {
      const old = have.get(fresh.godId);
      // A telling never moves a row's time back (a tick's sync may run after a look made later in world time).
      const row = telling && old?.learnedAt !== undefined && old.learnedAt > telling.world ? { ...fresh, learnedAt: old.learnedAt } : fresh;
      // The god's knowledge over time (knowledgeLog): a telling that brings something new is one row of its series.
      // (The same version re-scored corrects its row; it is not a second observation.)
      const log = async () => {
        const entry = { gameId: row.gameId, godId: row.godId, objectId: row.objectId, world: row.learnedAt ?? 0, version: row.version, value: row.value,
          own: row.netBits, others: row.peerNetBits, payoff: row.payoff };
        const last = old && old.version === row.version
          ? await ctx.db.query("knowledgeLog").withIndex("by_game_god_object_world", q => q.eq("gameId", row.gameId).eq("godId", row.godId).eq("objectId", row.objectId)).order("desc").first()
          : null;
        if (last && last.version === row.version) await ctx.db.patch(last._id, { own: entry.own, others: entry.others, payoff: entry.payoff });
        else await ctx.db.insert("knowledgeLog", entry);
      };
      const news = !old || old.version !== row.version || old.peerNetBits !== row.peerNetBits || old.netBits !== row.netBits;
      if (!old) { await ctx.db.insert("objectViews", row); if (telling) await log(); }
      else if (told !== undefined && told !== "all" && !told.has(row.godId)) {
        const toldVersion = old.toldVersion ?? old.version;
        if (telling?.boards) {
          // "boards": the board and the god's own bits follow the object; the others' sum (and so the payoff) stays as
          // last told, with the time and the version of that telling. Stale once the object is past that version.
          const kept: Row = { ...row, peerNetBits: old.peerNetBits, peerCare: old.peerCare, payoff: old.peerCare === 0 ? 0 : row.netBits * old.peerCare,
            learnedAt: old.learnedAt ?? row.learnedAt, toldVersion, ...(row.version > toldVersion ? { stale: true } : {}) };
          if (old.version <= kept.version && JSON.stringify(stored(old)) !== JSON.stringify(kept)) await ctx.db.replace(old._id, kept);
          continue;
        }
        // Not told: the row stays. Only the same version re-scored (the hold corrections of planning, whose fill may
        // finish after the world starts) follows, keeping its time: the object is the one the god already knows.
        const same = { ...row, ...(old.learnedAt !== undefined ? { learnedAt: old.learnedAt } : {}) };
        if (old.version === row.version && JSON.stringify(stored(old)) !== JSON.stringify(same)) { await ctx.db.replace(old._id, same); if (news) await log(); }
        // The object moved past what the god was told: marked once (the count of changed objects, player.staleCount).
        else if (old.version < row.version && !old.stale) await ctx.db.patch(old._id, { stale: true });
      }
      else if (old.version <= row.version && JSON.stringify(stored(old)) !== JSON.stringify(row)) { await ctx.db.replace(old._id, row); if (telling && news) await log(); }
    }
  }
}

/** Write each god's totals where they changed; `force` (the end, a fill) replaces whatever world the stored one has. */
async function writeTotals(ctx: MutationCtx, gameId: Id<"games">, world: number, totals: readonly GodTotals[], force: boolean) {
  for (const t of totals) {
    const old = await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", t.godId)).first();
    const row = { gameId, world, ...t };
    // Only numbers that changed are written (not the world alone): every viewer's footer re-runs on a write.
    if (!old) await ctx.db.insert("godTotals", row);
    else if ((force || world >= old.world) && (Object.keys(t) as (keyof GodTotals)[]).some(k => old[k] !== t[k])) await ctx.db.replace(old._id, row);
  }
}

/**
 * The read model after one tick commit: the rows of the objects it changed or spawned (as they are now), and its totals.
 * In a paid live game (lib/knowledge.ts) only the gods the commit told get their row rewritten: `told` lists, per
 * object, the gods whose agents changed it or read all of it in the window; a spawn's rows are new, so everyone's.
 */
export const sync = internalMutation({
  args: {
    gameId: v.id("games"), objectIds: v.array(v.id("objects")), world: v.number(), totals: v.optional(v.array(godTotalsV)),
    told: v.optional(v.array(v.object({ id: v.id("objects"), gods: v.array(v.string()) }))),
  },
  handler: async (ctx, { gameId, objectIds, world, totals, told }) => {
    const game = await ctx.db.get(gameId);
    // Once ended, the end's fill writes the exact rows and totals; a late tick's live ones are dropped.
    if (!game || game.phase === "ended") return;
    const objects = (await Promise.all(objectIds.map(id => ctx.db.get(id)))).filter((o): o is Doc<"objects"> => !!o && o.gameId === gameId);
    const gods = new Map((told ?? []).map(t => [t.id as string, new Set(t.gods)]));
    const none: ReadonlySet<string> = new Set();
    await syncRows(ctx, objects, true, paidLive(game) ? { world, told: id => gods.get(id) ?? none, boards: boardsLive(game) } : undefined);
    if (totals) await writeTotals(ctx, gameId, world, totals, false);
  },
});

/** Objects per fill page: small, so a page's read of objects the tick is changing rarely conflicts with a commit. */
const FILL_PAGE = 25;

/** A game's rows from every object, a page at a time; the last page schedules its totals (fillTotals). */
export const fill = internalMutation({
  /** `rowsOnly`: the running game's sweep (every commit's sync writes the totals). */
  args: { gameId: v.id("games"), cursor: v.union(v.string(), v.null()), rowsOnly: v.optional(v.boolean()) },
  handler: async (ctx, { gameId, cursor, rowsOnly }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return;
    const page = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: FILL_PAGE });
    // Paid observation: before the world runs (the start, the hold rescoring) every god is told every object as it is
    // born; once it runs, a fill only adds a missing row (a birth), and the running game's sweep has nothing to repair.
    // (The clock is read only then: every commit writes it, and a free game's fill must not conflict with commits.)
    const paid = paidLive(game);
    const world = paid ? (await clockDoc(ctx, gameId))?.worldSeconds ?? 0 : 0;
    await syncRows(ctx, page.page, game.phase !== "ended", paid ? { world, told: () => (game.phase === "planning" ? "all" : NOBODY), boards: boardsLive(game) } : undefined);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.game.objectViews.fill, { gameId, cursor: page.continueCursor, ...(rowsOnly ? { rowsOnly } : {}) });
    else if (!rowsOnly) await ctx.scheduler.runAfter(0, internal.game.objectViews.fillTotals, { gameId });
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

/** Schedule a whole game's fill (the start, the hold rescoring, the end, the backfill; `rowsOnly`: the sweep). */
export const scheduleFill = (ctx: MutationCtx, gameId: Id<"games">, rowsOnly = false) =>
  ctx.scheduler.runAfter(0, internal.game.objectViews.fill, { gameId, cursor: null, ...(rowsOnly ? { rowsOnly } : {}) });

/** Whether a game has any read-model row (one stored before them has none until migrations.backfillObjectViews). */
export async function hasObjectViews(ctx: MutationCtx, game: Doc<"games">) {
  const godId = game.roster[0]?.id;
  return !godId || !!await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", game._id).eq("godId", godId)).first();
}
