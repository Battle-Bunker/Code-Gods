import { defineTable } from "convex/server";
import { v } from "convex/values";
import { languageV } from "../lib/language";

/**
 * Rooms, games, objects, agents, events, chat, receipts, AI library and budgets (owned by convex/game).
 *
 * God ids are strings: a human's Replit subject, or "ai:<uuid>" for an AI seat. Private fields (never
 * returned raw by a public function): deities.utility/card, objects.scores, agents.source (owner only),
 * games.endAtWorld, members.aiAgent.prompt, tickBatches.events[].net (per-god net bits). Private while the game is LIVE:
 * once it has ended, player.replay reveals all of it to its players (docs/replay-design.md), except the season salt.
 */
const kind = v.union(v.literal("human"), v.literal("ai"));
const phase = v.union(v.literal("planning"), v.literal("running"), v.literal("paused"), v.literal("recovery"), v.literal("ended"));
/**
 * LEGACY: where settings came from before every room ran a setup (setupId). Only rooms and games stored before the
 * setups-v2 migration (convex/migrations.ts) carry it; the migration clears it, and nothing writes it.
 */
export const settingsOriginV = v.object({ kind: v.union(v.literal("setup"), v.literal("custom"), v.literal("preset")), id: v.optional(v.string()), modified: v.boolean() });
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
const rosterEntry = v.object({ id: v.string(), name: v.string(), kind });
const account = v.object({ balance: v.number(), settledWorldSeconds: v.number() });
const breakdown = v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number() });
const charge = v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number(), total: v.number(), naming: v.number() });

/**
 * One entry of the event log (schema EVENT_LOG_SCHEMA, lib/world.ts; docs/replay-design.md §2). `net` is every roster
 * god's net bits of the object AFTER the event, in roster order: server-private, projected per viewer to its own bits
 * and the peer aggregate. Together with the game document's fixed header (settings, roster, createdAt, planningEndsAt)
 * and the chat rows stamped with the game, the log replays the game exactly by playing back recorded outcomes:
 * nothing is re-run. `noise` (PRIVATE, settings.peerNoiseBits) is the disclosure noise on the peers' sum of this version
 * of the object while the game is live. `summon` carries the agent's whole record (its source is PRIVATE to its owner); an agent's account
 * then follows from its acts' charges (lib/player-client replay.ts).
 */
export const eventV = v.union(
  v.object({ t: v.literal("spawn"), objectId: v.string(), value: wire, version: v.number(), world: v.number(), net: v.array(v.number()), noise: v.optional(v.number()) }),
  v.object({
    t: v.literal("transform"), objectId: v.string(), before: wire, value: wire, version: v.number(), world: v.number(),
    agentId: v.string(), ownerId: v.string(), calls: v.any(), cost: charge, net: v.array(v.number()), noise: v.optional(v.number()),
    /** The act's seed (decimal), derived from the secret season salt by HMAC: revealing it reveals nothing else (schema 3). */
    seed: v.optional(v.string()),
  }),
  v.object({
    t: v.literal("fail"), objectId: v.string(), world: v.number(), agentId: v.string(), ownerId: v.string(),
    reason: v.string(), cost: charge, seed: v.optional(v.string()),
  }),
  v.object({ t: v.literal("phase"), phase, world: v.number(), reason: v.optional(v.string()) }),
  v.object({
    t: v.literal("summon"), agentId: v.string(), ownerId: v.string(), world: v.number(), language: v.string(), source: v.string(),
    summonCost: v.number(), decisionBits: v.number(), expectedActCost: v.number(), perActFloorBits: v.number(),
    breakdown, randomized: v.boolean(), account,
  }),
  v.object({ t: v.literal("destroy"), agentId: v.string(), ownerId: v.string(), world: v.number() }),
);

