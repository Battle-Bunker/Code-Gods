/**
 * The transactional half of the assistant's turn loop (docs/surface-architecture.md §6): the context a step needs,
 * streaming flushes, step results, tool-call state, confirmations, finishing, and the deadline sweeper. The model
 * calls and tool executions run in assistant/step.ts ("use node"); every write here checks the turn's generation
 * (`gen`) and status, so a stale or cancelled step changes nothing and learns it should stop.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { ChatMessage } from "@workspace/ai-player";
import { LIMITS, buildHistory, isActive, turnEnding, type TurnStatus } from "./rules";

type Ctx = QueryCtx | MutationCtx;
type Turn = Doc<"assistantTurns">;
type Call = Doc<"assistantToolCalls">;
const TERMINAL_CALL = ["ok", "error", "denied"];
/** A call still running when its turn ended; its real outcome may still arrive (endCall then replaces this). */
const INTERRUPTED = "Interrupted when the turn ended";
/** A cancelled turn whose step never acknowledged is finished after this (longer than a tool call can wait). */
export const CANCEL_GRACE_MS = LIMITS.waitMs + 30_000;
const clipText = (text: string) => text.length > LIMITS.textChars ? text.slice(0, LIMITS.textChars) : text;

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
}

const addUsage = (usage: Turn["usage"], step: { inputTokens: number; outputTokens: number; billedTokens: number }): Turn["usage"] => ({
  ...usage, inputTokens: usage.inputTokens + step.inputTokens, outputTokens: usage.outputTokens + step.outputTokens,
  billedTokens: (usage.billedTokens ?? usage.inputTokens + usage.outputTokens) + step.billedTokens,
});

/** The live turn this step may write to, or null (stale generation, cancelled or finished). */
async function liveTurn(ctx: Ctx, turnId: Id<"assistantTurns">, gen: number) {
  const turn = await ctx.db.get(turnId);
  return turn && turn.gen === gen && turn.status === "running" ? turn : null;
}

// ---------------------------------------------------------------------------------------------
// Context of one step
// ---------------------------------------------------------------------------------------------

/**
 * The thread as model messages (rules.ts buildHistory). The window is turn-aligned so it never moves during a turn:
 * all of the current turn, and up to LIMITS.historyMessages earlier messages with their calls.
 */
async function historyOf(ctx: QueryCtx, turn: Turn): Promise<ChatMessage[]> {
  const mine = await ctx.db.query("assistantMessages").withIndex("by_turn", q => q.eq("turnId", turn._id)).take(200);
  const firstSeq = Math.min(...mine.map(m => m.seq), Number.MAX_SAFE_INTEGER);
  const before = (await ctx.db.query("assistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", turn.threadId).lt("seq", firstSeq))
    .order("desc").take(LIMITS.historyMessages)).reverse();
  const rows = [...before, ...mine.sort((a, b) => a.seq - b.seq)];
  const turnIds = [...new Set(rows.map(m => m.turnId))];
  const calls = (await Promise.all(turnIds.map(id => callsOf(ctx, id)))).flat();
  const earlier = await Promise.all(turnIds.filter(id => id !== turn._id).map(id => ctx.db.get(id)));
  const endings = Object.fromEntries(earlier.flatMap(t => t ? [[t._id, turnEnding(t.status, t.error?.code)]] : []));
  return buildHistory(
    rows.map(m => ({ id: m._id, turnId: m.turnId, role: m.role, text: m.text, contentJson: m.contentJson ?? null })),
    calls.map(c => ({ messageId: c.messageId, callId: c.callId, index: c.index, tool: c.tool, argsJson: c.argsJson, status: c.status, resultJson: c.resultJson ?? null })),
    { turnId: turn._id, briefings: Object.fromEntries([turn, ...earlier].flatMap(t => t?.briefing ? [[t._id, t.briefing]] : [])), endings },
  );
}

