/**
 * The per-user object store (docs/assistant/code-execution.md §5): the only persistence a script has. Values are JSON
 * text by key in one namespace per human; a run loads the scopes its run_code call names (loadAs), the sandbox buffers
 * its writes, and commitAs validates and applies them after the run, under the human's quota, recording every write
 * in codeObjectEvents. Every function resolves the caller's human from the principal (or ctx.auth) and touches only
 * that human's rows: no key a script names can reach another human's namespace, because the namespace is never in the
 * key. Run results are the engine's objects runs/<runId> (code/execute.ts writes them; the code-output panel reads them).
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { fail } from "../lib/errors";
import { principalV, viewerOf } from "../lib/rooms";
import { runResultKey, scopeProblem, scopeRange, writeProblem } from "./keys";
import { CODE_LIMITS } from "./limits";

type Ctx = QueryCtx | MutationCtx;
async function rowOf(ctx: Ctx, subject: string, key: string) {
  return ctx.db.query("codeObjects").withIndex("by_subject_key", q => q.eq("subject", subject).eq("key", key)).unique();
}
/** The human's usage, run results excluded (they are pruned with their runs): a counter row, never the values. */
async function usageRow(ctx: Ctx, subject: string) {
  return ctx.db.query("codeObjectUsage").withIndex("by_subject", q => q.eq("subject", subject)).unique();
}
async function usageOf(ctx: Ctx, subject: string) {
  const row = await usageRow(ctx, subject);
  return { objects: row?.objects ?? 0, bytes: row?.bytes ?? 0 };
}
const quota = { objects: CODE_LIMITS.objectsPerUser, bytes: CODE_LIMITS.objectBytesPerUser, valueBytes: CODE_LIMITS.valueBytes, writesPerRun: CODE_LIMITS.writesPerRun };

/** The objects in the run's scopes: small ones inline, large ones as storage ids for the action to fetch. */
export const loadAs = internalQuery({
  args: { principal: principalV, scopes: v.array(v.string()) },
  handler: async (ctx, { principal, scopes }) => {
    const viewer = await viewerOf(ctx, principal);
    if (scopes.length > CODE_LIMITS.scopesPerRun) fail("BAD_REQUEST", `At most ${CODE_LIMITS.scopesPerRun} object scopes per run`);
    for (const s of scopes) { const problem = scopeProblem(s); if (problem) fail("BAD_REQUEST", problem); }
    const found = new Map<string, Doc<"codeObjects">>();
    for (const scope of scopes) {
      const [lo, hi] = scopeRange(scope);
      const rows = await ctx.db.query("codeObjects").withIndex("by_subject_key", q => q.eq("subject", viewer.subject).gte("key", lo).lt("key", hi))
        .take(CODE_LIMITS.objectsPerUser + CODE_LIMITS.keptRuns + 1);
      for (const r of rows) found.set(r.key, r);
    }
    const bytes = [...found.values()].reduce((n, r) => n + r.bytes, 0);
    if (bytes > CODE_LIMITS.loadBytes) fail("BAD_REQUEST", `The objects named are ${(bytes / 1048576).toFixed(1)} MiB; a run loads at most ${CODE_LIMITS.loadBytes / 1048576} MiB: name fewer keys or a narrower prefix`);
    return [...found.values()].map(r => ({ key: r.key, valueJson: r.valueJson ?? null, storageId: r.storageId ?? null }));
  },
});

/** One write of a run: the value's JSON (inline) or its uploaded blob. */
const putV = v.object({ key: v.string(), valueJson: v.optional(v.string()), storageId: v.optional(v.id("_storage")), bytes: v.number() });
/**
 * Apply a run's writes as the principal, all or nothing: every key valid and outside runs/, every value within
 * valueBytes, at most writesPerRun keys, and the human's objects and bytes after the writes within quota. A refused set
 * deletes its uploaded blobs and is recorded as one "refused" event; an applied one records each put and delete.
 */