export const gameTables = {
  rooms: defineTable({
    /** Short code from the room GUID (Crockford base32 prefix); `encoded` is the full 26-digit encoding. */
    shortCode: v.string(), guid: v.string(), encoded: v.string(),
    ownerId: v.string(), createdAt: v.number(),
    /** Settings revision for optimistic concurrency; `seq` counts every room change (observation revision). */
    revision: v.number(), seq: v.number(),
    settings: v.any(),
    /**
     * The game setup the room runs (convex/setups.ts): `settings` is a snapshot of its settings when it was applied, and
     * `setupName` its name then (shown with "(deleted)" once the setup is gone). Absent only on rooms stored before the
     * setups-v2 migration.
     */
    setupId: v.optional(v.id("gameSetups")), setupName: v.optional(v.string()),
    /** LEGACY (pre setups-v2; cleared by the migration). */
    settingsOrigin: v.optional(settingsOriginV),
    aiBudget: v.number(), aiUsed: v.number(), aiReservedUsd: v.number(), aiInputTokens: v.number(), aiOutputTokens: v.number(),
    aiCalls: v.array(v.number()),
    /**
     * The in-client assistant pool (assistant/*): tokens per human per game approved by the owner (absent or 0 = off)
     * and the model's catalog id. Its usage counters live in assistantAllowances, off this hot document.
     */
    assistantBudget: v.optional(v.number()), assistantModel: v.optional(v.string()),
    /** The active game (not ended), and the room's current game slot (active, or the latest until the next launch). */
    activeGameId: v.optional(v.id("games")), currentGameId: v.optional(v.id("games")),
    /**
     * A start waiting for calibration tables computed on demand (owner.ts start, docs/analytic-calibration/architecture.md
     * §3.4): the deal is fixed (`deals`, private: never projected), `pending` lists the table keys not ready yet, and the
     * game begins (planning clock and all) when the last one lands. `error` is set when a table could not be computed;
     * the owner starts again (or ends the preparation).
     */
    preparing: v.optional(v.object({
      requestId: v.string(), ownerId: v.string(), startedAt: v.number(), revision: v.number(), memberIds: v.array(v.string()),
      instance: v.string(), total: v.number(), pending: v.array(v.string()), estimateSeconds: v.number(),
      deals: v.array(v.object({ godId: v.string(), utility: v.any() })),
      dealer: v.object({ selectorId: v.string(), dealtAs: v.string(), note: v.optional(v.string()) }),
      error: v.optional(v.string()),
      /** Progress in computation pieces (a split table is several, architecture.md §3.2): done of total, for the waited keys. */
      pieces: v.optional(v.object({ done: v.number(), total: v.number() })),
    })),
  }).index("by_short_code", ["shortCode"]).index("by_encoded", ["encoded"]).index("by_guid", ["guid"]),

  members: defineTable({
    roomId: v.id("rooms"), godId: v.string(), name: v.string(), kind, ready: v.boolean(), joinedAt: v.number(),
    /** Humans only: the Replit subject (= godId), indexed for auth's device approval (auth/rooms.ts isRoomMember). */
    userId: v.optional(v.string()),
    aiAgent: v.optional(aiAgentSnapshot), status: v.optional(v.string()),
    /** AI seats: the turn chain generation (a stale scheduled turn exits) and consecutive failures. */
    aiChain: v.optional(v.number()), aiFailures: v.optional(v.number()),
  }).index("by_room", ["roomId"]).index("by_room_god", ["roomId", "godId"]).index("by_god", ["godId"]).index("by_room_user", ["roomId", "userId"]),

  games: defineTable({
    roomId: v.id("rooms"), guid: v.string(), shortCode: v.string(), encoded: v.string(),
    phase, scoring: v.literal("information-v1"), seasonCommitment: v.string(),
    settings: v.any(), roster: v.array(rosterEntry),
    /** The room's setup when the game started (its id and name then), so history can name it. */
    setupId: v.optional(v.id("gameSetups")), setupName: v.optional(v.string()),
    /** LEGACY (pre setups-v2; cleared by the migration). */
    settingsOrigin: v.optional(settingsOriginV),
    createdAt: v.number(), planningEndsAt: v.number(), pauseEndsAt: v.number(),
    worldSeconds: v.number(), lastTick: v.number(), nextSpawn: v.number(),
    /** PRIVATE: the sampled lifetime in world seconds. Never projected. */
    endAtWorld: v.number(),
    /** PRIVATE: the key of the live disclosure noise per object value (engine/node.ts disclosureNoise). Never projected. */
    noiseKey: v.optional(v.string()),
    executionEpoch: v.number(),
    /** Engine loop lease: only the commit holding `seq` schedules `seq + 1`; the watchdog restarts expired leases. */
    tick: v.object({ seq: v.number(), leaseUntil: v.number() }),
    /** Next tickBatches sequence number. */
    nextBatch: v.number(),
    objectCount: v.number(),
    /** Live agents (summon +1, destroy −1), so the public view never reads agent documents to count them. */
    agentCount: v.optional(v.number()),
    autoResume: v.optional(v.boolean()), recoveryReason: v.optional(v.string()),
    endedAt: v.optional(v.number()), endReason: v.optional(v.union(v.literal("lifetime"), v.literal("owner"))),
    /**
     * The published scoreboard (docs/public-log-design.md §3): every roster god's total payoff, roster order, as the
     * leaderboard shows it, published at world time `world` (wall `at`) by the first commit reaching the next multiple of
     * settings.scoreIntervalSeconds, at the start and at the end. Public. Absent on games started before it existed
     * (their leaderboard is live).
     */
    scoreboard: v.optional(v.object({ totals: v.array(v.number()), world: v.number(), at: v.number() })),
    /** Public result, written in the commit that ends the game. */
    summary: v.optional(v.any()),
    stats: v.object({ acts: v.number(), commits: v.number(), discarded: v.number(), opportunities: v.number() }),
  }).index("by_room", ["roomId"]).index("by_short_code", ["shortCode"]).index("by_encoded", ["encoded"])
    .index("by_guid", ["guid"]).index("by_phase", ["phase"]),

  deities: defineTable({
    gameId: v.id("games"), godId: v.string(), index: v.number(),
    /** PRIVATE: the dealt utility descriptor and its kid card (shown to its own god only). */
    utility: v.any(), card: v.any(),
    /** PRIVATE: an AI seat's library agent, snapshotted at start (lobby edits never change a running seat). */
    aiAgent: v.optional(aiAgentSnapshot),
    spent: v.number(), pauseUsed: v.boolean(),
  }).index("by_game", ["gameId"]).index("by_game_god", ["gameId", "godId"]),

  objects: defineTable({
    gameId: v.id("games"), value: wire, version: v.number(),
    /** PRIVATE: every god's score of the current value. */
    scores: v.array(scoreV),
    /** Public: Σ net bits (disclosed live with `noise` added). */
    salience: v.number(),
    /** PRIVATE: the live disclosure noise on this value's peers' sums and salience (settings.peerNoiseBits). */
    noise: v.optional(v.number()),
  }).index("by_game", ["gameId"]).index("by_game_value", ["gameId", "value"]),

  agents: defineTable({
    gameId: v.id("games"), ownerId: v.string(),
    /** PRIVATE to the owner. */
    source: v.string(), createdAt: v.number(),
    /** The language the source is written in (one the game allows). Absent on agents from single-language games: lib/language agentLanguage. */
    language: v.optional(languageV),
    summonCost: v.number(), decisionBits: v.number(), perActFloorBits: v.number(), expectedActCost: v.number(),
    breakdown, randomized: v.boolean(), account, acts: v.number(), spent: v.number(),
  }).index("by_game", ["gameId"]).index("by_game_owner", ["gameId", "ownerId"]),

  /** The event log: one doc per committed tick (a large tick is split over several docs). */
  tickBatches: defineTable({
    gameId: v.id("games"), seq: v.number(), at: v.number(), worldFrom: v.number(), worldTo: v.number(),
    events: v.array(eventV),
    /** The event schema this batch was written with (EVENT_LOG_SCHEMA); absent on batches written before schema 2. */
    schema: v.optional(v.number()),
    /**
     * Every roster god's exact total payoff after this batch, in roster order, on batches that change scores (spawns,
     * transforms) and on batches that publish the scoreboard. Server-exact: a LIVE game never projects it (a live replay
     * shows `scoreboard` on the publishing batches instead, docs/public-log-design.md §3); an ended game's replay shows it.
     */
    totals: v.optional(v.array(v.number())),
    /**
     * Schema 3: this batch's commit published the live scoreboard, as disclosed (every god's total from the noisy peers'
     * sums, settings.peerNoiseBits): games.scoreboard.totals. A live replay shows these, never the exact `totals`.
     */
    scoreboard: v.optional(v.array(v.number())),
    /** Engine sample of the commit that wrote this batch: acts, world window, simulate time, previous commit round trip. */
    perf: v.optional(v.object({ acts: v.number(), window: v.number(), simulateMs: v.number(), commitMs: v.optional(v.number()) })),
  }).index("by_game_seq", ["gameId", "seq"]),

  /**
   * The per-object history (docs/public-log-design.md §2): one row per spawn and transform, written in the same commit
   * as its tickBatches event. `net` is every roster god's net bits of the object AFTER the event, in roster order:
   * SERVER-PRIVATE, projected per viewer to its own bits, the others' sum and the product. `agentId`, `ownerId` and
   * `calls` are private while the game is live (only the owner sees their own). The state of any object at world time t
   * is its last row at or before t (by_game_object_world); an object's previous row is version − 1 (by_game_object_version).
   */
  objectEvents: defineTable({
    gameId: v.id("games"), objectId: v.id("objects"), seq: v.number(), world: v.number(),
    kind: v.union(v.literal("spawn"), v.literal("transform")),
    before: v.optional(wire), value: wire, version: v.number(),
    calls: v.optional(v.any()), agentId: v.optional(v.string()), ownerId: v.optional(v.string()),
    net: v.array(v.number()),
    /** PRIVATE: the live disclosure noise on this version's others' sums (settings.peerNoiseBits). */
    noise: v.optional(v.number()),
  }).index("by_game_world", ["gameId", "world"]).index("by_game_object_world", ["gameId", "objectId", "world"])
    .index("by_game_object_version", ["gameId", "objectId", "version"]),

  /**
   * Large, rarely written public data kept OFF the hot docs (the game doc is rewritten every tick and Convex
   * keeps every revision): the utility catalog of a room's next game ("room:<id>") or of a game ("game:<id>").
   */
  catalogs: defineTable({ key: v.string(), catalog: v.any(), revision: v.number() }).index("by_key", ["key"]),

  chat: defineTable({
    roomId: v.id("rooms"), authorId: v.string(), authorName: v.string(), kind, text: v.string(), timestamp: v.number(),
    /** Sent while a game was live (planning to recovery): that game and its world time then, for its replay. */
    gameId: v.optional(v.id("games")), world: v.optional(v.number()),
  }).index("by_room", ["roomId", "timestamp"]).index("by_room_author", ["roomId", "authorId", "timestamp"]),

  /**
   * Agent examinations (validate and summon run the agent a few hundred times in the sandbox) in the last minute,
   * per human per room: the abuse cap of game/commands.ts claimExamination. Rows older than the window are deleted
   * by the next claim of the same human.
   */
  examinations: defineTable({ roomId: v.id("rooms"), godId: v.string(), at: v.number() }).index("by_room_god_at", ["roomId", "godId", "at"]),

  receipts: defineTable({
    roomId: v.id("rooms"), actorId: v.string(), requestId: v.string(), hash: v.string(), result: v.any(), createdAt: v.number(),
  }).index("by_key", ["roomId", "actorId", "requestId"]),

  aiTemplates: defineTable({
    templateId: v.string(), name: v.string(), provider: v.union(v.literal("anthropic"), v.literal("openai")), model: v.string(),
    prompt: v.string(), revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    /** Deleted templates stay as tombstones so seeding never recreates them. */
    deleted: v.boolean(),
  }).index("by_template", ["templateId"]).index("by_deleted", ["deleted"]),

  /**
   * The catalogue of game setups (convex/setups.ts): complete next-game settings with a name, one shared collection
   * everyone sees. `ownerId` null marks a system setup (game-core SEED_SETUPS, kept equal to the code by `seedId`,
   * editable and deletable by nobody); otherwise the human who created it, the only one who may change it.
   */
  gameSetups: defineTable({
    ownerId: v.union(v.string(), v.null()),
    /** 1–40 characters. */
    name: v.string(),
    /** A complete GameSettings, valid and offered when saved. */
    settings: v.any(),
    /** One plain sentence for the setup menu. */
    summary: v.string(),
    seedId: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(),
    /** LEGACY: a tombstone an admin's removal of a seed left before setups-v2; the seed sync clears it. */
    deleted: v.optional(v.boolean()),
  }).index("by_owner", ["ownerId"]).index("by_seed", ["seedId"]),

  /** Host-wide AI spend per UTC day (the $5/day ceiling across rooms for seats; the assistant's own ceiling). */
  aiUsage: defineTable({
    day: v.string(), usd: v.number(), calls: v.number(),
    /** The in-client assistant's pool, counted separately (DAILY_ASSISTANT_USD). */
    assistantUsd: v.optional(v.number()), assistantCalls: v.optional(v.number()),
  }).index("by_day", ["day"]),

  /** Singleton (key "global"): the last authenticated human activity, which drives idle parking. */
  activity: defineTable({ key: v.string(), lastHumanActivityAt: v.number() }).index("by_key", ["key"]),
};
