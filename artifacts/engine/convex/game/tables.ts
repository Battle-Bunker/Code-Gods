import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Rooms, games, objects, agents, events, chat, receipts, AI library and budgets (owned by convex/game).
 *
 * God ids are strings: a human's Replit subject, or "ai:<uuid>" for an AI seat. Private fields (never
 * returned raw by a public function): deities.utility/card, objects.scores, agents.source (owner only),
 * games.endAtWorld, members.aiAgent.prompt, tickBatches.events[].net (per-god net bits).
 */
const kind = v.union(v.literal("human"), v.literal("ai"));
const phase = v.union(v.literal("planning"), v.literal("running"), v.literal("paused"), v.literal("recovery"), v.literal("ended"));
const wire = v.union(v.number(), v.string());
const ordinal = v.union(v.number(), v.array(v.number()));
/** One god's private score of one object (game-utilities GodScore plus the god id). */
export const scoreV = v.object({
  god: v.string(), ordinal, rewardBits: v.number(), netBits: v.number(),
  penaltyOrdinal: v.optional(ordinal), penaltyBits: v.optional(v.number()),
});
const aiAgentSnapshot = v.object({
  id: v.string(), name: v.string(), provider: v.union(v.literal("anthropic"), v.literal("openai")), model: v.string(),
  prompt: v.string(), revision: v.number(),
});
const rosterEntry = v.object({ id: v.string(), name: v.string(), kind, aiAgent: v.optional(aiAgentSnapshot) });
const account = v.object({ balance: v.number(), settledWorldSeconds: v.number() });
const breakdown = v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number() });
const charge = v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number(), total: v.number(), naming: v.number() });

/**
 * One entry of the event log. `net` is every roster god's net bits of the object AFTER the event, in roster
 * order: server-private, projected per viewer to its own bits and the peer aggregate.
 */
export const eventV = v.union(
  v.object({ t: v.literal("spawn"), objectId: v.string(), value: wire, version: v.number(), world: v.number(), net: v.array(v.number()) }),
  v.object({
    t: v.literal("transform"), objectId: v.string(), before: wire, value: wire, version: v.number(), world: v.number(),
    agentId: v.string(), ownerId: v.string(), calls: v.any(), cost: charge, net: v.array(v.number()),
  }),
  v.object({
    t: v.literal("fail"), objectId: v.string(), world: v.number(), agentId: v.string(), ownerId: v.string(),
    reason: v.string(), cost: charge,
  }),
  v.object({ t: v.literal("phase"), phase, world: v.number(), reason: v.optional(v.string()) }),
);

