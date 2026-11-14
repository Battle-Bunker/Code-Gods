/**
 * The in-client assistant on v2 (integration plan §1 "In-client assistant", §4.4): a model that acts for ONE human, in
 * one room, as their delegate (`via: "assistant"`, with the grant they chose), through the affordance directory's
 * tools, the same internal twins MCP and the CLI reach. Paid from the human's AI allowance for the game (v2/ai.ts).
 *
 *   operations (v2/ops/assistant.ts)  assistant.send, cancel, setMode, editQueued, removeQueued, sendQueued
 *   queries                           status ({roomId}), threads ({roomId, gameId?}), transcript ({threadId})
 *   the run                           v2/assistantRun.ts: one action per turn; the autopilot ticks with autopilotTick
 *
 * Everything is per (room, human, game): threads belong to the game current when they started, and the queue, modes
 * and allowance follow the same key. A message sent while a turn runs waits in the queue and starts the next turn; a
 * Stop or a failed turn holds the queue until the human sends again. Mode: autopilot plays on its own while the game
 * runs; on request (the default) acts only when asked; read-only offers read tools only.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { mergeTurns, type ChatMessage } from "@workspace/v2-ai";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { ALLOWANCE } from "./ai";
import { memberOf, requireUser, ruleOf } from "./access";
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

const RUN = makeFunctionReference<"action", { turnId: Id<"v2AssistantTurns"> }>("v2/assistantRun:run");
const AUTOPILOT = makeFunctionReference<"mutation", { roomId: Id<"v2Rooms">; userId: string; chain: number }>("v2/assistant:autopilotTick");

type Ctx = QueryCtx | MutationCtx;
const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

export async function prefsOf(ctx: Ctx, roomId: Id<"v2Rooms">, userId: string) {
  return await ctx.db.query("v2AssistantPrefs").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", userId)).unique();
}

/** The human's latest turn in the room while it runs (a turn past its life is dead, so not busy), else null. */
export async function busyTurn(ctx: Ctx, roomId: Id<"v2Rooms">, userId: string) {
  const t = await ctx.db.query("v2AssistantTurns").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", userId)).order("desc").first();
  return t && (t.status === "running" || t.status === "cancelling") && t.createdAt > Date.now() - LIMITS.turnMs ? t : null;
}

/** The thread a message goes to: the one named (of this room, human and game), a new one, or the latest. */
async function threadFor(ctx: MutationCtx, room: Doc<"v2Rooms">, userId: string, a: { threadId?: string; newThread?: boolean; title: string }) {
  const gameId = room.gameId;
  if (a.threadId) {
    const id = ctx.db.normalizeId("v2AssistantThreads", a.threadId), t = id ? await ctx.db.get(id) : null;
    if (!t || t.roomId !== room._id || t.userId !== userId) throw new OpFailure("No such conversation.");
    if (t.gameId !== gameId) throw new OpFailure("That conversation belongs to an earlier game: start a new one.");
    return t._id;
  }
  if (!a.newThread) {
    const latest = await ctx.db.query("v2AssistantThreads").withIndex("by_room_user_game", q => q.eq("roomId", room._id).eq("userId", userId).eq("gameId", gameId)).order("desc").first();
    if (latest) return latest._id;
  }
  const now = Date.now();
  return await ctx.db.insert("v2AssistantThreads", { roomId: room._id, userId, ...(gameId ? { gameId } : {}), title: clip(a.title, 60), createdAt: now, updatedAt: now });
}

async function nextSeq(ctx: Ctx, threadId: Id<"v2AssistantThreads">) {
  return ((await ctx.db.query("v2AssistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", threadId)).order("desc").first())?.seq ?? 0) + 1;
}

export const RANK = { read: 0, act: 1, owner: 2 } as const;
export const lower = (a: Grant, b: Grant | undefined): Grant => b !== undefined && RANK[b] < RANK[a] ? b : a;

