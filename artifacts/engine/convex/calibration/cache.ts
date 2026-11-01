import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { fail } from "../lib/errors";

/**
 * The on-demand table cache (calibration/tables.ts calibrationComputed): claim a key before computing it, record the
 * result, read many keys at once. Readers are engine/calibration.ts resolveTables; the writer is calibration/compute.ts.
 */

/** A computing row older than this is a crashed action (Node actions stop at 10 minutes): the next claim restarts it. */
export const STALE_COMPUTING_MS = 11 * 60_000;
/** Attempts per key before it is reported failed; a failed key may be tried afresh after FAILED_COOLDOWN_MS. */
export const MAX_ATTEMPTS = 3;
export const FAILED_COOLDOWN_MS = 10 * 60_000;
/** Delay before retry n (n = 1, 2, …) of a failed computation that a room is waiting for: 5 s, 15 s, 45 s, … */
export const retryDelayMs = (attempt: number) => 5_000 * 3 ** (attempt - 1);
/** Ready rows unused this long are pruned (they are recomputed on demand if needed again). */
export const PRUNE_AFTER_MS = 90 * 86_400_000;

/** The rows of `keys` that exist; reading a ready row marks it used (what pruning by `lastUsedAt` relies on). */
export const getMany = internalMutation({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const now = Date.now();
    const out: { key: string; status: "computing" | "ready" | "failed"; table?: string; attempts: number; startedAt: number; finishedAt?: number; error?: string; buildMs?: number }[] = [];
    for (const key of keys) {
      const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
      if (!row) continue;
      if (row.status === "ready" && now - row.lastUsedAt > 60_000) await ctx.db.patch(row._id, { lastUsedAt: now });
      out.push({ key, status: row.status, table: row.table, attempts: row.attempts, startedAt: row.startedAt, finishedAt: row.finishedAt, error: row.error, buildMs: row.buildMs });
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
    // A key that failed long enough ago gets a fresh round of attempts (a deploy may have fixed it, or the cloud was busy).
    if (row.status === "failed" && now - (row.finishedAt ?? row.startedAt) >= FAILED_COOLDOWN_MS) {
      await ctx.db.patch(row._id, { status: "computing", startedAt: now, attempts: 1, error: undefined, lastUsedAt: now });
      return "compute";
    }
    // Failed, or computing for too long (an action that died without reporting): retry while attempts remain.
    if (row.attempts >= MAX_ATTEMPTS) {
      if (row.status !== "failed") await ctx.db.patch(row._id, { status: "failed", error: row.error ?? `no result after ${row.attempts} attempts (the action did not finish)`, finishedAt: now });
      return "failed";
    }
    await ctx.db.patch(row._id, { status: "computing", startedAt: now, attempts: row.attempts + 1, error: undefined, lastUsedAt: now });
    return "compute";
  },
});

/**
 * The compute action's result: the table (ready) or the error. A row forgotten meanwhile is simply not updated.
 * The coordinator (architecture.md §3.2): a ready key advances every room waiting for it (calibrationWaits), and a
 * room whose last key landed has the start's second half scheduled at once (owner.ts completeStart). A failure that
 * rooms wait for is retried with backoff (retryDelayMs) up to MAX_ATTEMPTS; then the key is failed and every waiting
 * room's preparation reports it.
 */
