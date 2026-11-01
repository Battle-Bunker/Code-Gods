import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
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

/** At most this many of an owner's rooms may be preparing tables that the owner's starts are computing. */
export const MAX_PREPARATIONS = 2;
/** The per-owner bucket of computation pieces (a split table is several): its size, and its refill per minute. */
export const PIECE_BUCKET = 200;
export const PIECES_PER_MINUTE = 60;
/** A room admitted this recently counts as preparing even before its start records the preparation. */
export const ADMISSION_GRACE_MS = 2 * 60_000;

type Verdict = "compute" | "wait" | "ready" | "failed";
const rowArgs = { key: v.string(), instance: v.string(), family: v.string(), paramsKey: v.string(), prior: v.string() };
type RowArgs = { key: string; instance: string; family: string; paramsKey: string; prior: string };
/** What a won claim must start: the whole table in one action, some pieces of a split one, or the merge of its pieces. */
type Work = { kind: "run" } | { kind: "pieces"; indices: number[] } | { kind: "merge" };

const piecesOfKey = (ctx: MutationCtx, key: string) => ctx.db.query("calibrationPieces").withIndex("by_key", q => q.eq("key", key)).collect();

/**
 * The claim of one key (architecture.md §3.1): inserts a computing row (or restarts a failed one with attempts left, or
 * a computing one older than STALE_COMPUTING_MS) under a plan of `pieces` (1: one action). A restart keeps a split key's
 * ready pieces and recomputes only the others (or merges, when all are ready). Returns the verdict and the work to start.
 */
async function claimRow(ctx: MutationCtx, args: RowArgs, pieces: number, now: number): Promise<{ verdict: Verdict; work?: Work; row?: Doc<"calibrationComputed"> }> {
  const fresh = (): Work => (pieces > 1 ? { kind: "pieces", indices: Array.from({ length: pieces }, (_, i) => i) } : { kind: "run" });
  const plan = { pieces: pieces > 1 ? pieces : undefined, piecesDone: pieces > 1 ? 0 : undefined, pieceMs: undefined };
  const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", args.key)).unique();
  if (!row) {
    const id = await ctx.db.insert("calibrationComputed", { ...args, status: "computing", startedAt: now, attempts: 1, lastUsedAt: now, ...plan });
    return { verdict: "compute", work: fresh(), row: (await ctx.db.get(id))! };
  }
  if (row.status === "ready") { await ctx.db.patch(row._id, { lastUsedAt: now }); return { verdict: "ready" }; }
  if (row.status === "computing" && now - row.startedAt < STALE_COMPUTING_MS) return { verdict: "wait" };
  // A key that failed long enough ago gets a fresh round of attempts (a deploy may have fixed it, or the cloud was busy).
  if (row.status === "failed" && now - (row.finishedAt ?? row.startedAt) >= FAILED_COOLDOWN_MS) {
    for (const p of await piecesOfKey(ctx, args.key)) await ctx.db.delete(p._id);
    await ctx.db.patch(row._id, { status: "computing", startedAt: now, attempts: 1, error: undefined, lastUsedAt: now, ...plan });
    return { verdict: "compute", work: fresh(), row: { ...row, ...plan, status: "computing" } };
  }
  // Failed, or computing for too long (an action that died without reporting): retry while attempts remain.
  if (row.attempts >= MAX_ATTEMPTS) {
    if (row.status !== "failed") await ctx.db.patch(row._id, { status: "failed", error: row.error ?? `no result after ${row.attempts} attempts (the action did not finish)`, finishedAt: now });
    return { verdict: "failed" };
  }
  const restart = async () => {
    await ctx.db.patch(row._id, { status: "computing", startedAt: now, attempts: row.attempts + 1, error: undefined, lastUsedAt: now });
  };
  if (!row.pieces || row.pieces <= 1) { await restart(); return { verdict: "compute", work: { kind: "run" }, row }; }
  // A split key keeps its plan (its ready pieces belong to it): restart the pieces that are not ready and not in flight,
  // or the merge when every piece is ready. Pieces still in flight (a retry waiting out its backoff) are no crash: the
  // key is waited for, its attempts untouched.
  const byIndex = new Map((await piecesOfKey(ctx, args.key)).map(p => [p.index, p]));
  const indices: number[] = [];
  let ready = 0;
  for (let i = 0; i < row.pieces; i++) {
    const p = byIndex.get(i);
    if (p?.status === "ready") { ready++; continue; }
    if (p?.status === "computing" && now - p.startedAt < STALE_COMPUTING_MS) continue;
    indices.push(i);
  }
  if (indices.length) { await restart(); return { verdict: "compute", work: { kind: "pieces", indices }, row }; }
  if (ready === row.pieces) { await restart(); return { verdict: "compute", work: { kind: "merge" }, row }; }
  await ctx.db.patch(row._id, { status: "computing", startedAt: now, lastUsedAt: now });
  return { verdict: "wait" };
}

