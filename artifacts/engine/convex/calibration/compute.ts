"use node";
/**
 * On-demand calibration (docs/analytic-calibration/architecture.md §3): the sampling estimator run inside a Node action
 * for one table, and the "prepare" entry point that resolves a game's draws (analytic first, then the warm file, then the
 * computed cache, then a fan-out of `run` actions, one per missing table).
 */
import { v } from "convex/values";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import { instantiateKey, paramsKey, tableKey, type CalibrationTable } from "@workspace/game-utilities";
import { budgetFor, buildTable, tableJson } from "@workspace/game-utilities/estimator";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { resolveTables } from "../engine/calibration";
import { priorOf } from "../engine/node";

const drawV = v.object({ familyId: v.string(), params: v.any() });

/** Builds one table with the type's default budget and records it (calibration/cache.ts finished). Idempotent by key. */
export const run = internalAction({
  args: { key: v.string(), instance: v.string(), familyId: v.string(), params: v.any() },
  handler: async (ctx, { key, instance, familyId, params }) => {
    const started = performance.now();
    try {
      const inst = instantiateKey(instance);
      if (tableKey(familyId, params, inst) !== key) throw new Error(`${familyId} ${paramsKey(params)} on ${instance}: key is not the current code's`);
      const r = buildTable(familyId, params, inst, budgetFor(inst.objectType));
      if (r.table.key !== key) throw new Error("internal: built table key mismatch");
      const table: CalibrationTable = JSON.parse(tableJson(r.table));
      await ctx.runMutation(internal.calibration.cache.finished, { key, table: JSON.stringify(table), buildMs: performance.now() - started });
      return { key, levels: table.levels.length, maxBits: table.meta.maxBits, seconds: r.seconds };
    } catch (error) {
      await ctx.runMutation(internal.calibration.cache.finished, { key, error: (error as Error).message, buildMs: performance.now() - started });
      throw error;
    }
  },
});

/**
 * Resolves the tables of some draws of a game's settings: what is ready, what is being prepared (and was scheduled by
 * this call if nobody had claimed it). Called again, it reports progress; when `pending` is empty every draw can be
 * scored. The first half of the two-half game start (architecture.md §3.4) and the latency probe of the tests.
 */
export const prepare = internalAction({
  args: { settings: v.any(), draws: v.array(drawV) },
  handler: async (ctx, { settings, draws }) => {
    const inst = instantiationOf(settings as GameSettings);
    const started = performance.now();
    const r = await resolveTables(ctx, inst, draws, priorOf((settings as GameSettings).priorId ?? "uniform"));
    return {
      instance: inst.key, ms: performance.now() - started,
      ready: r.ready.map(x => ({ key: x.key, source: x.source, familyId: x.draw.familyId, buildMs: x.buildMs })),
      pending: r.pending.map(x => ({ key: x.key, familyId: x.draw.familyId, scheduled: x.scheduled })),
    };
  },
});
