/** The examination cache's storage (lib/examinationCache.ts says what it is and why sharing it is safe). Engine only. */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { mergeRuns } from "../lib/examinationCache";

const runV = v.object({ k: v.string(), calls: v.string(), usedRandom: v.boolean(), steps: v.optional(v.number()), readBits: v.optional(v.number()) });

/** A program's remembered inspection and runs, or null. */
export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("examinationRuns").withIndex("by_key", q => q.eq("key", key)).first();
    return row ? { inspection: row.inspection, runs: row.runs, usedAt: row.usedAt } : null;
  },
});

/** Keep what an examination used and learned (`used` first: lib/examinationCache.ts mergeRuns). */
export const put = internalMutation({
  args: { key: v.string(), inspection: v.any(), used: v.array(runV) },
  handler: async (ctx, { key, inspection, used }) => {
    const row = await ctx.db.query("examinationRuns").withIndex("by_key", q => q.eq("key", key)).first();
    const runs = mergeRuns(used, row?.runs ?? []);
    if (row) await ctx.db.patch(row._id, { inspection, runs, usedAt: Date.now() });
    else await ctx.db.insert("examinationRuns", { key, inspection, runs, usedAt: Date.now() });
  },
});

/** The program was examined from memory alone: it is in use (called at most once a day per program: TOUCH_AFTER_MS). */
export const touch = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("examinationRuns").withIndex("by_key", q => q.eq("key", key)).first();
    if (row) await ctx.db.patch(row._id, { usedAt: Date.now() });
  },
});

/** Drop programs nobody examined for 30 days (cron). */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db.query("examinationRuns").withIndex("by_usedAt", q => q.lt("usedAt", Date.now() - 30 * 24 * 3600_000)).take(200);
    for (const row of old) await ctx.db.delete(row._id);
    return old.length;
  },
});
