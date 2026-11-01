/**
 * The per-user object store (docs/assistant/code-execution.md §5): the only persistence a script has. Values are JSON
 * text by key in one namespace per human, partitioned per game (code/keys.ts partitionOf: a game's runs see that game's
 * objects and the player-wide saved scripts, never an earlier game's); a run loads the scopes its run_code call names (loadAs), the sandbox buffers
 * its writes, and commitAs validates and applies them after the run, under the human's quota, recording every write
 * in codeObjectEvents. Every function resolves the caller's human from the principal (or ctx.auth) and touches only
 * that human's rows: no key a script names can reach another human's namespace, because the namespace is never in the
 * key. Run results are the engine's objects runs/<runId> (code/execute.ts writes them; the code-output panel reads them).
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { fail } from "../lib/errors";
import { principalV, requireMemberAs, requireRoom, viewerOf } from "../lib/rooms";
import { PLAYER_PARTITION, RUNS_PREFIX, codeEpoch, partitionOf, runResultKey, scopeProblem, scopeRange, writeProblem } from "./keys";
import { CODE_LIMITS } from "./limits";

type Ctx = QueryCtx | MutationCtx;
/** A key's row for a run of game `epoch` (in that game's partition, or the player-wide one for a saved script). */
async function rowOf(ctx: Ctx, subject: string, epoch: string, key: string) {
  return ctx.db.query("codeObjects").withIndex("by_subject_epoch_key", q => q.eq("subject", subject).eq("epoch", partitionOf(key, epoch)).eq("key", key)).unique();
}
/** A partition's usage, run results excluded (they are pruned with their runs): a counter row, never the values. */
async function usageRow(ctx: Ctx, subject: string, partition: string) {
  return ctx.db.query("codeObjectUsage").withIndex("by_subject_epoch", q => q.eq("subject", subject).eq("epoch", partition)).unique();
}
/** What counts against a game's quota: its own partition and the player-wide saved scripts. */
async function usageOf(ctx: Ctx, subject: string, epoch: string) {
  const rows = await Promise.all([usageRow(ctx, subject, PLAYER_PARTITION), usageRow(ctx, subject, epoch)]);
  return { objects: rows.reduce((n, r) => n + (r?.objects ?? 0), 0), bytes: rows.reduce((n, r) => n + (r?.bytes ?? 0), 0) };
}
/** The game epoch of a room the principal reads (its current game, or its lobby). */
async function roomEpoch(ctx: Ctx, viewer: Awaited<ReturnType<typeof viewerOf>>, roomId: string) {
  const room = await requireRoom(ctx, roomId);
  await requireMemberAs(ctx, viewer, room, "read");
  return codeEpoch(room);
}
const quota = { objects: CODE_LIMITS.objectsPerUser, bytes: CODE_LIMITS.objectBytesPerUser, valueBytes: CODE_LIMITS.valueBytes, writesPerRun: CODE_LIMITS.writesPerRun };

/** The objects in the run's scopes (this game's and the saved scripts): small ones inline, large ones as storage ids for the action to fetch. */
export const loadAs = internalQuery({
  /** `epoch`: the run's game (codeRuns.epoch), so a run loads from the partition it will write to; default the room's current game. */
  args: { principal: principalV, roomId: v.string(), epoch: v.optional(v.string()), scopes: v.array(v.string()) },
  handler: async (ctx, { principal, roomId, epoch: runEpoch, scopes }) => {
    const viewer = await viewerOf(ctx, principal);
    const current = await roomEpoch(ctx, viewer, roomId);
    const epoch = runEpoch ?? current;
    if (scopes.length > CODE_LIMITS.scopesPerRun) fail("BAD_REQUEST", `At most ${CODE_LIMITS.scopesPerRun} object scopes per run`);
    for (const s of scopes) { const problem = scopeProblem(s); if (problem) fail("BAD_REQUEST", problem); }
    const found = new Map<string, Doc<"codeObjects">>();
    for (const scope of scopes) {
      const [lo, hi] = scopeRange(scope);
      for (const partition of [PLAYER_PARTITION, epoch]) {
        const rows = await ctx.db.query("codeObjects").withIndex("by_subject_epoch_key", q => q.eq("subject", viewer.subject).eq("epoch", partition).gte("key", lo).lt("key", hi))
          .take(CODE_LIMITS.objectsPerUser + CODE_LIMITS.keptRuns + 1);
        for (const r of rows) found.set(r.key, r);
      }
    }
    const bytes = [...found.values()].reduce((n, r) => n + r.bytes, 0);
    if (bytes > CODE_LIMITS.loadBytes) fail("BAD_REQUEST", `The objects named are ${(bytes / 1048576).toFixed(1)} MiB; a run loads at most ${CODE_LIMITS.loadBytes / 1048576} MiB: name fewer keys or a narrower prefix`);
    return [...found.values()].map(r => ({ key: r.key, valueJson: r.valueJson ?? null, storageId: r.storageId ?? null }));
  },
});

