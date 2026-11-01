import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The in-client assistant (owned by convex/assistant; docs/surface-architecture.md §6). A thread is one human's
 * conversation in one room during one game (its `epoch`, the same key as the allowance's): a new game starts with no
 * thread, and an earlier game's threads stay readable by their human for that game only (assistant.threads gameId). A turn is one answer to one user message, run as a chain of scheduled model steps; each
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
/**
 * A turn's usage: provider input and output tokens, the reservations, and `billedTokens`, the allowance tokens its
 * steps used (input-price equivalent: cache reads count 0.1 at Anthropic; lib/ai-player usageCost).
 */
export const usageV = v.object({ inputTokens: v.number(), outputTokens: v.number(), reservedTokens: v.number(), reservedUsd: v.number(), billedTokens: v.optional(v.number()) });

export const assistantTables = {
  assistantThreads: defineTable({
    roomId: v.id("rooms"), subject: v.string(), title: v.string(), createdAt: v.number(), updatedAt: v.number(),
    activeTurnId: v.optional(v.id("assistantTurns")),
    /** The game the conversation belongs to: the room's current game id when it started, or "lobby" before the room's
     * first game (ai/seats.ts assistantEpoch). Absent only on rows from before games scoped threads, until the
     * assistant-per-game migration (convex/migrations.ts) gives them theirs; no scoped read returns such a row. */
    epoch: v.optional(v.string()),
  }).index("by_room_subject_epoch", ["roomId", "subject", "epoch", "updatedAt"]),

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
    /** The first message seq of the earlier history this turn replays, fixed at its first step (rules.ts historyStart). */
    historyFromSeq: v.optional(v.number()),
    /** The output ceiling of the turn's later steps, raised after a step was cut (rules.ts outputCeiling). */
    outputCeiling: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_room_subject", ["roomId", "subject"]).index("by_thread", ["threadId"]).index("by_status_deadline", ["status", "deadline"])
    .index("by_room_status", ["roomId", "status"]),

  assistantMessages: defineTable({
    threadId: v.id("assistantThreads"), turnId: v.id("assistantTurns"), seq: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    /** ≤ LIMITS.textChars (32 KB). */
    text: v.string(),
    status: v.union(v.literal("streaming"), v.literal("done"), v.literal("error"), v.literal("cancelled")),
    /** Assistant messages (one per model step): the step's budget reservation and provider usage. */
    reservedTokens: v.optional(v.number()), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()),
    /** The parts of inputTokens read from / written to the prompt cache, the allowance tokens the step used, and the
     * input estimate its reservation was made from. `usageEstimated`: a cancelled step billed from what was known. */
    cacheReadTokens: v.optional(v.number()), cacheWriteTokens: v.optional(v.number()), billedTokens: v.optional(v.number()),
    inputEstimate: v.optional(v.number()), usageEstimated: v.optional(v.boolean()),
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

  /**
   * Messages the player sent while their assistant was working (docs/surface-architecture.md §6 "Queued messages"), per
   * (room, human, game epoch) like the threads. `queued` until delivered at the turn's next step boundary (after a
   * step's tool results, assistant/store.ts deliverQueued) or as the start of the next turn, then `delivered` with
   * the message it became; `removed` by the player. `held`: kept through a Stop, sent only when the player sends again.
   * `clientId` makes a retried send the same message (the commandId pattern). Its text is private like a message's.
   */
  assistantQueue: defineTable({
    roomId: v.id("rooms"), subject: v.string(), epoch: v.string(), threadId: v.id("assistantThreads"),
    clientId: v.optional(v.string()), text: v.string(),
    status: v.union(v.literal("queued"), v.literal("delivered"), v.literal("removed")),
    held: v.optional(v.boolean()),
    turnId: v.optional(v.id("assistantTurns")), messageId: v.optional(v.id("assistantMessages")),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_key_status", ["roomId", "subject", "epoch", "status", "createdAt"])
    .index("by_thread_status", ["threadId", "status", "createdAt"])
    .index("by_room_status", ["roomId", "status"])
    .index("by_client", ["subject", "clientId"]),

  /** A player's assistant preferences per room: auto-approve summons up to this many bits (0 = always ask). A choice of
   * the player's, like their layout, not the assistant's working state, so it is kept across the room's games. */
  assistantPrefs: defineTable({ roomId: v.id("rooms"), subject: v.string(), autoApproveSummonBits: v.number() })
    .index("by_key", ["roomId", "subject"]),
};