/** Opens a turn on `text` and schedules its run, at the human's grant, lowered to `cap` (a delegate's own). */
export async function startTurn(ctx: MutationCtx, room: Doc<"v2Rooms">, userId: string, threadId: Id<"v2AssistantThreads">, text: string, trigger?: "autopilot", cap?: Grant) {
  const prefs = await prefsOf(ctx, room._id, userId), now = Date.now();
  const turnId = await ctx.db.insert("v2AssistantTurns", {
    threadId, roomId: room._id, userId, ...(room.gameId ? { gameId: room.gameId } : {}), status: "running", ...(trigger ? { trigger } : {}),
    grant: lower(prefs?.grant ?? "act", cap), mode: prefs?.mode ?? "onRequest", steps: 0, tokens: 0, usd: 0, createdAt: now,
  });
  await ctx.db.insert("v2AssistantMessages", { threadId, turnId, seq: await nextSeq(ctx, threadId), role: "user", text: clip(text, LIMITS.textChars), ...(trigger ? { autopilot: true } : {}), createdAt: now });
  await ctx.db.patch(threadId, { updatedAt: now });
  await ctx.scheduler.runAfter(0, RUN, { turnId });
  return turnId;
}

const queuedOf = (ctx: Ctx, roomId: Id<"v2Rooms">, userId: string) =>
  ctx.db.query("v2AssistantQueue").withIndex("by_room_user_status", q => q.eq("roomId", roomId).eq("userId", userId).eq("status", "queued")).take(LIMITS.queued * 2);

/**
 * Waits `text` in the human's queue, sent with at most `cap` rights (a delegate's). Refused when full while a turn
 * runs; an idle send drains the queue at once, so it is not limited.
 */
export async function enqueue(ctx: MutationCtx, room: Doc<"v2Rooms">, userId: string, threadId: Id<"v2AssistantThreads">, text: string, cap: Grant | undefined, limited: boolean) {
  if (limited && (await queuedOf(ctx, room._id, userId)).length >= LIMITS.queued) throw new OpFailure(`At most ${LIMITS.queued} messages can wait; edit or remove one.`, "assistant.removeQueued");
  return await ctx.db.insert("v2AssistantQueue", { roomId: room._id, userId, threadId, text, status: "queued", ...(cap ? { cap } : {}), createdAt: Date.now() });
}

/**
 * Starts the next turn from the waiting messages (all of them, in order, as one message), held ones included when
 * `held`, at the lowest rights any of them was sent with; null when nothing waits.
 */
export async function drainQueue(ctx: MutationCtx, room: Doc<"v2Rooms">, userId: string, held: boolean) {
  const rows = (await queuedOf(ctx, room._id, userId)).filter(r => held || !r.held);
  if (!rows.length) return null;
  const text = rows.map(r => r.text).join("\n\n");
  // Sent in an earlier game's conversation (the game changed while they waited): they start one in this game.
  const thread = await ctx.db.get(rows.at(-1)!.threadId);
  const threadId = thread && thread.gameId === room.gameId ? thread._id : await threadFor(ctx, room, userId, { newThread: true, title: text });
  for (const r of rows) await ctx.db.patch(r._id, { status: "delivered" });
  const cap = rows.reduce<Grant | undefined>((c, r) => r.cap ? lower(c ?? r.cap, r.cap) : c, undefined);
  return await startTurn(ctx, room, userId, threadId, text, undefined, cap);
}

/** The waiting messages held: a Stop or a failure leaves them for the human to send. */
async function holdQueue(ctx: MutationCtx, roomId: Id<"v2Rooms">, userId: string) {
  for (const r of await queuedOf(ctx, roomId, userId)) if (!r.held) await ctx.db.patch(r._id, { held: true });
}

/** The autopilot's next tick (a new chain retires the old one's). */
export async function scheduleAutopilot(ctx: MutationCtx, roomId: Id<"v2Rooms">, userId: string, chain: number, delayMs: number) {
  await ctx.scheduler.runAfter(delayMs, AUTOPILOT, { roomId, userId, chain });
}

// ------------------------------------------------------------------------------------------------
// the run's reads and writes (v2/assistantRun.ts)
// ------------------------------------------------------------------------------------------------