/** Everything a step needs, or why it must stop. The history is JSON (model-chosen keys need not be Convex field names). */
export const context = internalQuery({
  args: { turnId: v.id("assistantTurns"), gen: v.number() },
  handler: async (ctx, { turnId, gen }) => {
    const turn = await ctx.db.get(turnId);
    if (!turn) return { stop: "gone" as const };
    if (turn.gen !== gen || turn.status !== "running") return { stop: "stale" as const, status: turn.status };
    const room = await ctx.db.get(turn.roomId);
    const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", turn.subject)).unique();
    const prefs = await ctx.db.query("assistantPrefs").withIndex("by_key", q => q.eq("roomId", turn.roomId).eq("subject", turn.subject)).unique();
    const calls = await callsOf(ctx, turnId);
    return {
      turn: { id: turn._id, step: turn.step, maxSteps: turn.maxSteps, deadline: turn.deadline, lastStop: turn.lastStop ?? null, credentialId: turn.credentialId, subject: turn.subject },
      roomId: turn.roomId, threadId: turn.threadId, roomCode: room?.shortCode ?? null, model: room?.assistantModel ?? null, playerName: user?.name ?? "the player",
      autoApproveSummonBits: prefs?.autoApproveSummonBits ?? 0,
      calls: calls.map(c => ({ id: c._id, callId: c.callId, index: c.index, tool: c.tool, argsJson: c.argsJson, status: c.status, approved: c.approved ?? false, resultJson: c.resultJson ?? null })),
      hasBriefing: turn.briefing !== undefined,
      historyJson: JSON.stringify(await historyOf(ctx, turn)),
    };
  },
});

// ---------------------------------------------------------------------------------------------
// One model step
// ---------------------------------------------------------------------------------------------

/** The turn's briefing, written once before its first model step (rules.ts buildHistory puts it in front). */
export const setBriefing = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), briefing: v.string() },
  handler: async (ctx, { turnId, gen, briefing }) => {
    const turn = await liveTurn(ctx, turnId, gen);
    if (!turn) return { cancelled: true };
    if (turn.briefing === undefined) await ctx.db.patch(turn._id, { briefing, updatedAt: Date.now() });
    return { cancelled: false };
  },
});

/** After a successful reservation: the step's (streaming) assistant message, and the tools offered. */
export const openStep = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), tools: v.array(v.string()), reservedTokens: v.number(), reservedUsd: v.number(), inputEstimate: v.number() },
  handler: async (ctx, { turnId, gen, tools, reservedTokens, reservedUsd, inputEstimate }) => {
    const turn = await liveTurn(ctx, turnId, gen);
    if (!turn) return null;
    const now = Date.now();
    const last = await ctx.db.query("assistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", turn.threadId)).order("desc").first();
    const messageId = await ctx.db.insert("assistantMessages", {
      threadId: turn.threadId, turnId, seq: (last?.seq ?? 0) + 1, role: "assistant", text: "", status: "streaming", reservedTokens, inputEstimate, createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(turnId, {
      tools, updatedAt: now,
      usage: { ...turn.usage, reservedTokens: turn.usage.reservedTokens + reservedTokens, reservedUsd: turn.usage.reservedUsd + reservedUsd },
    });
    return messageId;
  },
});

/** Is the turn still live on this generation? (The step's cancellation check while no text streams.) */
export const live = internalQuery({
  args: { turnId: v.id("assistantTurns"), gen: v.number() },
  handler: async (ctx, { turnId, gen }) => !!await liveTurn(ctx, turnId, gen),
});

/** A streaming flush; `cancelled` tells the step to abort the provider stream. */
export const flush = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), messageId: v.id("assistantMessages"), text: v.string() },
  handler: async (ctx, { turnId, gen, messageId, text }) => {
    if (!await liveTurn(ctx, turnId, gen)) return { cancelled: true };
    await ctx.db.patch(messageId, { text: clipText(text), updatedAt: Date.now() });
    return { cancelled: false };
  },
});

const newCall = v.object({ callId: v.string(), tool: v.string(), argsJson: v.string(), commandId: v.optional(v.string()), status: v.union(v.literal("pending"), v.literal("error")), summary: v.string(), resultJson: v.optional(v.string()) });

