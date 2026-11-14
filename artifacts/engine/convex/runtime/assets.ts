import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Runtime assets in file storage. Upload flow (scripts/upload-runtime.mjs, with deploy-key / admin access):
 *   1. runtime/assets:generateUploadUrl            -> a one-time upload URL
 *   2. POST the bytes to it                         -> storageId
 *   3. runtime/assets:register {name, sha256, storedSha256, storageId}
 *      re-reads the stored bytes, checks their SHA-256 server-side, records the row and deletes the
 *      asset it replaces. Readers (runtime/node.ts) look rows up by name and verify `sha256` again.
 */

export const generateUploadUrl = internalMutation({
  args: {},
  handler: async ctx => await ctx.storage.generateUploadUrl(),
});

export const lookup = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => await ctx.db.query("runtimeAssets").withIndex("by_name", q => q.eq("name", name)).unique(),
});

export const record = internalMutation({
  args: { name: v.string(), sha256: v.string(), storedSha256: v.string(), storageId: v.id("_storage"), size: v.number() },
  handler: async (ctx, row) => {
    const old = await ctx.db.query("runtimeAssets").withIndex("by_name", q => q.eq("name", row.name)).unique();
    if (old) {
      await ctx.db.delete(old._id);
      if (old.storageId !== row.storageId) await ctx.storage.delete(old.storageId);
    }
    await ctx.db.insert("runtimeAssets", { ...row, uploadedAt: Date.now() });
    return { replaced: old?.sha256 ?? null };
  },
});

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");

/** Verifies an uploaded object's bytes server-side, then records it under `name`. */
export const register = internalAction({
  args: { name: v.string(), sha256: v.string(), storedSha256: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { name, sha256, storedSha256, storageId }): Promise<{ name: string; size: number; replaced: string | null }> => {
    if (!/^[0-9a-f]{64}$/.test(sha256) || !/^[0-9a-f]{64}$/.test(storedSha256)) throw new Error("SHA-256 values must be 64 hex digits");
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("Uploaded object not found");
    const bytes = await blob.arrayBuffer();
    const actual = hex(await crypto.subtle.digest("SHA-256", bytes));
    if (actual !== storedSha256) {
      await ctx.storage.delete(storageId);
      throw new Error(`Stored bytes have SHA-256 ${actual}, expected ${storedSha256}; upload discarded`);
    }
    const { replaced } = await ctx.runMutation(internal.runtime.assets.record, { name, sha256, storedSha256, storageId, size: bytes.byteLength });
    return { name, size: bytes.byteLength, replaced };
  },
});

/**
 * Delete a runtime asset by name: its row and its stored bytes (e.g. the measurement-only probe-pyodide.bin.gz).
 * Internal (deploy key / admin): `npx convex run runtime/assets:remove '{"name": "..."}'`. Returns what was removed.
 */
export const remove = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const row = await ctx.db.query("runtimeAssets").withIndex("by_name", q => q.eq("name", name)).unique();
    if (!row) return { removed: null };
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
    return { removed: { name: row.name, size: row.size, sha256: row.sha256 } };
  },
});
