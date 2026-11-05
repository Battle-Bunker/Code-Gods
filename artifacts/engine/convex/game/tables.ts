import { defineTable } from "convex/server";
import { v } from "convex/values";
import { storedLanguageV } from "../lib/language";

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
const leaseV = v.object({ seq: v.number(), leaseUntil: v.number() });
const statsV = v.object({ acts: v.number(), commits: v.number(), discarded: v.number(), opportunities: v.number() });
const scoreboardV = v.object({ totals: v.array(v.number()), world: v.number(), at: v.number() });
const account = v.object({ balance: v.number(), settledWorldSeconds: v.number() });
/** An agent's estimated cost per act, split (docs/energy-model.md §5): the bits it reads and its change. */
const agentBreakdown = v.object({ read: v.number(), change: v.number() });
/** A summon event's estimate: an agent's, or (event-log schema ≤ 4 history) the decision/erasure/motion/floor split. */
const breakdown = v.union(agentBreakdown, v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number() }));
/**
 * One act's charge (docs/energy-model.md §2): what it read plus its change when that committed. Event-log schema ≤ 4
 * (history) carries the older split, which stays readable by schema.
 */
const charge = v.union(
  v.object({ read: v.number(), change: v.number(), total: v.number() }),
  v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number(), total: v.number(), naming: v.number() }),
);

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
  /** An act that returned no calls (schema 5): it paid its reads; not a failure (docs/energy-model.md §2). */
  v.object({
    t: v.literal("skip"), objectId: v.string(), world: v.number(), agentId: v.string(), ownerId: v.string(), cost: charge, seed: v.optional(v.string()),
  }),
  v.object({ t: v.literal("phase"), phase, world: v.number(), reason: v.optional(v.string()) }),
  v.object({
    t: v.literal("summon"), agentId: v.string(), ownerId: v.string(), world: v.number(), language: v.string(), source: v.string(),
    name: v.optional(v.string()), description: v.optional(v.string()),
    summonCost: v.number(), expectedActCost: v.number(),
    /** Its share of the owner's power at the summon (schema 6; docs/energy-model.md §6). */
    powerShare: v.optional(v.number()),
    /** LEGACY (schema ≤ 4 history): the decision price and the per-act floor, no longer charged. */
    decisionBits: v.optional(v.number()), perActFloorBits: v.optional(v.number()),
    breakdown, randomized: v.boolean(), account,
  }),
  v.object({ t: v.literal("destroy"), agentId: v.string(), ownerId: v.string(), world: v.number() }),
  /** The hold corrections arrived during planning (schema 7): the object re-scored with them, before the world ran. */
  v.object({ t: v.literal("rescore"), objectId: v.string(), value: wire, version: v.number(), world: v.number(), net: v.array(v.number()), noise: v.optional(v.number()) }),
  /** The owner re-allocated its power (schema 6): the agent's share from `world` on. */
  v.object({ t: v.literal("power"), agentId: v.string(), ownerId: v.string(), world: v.number(), share: v.number() }),
);

/** An agent's failure breakdown (lib/futility.ts FAILURE_KINDS) and the last reason of the kinds the diagnosis quotes. */
export const failuresV = v.object({ collision: v.number(), noChange: v.number(), commit: v.number(), invalid: v.number(), error: v.number() });
export const lastFailuresV = v.object({ invalid: v.optional(v.string()), error: v.optional(v.string()) });
/** One agent's futile pairs (lib/futility.ts Futile). */
export const futileEntriesV = v.array(v.object({ o: v.id("objects"), v: v.number(), by: v.optional(v.id("objects")), bv: v.optional(v.number()) }));