export const commitAs = internalMutation({
  args: { principal: principalV, roomId: v.id("rooms"), runId: v.id("codeRuns"), puts: v.array(putV), deletes: v.array(v.string()) },
  handler: async (ctx, { principal, roomId, runId, puts, deletes }): Promise<{ ok: true; written: string[]; deleted: string[] } | { ok: false; reason: string }> => {
    const viewer = await viewerOf(ctx, principal);
    const run = await ctx.db.get(runId);
    if (!run || run.subject !== viewer.subject) return fail("NOT_FOUND", "No such run of yours");
    const now = Date.now();
    const refuse = async (reason: string) => {
      for (const p of puts) if (p.storageId) await ctx.storage.delete(p.storageId);
      await ctx.db.insert("codeObjectEvents", { subject: viewer.subject, roomId, runId, op: "refused", key: puts[0]?.key ?? deletes[0] ?? "", bytes: puts.reduce((n, p) => n + p.bytes, 0), reason, at: now });
      return { ok: false as const, reason };
    };
    if (puts.length + deletes.length > quota.writesPerRun) return refuse(`A run writes at most ${quota.writesPerRun} keys (this one wrote ${puts.length + deletes.length})`);
    for (const k of [...puts.map(p => p.key), ...deletes]) { const problem = writeProblem(k); if (problem) return refuse(problem); }
    for (const p of puts) {
      if (p.bytes > quota.valueBytes) return refuse(`${JSON.stringify(p.key)} is ${(p.bytes / 1048576).toFixed(2)} MiB; one value is at most ${quota.valueBytes / 1048576} MiB`);
      if (!!p.valueJson === !!p.storageId) return refuse(`${JSON.stringify(p.key)}: a value is inline or a blob`);
    }
    // The usage after the writes, from the counter and only the rows the writes touch (deletes first, then puts).
    const usage = await usageOf(ctx, viewer.subject);
    const touched = new Map<string, Doc<"codeObjects"> | null>();
    for (const k of new Set([...deletes, ...puts.map(p => p.key)])) touched.set(k, await rowOf(ctx, viewer.subject, k));
    const present = new Map([...touched].filter(([, r]) => r).map(([k, r]) => [k, r!.bytes]));
    let objects = usage.objects, bytes = usage.bytes;
    for (const k of deletes) { const b = present.get(k); if (b !== undefined) { objects--; bytes -= b; present.delete(k); } }
    for (const p of puts) { const b = present.get(p.key); if (b !== undefined) bytes -= b; else objects++; bytes += p.bytes; present.set(p.key, p.bytes); }
    if (objects > quota.objects) return refuse(`Your object store would hold ${objects} objects; the limit is ${quota.objects}: delete some (store.delete) first`);
    if (bytes > quota.bytes) return refuse(`Your object store would hold ${(bytes / 1048576).toFixed(1)} MiB; the limit is ${quota.bytes / 1048576} MiB: delete some (store.delete) first`);
    for (const k of deletes) {
      const r = await rowOf(ctx, viewer.subject, k);
      if (r) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.delete(r._id); }
      await ctx.db.insert("codeObjectEvents", { subject: viewer.subject, roomId, runId, op: "delete", key: k, bytes: r?.bytes ?? 0, at: now });
    }
    for (const p of puts) {
      const r = await rowOf(ctx, viewer.subject, p.key);
      const fields = { valueJson: p.valueJson, storageId: p.storageId, bytes: p.bytes, roomId, runId, updatedAt: now };
      if (r) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.replace(r._id, { subject: viewer.subject, key: p.key, ...fields }); }
      else await ctx.db.insert("codeObjects", { subject: viewer.subject, key: p.key, ...fields });
      await ctx.db.insert("codeObjectEvents", { subject: viewer.subject, roomId, runId, op: "put", key: p.key, bytes: p.bytes, at: now });
    }
    const counter = await usageRow(ctx, viewer.subject);
    if (counter) await ctx.db.patch(counter._id, { objects, bytes });
    else await ctx.db.insert("codeObjectUsage", { subject: viewer.subject, objects, bytes });
    return { ok: true as const, written: puts.map(p => p.key), deleted: deletes };
  },
});

