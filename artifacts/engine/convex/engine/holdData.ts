/**
 * Hold rarity's data side (docs/energy-model.md §8; the computing side is engine/hold.ts): the cache of hold tables,
 * a game's hold state during planning, and the re-score that applies them before the world runs.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { publicSalienceOf } from "../game/readModel";
import { liveGame, writeGame } from "../game/state";
import { scheduleFill } from "../game/objectViews";
import { scoreV } from "../game/tables";
import { disclosedTotalsOf, salienceOf, totalsOf } from "../lib/world";
import { appendEvents } from "./loop";

/** What engine/hold.ts needs of a game: its settings, deal (roster order), pinned file and starting objects. */
export const inputs = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const deities = (await ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).take(16)).sort((a, b) => a.index - b.index);
    const objects = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
    return {
      settings: game.settings, phase: game.phase, holdState: game.holdState, holdPending: game.holdPending ?? [], tablesStorageId: game.tablesStorageId,
      deities: deities.map(d => ({ godId: d.godId, utility: d.utility })),
      objects: objects.map(o => ({ id: o._id, value: o.value, version: o.version, noise: o.noise })),
    };
  },
});

/** Just what a hold action checks before working: the game's hold state and settings (the game doc only). */
export const status = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    return game ? { phase: game.phase, holdState: game.holdState, settings: game.settings } : null;
  },
});

/** Which of these keys the cache lacks (an existence check: no table is read back). */
export const missing = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const out: string[] = [];
    for (const key of new Set(keys)) if (!await ctx.db.query("holdTables").withIndex("by_key", q => q.eq("key", key)).first()) out.push(key);
    return out;
  },
});

export const cached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => (await ctx.db.query("holdTables").withIndex("by_key", q => q.eq("key", key)).first())?.table ?? null,
});

/** Keep a computed table; with `gameId`, the game's pending key is done and, the last one, the game is finished. */
export const store = internalMutation({
  args: { key: v.string(), table: v.any(), gameId: v.optional(v.id("games")) },
  handler: async (ctx, { key, table, gameId }) => {
    if (!await ctx.db.query("holdTables").withIndex("by_key", q => q.eq("key", key)).first()) {
      await ctx.db.insert("holdTables", { key, table, computedAt: Date.now() });
    }
    if (!gameId) return;
    const game = await ctx.db.get(gameId);
    if (!game || game.holdState !== "computing") return;
    const pending = (game.holdPending ?? []).filter(k => k !== key);
    await ctx.db.patch(gameId, { holdPending: pending });
    if (!pending.length) await ctx.scheduler.runAfter(0, internal.engine.hold.finish, { gameId });
  },
});

/** The keys a computing game waits for (an empty list finishes at once); the start set `computing` (game/lobby.ts). */
export const begin = internalMutation({
  args: { gameId: v.id("games"), pending: v.array(v.string()) },
  handler: async (ctx, { gameId, pending }) => {
    const game = await ctx.db.get(gameId);
    if (game?.holdState !== "computing") return;
    await ctx.db.patch(gameId, { holdPending: pending });
    if (!pending.length) await ctx.scheduler.runAfter(0, internal.engine.hold.finish, { gameId });
  },
});

/**
 * The corrections are in: the game scores with the new pinned file from now on, and every object is re-scored with it
 * at world time 0 (still planning: nothing has acted), logged as `rescore` events.
 */
export const apply = internalMutation({
  args: {
    gameId: v.id("games"), storageId: v.id("_storage"),
    objects: v.array(v.object({ id: v.id("objects"), version: v.number(), scores: v.array(scoreV) })),
  },
  handler: async (ctx, { gameId, storageId, objects }): Promise<Id<"_storage"> | null> => {
    const game = await liveGame(ctx, gameId);
    if (!game || game.holdState !== "computing") return null;
    // The game moved on (ended, or the world started on static rarity): nothing to apply; stop computing.
    if (game.phase !== "planning") {
      await ctx.db.patch(gameId, { holdState: "failed", holdError: "The game left planning before the corrections were in", holdPending: [], holdReadyAt: Date.now() });
      return null;
    }
    const roster = game.roster.map(m => m.id);
    const events = [];
    for (const o of objects) {
      const doc = await ctx.db.get(o.id);
      if (!doc || doc.version !== o.version) continue;
      const salience = salienceOf(o.scores);
      await ctx.db.patch(o.id, { scores: o.scores, salience, publicSalience: publicSalienceOf({ salience, noise: doc.noise }, true) });
      const net = roster.map(id => o.scores.find(s => s.god === id)?.netBits ?? 0);
      // The per-object history is the state index (the state at t is the last row at or before t): this version's row
      // now holds the re-scored bits; the log keeps both (the spawn, then the rescore).
      const row = await ctx.db.query("objectEvents").withIndex("by_game_object_version", q => q.eq("gameId", gameId).eq("objectId", o.id).eq("version", o.version)).first();
      if (row) await ctx.db.patch(row._id, { net });
      events.push({ t: "rescore" as const, objectId: o.id as string, value: doc.value, version: doc.version, world: game.worldSeconds,
        net, ...(doc.noise !== undefined ? { noise: doc.noise } : {}) });
    }
    // The totals and the published scoreboard follow the new scores at once (the start published the static ones).
    const all = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
    const totals = totalsOf(roster, all), disclosed = disclosedTotalsOf(roster, all);
    const nextBatch = await appendEvents(ctx, game, events, game.worldSeconds, game.worldSeconds, undefined, totals, disclosed);
    const old = game.tablesStorageId ?? null;
    await writeGame(ctx, game, { tablesStorageId: storageId, holdState: "ready", holdPending: [], holdReadyAt: Date.now(), nextBatch,
      scoreboard: { totals: disclosed, world: game.worldSeconds, at: Date.now() } });
    // Each god's object rows and totals follow the new scores (game/objectViews.ts), paged off this transaction.
    await scheduleFill(ctx, gameId);
    return old;
  },
});

/** Hold rarity could not be computed: the game plays on static rarity (planning stops waiting). */
export const failed = internalMutation({
  args: { gameId: v.id("games"), message: v.string() },
  handler: async (ctx, { gameId, message }) => {
    const game = await ctx.db.get(gameId);
    if (game?.holdState === "computing") await ctx.db.patch(gameId, { holdState: "failed", holdError: message.slice(0, 500), holdPending: [], holdReadyAt: Date.now() });
  },
});

/** Post-deploy: warm the cache for the default board (engine/hold.ts warm), without waiting for it. */
export const scheduleWarm = internalMutation({
  args: {},
  handler: async ctx => { await ctx.scheduler.runAfter(0, internal.engine.hold.warm, {}); },
});
