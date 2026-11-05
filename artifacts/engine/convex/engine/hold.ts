"use node";
/**
 * Hold rarity's computing side (docs/energy-model.md §8; the data side is engine/holdData.ts). A game with more than one
 * player needs each god's reward hold table at m = players − 1. They are computed during planning, in parallel with the
 * sandbox warm-up, one action per missing table (fan-out), cached by (static table key, m, NOISE_VERSION); planning waits
 * for them (engine/tick.ts) and `finish` re-pins the game's tables with them and re-scores the starting objects. A
 * failure plays the game on static rarity. `warm` fills the cache after a deploy for the default board.
 */
import { v } from "convex/values";
import { DEFAULT_SETUP_SEED_ID, instantiationOf, seedSetupSettings, type GameSettings } from "@workspace/game-core";
import { context, family, familiesFor, tableKey, type UtilityDescriptor } from "@workspace/game-utilities";
import { DEFAULT_HOLD_BUDGET, buildHoldTable, holdKeyPart, type HoldTable } from "@workspace/game-utilities/hold";
import { sha256, type Instantiation } from "@workspace/game-types";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { priorOf, scoresOf, type Deal } from "./node";
import { fromPinnedFile, pinnedFile, storePinned } from "./pinned";

/** The cache key of one draw's hold table at m: its static table's key (family, canonical params, card, prelude…) + m + noise. */
export function holdCacheKey(draw: { familyId: string; params: Record<string, unknown> }, inst: Instantiation, settings: GameSettings, m: number): string {
  const f = family(draw.familyId), canon = f.canonical(draw.params as never, context(inst));
  return sha256(`${tableKey(draw.familyId, canon, inst, priorOf(settings.priorId))}\0${holdKeyPart(m)}`);
}

async function compute(ctx: ActionCtx, key: string, draw: { familyId: string; params: Record<string, unknown> }, inst: Instantiation, m: number,
  gameId?: Id<"games">): Promise<void> {
  const table = buildHoldTable(draw.familyId, draw.params as never, inst, m, key, DEFAULT_HOLD_BUDGET);
  await ctx.runMutation(internal.engine.holdData.store, { key, table, ...(gameId ? { gameId } : {}) });
}

/** Scheduled by the game start (game/lobby.ts commitStart) for a game with more than one player. */
export const start = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const input = await ctx.runQuery(internal.engine.holdData.inputs, { gameId });
    if (!input || input.phase !== "planning" || input.holdState !== "computing") return;
    try {
      if (!input.tablesStorageId) throw new Error("the game has no pinned tables");
      const settings = input.settings as GameSettings, inst = instantiationOf(settings), m = input.deities.length - 1;
      const missing = new Map<string, { familyId: string; params: Record<string, unknown> }>();
      for (const d of input.deities) {
        const u = d.utility as UtilityDescriptor, key = holdCacheKey(u, inst, settings, m);
        if (!missing.has(key) && !await ctx.runQuery(internal.engine.holdData.cached, { key })) missing.set(key, { familyId: u.familyId, params: u.params as Record<string, unknown> });
      }
      await ctx.runMutation(internal.engine.holdData.begin, { gameId, pending: [...missing.keys()] });
      for (const [key, draw] of missing) await ctx.scheduler.runAfter(0, internal.engine.hold.computeOne, { gameId, key, draw, m });
    } catch (error) {
      await ctx.runMutation(internal.engine.holdData.failed, { gameId, message: (error as Error).message });
    }
  },
});

export const computeOne = internalAction({
  args: { gameId: v.id("games"), key: v.string(), draw: v.object({ familyId: v.string(), params: v.any() }), m: v.number() },
  handler: async (ctx, { gameId, key, draw, m }) => {
    const input = await ctx.runQuery(internal.engine.holdData.inputs, { gameId });
    if (!input || input.holdState !== "computing") return;
    try { await compute(ctx, key, draw, instantiationOf(input.settings as GameSettings), m, gameId); }
    catch (error) { await ctx.runMutation(internal.engine.holdData.failed, { gameId, message: `hold table ${draw.familyId}: ${(error as Error).message}` }); }
  },
});

/** Every table is cached: pin them with the game's tables and re-score the starting objects. */
export const finish = internalAction({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const input = await ctx.runQuery(internal.engine.holdData.inputs, { gameId });
    if (!input || input.holdState !== "computing") return;
    try {
      if (!input.tablesStorageId) throw new Error("the game has no pinned tables");
      const settings = input.settings as GameSettings, inst = instantiationOf(settings), m = input.deities.length - 1;
      const blob = await ctx.storage.get(input.tablesStorageId);
      if (!blob) throw new Error("the game's pinned tables are missing");
      const file = pinnedFile(fromPinnedFile(JSON.parse(await blob.text()), inst.key));
      for (const g of file.gods) {
        const u = input.deities.find(d => d.godId === g.godId)?.utility as UtilityDescriptor | undefined;
        if (!u) continue;
        const hold = await ctx.runQuery(internal.engine.holdData.cached, { key: holdCacheKey(u, inst, settings, m) }) as HoldTable | null;
        if (!hold) throw new Error(`no hold table for ${u.familyId}`);
        g.hold = hold;
      }
      const pinned = fromPinnedFile(file, inst.key);
      const deals: Deal[] = input.deities.map(d => ({ godId: d.godId, utility: d.utility as UtilityDescriptor }));
      const objects = input.objects.map(o => ({ id: o.id, version: o.version, scores: scoresOf(pinned, settings, deals, o.value) }));
      const storageId = await storePinned(ctx, pinned);
      const old: Id<"_storage"> | null = await ctx.runMutation(internal.engine.holdData.apply, { gameId, storageId, objects });
      if (old) await ctx.storage.delete(old).catch(() => undefined);
      else await ctx.storage.delete(storageId).catch(() => undefined);   // the game moved on (not planning any more)
    } catch (error) {
      await ctx.runMutation(internal.engine.holdData.failed, { gameId, message: (error as Error).message });
    }
  },
});

/** The cache warm-up after a deploy: every draw the default setup can deal, on its board, for m = 1..3 (one action each). */
export const warm = internalAction({
  args: {},
  handler: async ctx => {
    const settings = seedSetupSettings(DEFAULT_SETUP_SEED_ID) as GameSettings, inst = instantiationOf(settings);
    const excluded = new Set(settings.excludedFamilies);
    let scheduled = 0;
    for (const { id } of familiesFor(inst.objectType, "reward")) {
      if (excluded.has(id)) continue;
      for (const params of family(id).support(context(inst))) for (const m of [1, 2, 3]) {
        const key = holdCacheKey({ familyId: id, params }, inst, settings, m);
        if (await ctx.runQuery(internal.engine.holdData.cached, { key })) continue;
        await ctx.scheduler.runAfter(scheduled++ * 2000, internal.engine.hold.warmOne, { key, draw: { familyId: id, params }, m });
      }
    }
    console.log(`hold warm-up: ${scheduled} tables scheduled for ${inst.key}`);
  },
});
export const warmOne = internalAction({
  args: { key: v.string(), draw: v.object({ familyId: v.string(), params: v.any() }), m: v.number() },
  handler: async (ctx, { key, draw, m }) => {
    if (await ctx.runQuery(internal.engine.holdData.cached, { key })) return;
    const settings = seedSetupSettings(DEFAULT_SETUP_SEED_ID) as GameSettings;
    await compute(ctx, key, draw, instantiationOf(settings), m);
  },
});
