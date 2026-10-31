import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/**
 * The calibration files' rows (calibration/tables.ts). Upload flow (scripts/upload-calibration.mjs, with deploy-key /
 * admin access), per instance file whose bytes the deployment does not have yet:
 *   1. calibration/files:generateUploadUrl     -> a one-time upload URL
 *   2. POST the bytes to it                     -> storageId
 *   3. calibration/node:register {instance, rank, sha256, storageId}
 *      re-reads the stored bytes, checks their SHA-256 and the file itself server-side, derives the manifest entry,
 *      records the row and deletes the file it replaces.
 * Rows whose instance no longer has a file in git are removed (calibration/files:remove), so storage mirrors git.
 */

export const generateUploadUrls = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error("count must be an integer in 0..1000");
    const urls: string[] = [];
    for (let i = 0; i < count; i++) urls.push(await ctx.storage.generateUploadUrl());
    return urls;
  },
});

/** What is stored, without the entries (the upload script's diff). */
export const list = internalQuery({
  args: {},
  handler: async ctx => (await ctx.db.query("calibrationFiles").collect())
    .map(r => ({ instance: r.instance, rank: r.rank, sha256: r.sha256, size: r.size, tableCount: r.tableCount })),
});

/** Every row with its entry, in rank order: what the engine's loader caches (convex/engine/calibration.ts). */
export const index = internalQuery({
  args: {},
  handler: async ctx => (await ctx.db.query("calibrationFiles").collect())
    .sort((a, b) => a.rank - b.rank || (a.instance < b.instance ? -1 : a.instance > b.instance ? 1 : 0))
    .map(r => ({ instance: r.instance, sha256: r.sha256, storageId: r.storageId, entry: r.entry })),
});

export const record = internalMutation({
  args: {
    instance: v.string(), rank: v.number(), sha256: v.string(), storageId: v.id("_storage"), size: v.number(), tableCount: v.number(),
    entry: v.string(),
  },
  handler: async (ctx, row) => {
    const old = await ctx.db.query("calibrationFiles").withIndex("by_instance", q => q.eq("instance", row.instance)).unique();
    if (old) {
      await ctx.db.delete(old._id);
      if (old.storageId !== row.storageId) await ctx.storage.delete(old.storageId);
    }
    await ctx.db.insert("calibrationFiles", { ...row, uploadedAt: Date.now() });
    return { replaced: old?.sha256 ?? null };
  },
});

/**
 * Keep exactly the instances in `keep` (each with its rank): every other row and its stored file go, and kept rows
 * take their new rank. Returns the removed instance keys.
 */
export const prune = internalMutation({
  args: { keep: v.array(v.object({ instance: v.string(), rank: v.number() })) },
  handler: async (ctx, { keep }) => {
    const ranks = new Map(keep.map(k => [k.instance, k.rank]));
    const removed: string[] = [];
    for (const row of await ctx.db.query("calibrationFiles").collect()) {
      const rank = ranks.get(row.instance);
      if (rank === undefined) {
        await ctx.db.delete(row._id);
        await ctx.storage.delete(row.storageId);
        removed.push(row.instance);
      } else if (rank !== row.rank) await ctx.db.patch(row._id, { rank });
    }
    return removed;
  },
});

/** An uploaded object that was never registered (a failed check). */
export const discard = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => { await ctx.storage.delete(storageId); },
});
