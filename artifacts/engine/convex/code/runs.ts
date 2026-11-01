/**
 * Code runs: a human's analytics scripts and their results, per room (docs/assistant/code-execution.md §4).
 *
 *   list, get              read (the human's own runs; the code-output panel subscribes to get)
 *   start, finish          internal: the run action (code/execute.ts) records a run around the sandbox
 *
 * Every read has an internal twin `<fn>As` taking `principal: {credentialId}` for the agent registry. Another human's
 * runs are never visible (NOT_FOUND). The budget is per human per game: CODE_LIMITS.runsPerGame runs started and
 * CODE_LIMITS.cpuMsPerGame of CPU, checked when a run starts.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Viewer } from "../auth/access";
import { fail } from "../lib/errors";
import { principalV, requireMemberAs, requireRoom, viewerOf } from "../lib/rooms";
import { CODE_LIMITS } from "./limits";

type Ctx = QueryCtx | MutationCtx;
const language = v.union(v.literal("python"), v.literal("typescript"));

async function memberRoom(ctx: Ctx, viewer: Viewer, roomRef: string) {
  const room = await requireRoom(ctx, roomRef);
  await requireMemberAs(ctx, viewer, room, "read");
  return room;
}
/** The budget epoch of a room now: its current game, or "lobby". */
const epochOf = (room: Doc<"rooms">) => room.currentGameId ?? "lobby";

/** Runs of an epoch, with the budget they used (a run still "running" past staleMs counts as used, not as running). */
async function budgetOf(ctx: Ctx, subject: string, epoch: string) {
  const rows = await ctx.db.query("codeRuns").withIndex("by_subject_epoch", q => q.eq("subject", subject).eq("epoch", epoch)).take(CODE_LIMITS.runsPerGame + 1);
  const cpuMs = rows.reduce((n, r) => n + (r.cpuMs ?? 0), 0);
  const now = Date.now();
  return {
    runs: rows.length, cpuMs,
    running: rows.filter(r => r.status === "running" && now - r.startedAt < CODE_LIMITS.staleMs).length,
    left: { runs: Math.max(0, CODE_LIMITS.runsPerGame - rows.length), cpuSeconds: Math.max(0, (CODE_LIMITS.cpuMsPerGame - cpuMs) / 1000) },
  };
}

const summary = (r: Doc<"codeRuns">) => ({
  runId: r._id, title: r.title ?? null, language: r.language, status: r.status === "running" && Date.now() - r.startedAt >= CODE_LIMITS.staleMs ? "error" as const : r.status,
  datasets: JSON.parse(r.datasetsJson) as unknown[], error: r.error ?? null, cpuMs: r.cpuMs ?? null, wallMs: r.wallMs ?? null,
  resultChars: r.resultChars ?? null, outputChars: r.outputChars ?? null, clipped: r.clipped ?? false, outputTruncated: r.outputTruncated ?? false,
  startedAt: r.startedAt, finishedAt: r.finishedAt ?? null,
});
export type RunSummary = ReturnType<typeof summary>;

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------

const listArgs = { roomId: v.string(), limit: v.optional(v.number()) };
async function listImpl(ctx: QueryCtx, viewer: Viewer, { roomId, limit }: { roomId: string; limit?: number }) {
  const room = await memberRoom(ctx, viewer, roomId);
  const n = Math.max(1, Math.min(50, Math.floor(limit ?? 10)));
  const rows = await ctx.db.query("codeRuns").withIndex("by_subject_room", q => q.eq("subject", viewer.subject).eq("roomId", room._id)).order("desc").take(n);
  const budget = await budgetOf(ctx, viewer.subject, epochOf(room));
  return { runs: rows.map(summary), budget: { used: { runs: budget.runs, cpuSeconds: budget.cpuMs / 1000 }, left: budget.left,
    limits: { runs: CODE_LIMITS.runsPerGame, cpuSeconds: CODE_LIMITS.cpuMsPerGame / 1000 } } };
}

const getArgs = { roomId: v.string(), runId: v.optional(v.string()) };
async function getImpl(ctx: QueryCtx, viewer: Viewer, { roomId, runId }: { roomId: string; runId?: string }) {
  const room = await memberRoom(ctx, viewer, roomId);
  let row: Doc<"codeRuns"> | null;
  if (runId) {
    const id = ctx.db.normalizeId("codeRuns", runId);
    row = id ? await ctx.db.get(id) : null;
    if (!row || row.subject !== viewer.subject || row.roomId !== room._id) return fail("NOT_FOUND", "No such code run of yours in this room");
  } else {
    row = await ctx.db.query("codeRuns").withIndex("by_subject_room", q => q.eq("subject", viewer.subject).eq("roomId", room._id)).order("desc").first();
    if (!row) return null;
  }
  return {
    ...summary(row), source: row.source, params: row.paramsJson ? JSON.parse(row.paramsJson) as unknown : null,
    resultJson: row.resultJson ?? null, output: row.output ?? null,
    /** The whole {result, output} JSON when the row holds only a prefix (fetch it; the URL is the human's own). */
    fullUrl: row.fullId ? await ctx.storage.getUrl(row.fullId) : null,
  };
}
export type RunDetail = NonNullable<Awaited<ReturnType<typeof getImpl>>>;

