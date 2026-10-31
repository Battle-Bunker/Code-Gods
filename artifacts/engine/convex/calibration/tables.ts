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
};