/** How many new pieces a work item starts (what the owner's bucket is charged). */
const piecesOf = (w: Work | undefined) => (!w ? 0 : w.kind === "pieces" ? w.indices.length : w.kind === "run" ? 1 : 0);

/**
 * Claims `key` for computation, as one action or under a plan of `pieces`, scheduling nothing (the caller computes). Returns "compute" (it won the
 * claim), "wait" (someone else is computing), "ready" (a table exists) or "failed" (no attempts left). Kept for callers
 * and tests that compute a key themselves; the engine claims through `claimMany`.
 */
export const claim = internalMutation({
  args: { ...rowArgs, pieces: v.optional(v.number()) },
  handler: async (ctx, { pieces, ...args }): Promise<Verdict> => (await claimRow(ctx, args, pieces ?? 1, Date.now())).verdict,
});

const itemV = v.object({
  ...rowArgs, params: v.any(),
  /** The split plan: replicate pieces (1: one action builds the table). */
  pieces: v.number(),
  /** Expected seconds of one piece: the costliest pieces are scheduled first. */
  pieceSeconds: v.number(),
});

/**
 * The game start's claims, all at once (engine/calibration.ts resolveTables): each missing key is claimed under its
 * split plan and its work is scheduled here, in the same transaction (costliest pieces first), so a claimed key is never
 * left without its actions. With `owner`, new work is rate limited per owner (`admit`): the whole claim is refused,
 * nothing changed, when the owner already has MAX_PREPARATIONS rooms preparing or the bucket lacks the pieces.
 */
export const claimMany = internalMutation({
  args: { items: v.array(itemV), owner: v.optional(v.object({ id: v.string(), roomId: v.id("rooms") })) },
  handler: async (ctx, { items, owner }) => {
    const now = Date.now(), seen = new Set<string>();
    const verdicts: { key: string; verdict: Verdict }[] = [];
    const work: { item: (typeof items)[number]; work: Work; row: Doc<"calibrationComputed"> }[] = [];
    for (const item of items) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      const { key, instance, family, paramsKey, prior } = item;
      const r = await claimRow(ctx, { key, instance, family, paramsKey, prior }, item.pieces, now);
      verdicts.push({ key, verdict: r.verdict });
      if (r.work) work.push({ item, work: r.work, row: r.row! });
    }
    const charged = work.reduce((n, w) => n + piecesOf(w.work), 0);
    if (owner && charged > 0) await admit(ctx, owner, charged, now);
    work.sort((a, b) => b.item.pieceSeconds - a.item.pieceSeconds);
    for (const { item, work: w, row } of work) {
      const { key, instance, family: familyId, params } = item;
      if (w.kind === "run") await ctx.scheduler.runAfter(0, internal.calibration.compute.run, { key, instance, familyId, params });
      else if (w.kind === "merge") await ctx.scheduler.runAfter(0, internal.calibration.compute.merge, { key });
      else for (const index of w.indices) await startPiece(ctx, row, index, now);
    }
    return verdicts;
  },
});

