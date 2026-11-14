/**
 * The in-client assistant on v2 (integration plan §1 "In-client assistant", §4.4): a model that acts for ONE human, in
 * one room, as their delegate (`via: "assistant"`, with the grant they chose), through the affordance directory's
 * tools, the same internal twins MCP and the CLI reach. Paid from the human's AI allowance for the game (v2/ai.ts).
 *
 *   operations (v2/ops/assistant.ts)  assistant.send, cancel, setMode, editQueued, removeQueued, sendQueued
 *   queries                           status ({roomId}), threads ({roomId, gameId?}), transcript ({threadId})
 *   the queue, turns and autopilot     v2/assistantCore.ts (kept apart so these page queries load light)
 *   the run                           v2/assistantRun.ts: one action per turn
 *
 * Everything is per (room, human, game): threads belong to the game current when they started, and the queue, modes
 * and allowance follow the same key. A message sent while a turn runs waits in the queue and starts the next turn; a
 * Stop or a failed turn holds the queue until the human sends again. Mode: autopilot plays on its own while the game
 * runs; on request (the default) acts only when asked; read-only offers read tools only.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { aiOffIn, quotasOf, usageIn } from "./spend";
import { memberOf, requireUser } from "./access";
import { grantV, modeV, turnStatusV } from "./assistantTables";

export type Mode = "autopilot" | "onRequest" | "readOnly";
export type Grant = "read" | "act" | "owner";

export const LIMITS = {
  /** Model steps per turn (an autopilot turn: fewer), and a turn's wall-clock life (after it, it is dead, not busy). */
  maxSteps: 12, autopilotSteps: 6, turnMs: 10 * 60_000,
  /** An autopilot turn while the game runs, every so often (never while another turn of the human's runs). */
  autopilotMs: 60_000,
  /** Before the world runs (planning) or while paused, the autopilot looks again this often. */
  waitMs: 5_000,
  /** The history a turn replays, at most. */
  historyMessages: 60,
  /** Messages waiting at once, and stored sizes. */
  queued: 5, textChars: 32 * 1024, argsChars: 8 * 1024,
} as const;

type Ctx = QueryCtx | MutationCtx;

export async function prefsOf(ctx: Ctx, roomId: Id<"v2Rooms">, userId: string) {
  return await ctx.db.query("v2AssistantPrefs").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", userId)).unique();
}

/** The human's latest turn in the room while it runs (a turn past its life is dead, so not busy), else null. */
export const queuedOf = (ctx: Ctx, roomId: Id<"v2Rooms">, userId: string) =>
  ctx.db.query("v2AssistantQueue").withIndex("by_room_user_status", q => q.eq("roomId", roomId).eq("userId", userId).eq("status", "queued")).take(LIMITS.queued * 2);

/**
 * Waits `text` in the human's queue, sent with at most `cap` rights (a delegate's). Refused when full while a turn
 * runs; an idle send drains the queue at once, so it is not limited.
 */
// ------------------------------------------------------------------------------------------------
// the pane's live reads (sign-in required; the caller's own rows only)
// ------------------------------------------------------------------------------------------------

const turnV = v.object({ turnId: v.id("v2AssistantTurns"), threadId: v.id("v2AssistantThreads"), status: turnStatusV, error: v.union(v.string(), v.null()), autopilot: v.boolean() });
const turnOut = (t: Doc<"v2AssistantTurns">) => ({ turnId: t._id, threadId: t.threadId, status: t.status, error: t.error ?? null, autopilot: t.trigger === "autopilot" });