export const finished = internalMutation({
  args: { key: v.string(), table: v.optional(v.string()), error: v.optional(v.string()), buildMs: v.number() },
  handler: async (ctx, { key, table, error, buildMs }): Promise<boolean> => {
    const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!row) return false;
    const now = Date.now();
    const waits = await ctx.db.query("calibrationWaits").withIndex("by_key", q => q.eq("key", key)).collect();
    if (table !== undefined) {
      await ctx.db.patch(row._id, { status: "ready", table, finishedAt: now, buildMs, error: undefined, lastUsedAt: now });
      for (const w of waits) {
        await ctx.db.delete(w._id);
        await keyLanded(ctx, w.roomId, w.requestId, key);
      }
      return true;
    }
    const message = (error ?? "unknown error").slice(0, 2000);
    if (waits.length && row.attempts < MAX_ATTEMPTS) {
      // Someone is waiting: try again after a pause (a busy or restarted backend is the usual cause).
      const delay = retryDelayMs(row.attempts);
      await ctx.db.patch(row._id, { status: "computing", startedAt: now + delay, attempts: row.attempts + 1, error: message, buildMs });
      await ctx.scheduler.runAfter(delay, internal.calibration.compute.run, { key, instance: row.instance, familyId: row.family, params: JSON.parse(row.paramsKey) });
      return true;
    }
    await ctx.db.patch(row._id, { status: "failed", error: message, finishedAt: now, buildMs });
    for (const w of waits) {
      await ctx.db.delete(w._id);
      await preparationFailed(ctx, w.roomId, w.requestId, failureMessage(row, message));
    }
    return true;
  },
});

/** The owner-facing words for a key that could not be computed. */
export const failureMessage = (row: Pick<Doc<"calibrationComputed">, "family" | "paramsKey" | "instance" | "attempts">, error: string) =>
  `The rule table for ${row.family} ${row.paramsKey} on ${row.instance} could not be prepared after ${row.attempts} attempt${row.attempts === 1 ? "" : "s"} (${error}). Start again to retry, or choose another shape.`;

/** One of a preparing room's keys is ready: record the progress, and launch when it was the last. */
async function keyLanded(ctx: MutationCtx, roomId: Doc<"rooms">["_id"], requestId: string, key: string) {
  const room = await ctx.db.get(roomId);
  const p = room?.preparing;
  if (!room || !p || p.requestId !== requestId || p.error) return;
  const pending = p.pending.filter(k => k !== key);
  await ctx.db.patch(room._id, { preparing: { ...p, pending }, seq: room.seq + 1 });
  if (!pending.length) await ctx.scheduler.runAfter(0, internal.owner.completeStart, { roomId, requestId });
}

/** A preparing room's start cannot proceed: say why on the room, stop waiting for its other keys. */
export async function preparationFailed(ctx: MutationCtx, roomId: Doc<"rooms">["_id"], requestId: string, message: string) {
  const room = await ctx.db.get(roomId);
  const p = room?.preparing;
  if (!room || !p || p.requestId !== requestId || p.error) return;
  await ctx.db.patch(room._id, { preparing: { ...p, error: message }, seq: room.seq + 1 });
  await forgetWaits(ctx, room._id);
}

/** Drop every wait row of a room (its preparation ended, failed or was cancelled). */
export async function forgetWaits(ctx: MutationCtx, roomId: Doc<"rooms">["_id"]) {
  for (const w of await ctx.db.query("calibrationWaits").withIndex("by_room", q => q.eq("roomId", roomId)).collect()) await ctx.db.delete(w._id);
}

/** Nightly: drop ready rows nobody used for PRUNE_AFTER_MS, and failed rows as old (bounded per run). */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    let dropped = 0;
    for (const status of ["ready", "failed"] as const) {
      for (const row of await ctx.db.query("calibrationComputed").withIndex("by_status_used", q => q.eq("status", status).lt("lastUsedAt", cutoff)).take(250)) {
        await ctx.db.delete(row._id); dropped++;
      }
    }
    return dropped;
  },
});

/** Test support (fixtures only): forget computed rows (all, or of one instance), so a first use can be measured again. */
export const forget = internalMutation({
  args: { instance: v.optional(v.string()) },
  handler: async (ctx, { instance }) => {
    if (process.env.DEV !== "1" && process.env.TEST_FIXTURES !== "1") fail("FORBIDDEN", "Testing functions need DEV=1 or TEST_FIXTURES=1");
    const rows = instance
      ? await ctx.db.query("calibrationComputed").withIndex("by_instance", q => q.eq("instance", instance)).collect()
      : await ctx.db.query("calibrationComputed").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});