/** One write of a run: the value's JSON (inline) or its uploaded blob. */
const putV = v.object({ key: v.string(), valueJson: v.optional(v.string()), storageId: v.optional(v.id("_storage")), bytes: v.number() });
/**
 * Apply a run's writes as the principal, all or nothing, in the run's game partition (saved scripts in the player-wide
 * one): every key valid and outside runs/, every value within valueBytes, at most writesPerRun keys, and the objects
 * and bytes of the game and the saved scripts after the writes within quota. A refused set
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
    // The usage after the writes, per partition, from the counters and only the rows the writes touch (deletes first, then puts).
    const epoch = run.epoch;
    const [gameRow, playerRow] = await Promise.all([usageRow(ctx, viewer.subject, epoch), usageRow(ctx, viewer.subject, PLAYER_PARTITION)]);
    const counts = new Map([[epoch, { objects: gameRow?.objects ?? 0, bytes: gameRow?.bytes ?? 0 }], [PLAYER_PARTITION, { objects: playerRow?.objects ?? 0, bytes: playerRow?.bytes ?? 0 }]]);
    const count = (k: string) => counts.get(partitionOf(k, epoch))!;
    const touched = new Map<string, Doc<"codeObjects"> | null>();
    for (const k of new Set([...deletes, ...puts.map(p => p.key)])) touched.set(k, await rowOf(ctx, viewer.subject, epoch, k));
    const present = new Map([...touched].filter(([, r]) => r).map(([k, r]) => [k, r!.bytes]));
    for (const k of deletes) { const b = present.get(k); if (b !== undefined) { count(k).objects--; count(k).bytes -= b; present.delete(k); } }
    for (const p of puts) { const c = count(p.key), b = present.get(p.key); if (b !== undefined) c.bytes -= b; else c.objects++; c.bytes += p.bytes; present.set(p.key, p.bytes); }
    const objects = [...counts.values()].reduce((n, c) => n + c.objects, 0), bytes = [...counts.values()].reduce((n, c) => n + c.bytes, 0);
    if (objects > quota.objects) return refuse(`Your object store would hold ${objects} objects; the limit is ${quota.objects}: delete some (store.delete) first`);
    if (bytes > quota.bytes) return refuse(`Your object store would hold ${(bytes / 1048576).toFixed(1)} MiB; the limit is ${quota.bytes / 1048576} MiB: delete some (store.delete) first`);
    for (const k of deletes) {
      const r = await rowOf(ctx, viewer.subject, epoch, k);
      if (r) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.delete(r._id); }
      await ctx.db.insert("codeObjectEvents", { subject: viewer.subject, roomId, runId, op: "delete", key: k, bytes: r?.bytes ?? 0, at: now });
    }
    for (const p of puts) {
      const r = await rowOf(ctx, viewer.subject, epoch, p.key);
      const fields = { valueJson: p.valueJson, storageId: p.storageId, bytes: p.bytes, roomId, runId, updatedAt: now };
      const doc = { subject: viewer.subject, epoch: partitionOf(p.key, epoch), key: p.key, ...fields };
      if (r) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.replace(r._id, doc); }
      else await ctx.db.insert("codeObjects", doc);
      await ctx.db.insert("codeObjectEvents", { subject: viewer.subject, roomId, runId, op: "put", key: p.key, bytes: p.bytes, at: now });
    }
    for (const [partition, row] of [[epoch, gameRow], [PLAYER_PARTITION, playerRow]] as const) {
      const c = counts.get(partition)!;
      if (row) await ctx.db.patch(row._id, { ...c, updatedAt: now });
      else await ctx.db.insert("codeObjectUsage", { subject: viewer.subject, epoch: partition, ...c, updatedAt: now });
    }
    if (!gameRow) await pruneOldGames(ctx, viewer.subject, epoch);
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
    const old = await rowOf(ctx, run.subject, run.epoch, key);
    if (old) { if (old.storageId) await ctx.storage.delete(old.storageId); await ctx.db.delete(old._id); }
    await ctx.db.insert("codeObjects", { subject: run.subject, epoch: run.epoch, key, valueJson, storageId, bytes, roomId: run.roomId, runId, updatedAt: Date.now() });
  },
});
/** Delete a run's result object (code/runs.ts start prunes old runs). */
export async function deleteRunResult(ctx: MutationCtx, run: Doc<"codeRuns">) {
  const r = await rowOf(ctx, run.subject, run.epoch, runResultKey(run._id));
  if (r) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.delete(r._id); }
}
/** A run's result object as its owner sees it: inline JSON, or a storage id (callers check the run is the viewer's). */
export async function runResultOf(ctx: Ctx, run: Doc<"codeRuns">) {
  const r = await rowOf(ctx, run.subject, run.epoch, runResultKey(run._id));
  return r ? { valueJson: r.valueJson ?? null, storageId: r.storageId ?? null } : null;
}

/** Is a code epoch some room's current game (or the lobby of a room with no game yet)? */
async function isCurrentEpoch(ctx: MutationCtx, epoch: string) {
  if (epoch.startsWith("lobby:")) {
    const id = ctx.db.normalizeId("rooms", epoch.slice("lobby:".length));
    const room = id ? await ctx.db.get(id) : null;
    return !!room && room.currentGameId === undefined;
  }
  const id = ctx.db.normalizeId("games", epoch);
  const game = id ? await ctx.db.get(id) : null;
  const room = game ? await ctx.db.get(game.roomId) : null;
  return !!room && room.currentGameId === game!._id;
}