/** The pane's header: mode, grant, allowance left in this game, the active turn and what waits. */
export const status = query({
  args: { roomId: v.id("v2Rooms") },
  returns: v.union(v.null(), v.object({
    mode: modeV, grant: grantV, gameId: v.union(v.id("v2Games"), v.null()),
    /** The room's assistant quota per player for this game (tokens), and what the caller used of it. */
    allowance: v.object({ tokens: v.number(), usedTokens: v.number(), usedUsd: v.number() }),
    /** Why the assistant cannot run in this room at all (not an administrator's room, a quota of 0), or null. */
    off: v.union(v.string(), v.null()),
    turn: v.union(turnV, v.null()),
    queued: v.array(v.object({ queueId: v.id("v2AssistantQueue"), text: v.string(), held: v.boolean() })),
  })),
  handler: async (ctx, { roomId }) => {
    const user = await requireUser(ctx), room = await ctx.db.get(roomId);
    const member = room ? await memberOf(ctx, roomId, user.userId) : null;
    if (!room || !member) return null;
    const prefs = await prefsOf(ctx, roomId, user.userId);
    const used = await usageIn(ctx, member._id, room.gameId);
    const latest = await ctx.db.query("v2AssistantTurns").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", user.userId)).order("desc").first();
    return {
      mode: prefs?.mode ?? "onRequest", grant: prefs?.grant ?? "act", gameId: room.gameId ?? null,
      allowance: { tokens: (await quotasOf(ctx, roomId)).assistant, usedTokens: used?.tokens ?? 0, usedUsd: used?.usd ?? 0 },
      off: await aiOffIn(ctx, room, "assistant"),
      turn: latest && latest.gameId === room.gameId ? turnOut(latest) : null,
      queued: (await queuedOf(ctx, roomId, user.userId)).map(q => ({ queueId: q._id, text: q.text, held: q.held ?? false })),
    };
  },
});

/** The human's conversations in the room's current game, or an earlier game's (read only). Newest first. */
export const threads = query({
  args: { roomId: v.id("v2Rooms"), gameId: v.optional(v.id("v2Games")) },
  returns: v.array(v.object({ threadId: v.id("v2AssistantThreads"), title: v.string(), updatedAt: v.number() })),
  handler: async (ctx, { roomId, gameId }) => {
    const user = await requireUser(ctx), room = await ctx.db.get(roomId);
    if (!room || !await memberOf(ctx, roomId, user.userId)) return [];
    const game = gameId ?? room.gameId;
    const rows = await ctx.db.query("v2AssistantThreads").withIndex("by_room_user_game", q => q.eq("roomId", roomId).eq("userId", user.userId).eq("gameId", game)).order("desc").take(20);
    return rows.map(t => ({ threadId: t._id, title: t.title, updatedAt: t.updatedAt }));
  },
});

/** One conversation's messages (its human only), newest first, a page at a time; each turn's detail is `turn`. */
export const transcript = query({
  args: { threadId: v.id("v2AssistantThreads"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({ seq: v.number(), role: v.union(v.literal("user"), v.literal("assistant")), text: v.string(), autopilot: v.boolean(), turnId: v.id("v2AssistantTurns") })),
    isDone: v.boolean(), continueCursor: v.string(),
  }),
  handler: async (ctx, { threadId, paginationOpts }) => {
    const user = await requireUser(ctx), thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== user.userId) return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db.query("v2AssistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", threadId)).order("desc")
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 30) });
    return {
      page: page.page.flatMap(r => r.role === "tool" || (r.role === "assistant" && !r.text) ? [] : [{ seq: r.seq, role: r.role as "user" | "assistant", text: r.text, autopilot: r.autopilot ?? false, turnId: r.turnId }]),
      isDone: page.isDone, continueCursor: page.continueCursor,
    };
  },
});

/** One turn (its human only): its outcome and tool calls, the pane's activity chips. */
export const turn = query({
  args: { turnId: v.id("v2AssistantTurns") },
  returns: v.union(v.null(), v.object({ ...turnV.fields, calls: v.array(v.object({ tool: v.string(), ok: v.boolean(), summary: v.string() })) })),
  handler: async (ctx, { turnId }) => {
    const user = await requireUser(ctx), t = await ctx.db.get(turnId);
    if (!t || t.userId !== user.userId) return null;
    const calls = await ctx.db.query("v2AssistantCalls").withIndex("by_turn", q => q.eq("turnId", t._id)).take(64);
    return { ...turnOut(t), calls: calls.map(c => ({ tool: c.tool, ok: c.ok, summary: c.summary })) };
  },
});