/** The history a turn replays, oldest first: whole exchanges, from a human message on. */
function historyOf(rows: Doc<"v2AssistantMessages">[]): ChatMessage[] {
  const first = rows.findIndex(r => r.role === "user");
  const out: ChatMessage[] = [];
  for (const r of first < 0 ? [] : rows.slice(first)) {
    if (r.role === "user") out.push({ role: "user", content: r.text });
    else if (r.contentJson) out.push({ role: r.role === "assistant" ? "assistant" : "user", content: JSON.parse(r.contentJson) } as ChatMessage);
  }
  // A turn that failed left a message unanswered: two of the human's in a row are one.
  return mergeTurns(out);
}

export const turnInput = internalQuery({
  args: { turnId: v.id("v2AssistantTurns") },
  handler: async (ctx, { turnId }) => {
    const turn = await ctx.db.get(turnId);
    if (!turn || turn.status !== "running") return null;
    const room = await ctx.db.get(turn.roomId), member = room ? await memberOf(ctx, room._id, turn.userId) : null;
    if (!room || !member) return null;
    const rows = (await ctx.db.query("v2AssistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", turn.threadId)).order("desc").take(LIMITS.historyMessages)).reverse();
    const rule = turn.gameId ? await ruleOf(ctx, turn.gameId, member._id) : null;
    return {
      roomId: turn.roomId as string, userId: turn.userId, gameId: turn.gameId ?? null, memberId: member._id, name: member.name,
      grant: turn.grant, mode: turn.mode, trigger: turn.trigger ?? null, history: historyOf(rows),
      rule: rule ? { card: rule.card, family: rule.family } : null,
    };
  },
});

export const turnStatus = internalQuery({
  args: { turnId: v.id("v2AssistantTurns") },
  handler: async (ctx, { turnId }) => (await ctx.db.get(turnId))?.status ?? null,
});

const SUMMARY = 160;
export const recordCall = internalMutation({
  args: { turnId: v.id("v2AssistantTurns"), index: v.number(), tool: v.string(), argsJson: v.string(), ok: v.boolean(), summary: v.string() },
  handler: async (ctx, a) => {
    const turn = await ctx.db.get(a.turnId);
    if (!turn) return;
    await ctx.db.insert("v2AssistantCalls", { turnId: a.turnId, threadId: turn.threadId, index: a.index, tool: a.tool,
      argsJson: clip(a.argsJson, LIMITS.argsChars), ok: a.ok, summary: clip(a.summary, SUMMARY), createdAt: Date.now() });
  },
});

/** Writes a run's new messages and outcome, then starts the next turn from the queue (or holds it after a failure). */
export const finish = internalMutation({
  args: {
    turnId: v.id("v2AssistantTurns"), messages: v.array(v.object({ role: v.union(v.literal("assistant"), v.literal("tool")), text: v.string(), contentJson: v.string() })),
    status: v.union(v.literal("done"), v.literal("failed"), v.literal("cancelled"), v.literal("budget")),
    steps: v.number(), tokens: v.number(), usd: v.number(), error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const turn = await ctx.db.get(a.turnId);
    if (!turn || (turn.status !== "running" && turn.status !== "cancelling")) return;
    const now = Date.now();
    let seq = await nextSeq(ctx, turn.threadId);
    for (const m of a.messages) {
      await ctx.db.insert("v2AssistantMessages", { threadId: turn.threadId, turnId: turn._id, seq: seq++, role: m.role, text: clip(m.text, LIMITS.textChars), contentJson: m.contentJson, createdAt: now });
    }
    // A Stop asked for during the run ends it as cancelled, whatever the run reports.
    const status = turn.status === "cancelling" ? "cancelled" : a.status;
    await ctx.db.patch(turn._id, { status, steps: a.steps, tokens: a.tokens, usd: a.usd, finishedAt: now, ...(a.error ? { error: clip(a.error, 500) } : {}) });
    await ctx.db.patch(turn.threadId, { updatedAt: now });
    const room = await ctx.db.get(turn.roomId);
    if (!room) return;
    // After a failure what waits is held; a Stop held what waited before it, and what came after it goes next.
    if (status === "failed") await holdQueue(ctx, room._id, turn.userId);
    else await drainQueue(ctx, room, turn.userId, false);
  },
});

