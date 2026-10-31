import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/**
 * The on-demand table cache (calibration/tables.ts calibrationComputed): claim a key before computing it, record the
 * result, read many keys at once. Readers are engine/calibration.ts resolveTables; the writer is calibration/compute.ts.
 */

/** A computing row older than this is a crashed action: the next claim restarts it. */
export const STALE_COMPUTING_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 2;

export const getMany = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const out: { key: string; status: "computing" | "ready" | "failed"; table?: string; attempts: number; startedAt: number; finishedAt?: number; error?: string; buildMs?: number }[] = [];
    for (const key of keys) {
      const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
      if (row) out.push({ key, status: row.status, table: row.table, attempts: row.attempts, startedAt: row.startedAt, finishedAt: row.finishedAt, error: row.error, buildMs: row.buildMs });
    }
    return out;
  },
});

/**
 * Claims `key` for computation: inserts a computing row (or restarts a failed one with attempts left, or a computing
 * one older than STALE_COMPUTING_MS). Returns what the caller should do: "compute" (it won the claim and must schedule
 * the action), "wait" (someone else is computing), "ready" (a table exists) or "failed" (no attempts left).
 */
export const claim = internalMutation({
  args: { key: v.string(), instance: v.string(), family: v.string(), paramsKey: v.string(), prior: v.string() },
  handler: async (ctx, args): Promise<"compute" | "wait" | "ready" | "failed"> => {
    const now = Date.now();
    const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (!row) {
      await ctx.db.insert("calibrationComputed", { ...args, status: "computing", startedAt: now, attempts: 1, lastUsedAt: now });
      return "compute";
    }
    if (row.status === "ready") { await ctx.db.patch(row._id, { lastUsedAt: now }); return "ready"; }
    if (row.status === "computing" && now - row.startedAt < STALE_COMPUTING_MS) return "wait";
    if (row.attempts >= MAX_ATTEMPTS && row.status === "failed") return "failed";
    await ctx.db.patch(row._id, { status: "computing", startedAt: now, attempts: row.attempts + 1, error: undefined, lastUsedAt: now });
    return "compute";
  },
});

/** The compute action's result: the table (ready) or the error (failed). */
export const finished = internalMutation({
  args: { key: v.string(), table: v.optional(v.string()), error: v.optional(v.string()), buildMs: v.number() },
  handler: async (ctx, { key, table, error, buildMs }) => {
    const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!row) throw new Error(`finished: no claim for ${key}`);
    await ctx.db.patch(row._id, table !== undefined
      ? { status: "ready", table, finishedAt: Date.now(), buildMs, error: undefined }
      : { status: "failed", error: error ?? "unknown error", finishedAt: Date.now(), buildMs });
  },
});

/** Test support: forget computed rows (all, or of one instance), so a first-use latency can be measured again. */
export const forget = internalMutation({
  args: { instance: v.optional(v.string()) },
  handler: async (ctx, { instance }) => {
    const rows = instance
      ? await ctx.db.query("calibrationComputed").withIndex("by_instance", q => q.eq("instance", instance)).collect()
      : await ctx.db.query("calibrationComputed").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});