/**
 * A human's first write in a game: keep the objects of their CODE_LIMITS.keptGames latest earlier games and delete
 * older games' (run results stay until their runs are pruned), so a store partitioned per game stays bounded.
 */
async function pruneOldGames(ctx: MutationCtx, subject: string, current: string) {
  const rows = await ctx.db.query("codeObjectUsage").withIndex("by_subject", q => q.eq("subject", subject)).take(200);
  const earlier = rows.filter(r => r.epoch !== undefined && r.epoch !== PLAYER_PARTITION && r.epoch !== current).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  for (const old of earlier.slice(CODE_LIMITS.keptGames)) {
    if (await isCurrentEpoch(ctx, old.epoch!)) continue;   // still the current game of another room
    const objects = await ctx.db.query("codeObjects").withIndex("by_subject_epoch_key", q => q.eq("subject", subject).eq("epoch", old.epoch)).take(CODE_LIMITS.objectsPerUser + CODE_LIMITS.keptRuns + 1);
    for (const r of objects) {
      if (r.key.startsWith(RUNS_PREFIX)) continue;
      if (r.storageId) await ctx.storage.delete(r.storageId);
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(old._id);
  }
}

// ------------------------------------------------------------------------------------------------
// reads for the human and the assistant
// ------------------------------------------------------------------------------------------------

const listArgs = { prefix: v.optional(v.string()), limit: v.optional(v.number()) };
/** Under a prefix: a game's objects and the saved scripts (`epoch`), or with no game, every partition (the human's whole store). */
async function listImpl(ctx: QueryCtx, subject: string, epoch: string | null, { prefix = "", limit }: { prefix?: string; limit?: number }) {
  if (prefix && scopeProblem(`${prefix}*`)) fail("BAD_REQUEST", `invalid prefix ${JSON.stringify(prefix).slice(0, 140)}`);
  const n = Math.max(1, Math.min(500, Math.floor(limit ?? 100)));
  const range = (partition: string) => ctx.db.query("codeObjects").withIndex("by_subject_epoch_key", q => q.eq("subject", subject).eq("epoch", partition).gte("key", prefix).lt("key", `${prefix}￿`)).take(n + 1);
  const rows = epoch === null
    ? await ctx.db.query("codeObjects").withIndex("by_subject_key", q => q.eq("subject", subject).gte("key", prefix).lt("key", `${prefix}￿`)).take(n + 1)
    : [...await range(PLAYER_PARTITION), ...await range(epoch)].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const usage = epoch === null
    ? wholeUsage(await ctx.db.query("codeObjectUsage").withIndex("by_subject", q => q.eq("subject", subject)).take(200))
    : await usageOf(ctx, subject, epoch);
  return {
    objects: rows.slice(0, n).map(r => ({ key: r.key, bytes: r.bytes, updatedAt: r.updatedAt })), more: rows.length > n,
    usage: { objects: usage.objects, bytes: usage.bytes }, limits: { objects: quota.objects, bytes: quota.bytes, valueBytes: quota.valueBytes, writesPerRun: quota.writesPerRun },
  };
}
/** All partitions' usage; a total from before the partitions counts only until the migration has recounted it. */
function wholeUsage(rows: Doc<"codeObjectUsage">[]) {
  const partitioned = rows.filter(r => r.epoch !== undefined);
  return (partitioned.length ? partitioned : rows).reduce((u, r) => ({ objects: u.objects + r.objects, bytes: u.bytes + r.bytes }), { objects: 0, bytes: 0 });
}

/**
 * The caller's stored objects (keys, sizes, times; never values) under a prefix, with their quota use: with a room, its
 * current game's and the saved scripts (what the game's runs see); without, the whole store across games.
 */
export const list = query({
  args: { ...listArgs, roomId: v.optional(v.string()) },
  handler: async (ctx, { roomId, ...a }) => {
    const viewer = await viewerOf(ctx);
    return listImpl(ctx, viewer.subject, roomId ? await roomEpoch(ctx, viewer, roomId) : null, a);
  },
});
/** The registry's list_code_objects: the room's current game only. */
export const listAs = internalQuery({
  args: { principal: principalV, roomId: v.string(), ...listArgs },
  handler: async (ctx, { principal, roomId, ...a }) => {
    const viewer = await viewerOf(ctx, principal);
    return listImpl(ctx, viewer.subject, await roomEpoch(ctx, viewer, roomId), a);
  },
});
/** The audit of the caller's writes, newest first (tests and the human). */
export const eventsAs = internalQuery({
  args: { principal: principalV, limit: v.optional(v.number()) },
  handler: async (ctx, { principal, limit }) => {
    const viewer = await viewerOf(ctx, principal);
    return ctx.db.query("codeObjectEvents").withIndex("by_subject", q => q.eq("subject", viewer.subject)).order("desc").take(Math.min(200, limit ?? 50));
  },
});
