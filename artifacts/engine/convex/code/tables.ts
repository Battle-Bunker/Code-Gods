import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Code runs (owned by convex/code; docs/assistant/code-execution.md §4): one row per analytics script a human ran in a
 * room (through the assistant's run_code), with its source, the datasets it read, its outcome and timing. Private to
 * the human (`subject`): only code/runs.ts reads them, checking the subject. The result JSON and printed output are
 * in the row when small; otherwise the row keeps a preview and `fullId` holds `{result, output}` in file storage.
 * Workers keep no state: a run's inputs are resolved and its outputs stored here.
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
    /** The row holds a prefix of the result or output; the whole of both is in file storage. */
    clipped: v.optional(v.boolean()),
    outputTruncated: v.optional(v.boolean()),
    fullId: v.optional(v.id("_storage")),
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
    cpuMs: v.optional(v.number()), wallMs: v.optional(v.number()), inputBytes: v.optional(v.number()),
    startedAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_subject_room", ["subject", "roomId"]).index("by_subject_epoch", ["subject", "epoch"]),
};