export const gameTables = {
  /**
   * Hold-rarity correction tables (docs/energy-model.md §8), computed on demand and kept: one per (static table key, m,
   * noise version) in `key` (engine/hold.ts holdCacheKey). Engine only, never projected.
   */
  holdTables: defineTable({ key: v.string(), table: v.any(), computedAt: v.number() }).index("by_key", ["key"]),

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
    /**
     * The AI players' per-game token quota (all AI seats of one game together; 0 = none) and this game's counters.
     */
    aiQuota: v.number(),
    aiUsed: v.number(), aiReservedUsd: v.number(), aiInputTokens: v.number(), aiOutputTokens: v.number(),
    aiCalls: v.array(v.number()),
    /**
     * The in-client assistant (assistant/*): each player's per-game token quota (0 = none) and the model's catalog id.
     * Its usage counters live in assistantAllowances, off this hot document.
     */
    assistantQuota: v.number(), assistantModel: v.optional(v.string()),
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
    /**
     * Watches the next game instead of playing it (docs/unify-apps-plan.md §2): not dealt in, not counted toward the
     * 3 to 8 players. A preference for the next game; a running game's roster never changes. The owner starts as one;
     * AI seats never are.
     */
    spectator: v.boolean(),
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
    /**
     * The room's human members who watch this game: everyone not dealt in at launch, and whoever joins while it runs.
     */
    spectators: v.array(v.string()),
    /** The room's setup when the game started (its id and name then), so history can name it. */
    setupId: v.optional(v.id("gameSetups")), setupName: v.optional(v.string()),
    /** LEGACY (pre setups-v2; cleared by the migration). */
    settingsOrigin: v.optional(settingsOriginV),
    createdAt: v.number(), planningEndsAt: v.number(), pauseEndsAt: v.number(),
    /** PRIVATE: the sampled lifetime in world seconds. Never projected. */
    endAtWorld: v.number(),
    /** PRIVATE: the key of the live disclosure noise per object value (engine/node.ts disclosureNoise). Never projected. */
    noiseKey: v.optional(v.string()),
    executionEpoch: v.number(),
    autoResume: v.optional(v.boolean()), recoveryReason: v.optional(v.string()),
    /**
     * PRIVATE: the deal's calibration tables pinned by god in file storage (engine/pinned.ts), so a deploy that re-keys
     * the shipped tables never leaves this game without them. Never projected. Optional: written at the start, or by the
     * first tick of a game started before pinning (no migration: an unpinned game pins itself).
     */
    tablesStorageId: v.optional(v.id("_storage")),
    /**
     * Hold rarity (docs/energy-model.md §8): the hold corrections of a game with more than one player are computed
     * during planning (engine/hold.ts); planning waits while `computing`. Absent: none needed (one player, or a game
     * from before hold rarity). `failed` plays on static rarity, `holdError` says why.
     */
    holdState: v.optional(v.union(v.literal("computing"), v.literal("ready"), v.literal("failed"))),
    holdPending: v.optional(v.array(v.string())), holdError: v.optional(v.string()),
    /** Wall ms the hold state left `computing` (ready or failed): planning ends no earlier, like a sandbox's readyAt. */
    holdReadyAt: v.optional(v.number()),
    /**
     * Public: the engine's ticks for this game are failing and being retried with backoff (engine/loop.ts tickFailed);
     * cleared by the next tick that succeeds. Written when the failures start (or their reason changes), never per retry
     * (the count lives on gameEngine). `reason` is a fixed, non-revealing phrase (never the raw error, which may name a
     * god's family); the raw error goes to the deployment's logs.
     */
    engineError: v.optional(v.object({ reason: v.string(), since: v.number() })),
    endedAt: v.optional(v.number()), endReason: v.optional(v.union(v.literal("lifetime"), v.literal("owner"))),
    /** Public result, written in the commit that ends the game. */
    summary: v.optional(v.any()),
    /**
     * The ended game's whole replay log in file storage (convex/replays.ts), written once after the end; the replay
     * page fetches it in one read. Optional: a game ended before it existed gets one from migrations:backfillReplays,
     * and a game whose build failed keeps the paged replay (player.replay).
     */
    replayStorageId: v.optional(v.id("_storage")),
  }).index("by_room", ["roomId"]).index("by_short_code", ["shortCode"]).index("by_encoded", ["encoded"])
    .index("by_guid", ["guid"]).index("by_phase", ["phase"]),

  /**
   * A game's public clock (read-architecture §4.1, R3): what changes on every tick commit and what readers of the world
   * clock need. Kept off the games doc, which the cold queries (room, layout, my utility, history) read. One per game.
   */
  gameClocks: defineTable({
    gameId: v.id("games"),
    worldSeconds: v.number(), lastTick: v.number(), objectCount: v.number(),
    /** Live agents (summon +1, destroy −1), so the public view never reads agent documents to count them. */
    agentCount: v.number(),
    /**
     * The published scoreboard (docs/public-log-design.md §3): every roster god's total payoff, roster order, as the
     * leaderboard shows it, published at world time `world` (wall `at`) by the first commit reaching the next multiple of
     * settings.scoreIntervalSeconds, at the start and at the end. Public. Absent on games started before it existed
     * (their leaderboard is live).
     */
    scoreboard: v.optional(scoreboardV),
  }).index("by_game", ["gameId"]),

  /** The engine loop's own state of a game (internal: the loop, the watchdog and commands; never a public query). */
  gameEngine: defineTable({
    gameId: v.id("games"),
    /** Engine loop lease: only the commit holding `seq` schedules `seq + 1`; the watchdog restarts expired leases. */
    tick: leaseV,
    nextSpawn: v.number(),
    /** Next tickBatches sequence number. */
    nextBatch: v.number(),
    stats: statsV,
    /** Ticks failed in a row (engine/loop.ts tickFailed: the retry backoff); 0 or absent while the loop is healthy. */
    tickFailures: v.optional(v.number()),
  }).index("by_game", ["gameId"]),

  /**
   * The published scoreboard as standings (read-architecture §4.1, R4): one row per roster god, rewritten by the commit
   * that publishes the scoreboard (every scoreIntervalSeconds of world time, at the start and at the end), so readers
   * read at most 8 small rows instead of the hot clock or the objects. Public: the disclosed totals only.
   */
  standings: defineTable({
    gameId: v.id("games"), godId: v.string(), rank: v.number(), total: v.number(),
    /** The publication's world time and wall time. */
    world: v.number(), at: v.number(),
  }).index("by_game", ["gameId"]).index("by_game_god", ["gameId", "godId"]),

  /**
   * One row per published scoreboard (read-architecture §4.1): the race's series, read in cursor pages by `seq` (the
   * game's publications counted from 0). `totals` are in roster order, as disclosed; the live agent and object counts
   * are published with them, so the spectator page shows them without reading the hot clock. The latest row's
   * `agentCount` follows summons and destroys until the next publication (game/readModel.ts recountAgents).
   */
  standingsHistory: defineTable({
    gameId: v.id("games"), seq: v.number(), world: v.number(), at: v.number(), totals: v.array(v.number()),
    agentCount: v.number(), objectCount: v.number(),
  }).index("by_game_seq", ["gameId", "seq"]),

  /**
   * PRIVATE to `godId`: its agents' energy at world time `world`, one row per god with agents per scoreboard publication
   * (game/agentSeries.ts): the agents panel's series, paged by player.agentSeries.
   */
  agentSamples: defineTable({
    gameId: v.id("games"), godId: v.string(), world: v.number(), agents: v.array(v.object({ id: v.string(), energy: v.number() })),
  }).index("by_game_god_world", ["gameId", "godId", "world"]),

  deities: defineTable({
    gameId: v.id("games"), godId: v.string(), index: v.number(),
    /** PRIVATE: the dealt utility descriptor and its kid card (shown to its own god only). */
    utility: v.any(), card: v.any(),
    /** PRIVATE: an AI seat's library agent, snapshotted at start (lobby edits never change a running seat). */
    aiAgent: v.optional(aiAgentSnapshot),
    /** Summon prices paid in total (history: the replay's per-god spending). */
    spent: v.number(), pauseUsed: v.boolean(),
    /** PRIVATE: the deity's own energy on world time and the share of its power its agents hold (docs/energy-model.md §6). */
    account, allocated: v.number(),
  }).index("by_game", ["gameId"]).index("by_game_god", ["gameId", "godId"]),

  objects: defineTable({
    gameId: v.id("games"), value: wire, version: v.number(),
    /** PRIVATE: every god's score of the current value. */
    scores: v.array(scoreV),
    /** Public: Σ net bits (disclosed live with `noise` added). */
    salience: v.number(),
    /** PRIVATE: the live disclosure noise on this value's peers' sums and salience (settings.peerNoiseBits). */
    noise: v.optional(v.number()),
    /**
     * Public: the salience as disclosed now (read-architecture §4.3): `salience + noise` while the game is live, exact
     * once it has ended (engine/readModel.ts). The spectator's skeleton orders by it (by_game_salience) and its object
     * row shows it, so neither ever reads `noise`.
     */
    publicSalience: v.number(),
    /**
     * Public (the owner's disclosure decision, docs/public-log-design.md §2): when the object was spawned, in world
     * seconds. The tick and the game start write it. Optional while backfillObjectTimes runs; absent reads as 0.
     */
    createdAt: v.optional(v.number()),
    /**
     * Public: the world time (seconds) of the object's last transformation; absent until it has one. How many it has
     * had is `version` (the tick adds one per transformation), so there is no separate counter. Nothing here says who.
     */
    lastMutatedAt: v.optional(v.number()),
  }).index("by_game", ["gameId"]).index("by_game_value", ["gameId", "value"]).index("by_game_salience", ["gameId", "publicSalience"]),

  /**
   * PRIVATE to `godId`: one object as that god sees it (read-architecture §4.1, §4.3), one row per roster god per object,
   * so the objects panel's skeletons, its rows, the top N and a rank each read one index page or one document, never the
   * world. Only the owning god's queries read a row: other gods' scores never leave the server. The numbers are the
   * observation's (lib/views.ts viewRowOf): live, the others' sum carries the value's disclosure noise; once ended, exact.
   * The public figures (version = mutations, createdAt, lastMutatedAt) are copied so every sort is one index.
   * Written off the tick's commit by game/objectViews.ts (a scheduled sync of the objects the commit changed, which
   * reads the objects as they are then), filled at the start and after hold rescoring, and made exact at the end.
   */
  objectViews: defineTable({
    gameId: v.id("games"), godId: v.string(), objectId: v.id("objects"), value: wire, version: v.number(),
    createdAt: v.number(), lastMutatedAt: v.optional(v.number()),
    ordinal, rewardBits: v.number(), penaltyBits: v.optional(v.number()), netBits: v.number(),
    peerNetBits: v.number(), peerCare: v.number(), payoff: v.number(),
  }).index("by_object_god", ["objectId", "godId"])
    .index("by_game_god_payoff", ["gameId", "godId", "payoff"])
    .index("by_game_god_netBits", ["gameId", "godId", "netBits"])
    .index("by_game_god_peer", ["gameId", "godId", "peerCare"])
    .index("by_game_god_version", ["gameId", "godId", "version"])
    .index("by_game_god_created", ["gameId", "godId", "createdAt"])
    .index("by_game_god_mutated", ["gameId", "godId", "lastMutatedAt"]),

  /**
   * PRIVATE to `godId`: that god's totals over every object as disclosed (lib/views.ts GodTotals): the objects panel's
   * footer and counts, the overview's score. Computed by the tick from its snapshot (or from every object at the start,
   * after rescoring and at the end) and written with the read-model sync; `world` orders the writes (an older one never
   * replaces a newer).
   */
  godTotals: defineTable({
    gameId: v.id("games"), godId: v.string(), world: v.number(), objectCount: v.number(), score: v.number(),
    sumOwnNetBits: v.number(), sumPeerNetBits: v.number(), contested: v.number(), chips: v.number(),
    maxOwn: v.number(), maxCare: v.number(), maxPayoff: v.number(), minPayoff: v.number(),
  }).index("by_game_god", ["gameId", "godId"]),

  agents: defineTable({
    gameId: v.id("games"), ownerId: v.string(),
    /** PRIVATE to the owner (and shown to everyone in the ended game's replay). */
    source: v.string(), createdAt: v.number(),
    /** The owner's name and description for it (summon requires the name; agents from before it carry neither: lib/projection defaults the name). */
    name: v.optional(v.string()), description: v.optional(v.string()),
    /** The language the source is written in (one the game allows). Absent on agents from single-language games: lib/language agentLanguage. */
    language: v.optional(storedLanguageV),
    summonCost: v.number(), expectedActCost: v.number(),
    /** Its share of the owner's power (docs/energy-model.md §6). */
    powerShare: v.number(),
    breakdown: agentBreakdown, randomized: v.boolean(), account, acts: v.number(), spent: v.number(),
    /** Of `spent`, the bits its acts read (the rest paid for changes), counted since this field existed; absent: none yet. */
    spentRead: v.optional(v.number()),
    /** Acts that returned no calls (docs/energy-model.md §2), counted since the energy model; absent: none yet. */
    skips: v.optional(v.number()),
    /** World time of its last opportunity: the per-agent cap (game-core MAX_AGENT_OPPORTUNITY_HZ); absent: none yet. */
    lastOpportunityWorld: v.optional(v.number()),
    /**
     * PRIVATE to the owner: how its acts ended (lib/futility.ts FAILURE_KINDS), counted by the tick since this field
     * existed (an older agent's earlier acts are not in it), and the last invalid call's and runtime error's reasons. lib/projection agentView
     * turns them into the owner's diagnosis.
     */
    transforms: v.optional(v.number()),
    failures: v.optional(failuresV),
    lastFailures: v.optional(lastFailuresV),
  }).index("by_game", ["gameId"]).index("by_game_owner", ["gameId", "ownerId"]),

  /**
   * Engine only (the tick's snapshot and commit; no query reads it): one agent's futile pairs (lib/futility.ts), the
   * objects its deterministic act can only fail on until they (or a colliding value's holder) change version.
   */
  futileActs: defineTable({
    gameId: v.id("games"), agentId: v.id("agents"),
    entries: futileEntriesV,
  }).index("by_game", ["gameId"]).index("by_agent", ["agentId"]),

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
    /**
     * The event's position in its tickBatches doc (`seq`), and a transform's charge (cost.total): the observation's
     * recent own transformations read these rows instead of the batches. `cost` is absent on spawns (rows written before
     * 2026-11-03 were placed by the objectEventPlaces migration).
     */
    index: v.number(), cost: v.optional(v.number()),
  }).index("by_game_world", ["gameId", "world"]).index("by_game_object_world", ["gameId", "objectId", "world"])
    .index("by_game_object_version", ["gameId", "objectId", "version"])
    /** A god's transformations in log order (spawns have no owner): the observation's recent own transformations. */
    .index("by_game_owner_seq", ["gameId", "ownerId", "seq"]),

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
    /**
     * The catalogue's order and search (setups.ts listingOf; read-architecture R1/R2): `order` is a system setup's seed
     * position, else OTHERS_ORDER; `nameKey` the name with case and accents folded; `searchText` name, owner and summary.
     */
    order: v.number(), nameKey: v.string(), searchText: v.string(),
  }).index("by_owner", ["ownerId"]).index("by_seed", ["seedId"])
    /** The catalogue's order: the system's in seed order, then everyone's by name (setups.page). */
    .index("by_order", ["order", "nameKey"])
    .searchIndex("search", { searchField: "searchText" }),

  /** Host-wide AI spend per UTC day (the $5/day ceiling across rooms for seats; the assistant's own ceiling). */
  aiUsage: defineTable({
    day: v.string(), usd: v.number(), calls: v.number(),
    /** The in-client assistant's pool, counted separately (DAILY_ASSISTANT_USD). */
    assistantUsd: v.optional(v.number()), assistantCalls: v.optional(v.number()),
  }).index("by_day", ["day"]),

  /** Singleton (key "global"): the last authenticated human activity, which drives idle parking. */
  activity: defineTable({ key: v.string(), lastHumanActivityAt: v.number() }).index("by_key", ["key"]),
};