/** The caller's recent code runs in this room (newest first) and this game's budget. */
export const list = query({ args: listArgs, handler: async (ctx, a) => listImpl(ctx, await viewerOf(ctx), a) });
export const listAs = internalQuery({ args: { principal: principalV, ...listArgs }, handler: async (ctx, { principal, ...a }) => listImpl(ctx, await viewerOf(ctx, principal), a) });
/** One of the caller's runs (default: the latest in this room), with its source, result and output; null when none. */
export const get = query({ args: getArgs, handler: async (ctx, a) => getImpl(ctx, await viewerOf(ctx), a) });
export const getAs = internalQuery({ args: { principal: principalV, ...getArgs }, handler: async (ctx, { principal, ...a }) => getImpl(ctx, await viewerOf(ctx, principal), a) });

/** The stored-result id of a run (the registry reads the whole result from file storage). */
export const fullOf = internalQuery({
  args: { principal: principalV, roomId: v.string(), runId: v.string() },
  handler: async (ctx, { principal, roomId, runId }): Promise<Id<"_storage"> | null> => {
    const detail = await getImpl(ctx, await viewerOf(ctx, principal), { roomId, runId });
    const id = ctx.db.normalizeId("codeRuns", detail!.runId);
    return id ? (await ctx.db.get(id))?.fullId ?? null : null;
  },
});

// ------------------------------------------------------------------------------------------------
// the run's record (internal: code/execute.ts)
// ------------------------------------------------------------------------------------------------

/**
 * Admit and record a run as the principal: a member of the room, within this game's budget, with no other run of
 * theirs in flight. Returns the run id and its CPU budget (the smaller of the request and what is left).
 */
export const start = internalMutation({
  args: { principal: principalV, roomId: v.string(), language, source: v.string(), title: v.optional(v.string()),
    datasetsJson: v.string(), paramsJson: v.optional(v.string()), cpuMs: v.number() },
  handler: async (ctx, { principal, roomId, cpuMs, ...run }): Promise<{ runId: Id<"codeRuns">; cpuMs: number; epoch: string; gameId: string | null }> => {
    const viewer = await viewerOf(ctx, principal);
    const room = await memberRoom(ctx, viewer, roomId);
    const epoch = epochOf(room);
    const budget = await budgetOf(ctx, viewer.subject, epoch);
    if (budget.running) fail("RATE_LIMITED", "Another code run of yours is still running; wait for it to finish");
    if (budget.runs >= CODE_LIMITS.runsPerGame) fail("RATE_LIMITED", `You have used this game's ${CODE_LIMITS.runsPerGame} code runs`);
    const left = CODE_LIMITS.cpuMsPerGame - budget.cpuMs;
    if (left < 100) fail("RATE_LIMITED", `You have used this game's ${CODE_LIMITS.cpuMsPerGame / 1000} s of code CPU`);
    const runId = await ctx.db.insert("codeRuns", { subject: viewer.subject, roomId: room._id, epoch, ...run, status: "running", startedAt: Date.now() });
    // Keep the newest runs of this human; delete the rest with their stored results.
    const old = await ctx.db.query("codeRuns").withIndex("by_subject_room", q => q.eq("subject", viewer.subject)).order("desc").collect();
    for (const row of old.slice(CODE_LIMITS.keptRuns)) {
      if (row.epoch === epoch) continue;   // this game's rows count against its budget
      if (row.fullId) await ctx.storage.delete(row.fullId);
      await ctx.db.delete(row._id);
    }
    return { runId, cpuMs: Math.max(1, Math.min(cpuMs, CODE_LIMITS.cpuMsMax, left)), epoch, gameId: room.currentGameId ?? null };
  },
});

export const finish = internalMutation({
  args: {
    runId: v.id("codeRuns"), status: v.union(v.literal("ok"), v.literal("error")),
    resultJson: v.optional(v.string()), output: v.optional(v.string()), resultChars: v.optional(v.number()), outputChars: v.optional(v.number()),
    clipped: v.optional(v.boolean()), outputTruncated: v.optional(v.boolean()), fullId: v.optional(v.id("_storage")),
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
    cpuMs: v.optional(v.number()), wallMs: v.optional(v.number()), inputBytes: v.optional(v.number()),
  },
  handler: async (ctx, { runId, ...outcome }) => {
    const row = await ctx.db.get(runId);
    if (!row) return;
    await ctx.db.patch(runId, { ...outcome, finishedAt: Date.now() });
  },
});