/** Records piece `index` of a split key as computing (its `attempts`-th attempt) and schedules it after `delay` ms. */
async function startPiece(ctx: MutationCtx, row: Doc<"calibrationComputed">, index: number, now: number, retry?: { delay: number; attempts: number; error: string }) {
  const piece = await ctx.db.query("calibrationPieces").withIndex("by_key", q => q.eq("key", row.key).eq("index", index)).unique();
  const state = { status: "computing" as const, startedAt: now + (retry?.delay ?? 0), error: retry?.error, result: undefined };
  if (piece) await ctx.db.patch(piece._id, { ...state, attempts: retry?.attempts ?? piece.attempts });
  else await ctx.db.insert("calibrationPieces", { key: row.key, index, ...state, attempts: retry?.attempts ?? 1 });
  await ctx.scheduler.runAfter(retry?.delay ?? 0, internal.calibration.compute.piece, {
    key: row.key, instance: row.instance, familyId: row.family, params: JSON.parse(row.paramsKey), index, pieces: row.pieces!,
  });
}

/**
 * The per-owner rate limit on new computation (B3): at most MAX_PREPARATIONS of the owner's other rooms may be preparing
 * tables, and the owner's bucket (PIECE_BUCKET, refilled at PIECES_PER_MINUTE) must hold the pieces. A start larger than
 * the bucket is admitted when the bucket is full (the bucket goes negative: the next start waits longer). Throws
 * RATE_LIMITED with what to do; otherwise charges the bucket and records the room.
 */
async function admit(ctx: MutationCtx, owner: { id: string; roomId: Id<"rooms"> }, pieces: number, now: number) {
  const quota = await ctx.db.query("calibrationQuotas").withIndex("by_owner", q => q.eq("ownerId", owner.id)).unique();
  const tokens = quota ? Math.min(PIECE_BUCKET, quota.tokens + ((now - quota.updatedAt) / 60_000) * PIECES_PER_MINUTE) : PIECE_BUCKET;
  // The owner's other rooms still preparing, or admitted so recently that their preparation is not recorded yet.
  const others: { roomId: Id<"rooms">; at: number }[] = [];
  for (const r of quota?.rooms ?? []) {
    if (r.roomId === owner.roomId) continue;
    const p = (await ctx.db.get(r.roomId))?.preparing;
    if ((p && !p.error && p.pending.length && p.ownerId === owner.id) || (!p && now - r.at < ADMISSION_GRACE_MS)) others.push(r);
  }
  if (others.length >= MAX_PREPARATIONS) {
    fail("RATE_LIMITED", `${others.length} of your rooms are already preparing rule tables for a new shape; this server prepares at most ${MAX_PREPARATIONS} at a time per owner. Wait for one of them to start (or end its preparation), or choose a shape whose tables are ready.`);
  }
  if (pieces > tokens && tokens < PIECE_BUCKET) {
    // Admitted once the bucket holds the pieces, or is full (a start larger than the bucket).
    const seconds = Math.ceil(((Math.min(pieces, PIECE_BUCKET) - tokens) / PIECES_PER_MINUTE) * 60);
    fail("RATE_LIMITED", `This game needs ${pieces} new rule-table computations, and this server allows each owner about ${PIECES_PER_MINUTE} a minute (${Math.max(0, Math.floor(tokens))} available now): you have started several new shapes recently. Try again in about ${seconds} s, or choose a shape whose tables are ready.`);
  }
  const next = { tokens: tokens - pieces, updatedAt: now, rooms: [...others, { roomId: owner.roomId, at: now }] };
  if (quota) await ctx.db.patch(quota._id, next);
  else await ctx.db.insert("calibrationQuotas", { ownerId: owner.id, ...next });
}

/** The ready pieces of a split key (the merge's input). */
export const readyPieces = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
    const pieces = await ctx.db.query("calibrationPieces").withIndex("by_key", q => q.eq("key", key)).collect();
    return {
      row: row && { instance: row.instance, family: row.family, paramsKey: row.paramsKey, pieces: row.pieces ?? 1, status: row.status },
      results: pieces.filter(p => p.status === "ready" && p.result).map(p => p.result!),
    };
  },
});

