/**
 * The in-client assistant's tables (v2/assistant.ts). Everything is per (room, human, game): a thread belongs to the
 * game that was current when it started (`gameId` absent: before the room's first game), so a new game starts with no
 * thread, and an earlier game's threads can be read, never continued. Message text, tool arguments and results are
 * private to the thread's human: only the queries in v2/assistant.ts read them, and they check the user.
 */
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const modeV = v.union(v.literal("autopilot"), v.literal("onRequest"), v.literal("readOnly"));
export const grantV = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));
export const turnStatusV = v.union(v.literal("running"), v.literal("cancelling"), v.literal("done"), v.literal("failed"),
  v.literal("cancelled"), v.literal("budget"));

export const assistantTables = {
  v2AssistantThreads: defineTable({
    roomId: v.id("v2Rooms"), userId: v.string(), gameId: v.optional(v.id("v2Games")), title: v.string(),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_room_user_game", ["roomId", "userId", "gameId", "updatedAt"]),
  /** One answer: a model run (lib/v2-ai runAssistant) over the thread so far, to a message or an autopilot prompt. */
  v2AssistantTurns: defineTable({
    threadId: v.id("v2AssistantThreads"), roomId: v.id("v2Rooms"), userId: v.string(), gameId: v.optional(v.id("v2Games")),
    status: turnStatusV, trigger: v.optional(v.literal("autopilot")), grant: grantV, mode: modeV,
    steps: v.number(), tokens: v.number(), usd: v.number(), error: v.optional(v.string()),
    createdAt: v.number(), finishedAt: v.optional(v.number()),
  }).index("by_room_user", ["roomId", "userId", "createdAt"]).index("by_thread", ["threadId", "createdAt"]),
  /**
   * The conversation: the human's text ("user"), each model step's blocks ("assistant", `text` its words) and each
   * step's tool results ("tool"). `contentJson` is the provider-neutral message (lib/v2-ai ChatMessage content).
   */
  v2AssistantMessages: defineTable({
    threadId: v.id("v2AssistantThreads"), turnId: v.id("v2AssistantTurns"), seq: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    text: v.string(), contentJson: v.optional(v.string()), autopilot: v.optional(v.boolean()), createdAt: v.number(),
  }).index("by_thread_seq", ["threadId", "seq"]),
  /** A tool call as it ran (the pane's activity chips): written when it finishes. */
  v2AssistantCalls: defineTable({
    turnId: v.id("v2AssistantTurns"), threadId: v.id("v2AssistantThreads"), index: v.number(), tool: v.string(),
    argsJson: v.string(), ok: v.boolean(), summary: v.string(), createdAt: v.number(),
  }).index("by_turn", ["turnId", "index"]),
  /**
   * Messages sent while a turn ran: they start the next turn when it ends. `held`: kept through a Stop or a failed
   * turn, sent by `assistant.sendQueued` (or the human's next message).
   */
  v2AssistantQueue: defineTable({
    roomId: v.id("v2Rooms"), userId: v.string(), threadId: v.id("v2AssistantThreads"), text: v.string(),
    status: v.union(v.literal("queued"), v.literal("delivered"), v.literal("removed")), held: v.optional(v.boolean()),
    /** Sent by a delegate with fewer rights than the human's assistant has: the turn runs with at most these. */
    cap: v.optional(grantV),
    createdAt: v.number(),
  }).index("by_room_user_status", ["roomId", "userId", "status", "createdAt"]),
  /** The human's choice per room, kept across its games: mode and grant; `chain` retires stale autopilot ticks. */
  v2AssistantPrefs: defineTable({
    roomId: v.id("v2Rooms"), userId: v.string(), mode: modeV, grant: grantV, chain: v.number(),
  }).index("by_room_user", ["roomId", "userId"]),
};
