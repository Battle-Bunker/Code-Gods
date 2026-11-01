"use node";
/**
 * On-demand calibration (docs/analytic-calibration/architecture.md §3): the sampling estimator run inside a Node action
 * for one table, and the "prepare" entry point that resolves a game's draws (analytic first, then the warm file, then the
 * computed cache, then a fan-out of `run` actions, one per missing table).
 */
import { v } from "convex/values";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import { instantiateKey, paramsKey, tableKey } from "@workspace/game-utilities";
import { budgetFor, buildReplicate, buildTable, mergeReplicates, tableJson, type ReplicateResult } from "@workspace/game-utilities/estimator";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { planDraws, resolveTables } from "../engine/calibration";
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
      // tableJson: the same compact, stably ordered bytes as the shipped files.
      await ctx.runMutation(internal.calibration.cache.finished, { key, table: tableJson(r.table), buildMs: performance.now() - started });
      return { key, levels: r.table.levels.length, maxBits: r.table.meta.maxBits, seconds: r.seconds };
    } catch (error) {
      try {
        await ctx.runMutation(internal.calibration.cache.finished, { key, error: (error as Error).message, buildMs: performance.now() - started });
      } catch (reportError) {
        console.error(`calibration.compute.run ${key}: could not record the failure: ${(reportError as Error).message}`);
      }
      throw error;
    }
  },
});

/**
 * One piece of a split table (architecture.md §3.2): replicate `index` of a `pieces`-way plan, recorded with
 * calibration/cache.ts pieceFinished (which retries a failed piece alone and schedules the merge after the last one).
 * Without a claim row (the latency probe) nothing is recorded; `returnResult` hands the replicate back instead.
 */
export const piece = internalAction({
  args: { key: v.string(), instance: v.string(), familyId: v.string(), params: v.any(), index: v.number(), pieces: v.number(), returnResult: v.optional(v.boolean()) },
  handler: async (ctx, { key, instance, familyId, params, index, pieces, returnResult }) => {
    const started = performance.now();
    try {
      const inst = instantiateKey(instance);
      if (tableKey(familyId, params, inst) !== key) throw new Error(`${familyId} ${paramsKey(params)} on ${instance}: key is not the current code's`);
      const r = buildReplicate(familyId, params, inst, budgetFor(inst.objectType), { replicates: pieces }, index);
      const result = JSON.stringify(r);
      await ctx.runMutation(internal.calibration.cache.pieceFinished, { key, index, pieces, result, buildMs: performance.now() - started });
      return { key, index, seconds: r.seconds, bodySeconds: r.bodySeconds, stages: r.stages, evaluations: r.evaluations, ...(returnResult ? { result } : {}) };
    } catch (error) {
      try {
        await ctx.runMutation(internal.calibration.cache.pieceFinished, { key, index, pieces, error: (error as Error).message, buildMs: performance.now() - started });
      } catch (reportError) {
        console.error(`calibration.compute.piece ${key} #${index}: could not record the failure: ${(reportError as Error).message}`);
      }
      throw error;
    }
  },
});

/** The merge of a split table's pieces (scheduled by pieceFinished when the last one is ready), recorded like `run`. */
export const merge = internalAction({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const started = performance.now();
    const { row, results } = await ctx.runQuery(internal.calibration.cache.readyPieces, { key });
    if (!row || row.status !== "computing") return null;   // forgotten, or merged already
    try {
      const inst = instantiateKey(row.instance), params = JSON.parse(row.paramsKey);
      const reps = results.map(r => JSON.parse(r) as ReplicateResult);
      const table = mergeReplicates(row.family, params, inst, budgetFor(inst.objectType), { replicates: row.pieces }, reps);
      if (table.key !== key) throw new Error("internal: merged table key mismatch");
      await ctx.runMutation(internal.calibration.cache.finished, { key, table: tableJson(table), buildMs: performance.now() - started });
      return { key, levels: table.levels.length, maxBits: table.meta.maxBits };
    } catch (error) {
      await ctx.runMutation(internal.calibration.cache.finished, { key, error: `merge: ${(error as Error).message}`, buildMs: performance.now() - started });
      throw error;
    }
  },
});

/**
 * The split plan of each sampled draw (engine/calibration.ts planDraws), measured in this action: for the latency
 * probe, which runs the pieces itself.
 */
export const plan = internalAction({
  args: { instance: v.string(), draws: v.array(drawV) },
  handler: async (_ctx, { instance, draws }) => planDraws(instantiateKey(instance), draws.map(d => ({ draw: d, canon: d.params, key: tableKey(d.familyId, d.params, instantiateKey(instance)) }))),
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