/**
 * One piece of a split key finished (compute.ts piece): record its result, advance the progress of every room waiting
 * for the key, and schedule the merge when it was the last. A failed piece is retried on its own with backoff
 * (retryDelayMs) up to MAX_ATTEMPTS, the other pieces untouched; then the key fails and every waiting room says so.
 */
export const pieceFinished = internalMutation({
  args: { key: v.string(), index: v.number(), pieces: v.number(), result: v.optional(v.string()), error: v.optional(v.string()), buildMs: v.number() },
  handler: async (ctx, { key, index, pieces, result, error, buildMs }): Promise<boolean> => {
    const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
    // A piece of another plan (an action still running from before a fresh round re-planned the key) is not this one's.
    if (!row || row.status !== "computing" || !row.pieces || row.pieces <= 1 || pieces !== row.pieces || index >= row.pieces) return false;
    const now = Date.now();
    const piece = await ctx.db.query("calibrationPieces").withIndex("by_key", q => q.eq("key", key).eq("index", index)).unique();
    if (piece?.status === "ready") return true;   // reported twice
    if (result !== undefined) {
      if (piece) await ctx.db.patch(piece._id, { status: "ready", result, finishedAt: now, buildMs, error: undefined });
      else await ctx.db.insert("calibrationPieces", { key, index, status: "ready", result, attempts: 1, startedAt: now, finishedAt: now, buildMs });
      const ready = (await piecesOfKey(ctx, key)).filter(p => p.status === "ready").length;
      await ctx.db.patch(row._id, { piecesDone: ready });
      for (const w of await ctx.db.query("calibrationWaits").withIndex("by_key", q => q.eq("key", key)).collect()) await piecesLanded(ctx, w.roomId, w.requestId, 1);
      if (ready >= row.pieces) await ctx.scheduler.runAfter(0, internal.calibration.compute.merge, { key });
      return true;
    }
    const message = (error ?? "unknown error").slice(0, 2000);
    const attempts = piece?.attempts ?? 1;
    if (attempts < MAX_ATTEMPTS) {
      await startPiece(ctx, row, index, now, { delay: retryDelayMs(attempts), attempts: attempts + 1, error: message });
      return true;
    }
    if (piece) await ctx.db.patch(piece._id, { status: "failed", error: message, finishedAt: now, buildMs });
    await failKey(ctx, row, `piece ${index + 1} of ${row.pieces}: ${message}`, now);
    return true;
  },
});

