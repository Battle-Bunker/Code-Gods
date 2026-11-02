import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Code runs and the per-user object store (owned by convex/code; docs/assistant/code-execution.md §4–5).
 *
 * codeRuns: one row per analytics script a human ran in a room (through the assistant's run_code), with its source, the
 * datasets and objects it read, its outcome, timing and store writes: the audit of every run. The result JSON and the
 * printed output are kept in the row as a prefix (for the panel and the model) and whole as the object `runs/<runId>`.
 *
 * codeObjects: the ONLY persistence a script has (no file system anywhere): JSON values (bytes as {"$hex"}) by key, in
 * one namespace per human (`subject`), partitioned by game (`epoch`; code/keys.ts partitionOf): a game's runs see that
 * game's objects and the player's saved scripts only. The row holds a small value; a larger one is a file-storage blob. Keys under
 * `runs/` are the engine's (run results) and read-only to scripts. codeObjectEvents records every write, refused ones
 * included. Every read and write goes through code/objects.ts, which checks the subject; workers keep no state.
 */
export const codeTables = {
  codeRuns: defineTable({
    subject: v.string(), roomId: v.id("rooms"),
    /** The game the run's budget counts against: its id, or `lobby:<roomId>` before the room's first game. */
    epoch: v.string(),
    language: v.union(v.literal("python"), v.literal("typescript")),
    source: v.string(),
    title: v.optional(v.string()),
    /** The datasets requested, as given ([name] or {name, gameId, limit}), and params, as JSON. */
    datasetsJson: v.string(),
    paramsJson: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("error")),
    /** main's result JSON (≤ CODE_LIMITS.rowResultChars, else a prefix) and the printed text (likewise). */
    resultJson: v.optional(v.string()),
    output: v.optional(v.string()),
    resultChars: v.optional(v.number()), outputChars: v.optional(v.number()),
    /** The row holds a prefix of the result or output; the whole of both is the object runs/<runId>. */
    clipped: v.optional(v.boolean()),
    outputTruncated: v.optional(v.boolean()),
    /** Unused since the object store (a run's whole result is the object runs/<runId>); kept so older rows validate. */
    fullId: v.optional(v.id("_storage")),
    /** The objects the run loaded (keys and "prefix*" scopes), and a summary of its store writes (or why they were refused). */
    objectsJson: v.optional(v.string()),
    storeJson: v.optional(v.string()),
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
    cpuMs: v.optional(v.number()), wallMs: v.optional(v.number()), inputBytes: v.optional(v.number()),
    startedAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_subject_room", ["subject", "roomId"]).index("by_subject_epoch", ["subject", "epoch"]),

  codeObjects: defineTable({
    subject: v.string(), key: v.string(),
    /** The partition: the game epoch of the run that wrote it (codeRuns.epoch), or "" for the player-wide saved scripts.
     * Absent only on rows from before the partitions, until the assistant-per-game migration (convex/migrations.ts). */
    epoch: v.optional(v.string()),
    /** The value's JSON text when at most CODE_LIMITS.inlineValueChars, else in `storageId`. */
    valueJson: v.optional(v.string()), storageId: v.optional(v.id("_storage")),
    bytes: v.number(),
    /** The room and run that wrote it last (absent for engine writes outside a run). */
    roomId: v.optional(v.id("rooms")), runId: v.optional(v.id("codeRuns")),
    updatedAt: v.number(),
  }).index("by_subject_key", ["subject", "key"]).index("by_subject_epoch_key", ["subject", "epoch", "key"]),

  /** Each human's store usage per partition (runs/ results excluded), kept by commitAs so a quota check never reads the
   * values. A row without `epoch` is a total from before the partitions (the migration replaces it). */
  codeObjectUsage: defineTable({ subject: v.string(), epoch: v.optional(v.string()), objects: v.number(), bytes: v.number(), updatedAt: v.optional(v.number()) })
    .index("by_subject", ["subject"]).index("by_subject_epoch", ["subject", "epoch"]),

  codeObjectEvents: defineTable({
    subject: v.string(), roomId: v.optional(v.id("rooms")), runId: v.optional(v.id("codeRuns")),
    op: v.union(v.literal("put"), v.literal("delete"), v.literal("refused")),
    /** The key written, or for a refused write set, the first key and the reason. */
    key: v.string(), bytes: v.number(), reason: v.optional(v.string()), at: v.number(),
  }).index("by_subject", ["subject", "at"]).index("by_run", ["runId"]),
};