/** The model answered: its final text and usage, and its tool calls (pending, or refused at once). */
export const completeStep = internalMutation({
  args: {
    turnId: v.id("assistantTurns"), gen: v.number(), messageId: v.id("assistantMessages"), text: v.string(), contentJson: v.optional(v.string()),
    inputTokens: v.number(), outputTokens: v.number(), cacheReadTokens: v.number(), cacheWriteTokens: v.number(), billedTokens: v.number(),
    stop: v.union(v.literal("end_turn"), v.literal("tool_use")), calls: v.array(newCall),
  },
  handler: async (ctx, args) => {
    const turn = await liveTurn(ctx, args.turnId, args.gen);
    if (!turn) return { cancelled: true };
    const now = Date.now();
    await ctx.db.patch(args.messageId, {
      text: clipText(args.text), status: "done", inputTokens: args.inputTokens, outputTokens: args.outputTokens,
      cacheReadTokens: args.cacheReadTokens, cacheWriteTokens: args.cacheWriteTokens, billedTokens: args.billedTokens, updatedAt: now,
      ...(args.contentJson ? { contentJson: args.contentJson } : {}),
    });
    await ctx.db.patch(turn._id, {
      step: turn.step + 1, lastStop: args.calls.length ? "tool_use" : "end_turn", updatedAt: now,
      usage: addUsage(turn.usage, args),
    });
    for (const [index, c] of args.calls.entries()) {
      await ctx.db.insert("assistantToolCalls", { turnId: turn._id, threadId: turn.threadId, messageId: args.messageId, index, ...c, createdAt: now, updatedAt: now });
    }
    return { cancelled: false };
  },
});

/**
 * A cancelled step's usage, billed from what was known when its stream was aborted (step.ts): recorded on the step's
 * message and the turn even though the turn is no longer live (the call did happen).
 */
export const recordAbortedUsage = internalMutation({
  args: {
    turnId: v.id("assistantTurns"), messageId: v.id("assistantMessages"), inputTokens: v.number(), outputTokens: v.number(),
    cacheReadTokens: v.number(), cacheWriteTokens: v.number(), billedTokens: v.number(),
  },
  handler: async (ctx, { turnId, messageId, ...usage }) => {
    const turn = await ctx.db.get(turnId);
    const message = await ctx.db.get(messageId);
    if (!turn || !message || message.turnId !== turnId || message.billedTokens !== undefined) return;
    await ctx.db.patch(messageId, { ...usage, usageEstimated: true, updatedAt: Date.now() });
    await ctx.db.patch(turnId, { usage: addUsage(turn.usage, usage) });
  },
});

/** A tool call starts running (refused when the turn was cancelled or the call is no longer runnable). */
export const startCall = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), callDocId: v.id("assistantToolCalls") },
  handler: async (ctx, { turnId, gen, callDocId }) => {
    if (!await liveTurn(ctx, turnId, gen)) return { go: false, cancelled: true };
    const call = await ctx.db.get(callDocId);
    if (!call || (call.status !== "pending" && call.status !== "running")) return { go: false, cancelled: false };
    await ctx.db.patch(call._id, { status: "running", updatedAt: Date.now() });
    return { go: true, cancelled: false };
  },
});

/** A tool call's outcome (written even when the turn was cancelled meanwhile: the call did run). */
export const endCall = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), callDocId: v.id("assistantToolCalls"), status: v.union(v.literal("ok"), v.literal("error")), summary: v.string(), resultJson: v.string() },
  handler: async (ctx, { turnId, gen, callDocId, ...outcome }) => {
    const call = await ctx.db.get(callDocId);
    if (call && (call.status === "running" || (call.status === "error" && call.summary === INTERRUPTED))) await ctx.db.patch(call._id, { ...outcome, updatedAt: Date.now() });
    return { cancelled: !await liveTurn(ctx, turnId, gen) };
  },
});

/** Pause the turn on a call that needs the player's confirmation; no action stays open while it waits. */
export const awaitConfirmation = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), callDocId: v.id("assistantToolCalls") },
  handler: async (ctx, { turnId, gen, callDocId }) => {
    const turn = await liveTurn(ctx, turnId, gen);
    if (!turn) return { cancelled: true };
    const deadline = Date.now() + LIMITS.confirmMs;
    await ctx.db.patch(callDocId, { status: "awaiting_confirmation", confirmDeadline: deadline, updatedAt: Date.now() });
    await ctx.db.patch(turn._id, { status: "awaiting_confirmation", updatedAt: Date.now() });
    await ctx.scheduler.runAt(deadline + 500, internal.assistant.store.expireConfirmation, { callDocId });
    log("confirm.wait", { turnId, callDocId });
    return { cancelled: false };
  },
});