/** A key that cannot be computed now: failed (a fresh round after FAILED_COOLDOWN_MS), and every waiting room told. */
async function failKey(ctx: MutationCtx, row: Doc<"calibrationComputed">, message: string, now: number) {
  await ctx.db.patch(row._id, { status: "failed", error: message, finishedAt: now, attempts: Math.max(row.attempts, MAX_ATTEMPTS) });
  for (const w of await ctx.db.query("calibrationWaits").withIndex("by_key", q => q.eq("key", row.key)).collect()) {
    await ctx.db.delete(w._id);
    await preparationFailed(ctx, w.roomId, w.requestId, failureMessage({ ...row, attempts: Math.max(row.attempts, MAX_ATTEMPTS) }, message));
  }
}

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
    // A second report for a written table (a duplicated merge or run) changes nothing.
    if (!row || row.status === "ready") return false;
    const now = Date.now(), split = !!row.pieces && row.pieces > 1;
    const waits = await ctx.db.query("calibrationWaits").withIndex("by_key", q => q.eq("key", key)).collect();
    if (table !== undefined) {
      // A split table keeps each piece's build time; its piece rows are done with.
      let pieceMs: number[] | undefined;
      if (split) {
        const pieces = (await piecesOfKey(ctx, key)).sort((a, b) => a.index - b.index);
        pieceMs = pieces.map(p => Math.round(p.buildMs ?? 0));
        for (const p of pieces) await ctx.db.delete(p._id);
      }
      await ctx.db.patch(row._id, { status: "ready", table, finishedAt: now, buildMs, error: undefined, lastUsedAt: now, ...(pieceMs ? { pieceMs, piecesDone: row.pieces } : {}) });
      for (const w of waits) {
        await ctx.db.delete(w._id);
        await keyLanded(ctx, w.roomId, w.requestId, key, split ? 0 : 1);
      }
      return true;
    }
    const message = (error ?? "unknown error").slice(0, 2000);
    if (row.attempts < MAX_ATTEMPTS) {
      // Try again after a pause (a busy or restarted backend is the usual cause). Not only when a room already waits:
      // the start's wait rows are written just after it schedules the computation, so an early failure has none yet.
      // A split key's failure here is its merge's (its pieces report through pieceFinished): only the merge is redone.
      const delay = retryDelayMs(row.attempts);
      await ctx.db.patch(row._id, { status: "computing", startedAt: now + delay, attempts: row.attempts + 1, error: message, buildMs });
      if (split) await ctx.scheduler.runAfter(delay, internal.calibration.compute.merge, { key });
      else await ctx.scheduler.runAfter(delay, internal.calibration.compute.run, { key, instance: row.instance, familyId: row.family, params: JSON.parse(row.paramsKey) });
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
async function keyLanded(ctx: MutationCtx, roomId: Doc<"rooms">["_id"], requestId: string, key: string, pieces: number) {
  const room = await ctx.db.get(roomId);
  const p = room?.preparing;
  if (!room || !p || p.requestId !== requestId || p.error) return;
  const pending = p.pending.filter(k => k !== key);
  await ctx.db.patch(room._id, { preparing: { ...p, pending, ...(p.pieces ? { pieces: advance(p.pieces, pieces) } : {}) }, seq: room.seq + 1 });
  if (!pending.length) await ctx.scheduler.runAfter(0, internal.owner.completeStart, { roomId, requestId });
}

const advance = (x: { done: number; total: number }, n: number) => ({ total: x.total, done: Math.min(x.total, x.done + n) });

/** Pieces of a key a preparing room waits for are ready: the room's progress at piece granularity. */
async function piecesLanded(ctx: MutationCtx, roomId: Doc<"rooms">["_id"], requestId: string, n: number) {
  const room = await ctx.db.get(roomId);
  const p = room?.preparing;
  if (!room || !p || p.requestId !== requestId || p.error || !p.pieces) return;
  await ctx.db.patch(room._id, { preparing: { ...p, pieces: advance(p.pieces, n) }, seq: room.seq + 1 });
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
        for (const p of await piecesOfKey(ctx, row.key)) await ctx.db.delete(p._id);
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
    for (const r of rows) {
      for (const p of await piecesOfKey(ctx, r.key)) await ctx.db.delete(p._id);
      await ctx.db.delete(r._id);
    }
    return rows.length;
  },
});

/** Test support (fixtures only): set the rate limit's state for a room's owner (its bucket and the rooms it counts). */
export const setQuota = internalMutation({
  args: { roomId: v.id("rooms"), tokens: v.number(), rooms: v.array(v.id("rooms")) },
  handler: async (ctx, { roomId, tokens, rooms }) => {
    if (process.env.DEV !== "1" && process.env.TEST_FIXTURES !== "1") fail("FORBIDDEN", "Testing functions need DEV=1 or TEST_FIXTURES=1");
    const room = await ctx.db.get(roomId);
    if (!room) fail("NOT_FOUND", "No such room");
    const quota = await ctx.db.query("calibrationQuotas").withIndex("by_owner", q => q.eq("ownerId", room.ownerId)).unique();
    // The rooms count as admitted long ago: preparing, or not at all (no admission grace).
    const now = Date.now(), next = { tokens, rooms: rooms.map(roomId => ({ roomId, at: 0 })), updatedAt: now };
    if (quota) await ctx.db.patch(quota._id, next);
    else await ctx.db.insert("calibrationQuotas", { ownerId: room.ownerId, ...next });
  },
});
