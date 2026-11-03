import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { PROGRAM_MAX_BYTES, PROGRAM_REFRESH_MS, PROGRAM_TTL_MS } from "../lib/programs";

const failure = v.object({ code: v.string(), message: v.string() });

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("compiledPrograms").withIndex("by_key", q => q.eq("key", key)).first();
    return row ? { js: row.js, inspection: row.inspection, error: row.error ?? null, compiledAt: row.compiledAt } : null;
  },
});

/** Records a compilation (a program, or the agent's own compile failure). Returns false when the row is too large. */
export const put = internalMutation({
  args: { key: v.string(), language: v.string(), js: v.string(), inspection: v.any(), error: v.optional(failure) },
  handler: async (ctx, { key, language, js, inspection, error }) => {
    const bytes = new TextEncoder().encode(js).length + new TextEncoder().encode(JSON.stringify([inspection, error ?? null])).length;
    if (bytes > PROGRAM_MAX_BYTES) return false;
    const old = await ctx.db.query("compiledPrograms").withIndex("by_key", q => q.eq("key", key)).first();
    if (old) await ctx.db.patch(old._id, { compiledAt: Date.now() });
    else await ctx.db.insert("compiledPrograms", { key, language, js, inspection, ...(error ? { error } : {}), compiledAt: Date.now() });
    return true;
  },
});

/** A stored row in use: keeps it from the prune. */
export const touch = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("compiledPrograms").withIndex("by_key", q => q.eq("key", key)).first();
    if (row && row.compiledAt < Date.now() - PROGRAM_REFRESH_MS) await ctx.db.patch(row._id, { compiledAt: Date.now() });
  },
});

/** Daily (crons.ts): deletes rows unused for PROGRAM_TTL_MS, 200 per run, continuing while full. */
export const prune = internalMutation({
  args: {},
  handler: async ctx => {
    const old = await ctx.db.query("compiledPrograms").withIndex("by_compiledAt", q => q.lt("compiledAt", Date.now() - PROGRAM_TTL_MS)).take(200);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === 200) await ctx.scheduler.runAfter(0, internal.runtime.programs.prune, {});
    return old.length;
  },
});