/** A Stop: the run sees it at its next tool call and ends; what waits is held. */
export async function cancelTurn(ctx: MutationCtx, roomId: Id<"v2Rooms">, userId: string) {
  const turn = await busyTurn(ctx, roomId, userId);
  await holdQueue(ctx, roomId, userId);
  if (!turn) return "idle" as const;
  if (turn.status === "running") await ctx.db.patch(turn._id, { status: "cancelling" });
  return "stopping" as const;
}

/** An autopilot tick's check, in one transaction: still chosen, game running, nothing of the human's running or waiting. */
export const autopilotTick = internalMutation({
  args: { roomId: v.id("v2Rooms"), userId: v.string(), chain: v.number() },
  handler: async (ctx, { roomId, userId, chain }) => {
    const prefs = await prefsOf(ctx, roomId, userId), room = await ctx.db.get(roomId);
    if (!prefs || prefs.mode !== "autopilot" || prefs.chain !== chain || !room?.gameId) return;
    const game = await ctx.db.get(room.gameId);
    if (!game || game.phase === "ended") return;   // the next game's start restarts the chain (restartAutopilots)
    const member = await memberOf(ctx, roomId, userId);
    if (!member) return;
    const used = await ctx.db.query("v2AiUsage").withIndex("by_member_game", q => q.eq("memberId", member._id).eq("gameId", game._id)).unique();
    if (used && (used.tokens >= ALLOWANCE.tokens || used.usd >= ALLOWANCE.usd)) return;   // the allowance is used up
    const again = (ms: number = LIMITS.autopilotMs) => scheduleAutopilot(ctx, roomId, userId, chain, ms);
    if (game.phase !== "live") return await again(LIMITS.waitMs);   // planning or paused: look again soon
    if (await busyTurn(ctx, roomId, userId) || (await queuedOf(ctx, roomId, userId)).length) return await again();
    const thread = await threadFor(ctx, room, userId, { title: "Autopilot" });
    await startTurn(ctx, room, userId, thread, "(Autopilot) Look at the game and play your next useful move for me: improve or protect my lines, " +
      "tend my agents and energy, or answer a pitch. Then say in one or two sentences what you did.", "autopilot");
    await again();
  },
});

/** A game started: every human of the room who chose autopilot gets a new chain of ticks. */
export async function restartAutopilots(ctx: MutationCtx, roomId: Id<"v2Rooms">) {
  for (const p of await ctx.db.query("v2AssistantPrefs").withIndex("by_room_user", q => q.eq("roomId", roomId)).take(64)) {
    if (p.mode !== "autopilot") continue;
    await ctx.db.patch(p._id, { chain: p.chain + 1 });
    await scheduleAutopilot(ctx, roomId, p.userId, p.chain + 1, 0);
  }
}

export { threadFor, queuedOf };

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
    allowance: v.object({ tokens: v.number(), usd: v.number(), usedTokens: v.number(), usedUsd: v.number() }),
    turn: v.union(turnV, v.null()),
    queued: v.array(v.object({ queueId: v.id("v2AssistantQueue"), text: v.string(), held: v.boolean() })),
  })),
  handler: async (ctx, { roomId }) => {
    const user = await requireUser(ctx), room = await ctx.db.get(roomId);
    const member = room ? await memberOf(ctx, roomId, user.userId) : null;
    if (!room || !member) return null;
    const prefs = await prefsOf(ctx, roomId, user.userId);
    const used = await ctx.db.query("v2AiUsage").withIndex("by_member_game", q => q.eq("memberId", member._id).eq("gameId", room.gameId)).unique();
    const latest = await ctx.db.query("v2AssistantTurns").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", user.userId)).order("desc").first();
    return {
      mode: prefs?.mode ?? "onRequest", grant: prefs?.grant ?? "act", gameId: room.gameId ?? null,
      allowance: { tokens: ALLOWANCE.tokens, usd: ALLOWANCE.usd, usedTokens: used?.tokens ?? 0, usedUsd: used?.usd ?? 0 },
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
