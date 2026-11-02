/**
 * The assistant's turn lifecycle shared by its mutations (assistant.ts), its turn loop (assistant/store.ts) and a game
 * launch (game/lobby.ts): opening, resuming and finishing turns, the message queue, denied calls. Kept apart from
 * store.ts so the hot reactive queries of assistant.ts and rooms.ts never load rules.ts and the tool registry it needs
 * (test/unit/hot-query-bundles.test.ts).
 */
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assistantEpoch } from "../ai/seats";
import { ENGINE_NOTES, LIMITS, withEngineNote, type TurnStatus } from "./limits";

export type Ctx = QueryCtx | MutationCtx;
export type Turn = Doc<"assistantTurns">;
export type Call = Doc<"assistantToolCalls">;
const TERMINAL_CALL = ["ok", "error", "denied"];
/** A call still running when its turn ended; its real outcome may still arrive (endCall then replaces this). */
export const INTERRUPTED = "Interrupted when the turn ended";
/** A cancelled turn whose step never acknowledged is finished after this (longer than a tool call can wait). */
export const CANCEL_GRACE_MS = LIMITS.waitMs + 30_000;

/** Structured log line: ids, tools, outcomes and usage only, never message text or tool arguments. */
export function log(event: string, fields: Record<string, string | number | boolean | undefined>) {
  console.log(JSON.stringify({ event: `assistant.${event}`, ...fields }));
}

export async function callsOf(ctx: Ctx, turnId: Id<"assistantTurns">) {
  return ctx.db.query("assistantToolCalls").withIndex("by_turn", q => q.eq("turnId", turnId)).take(200);
}

/**
 * End a turn: its status and error, the thread freed, streaming messages closed, and calls that never ran marked
 * denied (a call interrupted while running is an error: its outcome is in its receipt, if any).
 */
export async function finishTurn(ctx: MutationCtx, turn: Turn, status: Exclude<TurnStatus, "running" | "awaiting_confirmation" | "cancelling">, error?: { code: string; message: string }) {
  const now = Date.now();
  await ctx.db.patch(turn._id, { status, finishedAt: now, updatedAt: now, gen: turn.gen + 1, ...(error ? { error } : {}) });
  const thread = await ctx.db.get(turn.threadId);
  if (thread?.activeTurnId === turn._id) await ctx.db.patch(thread._id, { activeTurnId: undefined, updatedAt: now });
  const messageStatus = status === "cancelled" ? "cancelled" : status === "done" ? "done" : "error";
  for (const m of await ctx.db.query("assistantMessages").withIndex("by_turn", q => q.eq("turnId", turn._id)).take(50)) {
    if (m.status === "streaming") await ctx.db.patch(m._id, { status: messageStatus, updatedAt: now });
  }
  for (const c of await callsOf(ctx, turn._id)) {
    if (TERMINAL_CALL.includes(c.status)) continue;
    const interrupted = c.status === "running";
    await ctx.db.patch(c._id, {
      status: interrupted ? "error" : "denied", updatedAt: now,
      summary: interrupted ? INTERRUPTED : "Not run: the turn ended",
      resultJson: JSON.stringify({ error: { code: interrupted ? "INTERRUPTED" : "NOT_RUN", message: "The turn ended before this call finished" } }),
    });
  }
  log("finish", { turnId: turn._id, status, code: error?.code, steps: turn.step, inputTokens: turn.usage.inputTokens, outputTokens: turn.usage.outputTokens });
  if (status === "done" || status === "cancelled") await startQueuedTurn(ctx, turn);
  else {
    // A turn that failed or ran out of allowance would fail its queued messages the same way: they are held for the
    // player to send (or remove) once they see why.
    for (const row of await queuedIn(ctx, turn.threadId, { held: false })) await ctx.db.patch(row._id, { held: true, updatedAt: now });
  }
}

// ---------------------------------------------------------------------------------------------
// Queued messages (docs/surface-architecture.md §6 "Queued messages")
// ---------------------------------------------------------------------------------------------

export type QueueRow = Doc<"assistantQueue">;