export const gameTables = {
  rooms: defineTable({
    /** Short code from the room GUID (Crockford base32 prefix); `encoded` is the full 26-digit encoding. */
    shortCode: v.string(), guid: v.string(), encoded: v.string(),
    ownerId: v.string(), createdAt: v.number(),
    /** Settings revision for optimistic concurrency; `seq` counts every room change (observation revision). */
    revision: v.number(), seq: v.number(),
    settings: v.any(),
    /** Public catalog of the families the next game might deal (computed in Node; absent until computed). */
    utilityCatalog: v.optional(v.any()),
    aiBudget: v.number(), aiUsed: v.number(), aiReservedUsd: v.number(), aiInputTokens: v.number(), aiOutputTokens: v.number(),
    aiCalls: v.array(v.number()),
    /** The active game (not ended), and the room's current game slot (active, or the latest until the next launch). */
    activeGameId: v.optional(v.id("games")), currentGameId: v.optional(v.id("games")),
  }).index("by_short_code", ["shortCode"]).index("by_encoded", ["encoded"]).index("by_guid", ["guid"]),

  members: defineTable({
    roomId: v.id("rooms"), godId: v.string(), name: v.string(), kind, ready: v.boolean(), joinedAt: v.number(),
    aiAgent: v.optional(aiAgentSnapshot), status: v.optional(v.string()),
    /** AI seats: the turn chain generation (a stale scheduled turn exits) and consecutive failures. */
    aiChain: v.optional(v.number()), aiFailures: v.optional(v.number()),
  }).index("by_room", ["roomId"]).index("by_room_god", ["roomId", "godId"]).index("by_god", ["godId"]),

  games: defineTable({
    roomId: v.id("rooms"), guid: v.string(), shortCode: v.string(), encoded: v.string(),
    phase, scoring: v.literal("information-v1"), seasonCommitment: v.string(),
    settings: v.any(), roster: v.array(rosterEntry),
    objectInstance: v.any(), utilityCatalog: v.any(),
    createdAt: v.number(), planningEndsAt: v.number(), pauseEndsAt: v.number(),
    worldSeconds: v.number(), lastTick: v.number(), nextSpawn: v.number(),
    /** PRIVATE: the sampled lifetime in world seconds. Never projected. */
    endAtWorld: v.number(),
    executionEpoch: v.number(),
    /** Engine loop lease: only the commit holding `seq` schedules `seq + 1`; the watchdog restarts expired leases. */
    tick: v.object({ seq: v.number(), leaseUntil: v.number() }),
    /** Next tickBatches sequence number. */
    nextBatch: v.number(),
    objectCount: v.number(),
    autoResume: v.optional(v.boolean()), recoveryReason: v.optional(v.string()),
    endedAt: v.optional(v.number()), endReason: v.optional(v.union(v.literal("lifetime"), v.literal("owner"))),
    /** Public result, written in the commit that ends the game. */
    summary: v.optional(v.any()),
    stats: v.object({ acts: v.number(), commits: v.number(), discarded: v.number(), opportunities: v.number() }),
    /** Rolling engine samples (last 120 commits): acts, world window, simulate and previous commit latency (ms). */
    perf: v.optional(v.array(v.object({ seq: v.number(), acts: v.number(), window: v.number(), simulateMs: v.number(), commitMs: v.optional(v.number()), at: v.number() }))),
  }).index("by_room", ["roomId"]).index("by_short_code", ["shortCode"]).index("by_encoded", ["encoded"])
    .index("by_guid", ["guid"]).index("by_phase", ["phase"]),

  deities: defineTable({
    gameId: v.id("games"), godId: v.string(), index: v.number(),
    /** PRIVATE: the dealt utility descriptor and its kid card (shown to its own god only). */
    utility: v.any(), card: v.any(),
    spent: v.number(), pauseUsed: v.boolean(),
  }).index("by_game", ["gameId"]).index("by_game_god", ["gameId", "godId"]),

  objects: defineTable({
    gameId: v.id("games"), value: wire, version: v.number(),
    /** PRIVATE: every god's score of the current value. */
    scores: v.array(scoreV),
    /** Public: Σ net bits. */
    salience: v.number(),
  }).index("by_game", ["gameId"]).index("by_game_value", ["gameId", "value"]),

  agents: defineTable({
    gameId: v.id("games"), ownerId: v.string(),
    /** PRIVATE to the owner. */
    source: v.string(), createdAt: v.number(),
    summonCost: v.number(), decisionBits: v.number(), perActFloorBits: v.number(), expectedActCost: v.number(),
    breakdown, randomized: v.boolean(), account, acts: v.number(), spent: v.number(),
  }).index("by_game", ["gameId"]).index("by_game_owner", ["gameId", "ownerId"]),

  /** The event log: one doc per committed tick (a large tick is split over several docs). */
  tickBatches: defineTable({
    gameId: v.id("games"), seq: v.number(), at: v.number(), worldFrom: v.number(), worldTo: v.number(),
    events: v.array(eventV),
  }).index("by_game_seq", ["gameId", "seq"]),

  chat: defineTable({
    roomId: v.id("rooms"), authorId: v.string(), authorName: v.string(), kind, text: v.string(), timestamp: v.number(),
  }).index("by_room", ["roomId", "timestamp"]).index("by_room_author", ["roomId", "authorId", "timestamp"]),

  receipts: defineTable({
    roomId: v.id("rooms"), actorId: v.string(), requestId: v.string(), hash: v.string(), result: v.any(), createdAt: v.number(),
  }).index("by_key", ["roomId", "actorId", "requestId"]),

  aiTemplates: defineTable({
    templateId: v.string(), name: v.string(), provider: v.union(v.literal("anthropic"), v.literal("openai")), model: v.string(),
    prompt: v.string(), revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    /** Deleted templates stay as tombstones so seeding never recreates them. */
    deleted: v.boolean(),
  }).index("by_template", ["templateId"]).index("by_deleted", ["deleted"]),

  /** Host-wide AI spend per UTC day (the $5/day ceiling across rooms). */
  aiUsage: defineTable({ day: v.string(), usd: v.number(), calls: v.number() }).index("by_day", ["day"]),

  /** Singleton (key "global"): the last authenticated human activity, which drives idle parking. */
  activity: defineTable({ key: v.string(), lastHumanActivityAt: v.number() }).index("by_key", ["key"]),
};
