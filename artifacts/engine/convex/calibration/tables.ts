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
    /** Build time of the last attempt (ms), for the latency record: the whole table, or the merge of a split one. */
    buildMs: v.optional(v.number()),
    lastUsedAt: v.number(),
    /**
     * The split plan (architecture.md §3.2): the table is computed as `pieces` replicate pieces (calibrationPieces) and
     * merged. Absent or 1: one action builds the whole table.
     */
    pieces: v.optional(v.number()),
    /** Pieces ready so far (the progress a preparing room shows). */
    piecesDone: v.optional(v.number()),
    /** Build time of each piece (ms, by index), kept when the table is merged: the latency record. */
    pieceMs: v.optional(v.array(v.number())),
  }).index("by_key", ["key"]).index("by_instance", ["instance"]).index("by_status_used", ["status", "lastUsedAt"]),
  /**
   * The pieces of a split computation (calibration/compute.ts piece): replicate `index` of the key's plan, its result
   * (game-utilities ReplicateResult JSON, a few KB) once ready. Each piece is retried on its own; the merge reads them all,
   * and the rows are dropped once the table is written.
   */
  calibrationPieces: defineTable({
    key: v.string(),
    index: v.number(),
    status: v.union(v.literal("computing"), v.literal("ready"), v.literal("failed")),
    result: v.optional(v.string()),
    attempts: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    buildMs: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_key", ["key", "index"]),
  /**
   * The rate limit on computing new tables, per owner (calibration/cache.ts claimMany): a bucket of pieces refilled at
   * PIECES_PER_MINUTE, and the rooms whose preparation the owner started (at most MAX_PREPARATIONS at a time).
   */
  calibrationQuotas: defineTable({
    ownerId: v.string(),
    tokens: v.number(),
    updatedAt: v.number(),
    /** Rooms the owner's admitted starts prepare, with when each was admitted. */
    rooms: v.array(v.object({ roomId: v.id("rooms"), at: v.number() })),
  }).index("by_owner", ["ownerId"]),
  /**
   * Rooms waiting for a computed table (owner.ts start, the preparing state): one row per (room start, key). The compute
   * action's `finished` (calibration/cache.ts) reads them to advance each room's progress and, when its last key lands,
   * to schedule the start's second half at once.
   */
  calibrationWaits: defineTable({
    key: v.string(),
    roomId: v.id("rooms"),
    /** The waiting start (rooms.preparing.requestId). */
    requestId: v.string(),
  }).index("by_key", ["key"]).index("by_room", ["roomId"]),
};