/** A thread's queued messages, oldest first: all, or only those not held by a Stop (`held: false`) or only held ones. */
export async function queuedIn(ctx: Ctx, threadId: Id<"assistantThreads">, { held }: { held?: boolean } = {}): Promise<QueueRow[]> {
  const rows = await ctx.db.query("assistantQueue").withIndex("by_thread_status", q => q.eq("threadId", threadId).eq("status", "queued")).take(LIMITS.queued * 4);
  return held === undefined ? rows : rows.filter(r => (r.held ?? false) === held);
}

/**
 * The user messages `texts` appended to the turn's thread, in order; the queue rows among them become `delivered`
 * (with the message they became). Run in one mutation, so a row is delivered exactly once: a racing delivery reads
 * it as no longer queued (Convex mutations are serializable).
 */
export async function appendUserMessages(ctx: MutationCtx, turn: { _id: Id<"assistantTurns">; threadId: Id<"assistantThreads"> }, items: { text: string; row?: QueueRow }[]) {
  const now = Date.now();
  const last = await ctx.db.query("assistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", turn.threadId)).order("desc").first();
  let seq = last?.seq ?? 0;
  for (const { text, row } of items) {
    const messageId = await ctx.db.insert("assistantMessages", { threadId: turn.threadId, turnId: turn._id, seq: ++seq, role: "user", text, status: "done", createdAt: now, updatedAt: now });
    if (row) await ctx.db.patch(row._id, { status: "delivered", turnId: turn._id, messageId, updatedAt: now });
  }
}

/** Start a turn in a thread with these user messages (assistant.send, and the queue's next turn). */
export async function openTurn(ctx: MutationCtx, at: { room: Doc<"rooms">; threadId: Id<"assistantThreads">; subject: string; credentialId: Id<"credentials">; replay?: Doc<"assistantTurns">["replay"] }, items: { text: string; row?: QueueRow }[]) {
  const now = Date.now();
  const turnId = await ctx.db.insert("assistantTurns", {
    threadId: at.threadId, roomId: at.room._id, subject: at.subject, ...(at.room.activeGameId ? { gameId: at.room.activeGameId } : {}), credentialId: at.credentialId,
    status: "running", gen: 0, step: 0, maxSteps: LIMITS.maxSteps, deadline: now + LIMITS.turnMs,
    usage: { inputTokens: 0, outputTokens: 0, reservedTokens: 0, reservedUsd: 0, billedTokens: 0 }, tools: [], createdAt: now, updatedAt: now,
    ...(at.replay ? { replay: at.replay } : {}),
  });
  await appendUserMessages(ctx, { _id: turnId, threadId: at.threadId }, items);
  await ctx.db.patch(at.threadId, { activeTurnId: turnId, updatedAt: now });
  await ctx.scheduler.runAfter(0, internal.assistant.step.run, { turnId, gen: 0 });
  return turnId;
}

/**
 * After a turn ends done (or cancelled: messages sent while it stopped): the thread's queued messages that a Stop did
 * not hold start the next turn at once, in order (a turn that ended with no tool step had no boundary to take them).
 * Not when the thread is an earlier game's or the owner has turned the assistant off: they stay queued, visible,
 * until the player sends or removes them.
 */
async function startQueuedTurn(ctx: MutationCtx, turn: Turn) {
  const rows = await queuedIn(ctx, turn.threadId, { held: false });
  if (!rows.length) return;
  const room = await ctx.db.get(turn.roomId);
  const thread = await ctx.db.get(turn.threadId);
  if (!room || !thread || thread.epoch !== assistantEpoch(room) || !(room.assistantBudget ?? 0)) return;
  const turnId = await openTurn(ctx, { room, threadId: turn.threadId, subject: turn.subject, credentialId: turn.credentialId }, rows.map(row => ({ text: row.text, row })));
  log("queue.turn", { turnId, after: turn._id, messages: rows.length });
}

