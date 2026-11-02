import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { HASKELL_PROGRAM_MAX_BYTES, HASKELL_PROGRAM_REFRESH_MS, HASKELL_PROGRAM_TTL_MS } from "../lib/haskellPrograms";

const failure = v.object({ code: v.string(), message: v.string() });

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("haskellPrograms").withIndex("by_key", q => q.eq("key", key)).first();
    return row ? { js: row.js, inspection: row.inspection, error: row.error ?? null, compiledAt: row.compiledAt } : null;
  },
});

/** Records a compilation (a program, or the agent's own compile failure). Returns false when the row is too large. */
export const put = internalMutation({
  args: { key: v.string(), js: v.string(), inspection: v.any(), error: v.optional(failure) },
  handler: async (ctx, { key, js, inspection, error }) => {
    const bytes = new TextEncoder().encode(js).length + new TextEncoder().encode(JSON.stringify([inspection, error ?? null])).length;
    if (bytes > HASKELL_PROGRAM_MAX_BYTES) return false;
    const old = await ctx.db.query("haskellPrograms").withIndex("by_key", q => q.eq("key", key)).first();
    if (old) await ctx.db.patch(old._id, { compiledAt: Date.now() });
    else await ctx.db.insert("haskellPrograms", { key, js, inspection, ...(error ? { error } : {}), compiledAt: Date.now() });
    return true;
  },
});

/** A stored row in use: keeps it from the prune. */
export const touch = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("haskellPrograms").withIndex("by_key", q => q.eq("key", key)).first();
    if (row && row.compiledAt < Date.now() - HASKELL_PROGRAM_REFRESH_MS) await ctx.db.patch(row._id, { compiledAt: Date.now() });
  },
});

/** Daily (crons.ts): deletes rows unused for HASKELL_PROGRAM_TTL_MS, 200 per run, continuing while full. */
export const prune = internalMutation({
  args: {},
  handler: async ctx => {
    const old = await ctx.db.query("haskellPrograms").withIndex("by_compiledAt", q => q.lt("compiledAt", Date.now() - HASKELL_PROGRAM_TTL_MS)).take(200);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === 200) await ctx.scheduler.runAfter(0, internal.runtime.haskellPrograms.prune, {});
    return old.length;
  },
});