/** The engine's write of a run's whole result as the object runs/<runId> (outside the human's quota; pruned with the run). */
export const putRunResult = internalMutation({
  args: { runId: v.id("codeRuns"), valueJson: v.optional(v.string()), storageId: v.optional(v.id("_storage")), bytes: v.number() },
  handler: async (ctx, { runId, valueJson, storageId, bytes }) => {
    const run = await ctx.db.get(runId);
    if (!run) { if (storageId) await ctx.storage.delete(storageId); return; }
    const key = runResultKey(runId);
    const old = await rowOf(ctx, run.subject, key);
    if (old) { if (old.storageId) await ctx.storage.delete(old.storageId); await ctx.db.delete(old._id); }
    await ctx.db.insert("codeObjects", { subject: run.subject, key, valueJson, storageId, bytes, roomId: run.roomId, runId, updatedAt: Date.now() });
  },
});
/** Delete a run's result object (code/runs.ts start prunes old runs). */
export async function deleteRunResult(ctx: MutationCtx, subject: string, runId: Id<"codeRuns">) {
  const r = await rowOf(ctx, subject, runResultKey(runId));
  if (r) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.delete(r._id); }
}
/** A run's result object as its owner sees it: inline JSON, or a storage id (callers check the run is the viewer's). */
export async function runResultOf(ctx: Ctx, subject: string, runId: string) {
  const r = await rowOf(ctx, subject, runResultKey(runId));
  return r ? { valueJson: r.valueJson ?? null, storageId: r.storageId ?? null } : null;
}

// ------------------------------------------------------------------------------------------------
// reads for the human and the assistant
// ------------------------------------------------------------------------------------------------

const listArgs = { prefix: v.optional(v.string()), limit: v.optional(v.number()) };
async function listImpl(ctx: QueryCtx, subject: string, { prefix = "", limit }: { prefix?: string; limit?: number }) {
  if (prefix && scopeProblem(`${prefix}*`)) fail("BAD_REQUEST", `invalid prefix ${JSON.stringify(prefix).slice(0, 140)}`);
  const n = Math.max(1, Math.min(500, Math.floor(limit ?? 100)));
  const rows = await ctx.db.query("codeObjects").withIndex("by_subject_key", q => q.eq("subject", subject).gte("key", prefix).lt("key", `${prefix}￿`)).take(n + 1);
  const usage = await usageOf(ctx, subject);
  return {
    objects: rows.slice(0, n).map(r => ({ key: r.key, bytes: r.bytes, updatedAt: r.updatedAt })), more: rows.length > n,
    usage: { objects: usage.objects, bytes: usage.bytes }, limits: { objects: quota.objects, bytes: quota.bytes, valueBytes: quota.valueBytes, writesPerRun: quota.writesPerRun },
  };
}
/** The caller's stored objects (keys, sizes, times; never values) under a prefix, with their quota use. */
export const list = query({ args: listArgs, handler: async (ctx, a) => listImpl(ctx, (await viewerOf(ctx)).subject, a) });
export const listAs = internalQuery({ args: { principal: principalV, ...listArgs }, handler: async (ctx, { principal, ...a }) => listImpl(ctx, (await viewerOf(ctx, principal)).subject, a) });
/** The audit of the caller's writes, newest first (tests and the human). */
export const eventsAs = internalQuery({
  args: { principal: principalV, limit: v.optional(v.number()) },
  handler: async (ctx, { principal, limit }) => {
    const viewer = await viewerOf(ctx, principal);
    return ctx.db.query("codeObjectEvents").withIndex("by_subject", q => q.eq("subject", viewer.subject)).order("desc").take(Math.min(200, limit ?? 50));
  },
});