/**
 * Deliver the thread's queued messages into a live turn at a step boundary (the step's tool calls are resolved and
 * their results stored; the next model step has not started): they become user messages after the step's, so the
 * history puts them after its tool results (rules.ts buildHistory). Only into a turn that will take another model
 * step (one left before the step ceiling, and its latest step called tools); otherwise they wait for the next turn.
 */
export async function deliverInto(ctx: MutationCtx, turn: Turn): Promise<number> {
  if (turn.step >= turn.maxSteps || turn.lastStop !== "tool_use") return 0;
  const rows = await queuedIn(ctx, turn.threadId, { held: false });
  if (!rows.length) return 0;
  await appendUserMessages(ctx, turn, rows.map(row => ({ text: row.text, row })));
  await ctx.db.patch(turn._id, { updatedAt: Date.now() });
  log("queue.deliver", { turnId: turn._id, step: turn.step, messages: rows.length });
  return rows.length;
}

/** Resume a turn on a new generation (after a confirmation decision), with a fresh step action. */
export async function resume(ctx: MutationCtx, turn: Turn) {
  const gen = turn.gen + 1;
  await ctx.db.patch(turn._id, { status: "running", gen, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.assistant.step.run, { turnId: turn._id, gen });
}

/** Deny a call (by the player, or when its card timed out) and let the turn continue. */
export async function denyCall(ctx: MutationCtx, call: Call, reason: "player" | "timeout" | "message") {
  const message = reason === "player" ? "The player declined this call."
    : reason === "message" ? "The player sent a message instead of answering this confirmation, so the call was declined (not run). Their message follows these results: read it, and ask again if the action is still wanted."
    : "The player did not confirm this call within two minutes.";
  let resultJson = JSON.stringify({ error: { code: "DENIED", message } });
  // The step's last call, before the turn's final model step: the note step.ts resolveCalls gives a call it runs.
  const turn = await ctx.db.get(call.turnId);
  if (turn && turn.step >= turn.maxSteps - 1) {
    const siblings = await ctx.db.query("assistantToolCalls").withIndex("by_turn", q => q.eq("turnId", call.turnId).gt("index", call.index)).take(LIMITS.callsPerStep + 1);
    if (!siblings.some(c => c.messageId === call.messageId)) resultJson = withEngineNote(resultJson, ENGINE_NOTES.lastStep);
  }
  await ctx.db.patch(call._id, {
    status: "denied", approved: false, updatedAt: Date.now(), summary: reason === "player" ? "Declined" : reason === "message" ? "Declined: you sent a message" : "Not confirmed in time", resultJson,
  });
  log("confirm.deny", { turnId: call.turnId, callDocId: call._id, tool: call.tool, reason });
}

/**
 * A new game starts in the room (game/lobby.ts launch): every assistant turn still active there ends, so no step, tool
 * call or confirmation card of the previous game's conversation runs in the new one. A running step is cancelled like
 * the player's own stop (it exits at its next check, finalizeCancel after the grace); a turn waiting on a card ends
 * now, its card denied.
 */
export async function endTurnsForNewGame(ctx: MutationCtx, roomId: Id<"rooms">) {
  const now = Date.now();
  // Messages queued for the last game's conversations are not carried into the new game.
  for (const row of await ctx.db.query("assistantQueue").withIndex("by_room_status", q => q.eq("roomId", roomId).eq("status", "queued")).take(200)) {
    await ctx.db.patch(row._id, { status: "removed", updatedAt: now });
  }
  for (const status of ["running", "awaiting_confirmation"] as const) {
    for (const turn of await ctx.db.query("assistantTurns").withIndex("by_room_status", q => q.eq("roomId", roomId).eq("status", status)).take(200)) {
      if (status === "awaiting_confirmation") { await finishTurn(ctx, turn, "cancelled"); continue; }
      await ctx.db.patch(turn._id, { status: "cancelling", gen: turn.gen + 1, updatedAt: now });
      await ctx.scheduler.runAfter(CANCEL_GRACE_MS, internal.assistant.store.finalizeCancel, { turnId: turn._id });
      log("cancel.newGame", { turnId: turn._id });
    }
  }
}
