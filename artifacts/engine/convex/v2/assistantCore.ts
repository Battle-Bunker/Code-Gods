/**
 * The in-client assistant's queue, turns and autopilot (v2/assistant.ts describes the whole): what the operations
 * (v2/ops/assistant.ts), the run (v2/assistantRun.ts) and the game's start (lobby.ts) call. Its page queries live in
 * v2/assistant.ts, which must not load this module's imports.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { limitsIn } from "./spend";
import { memberOf } from "./access";
import { LIMITS, prefsOf, queuedOf, type Grant } from "./assistant";

const RUN = makeFunctionReference<"action", { turnId: Id<"v2AssistantTurns"> }>("v2/assistantRun:run");
const AUTOPILOT = makeFunctionReference<"mutation", { roomId: Id<"v2Rooms">; userId: string; chain: number }>("v2/assistantCore:autopilotTick");
type Ctx = QueryCtx | MutationCtx;
const clip = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

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
    const again = (ms: number = LIMITS.autopilotMs) => scheduleAutopilot(ctx, roomId, userId, chain, ms);
    if (game.phase !== "live") return await again(LIMITS.waitMs);   // planning or paused: look again soon
    // Refused (a quota, a ceiling, the rate limit, not an administrator's room): no turn now; it asks again next tick,
    // since the owner may raise a quota mid-game.
    if ("refused" in await limitsIn(ctx, { roomId, gameId: game._id, memberId: member._id, pool: "assistant" })) return await again();
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

export { threadFor };
