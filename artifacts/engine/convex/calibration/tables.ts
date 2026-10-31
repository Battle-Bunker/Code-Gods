import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Calibration tables in Convex file storage (scripts/upload-calibration.mjs uploads every
 * lib/game-utilities/data/calibration/v1/<instance>.json at deploy). One row per instantiation; the engine loads a
 * file lazily, the first time a process needs that instantiation (convex/engine/calibration.ts).
 */
export const calibrationTables = {
  calibrationFiles: defineTable({
    /** Instance key, e.g. "Grid(5,base10,rgby)". */
    instance: v.string(),
    /** Position in the offered lists (manifest.json's order; files it does not list yet come after, sorted). */
    rank: v.number(),
    /** SHA-256 of the file's bytes (as in git), checked server-side when the upload is registered. */
    sha256: v.string(),
    storageId: v.id("_storage"),
    size: v.number(),
    tableCount: v.number(),
    /**
     * The file's manifest entry (game-utilities `manifestEntry`: objectType, args and every table's key), as JSON
     * text (params keys are not Convex field names). Small; what `offeredInstantiations` checks for freshness.
     */
    entry: v.string(),
    uploadedAt: v.number(),
  }).index("by_instance", ["instance"]),
  /**
   * Tables computed on demand (convex/calibration/compute.ts, engine/calibration.ts resolveTables): one row per table
   * key, doubling as the job record. The table JSON is written in the same mutation that marks the row ready, so a
   * reader never sees a half-written table. Analytic tables are never stored (recomputing them is cheaper).
   */
  calibrationComputed: defineTable({
    /** game-utilities tableKey: family, canonical params, instantiation, card, prelude, estimator, prior. Unique. */
    key: v.string(),
    instance: v.string(),
    family: v.string(),
    paramsKey: v.string(),
    prior: v.string(),
    status: v.union(v.literal("computing"), v.literal("ready"), v.literal("failed")),
    /** CalibrationTable JSON (status ready). */
    table: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    attempts: v.number(),
    error: v.optional(v.string()),
    /** Build time of the last attempt (ms), for the latency record. */
    buildMs: v.optional(v.number()),
    lastUsedAt: v.number(),
  }).index("by_key", ["key"]).index("by_instance", ["instance"]).index("by_status", ["status"]),
};