/** Resume a turn on a new generation (after a confirmation decision), with a fresh step action. */
export async function resume(ctx: MutationCtx, turn: Turn) {
  const gen = turn.gen + 1;
  await ctx.db.patch(turn._id, { status: "running", gen, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.assistant.step.run, { turnId: turn._id, gen });
}

/** Deny a call (by the player, or when its card timed out) and let the turn continue. */
export async function denyCall(ctx: MutationCtx, call: Call, reason: "player" | "timeout") {
  const message = reason === "player" ? "The player declined this call." : "The player did not confirm this call within two minutes.";
  await ctx.db.patch(call._id, {
    status: "denied", approved: false, updatedAt: Date.now(), summary: reason === "player" ? "Declined" : "Not confirmed in time",
    resultJson: JSON.stringify({ error: { code: "DENIED", message } }),
  });
  log("confirm.deny", { turnId: call.turnId, callDocId: call._id, tool: call.tool, reason });
}

export const expireConfirmation = internalMutation({
  args: { callDocId: v.id("assistantToolCalls") },
  handler: async (ctx, { callDocId }) => {
    const call = await ctx.db.get(callDocId);
    if (!call || call.status !== "awaiting_confirmation" || (call.confirmDeadline ?? 0) > Date.now()) return;
    await denyCall(ctx, call, "timeout");
    const turn = await ctx.db.get(call.turnId);
    if (turn?.status === "awaiting_confirmation") await resume(ctx, turn);
  },
});

/** Schedule the next step of a live turn (`delayMs` waits out a rate limit). */
export const next = internalMutation({
  args: { turnId: v.id("assistantTurns"), gen: v.number(), delayMs: v.optional(v.number()) },
  handler: async (ctx, { turnId, gen, delayMs }) => {
    const turn = await liveTurn(ctx, turnId, gen);
    if (!turn) return { cancelled: true };
    await ctx.scheduler.runAfter(delayMs ?? 0, internal.assistant.step.run, { turnId, gen });
    return { cancelled: false };
  },
});

/**
 * End a turn from its step: `done`, `failed` or `budget_exhausted` only while it is live on this generation;
 * `cancelled` only once the player asked to cancel (status cancelling).
 */
export const finish = internalMutation({
  args: {
    turnId: v.id("assistantTurns"), gen: v.number(),
    status: v.union(v.literal("done"), v.literal("failed"), v.literal("budget_exhausted"), v.literal("cancelled")),
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
  },
  handler: async (ctx, { turnId, gen, status, error }) => {
    const turn = await ctx.db.get(turnId);
    if (!turn || !isActive(turn.status)) return;
    if (turn.status === "cancelling") return finishTurn(ctx, turn, "cancelled");
    if (status === "cancelled" || turn.gen !== gen || turn.status !== "running") return;
    await finishTurn(ctx, turn, status, error);
  },
});

/**
 * The cron sweeper (crons.ts, every minute): fail turns past their deadline, finish cancellations whose step died,
 * and deny confirmations nobody answered.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of ["running", "awaiting_confirmation", "cancelling"] as const) {
      for (const turn of await ctx.db.query("assistantTurns").withIndex("by_status_deadline", q => q.eq("status", status).lt("deadline", now)).take(50)) {
        await finishTurn(ctx, turn, status === "cancelling" ? "cancelled" : "failed", status === "cancelling" ? undefined : { code: "DEADLINE", message: "The turn ran past its 10-minute deadline" });
      }
    }
    for (const turn of await ctx.db.query("assistantTurns").withIndex("by_status_deadline", q => q.eq("status", "cancelling")).take(50)) {
      if (turn.updatedAt < now - CANCEL_GRACE_MS) await finishTurn(ctx, turn, "cancelled");
    }
    for (const call of await ctx.db.query("assistantToolCalls").withIndex("by_status_deadline", q => q.eq("status", "awaiting_confirmation").lt("confirmDeadline", now)).take(50)) {
      await denyCall(ctx, call, "timeout");
      const turn = await ctx.db.get(call.turnId);
      if (turn?.status === "awaiting_confirmation") await resume(ctx, turn);
    }
  },
});

/** A cancellation the step never acknowledged (it died or never ran): finish it. */
export const finalizeCancel = internalMutation({
  args: { turnId: v.id("assistantTurns") },
  handler: async (ctx, { turnId }) => {
    const turn = await ctx.db.get(turnId);
    if (turn?.status === "cancelling") await finishTurn(ctx, turn, "cancelled");
  },
});
