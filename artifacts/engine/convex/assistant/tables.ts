import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The in-client assistant (owned by convex/assistant; docs/surface-architecture.md §6). A thread is one human's
 * conversation in one room; a turn is one answer to one user message, run as a chain of scheduled model steps; each
 * step writes one assistant message (its streamed text) and the tool calls the model asked for. Allowances are the
 * assistant pool per (room, human, epoch); the epoch is the room's current game id, or "lobby" before the first game.
 * One more row per (room, epoch), with subject "", counts the room's assistant USD and call rate.
 *
 * Message text, tool arguments and results are private to the thread's human: only assistant.thread(s), which check
 * `subject`, read them, and logs never carry them.
 */
const turnStatus = v.union(
  v.literal("running"), v.literal("awaiting_confirmation"), v.literal("cancelling"),
  v.literal("done"), v.literal("failed"), v.literal("cancelled"), v.literal("budget_exhausted"),
);
const callStatus = v.union(
  v.literal("pending"), v.literal("awaiting_confirmation"), v.literal("running"), v.literal("ok"), v.literal("error"), v.literal("denied"),
);
export const usageV = v.object({ inputTokens: v.number(), outputTokens: v.number(), reservedTokens: v.number(), reservedUsd: v.number() });

export const assistantTables = {
  assistantThreads: defineTable({
    roomId: v.id("rooms"), subject: v.string(), title: v.string(), createdAt: v.number(), updatedAt: v.number(),
    activeTurnId: v.optional(v.id("assistantTurns")),
  }).index("by_room_subject", ["roomId", "subject", "updatedAt"]),

  assistantTurns: defineTable({
    threadId: v.id("assistantThreads"), roomId: v.id("rooms"), subject: v.string(), gameId: v.optional(v.string()),
    credentialId: v.id("credentials"), status: turnStatus,
    /** Chain generation: cancel and confirm bump it, so a stale scheduled step exits. */
    gen: v.number(),
    /** Model steps taken, the step ceiling and the wall-clock deadline (a cron fails turns past it). */
    step: v.number(), maxSteps: v.number(), deadline: v.number(),
    usage: usageV,
    /** The tool names offered to the model at the latest step (the grant's tools). */
    tools: v.array(v.string()),
    /** The latest step's model stop: "tool_use" continues the turn once its calls are resolved. */
    lastStop: v.optional(v.union(v.literal("end_turn"), v.literal("tool_use"))),
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
    /** The player's situation, fetched once before the turn's first model step and put in front of their message. */
    briefing: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_room_subject", ["roomId", "subject"]).index("by_thread", ["threadId"]).index("by_status_deadline", ["status", "deadline"]),

  assistantMessages: defineTable({
    threadId: v.id("assistantThreads"), turnId: v.id("assistantTurns"), seq: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    /** ≤ 16 KB. */
    text: v.string(),
    status: v.union(v.literal("streaming"), v.literal("done"), v.literal("error"), v.literal("cancelled")),
    /** Assistant messages (one per model step): the step's budget reservation and provider usage. */
    reservedTokens: v.optional(v.number()), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()),
    /** Assistant messages: the model's own blocks of the step, verbatim (thinking included), replayed in its history. */
    contentJson: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_thread_seq", ["threadId", "seq"]).index("by_turn", ["turnId"]),

  assistantToolCalls: defineTable({
    turnId: v.id("assistantTurns"), threadId: v.id("assistantThreads"), messageId: v.id("assistantMessages"),
    /** The provider's tool-use id; with turnId it derives commandId (UUIDv5). */
    callId: v.string(), index: v.number(), tool: v.string(),
    /** The exact arguments the call runs with (derived ids included), ≤ 8 KB. */
    argsJson: v.string(), status: callStatus,
    /** A short outcome for the activity chip (shown to the thread's human only). */
    summary: v.string(),
    /** The tool result as the model sees it ({untrusted: true, …} or {error}), ≤ 8 KB. */
    resultJson: v.optional(v.string()),
    commandId: v.optional(v.string()),
    /** Confirmation: when the card stops waiting (denied after), and the player's approval. */
    confirmDeadline: v.optional(v.number()), approved: v.optional(v.boolean()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_turn", ["turnId", "index"]).index("by_thread", ["threadId"]).index("by_status_deadline", ["status", "confirmDeadline"]),

  assistantAllowances: defineTable({
    roomId: v.id("rooms"), subject: v.string(), epoch: v.string(), usedTokens: v.number(),
    /** Call times in the last minute (the per-player, or for the room row the per-room, rate limit). */
    calls: v.array(v.number()),
    /** The room row only (subject "", ai/seats.ts ROOM_POOL): USD reserved this epoch (ASSISTANT_GAME_USD). */
    reservedUsd: v.optional(v.number()),
  }).index("by_key", ["roomId", "subject", "epoch"]),

  /** A player's assistant preferences per room: auto-approve summons up to this many bits (0 = always ask). */
  assistantPrefs: defineTable({ roomId: v.id("rooms"), subject: v.string(), autoApproveSummonBits: v.number() })
    .index("by_key", ["roomId", "subject"]),
};
