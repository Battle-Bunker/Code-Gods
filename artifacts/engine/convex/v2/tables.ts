/**
 * The v2 tables (integration plan §4.2, spec §10). New tables beside the v1 engine's: nothing here is shared with v1
 * except the infrastructure tables (users, credentials, auth), which v2 reads through convex/auth.
 *
 * Who is a player: a `v2Members` row (a human, a practice partner or an AI player), so every game table keys players by
 * `memberId`. Read rules (docs/convex-read-architecture.md R1–R9): hot fields (written every tick) live apart from cold
 * ones (`v2ObjectStates` vs `v2Objects`, `v2AgentEnergy` vs `v2Agents`, `v2Clocks` vs `v2Games`); per-viewer rows
 * (`v2ObjectValues`, `v2Moves`, `v2Digests`, `v2Rules`, `v2Players`) are written by the tick so a query reads one.
 *
 * v2 holds no data worth keeping yet, so these tables change shape freely (CLAUDE.md "Engine v2").
 */
import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";
import { assistantTables } from "./assistantTables.ts";
import { authorV, diagnosticV, manifestV, placementV, sizeV } from "./panelShapes.ts";

/** Why a game ended (v1's end reasons, plus a practice game its player left for another). */
export const endReasonV = v.union(v.literal("lifetime"), v.literal("owner"), v.literal("abandoned"), v.literal("retired"));
export type EndReason = Infer<typeof endReasonV>;

// ---------------------------------------------------------------- shared shapes

export const phaseV = v.union(v.literal("planning"), v.literal("live"), v.literal("paused"), v.literal("ended"));
export const memberKindV = v.union(v.literal("human"), v.literal("practice"), v.literal("ai"));
export const languageV = v.union(v.literal("typescript"), v.literal("python"));
/** A rule score on the wire: rationals as "p/q" strings, a component null when undefined; null is WORST (spec §4). */
export const scoreWireV = v.union(v.array(v.union(v.string(), v.null())), v.null());
/** One mutator call (spec §5): rationals and choices as strings. */
export const callV = v.object({ mutator: v.string(), site: v.number(), args: v.record(v.string(), v.string()) });
/** The room's overrides of its preset (affordance `room.settings`). */
export const durationModeV = v.union(v.literal("fixed"), v.literal("halfLife"));
export const retiredPointsV = v.union(v.literal("banked"), v.literal("dropped"));
/** Line turnover (retirement-design.md), frozen in a game's settings: absent, every line stays live (today's game). */
export const turnoverV = v.object({ liveCap: v.number(), retiredPoints: retiredPointsV, retiredHolds: v.boolean() });
export const overridesV = v.object({
  planningSeconds: v.optional(v.number()), worldSeconds: v.optional(v.number()), startingEnergy: v.optional(v.number()),
  durationMode: v.optional(durationModeV), scoreIntervalSeconds: v.optional(v.number()),
  /** The variance, bits², of each reading of the others' sums while live (decision 32). */
  peerNoiseVariance: v.optional(v.number()),
  /** Stored rooms' old σ override, ignored (decision 32 replaced it with the variance). */
  peerNoiseBits: v.optional(v.number()),
  /** The weight on a look's read price (decision 35). */
  readPriceWeight: v.optional(v.number()),
  /** Parameter drift's interval in world seconds (drift.ts; 0: off). */
  driftSeconds: v.optional(v.number()),
  /** How long a player's pause lasts, wall seconds (v1's pauseSeconds; absent: 180). */
  pauseSeconds: v.optional(v.number()),
  /** Offer the commit clause (v1, off by default): agents may mark acts only-if-better. */
  commitClause: v.optional(v.boolean()),
  /** Defence goals (v1, restored; owner-decisions call 1): grids only, off by default; the penalty weight w (absent: 1). */
  defenceGoals: v.optional(v.boolean()), penaltyWeight: v.optional(v.number()), excludedDefenceFamilies: v.optional(v.array(v.string())),
  /** v1's world, energy and compute settings (absent: the preset's economy; the sandbox's 500,000 steps and 2,000 ms). */
  startingObjects: v.optional(v.number()), birthsPerSecond: v.optional(v.number()), opportunitiesPerSecond: v.optional(v.number()),
  powerPerSecond: v.optional(v.number()), fullChargeSeconds: v.optional(v.number()),
  stepBudget: v.optional(v.number()), interactionComputeMs: v.optional(v.number()),
  /** v1's "Rules never dealt": the preset's families this room never deals (absent: none). */
  excludedFamilies: v.optional(v.array(v.string())),
  /** v1's bid price and bid visibility, on a preset with a bid phase (absent: the preset's pricing; sealed). */
  bidPricing: v.optional(v.union(v.literal("first"), v.literal("second"))),
  bidVisibility: v.optional(v.union(v.literal("sealed"), v.literal("open"))),
  /** v1's bid results shown, during the game (absent: the preset's; after the end everything is shown). */
  bidDisclosure: v.optional(v.union(v.literal("none"), v.literal("handicaps"), v.literal("all"))),
  /** v1's bidSeconds: the bid phase's length; 0 is none, above 0 opens one on any setup (absent: the preset's). */
  bidSeconds: v.optional(v.number()),
  /** Line turnover (retirement-design.md): at most this many live lines; a birth past it retires the oldest. Absent: none. */
  liveCap: v.optional(v.number()),
  /** Regular births, one every this many world seconds, in place of the preset's birth rate. */
  birthSeconds: v.optional(v.number()),
  /** Under turnover: a retired line's points stay in the totals ("banked", the default) or leave them ("dropped"). */
  retiredPoints: v.optional(retiredPointsV),
  /** Under turnover: a retired line keeps holding its state for uniqueness (decision 24; default true). */
  retiredHolds: v.optional(v.boolean()),
  /**
   * Time dilation (owner decision 37): every rate × this, every duration ÷ it (v2-economy dilate), so the room's games
   * run this many times faster with the same per-act quantities. For simulations and local playtests only: set by the
   * internal `v2/lobby:setTimeScale`, never offered in room setup. Absent: 1.
   */
  timeScale: v.optional(v.number()),
  /** Stored rooms' old free/paid flag, ignored (decision 35). */
  observation: v.optional(v.union(v.literal("free"), v.literal("paid"))),
});
/** A player's view of an object at one moment (a move's before and after). */
/** A player's value of a state: the utility (as its wire), its worth in bits, the others' worth and the points. */
export const valueSnapV = v.object({ score: scoreWireV, rarityBits: v.number(), want: v.number(), points: v.number() });
/**
 * Widened while migrations:stripLevels runs (CLAUDE.md "Schema migrations"): rows written before decision 23 (#488)
 * still carry a level, a rule its ladder. Narrowed in a later PR once dev and production report the migration done.
 */
const legacyLevel = v.optional(v.number());
/** `shownWant`/`shownPoints`: as disclosed while live (disclose.ts); absent on rows written before the noise was restored. */
const shownFields = { shownWant: v.optional(v.number()), shownPoints: v.optional(v.number()) };
/**
 * The objects pane's filters (v1's quadrants, disclose.ts quadrantOf): from the player's own bits and the others' sum as
 * disclosed to them (exact after the end). Absent on rows written before the filters were restored.
 */
export const quadrantV = v.union(v.literal("contested"), v.literal("chips"), v.literal("other"));
const storedValueSnapV = v.object({ score: scoreWireV, level: legacyLevel, rarityBits: v.number(), want: v.number(), points: v.number(), ...shownFields });
const legacyLadder = v.optional(v.array(v.object({ level: v.number(), label: v.string(), rarityBits: v.number(), layer: v.optional(v.string()) })));
export const bidV = v.object({ family: v.string(), percent: v.number() });
/** A family on offer in the bid phase, as a player judges it: its card and the most rarity bits its rules reach. */
export const offerV = v.object({ family: v.string(), title: v.string(), card: v.string(), top: v.number() });

export const eventKindV = v.union(
  v.literal("gameStarted"), v.literal("objectBorn"), v.literal("act"), v.literal("values"), v.literal("tick"),
  v.literal("phase"), v.literal("command"), v.literal("gameEnded"), v.literal("drift"), v.literal("retired"),
);

// ---------------------------------------------------------------- the tables

export const v2Tables = {
  ...assistantTables,
  /** A room: codes, owner, preset and overrides, the current game, and the bid phase while it is open. */
  v2Rooms: defineTable({
    code: v.string(), name: v.string(), ownerId: v.string(), revision: v.number(), createdAt: v.number(),
    preset: v.string(), overrides: overridesV,
    /** The game in progress (planning, live or paused); cleared when it ends. */
    gameId: v.optional(v.id("v2Games")),
    /** The most recent game, ended or not (the results screen). */
    lastGameId: v.optional(v.id("v2Games")),
    /** Games started in this room so far (a game's `number`). */
    games: v.number(),
    /** The open bid phase (plan §5.9): a step of the start, before the game exists. */
    bidding: v.optional(v.object({
      deadline: v.number(), pricing: v.union(v.literal("first"), v.literal("second")), families: v.array(offerV),
      /** v1's bid visibility: "open" shows every player's bids as they are placed (absent: sealed). */
      visibility: v.optional(v.union(v.literal("sealed"), v.literal("open"))),
    })),
    /** The saved setup the owner last applied (room.settings `setupId`), as it was then; cleared by a change by hand. */
    setup: v.optional(v.object({ setupId: v.id("v2Setups"), name: v.string() })),
  }).index("by_code", ["code"]),

  /** A seat or a spectator in a room (≤ 16 per room): a human, a practice partner or an AI player. */
  v2Members: defineTable({
    roomId: v.id("v2Rooms"), kind: memberKindV, name: v.string(), spectator: v.boolean(), joinedAt: v.number(),
    /** The human's user id (Better Auth subject); absent for practice partners and AI players. */
    userId: v.optional(v.string()),
    aiTemplate: v.optional(v.string()),
    /** Joined while a game ran (so watching it); seated again when it ends. */
    seatNext: v.optional(v.boolean()),
  }).index("by_room", ["roomId", "joinedAt"]).index("by_user", ["userId", "joinedAt"]).index("by_room_user", ["roomId", "userId"]),

  v2Chat: defineTable({ roomId: v.id("v2Rooms"), memberId: v.optional(v.id("v2Members")), from: v.string(), text: v.string(), at: v.number() })
    .index("by_room", ["roomId", "at"]),

  /** Completed writes by (caller, affordance, requestId): a retry is answered, never applied twice. */
  v2Receipts: defineTable({
    key: v.string(), outcome: v.any(), at: v.number(),
    /** The key's parts (callerKey|operation|requestId), for receipt.get by request id; absent on rows stored before it. */
    callerKey: v.optional(v.string()), operation: v.optional(v.string()), requestId: v.optional(v.string()),
  }).index("by_key", ["key"]).index("by_caller_request", ["callerKey", "requestId"]),

  /** A game's header (cold: written by the lobby, and by the loop only when the phase changes). */
  v2Games: defineTable({
    roomId: v.id("v2Rooms"), number: v.number(), code: v.string(), phase: phaseV,
    preset: v.string(), variant: v.string(), seed: v.string(),
    /** The economy and timing the game was started with (preset plus overrides), frozen at the start. */
    settings: v.object({
      planningSeconds: v.number(), worldSeconds: v.number(), startingEnergy: v.number(), startingObjects: v.number(),
      minPlayers: v.number(),
      economy: v.object({ powerPerSecond: v.number(), fullChargeSeconds: v.number(), opportunitiesPerSecond: v.number(), birthsPerSecond: v.number() }),
      bid: v.optional(v.object({ pricing: v.union(v.literal("first"), v.literal("second")), disclosure: v.union(v.literal("none"), v.literal("handicaps"), v.literal("all")) })),
      /** The variance, bits², of each reading of the others' sums while live (disclose.ts, decision 32; absent: 0). */
      peerNoiseVariance: v.optional(v.number()),
      /** Games stored before decision 32: σ of the old shared draw, ignored. */
      peerNoiseBits: v.optional(v.number()),
      /**
       * v1's duration modes: "fixed" ends the world exactly `worldSeconds` after it starts (public); "halfLife" ends it
       * at a hidden random moment, half of games within `worldSeconds` (absent: fixed, as games stored before).
       */
      durationMode: v.optional(durationModeV),
      /** World seconds between published standings (v1's scoreIntervalSeconds; absent: 10). */
      scoreIntervalSeconds: v.optional(v.number()),
      /** Parameter drift's interval in world seconds (drift.ts; 0 or absent: off). */
      driftSeconds: v.optional(v.number()),
      /** How long a player's pause lasts, wall seconds (v1's pauseSeconds; absent: 180). */
      pauseSeconds: v.optional(v.number()),
      /** The commit clause is offered (v1, off by default): an only-if-better act commits only if its owner gains. */
      commitClause: v.optional(v.boolean()),
      /** Defence goals are dealt (v1; grids only), with the penalty weight w (absent: 1) and the families left out. */
      defenceGoals: v.optional(v.boolean()), penaltyWeight: v.optional(v.number()), excludedDefenceFamilies: v.optional(v.array(v.string())),
      /** Per-act compute limits the room set (v1's stepBudget and interactionComputeMs); absent: the sandbox's defaults. */
      stepBudget: v.optional(v.number()), interactionComputeMs: v.optional(v.number()),
      /** Births on a regular schedule, birth j at j / rate (decision 31; duration.ts regularBirths); absent: stochastic. */
      regularBirths: v.optional(v.boolean()),
      /** Line turnover (retirement-design.md): at most `liveCap` live lines, the oldest retiring; absent: none. */
      turnover: v.optional(turnoverV),
      /** The game's time dilation (decision 37): its settings are already dilated by it; wall-clock pacing divides by it. */
      timeScale: v.optional(v.number()),
      /** The weight on a look's read price (knowledge.ts, decision 35); absent (games stored before it): 0, free. */
      readPriceWeight: v.optional(v.number()),
      /** Games stored before decision 35: the old free/paid flag, ignored. */
      observation: v.optional(v.union(v.literal("free"), v.literal("paid"))),
    }),
    /**
     * The dealing trial's measurement (the coordinator's call 12, step 1): the seated rules' unopposed shared directions
     * (lib/v2-agents unopposedDirections), computed at the deal. Never shown to players; for the collapse analysis.
     */
    unopposed: v.optional(v.array(v.any())),
    /**
     * The dealing trial's step 2 (deal.ts policyDeal), logging only: the table the policy would have dealt (rule keys by
     * seat), its unopposed directions, its fair-aligned score and any fallback. Private, like `unopposed`.
     */
    unopposedPolicy: v.optional(v.object({ wouldDeal: v.array(v.string()), unopposed: v.array(v.any()), score: v.number(), fallback: v.optional(v.string()) })),
    /** Seating (deal.ts; lib/v2-grid and lib/v2-pair seating.ts): the forbidden and the aligned pairs of seated rules the deal left. */
    seating: v.optional(v.object({ clashes: v.array(v.string()), aligned: v.optional(v.array(v.string())) })),
    /** Paused by idle parking (activity.ts): resumed by the next human activity, not by the owner. */
    parked: v.optional(v.boolean()),
    /** PRIVATE: the world second the game ends at (drawn at the start in halfLife mode); absent: settings.worldSeconds. */
    endAtWorld: v.optional(v.number()),
    /** PRIVATE: the key of the game's disclosure noise (disclose.ts). Never returned while live. */
    noiseKey: v.optional(v.string()),
    roster: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), kind: memberKindV })),
    createdAt: v.number(),
    /** Wall-clock deadlines: planning's end, and the world's end (null while paused; recomputed on resume). */
    planningEndsAt: v.optional(v.number()), endsAt: v.optional(v.number()),
    startedAt: v.optional(v.number()), endedAt: v.optional(v.number()), pausedBy: v.optional(v.id("v2Members")),
    /** Why the game ended (v1's endReason): its world ran out, its owner ended it, a practice game its player left, or the server retired it. */
    endReason: v.optional(endReasonV),
    /** When a player's pause ends by itself (v1: pauseSeconds after it began); absent unless a player paused. */
    pauseEndsAt: v.optional(v.number()),
    /** Each dealt rule's artefact content hash, by member (the header of spec §9.1). */
    artefacts: v.array(v.object({
      memberId: v.id("v2Members"), ruleKey: v.string(), contentHash: v.string(),
      /** The seat's defence goal's value function (v1, restored; call 1), when one was dealt. */
      defence: v.optional(v.object({ ruleKey: v.string(), contentHash: v.string() })),
    })),
    /** Whether this game's deal continues the room's rotation (plan §5.9: not after a won bid). */
    rotates: v.boolean(),
    /** What a fresh deal depends on (variant and dealable pool): a rotation continues only under the same key. */
    dealKey: v.string(),
    /** This game's place in a rotation (round 2 of 3: the second game of three), absent for a fresh deal. */
    rotation: v.optional(v.object({ round: v.number(), of: v.number() })),
    summary: v.optional(v.object({ winner: v.union(v.id("v2Members"), v.null()), objects: v.number(), acts: v.number() })),
    replayFile: v.optional(v.id("_storage")),
  }).index("by_room_phase", ["roomId", "phase", "number"]).index("by_room", ["roomId", "number"]).index("by_code", ["code"])
    .index("by_parked", ["parked"]),

  /** Whether each language's sandbox runtime has booted (readiness.ts: players never wait for a boot). */
  v2RuntimeReadiness: defineTable({
    language: languageV, version: v.string(), state: v.union(v.literal("warming"), v.literal("ready"), v.literal("failed")),
    reason: v.optional(v.string()), at: v.number(),
  }).index("by_language_version", ["language", "version"]),

  /**
   * Paid observation (knowledge.ts): what a player was last told of an object in a paid game, and their value of it as
   * disclosed then (`want` and `points` with the noise). Written only in paid games.
   */
  v2Knowledge: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), objectId: v.id("v2Objects"), number: v.number(),
    state: v.string(), version: v.number(), learnedAt: v.number(), score: scoreWireV, rarityBits: v.number(), want: v.number(), points: v.number(),
    quadrant: v.optional(quadrantV),
  }).index("by_object_member", ["objectId", "memberId"])
    .index("by_game_member_points", ["gameId", "memberId", "points"])
    .index("by_game_member_rarity", ["gameId", "memberId", "rarityBits"])
    .index("by_game_member_want", ["gameId", "memberId", "want"])
    .index("by_game_member_born", ["gameId", "memberId", "number"])
    .index("by_game_member_learned", ["gameId", "memberId", "learnedAt"])
    .index("by_game_member_version", ["gameId", "memberId", "version"])
    // The filtered sorts (v1's positive, contested, chips): the same orders within one quadrant.
    .index("by_game_member_quadrant_points", ["gameId", "memberId", "quadrant", "points"])
    .index("by_game_member_quadrant_rarity", ["gameId", "memberId", "quadrant", "rarityBits"])
    .index("by_game_member_quadrant_want", ["gameId", "memberId", "quadrant", "want"])
    .index("by_game_member_quadrant_version", ["gameId", "memberId", "quadrant", "version"])
    .index("by_game_member_quadrant_born", ["gameId", "memberId", "quadrant", "number"])
    .index("by_game_member_quadrant_learned", ["gameId", "memberId", "quadrant", "learnedAt"]),

  /** When a human last acted (activity.ts: idle parking); one row, key "global". */
  v2Activity: defineTable({ key: v.string(), lastHumanActivityAt: v.number() }).index("by_key", ["key"]),

  /** Hot: world time and counts, written by every commit; no public query reads it (clients interpolate). */
  v2Clocks: defineTable({
    gameId: v.id("v2Games"), tick: v.number(), worldSeconds: v.number(), lastTickAt: v.number(),
    objects: v.number(), agents: v.number(), commits: v.number(), events: v.number(),
  }).index("by_game", ["gameId"]),

  /**
   * The loop's private state: the lease (only the tick chain holding `leaseId` may commit; empty while not live), the
   * counters that number objects, acts, moves, events and scoreboards, and the world time of the last scoreboard.
   */
  v2Engine: defineTable({
    gameId: v.id("v2Games"), leaseId: v.string(), tick: v.number(), objects: v.number(), acts: v.number(), moves: v.number(),
    events: v.number(), scoreboards: v.number(), scoreboardAt: v.number(), failures: v.number(),
    /** Parameter drifts done (drift.ts): drift k happens at world second k × driftSeconds. */
    drifts: v.optional(v.number()),
    /** Line turnover: the live lines' numbers, oldest first (absent: every number up to `objects` is live). */
    live: v.optional(v.array(v.number())),
    /** Each player's running points total (hot, so it lives here and not on any document a query reads). */
    totals: v.record(v.string(), v.number()),
    /** The same totals from the disclosed points (what the published standings show while live). */
    shownTotals: v.optional(v.record(v.string(), v.number())),
  }).index("by_game", ["gameId"]),

  /** A player's dealt rule (private to that player): `{family, params, layers}` and its card (its value: values.ts). */
  v2Rules: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"),
    family: v.string(), params: v.any(),
    /** The dealt layers' ids: the main layer, then the dealt tie-breaker if any (a rule is never more than two). */
    layers: v.array(v.string()), tieBreaker: v.union(v.string(), v.null()), ruleKey: v.string(), contentHash: v.string(),
    title: v.string(), card: v.string(), depends: v.array(v.string()),
    /** The main layer's representation (the compact face's view). */
    primary: v.string(), ladder: legacyLadder,
    /** Parameter drift (drift.ts): how many times this rule's parameters were redrawn, and the world second of the last. */
    drifts: v.optional(v.number()), driftedAt: v.optional(v.number()),
    /** The rule before its last redraw (its params and card), so a notice "changed from … to …" survives a reload. */
    previous: v.optional(v.object({ params: v.any(), card: v.string() })),
    /** Won by a bid (the percent bid) and the handicap the winner pays, percent of totals. */
    bid: v.optional(v.number()), handicap: v.optional(v.number()),
    /** A defence goal dealt beside the rule (v1, restored; owner-decisions call 1): one of the variant's penalty families. */
    defence: v.optional(v.object({ family: v.string(), params: v.any(), ruleKey: v.string(), card: v.string() })),
  }).index("by_game_member", ["gameId", "memberId"]),

  /** A player's account in one game (hot, one per player): energy store, power, ready, pause. */
  v2Players: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), userId: v.optional(v.string()), kind: memberKindV,
    energy: v.number(), power: v.number(), ready: v.boolean(), pauseUsed: v.boolean(), agents: v.number(),
    /** The own store's balance is as of this world second; Σ of the agents' power shares. */
    settledAt: v.number(), allocated: v.number(),
  }).index("by_game_member", ["gameId", "memberId"]).index("by_game", ["gameId"]),

  /** An object's cold part. */
  v2Objects: defineTable({
    gameId: v.id("v2Games"), number: v.number(), bornAt: v.number(),
    /** Line turnover: the world second it retired (no agent is offered it again; its points as the settings say). */
    retiredAt: v.optional(v.number()),
  })
    .index("by_game", ["gameId", "number"]),
  /** An object's hot part, shared by every viewer: the state on the wire. */
  v2ObjectStates: defineTable({
    objectId: v.id("v2Objects"), gameId: v.id("v2Games"), state: v.string(), version: v.number(), changedAt: v.number(),
    /** Retired and no longer holding its state (turnover with `retiredHolds` false): uniqueness passes it over. */
    released: v.optional(v.boolean()),
  }).index("by_object", ["objectId"])
    /** Who holds a state (decision 24: no two objects of a game hold the same one; one document per check). */
    .index("by_game_state", ["gameId", "state"]),
  /**
   * One player's value of one object (spec §7.7, §8; decision 23): utility, own worth n_i (bits), the others' sum
   * Σ_{j≠i} n_j (`want`) and points π_i = n_i · want. Private to that player during a live game.
   */
  v2ObjectValues: defineTable({
    objectId: v.id("v2Objects"), gameId: v.id("v2Games"), memberId: v.id("v2Members"), number: v.number(),
    score: scoreWireV, level: legacyLevel, rarityBits: v.number(), want: v.number(), points: v.number(), ...shownFields,
    version: v.number(), changedAt: v.number(), quadrant: v.optional(quadrantV),
    /** The last moves on it that concerned this player (at most HISTORY, oldest first): their agents' `history`. */
    recent: v.optional(v.array(v.object({ mine: v.boolean(), pointsBefore: v.number(), pointsAfter: v.number() }))),
  }).index("by_object_member", ["objectId", "memberId"])
    .index("by_game_member_points", ["gameId", "memberId", "points"])
    .index("by_game_member_rarity", ["gameId", "memberId", "rarityBits"])
    .index("by_game_member_want", ["gameId", "memberId", "want"])
    // The live sorts read the disclosed values (a sort on the exact ones would leak their order).
    .index("by_game_member_shownPoints", ["gameId", "memberId", "shownPoints"])
    .index("by_game_member_shownWant", ["gameId", "memberId", "shownWant"])
    .index("by_game_member_born", ["gameId", "memberId", "number"])
    .index("by_game_member_changed", ["gameId", "memberId", "changedAt"])
    // v1's "most mutated": the row's version counts the object's changes (1 at birth).
    .index("by_game_member_version", ["gameId", "memberId", "version"])
    // The filtered sorts (v1's positive, contested, chips) on the disclosed values: the same orders within one quadrant.
    .index("by_game_member_quadrant_shownPoints", ["gameId", "memberId", "quadrant", "shownPoints"])
    .index("by_game_member_quadrant_rarity", ["gameId", "memberId", "quadrant", "rarityBits"])
    .index("by_game_member_quadrant_shownWant", ["gameId", "memberId", "quadrant", "shownWant"])
    .index("by_game_member_quadrant_version", ["gameId", "memberId", "quadrant", "version"])
    .index("by_game_member_quadrant_born", ["gameId", "memberId", "quadrant", "number"])
    .index("by_game_member_quadrant_changed", ["gameId", "memberId", "quadrant", "changedAt"]),

  /** An agent's cold part. */
  v2Agents: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), name: v.string(), language: languageV,
    sourceHash: v.string(), version: v.number(), share: v.number(), createdAt: v.number(), destroyedAt: v.optional(v.number()),
    /**
     * No longer written: the current program is v2AgentPrograms at (agentId, version) (`programOf`), so a page of a
     * player's agents (up to 200, call 35) stays a few KiB however long their programs are. Rows stored before keep it.
     */
    source: v.optional(v.string()),
  })
    // Live agents (destroyedAt unset) by player and by game: the paginated lists and the tick read only these.
    .index("by_game_member_live", ["gameId", "memberId", "destroyedAt"]).index("by_game_live", ["gameId", "destroyedAt"]),
  /** An agent's hot part. */
  v2AgentEnergy: defineTable({
    agentId: v.id("v2Agents"), gameId: v.id("v2Games"), energy: v.number(), acts: v.number(), skips: v.number(),
    failures: v.number(), spend: v.number(), pointsGained: v.number(), lastActAt: v.optional(v.number()),
    /**
     * v1's My agents split of `spend`: the part paid for reading (R/κ, every act) and for changing (W + βW², committed
     * acts only), and the last act's two parts. Absent on rows stored before the split: read as 0 and null.
     */
    spendRead: v.optional(v.number()), spendChange: v.optional(v.number()),
    lastAct: v.optional(v.object({ at: v.number(), read: v.number(), change: v.number(), outcome: v.string() })),
    /** The balance is as of this world second. */
    settledAt: v.number(),
    /**
     * The agents pane's sparkline (v1's, A6): the balance just after each act, oldest first, at most one a tick and the
     * last AGENT_HISTORY (loop.ts). Hot, like the rest of this row: it changes when the row does.
     */
    history: v.optional(v.array(v.object({ at: v.number(), energy: v.number() }))),
  }).index("by_agent", ["agentId"]),
  /** Every program an agent has run (the put-back comparison). */
  v2AgentPrograms: defineTable({
    agentId: v.id("v2Agents"), version: v.number(), language: languageV, source: v.string(), sourceHash: v.string(),
    price: v.number(), summonedAt: v.number(), acts: v.number(), pointsGained: v.number(),
  }).index("by_agent", ["agentId", "version"]),

  /** The scoreboard (≤ 8 rows in one document), ranked by net total (total less the bid handicap). */
  v2Standings: defineTable({
    gameId: v.id("v2Games"), seq: v.number(), worldSeconds: v.number(),
    rows: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), total: v.number(), handicap: v.number(), net: v.number(), rank: v.number() })),
  }).index("by_game", ["gameId"]),
  v2StandingsHistory: defineTable({
    gameId: v.id("v2Games"), seq: v.number(), worldSeconds: v.number(),
    totals: v.array(v.object({ memberId: v.id("v2Members"), net: v.number() })),
  }).index("by_game_seq", ["gameId", "seq"]),

  /** One row per (move, player concerned): the act log line (plan §2.3). */
  v2Moves: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), seq: v.number(), worldSeconds: v.number(),
    objectId: v.id("v2Objects"), number: v.number(), agentId: v.optional(v.id("v2Agents")), mine: v.boolean(),
    /** The player whose agent made the move (on every row: whose line-pulling it was). */
    by: v.optional(v.id("v2Members")),
    calls: v.array(callV), rep: v.string(), stateBefore: v.string(), stateAfter: v.string(),
    before: storedValueSnapV, after: storedValueSnapV, charge: v.optional(v.number()),
    /** The mover's notes to its owner (lib/v2-agents `note`), on the mover's own row. */
    notes: v.optional(v.array(v.string())),
  }).index("by_game_member_seq", ["gameId", "memberId", "seq"])
    .index("by_game_member_object", ["gameId", "memberId", "objectId", "seq"]),

  /**
   * Per (player, object) the moves that concerned the player, folded by the tick as they commit: how often the line
   * changed hands between their agent and others' (`flips`), what their agents spent on it, who pulled, and the best
   * state it passed through for them. The end summary's tugs-of-war read the most-flipped of these (`v2/play:tugs`).
   */
  /**
   * The public log (v1's, docs/public-log-design.md §1–§2): one row per birth and per committed move, read by every
   * seated player. `bits` is every roster seat's exact bits after it (roster order, server-private: a viewer gets its own
   * and the others' sum; each reader's reading of it is their own, play.ts logPage); `by`, `agentId`, `calls` and `charge`
   * reach only the mover while live. `seq` is the record's event seq of the birth or the act.
   */
  v2Log: defineTable({
    gameId: v.id("v2Games"), seq: v.number(), worldSeconds: v.number(), kind: v.union(v.literal("born"), v.literal("move")),
    objectId: v.id("v2Objects"), number: v.number(), version: v.number(), stateBefore: v.optional(v.string()), state: v.string(),
    bits: v.array(v.number()), bitsBefore: v.optional(v.array(v.number())), 
    /** Rows written before decision 32: the old shared draw, ignored. */
    noise: v.optional(v.number()), noiseBefore: v.optional(v.number()),
    by: v.optional(v.id("v2Members")), agentId: v.optional(v.id("v2Agents")), calls: v.optional(v.array(callV)), charge: v.optional(v.number()),
  }).index("by_game_seq", ["gameId", "seq"]),

  v2Tugs: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), objectId: v.id("v2Objects"), number: v.number(),
    moves: v.number(), flips: v.number(), lastMine: v.boolean(), mySpend: v.number(), others: v.array(v.id("v2Members")),
    from: v.number(), to: v.number(), best: v.union(v.object({ state: v.string(), points: v.number() }), v.null()),
    /** The states the last two moves left it in, oldest first (rows stored before: absent). */
    lastStates: v.optional(v.array(v.string())),
    /**
     * The two-state cycle it is in (playtest rounds 32 and 33: a line toggled between two states): the pair (a < b) and
     * how many moves went between exactly those two states. Null until a move does.
     */
    cycle: v.optional(v.union(v.object({ a: v.string(), b: v.string(), moves: v.number() }), v.null())),
  }).index("by_game_member_object", ["gameId", "memberId", "objectId"])
    .index("by_game_member_flips", ["gameId", "memberId", "flips"]),

  /** Per player: every object's own rarity and want, packed [number, rarityBits, want, …] (the others-care scatter). */
  v2Digests: defineTable({ gameId: v.id("v2Games"), memberId: v.id("v2Members"), packed: v.array(v.number()), version: v.number() })
    .index("by_game_member", ["gameId", "memberId"]),

  /** The record (spec §9.1): append-only, dense `seq` from 0; replay folds it. */
  v2Events: defineTable({ gameId: v.id("v2Games"), seq: v.number(), kind: eventKindV, data: v.any() })
    .index("by_game_seq", ["gameId", "seq"]).index("by_game_kind", ["gameId", "kind", "seq"]),

  /**
   * A human's dock layout in one room (the app's), and their view state: what the directory's view operations change
   * (panes, representation pins, the object in focus, the replay cursor; lib/v2-affordances layout.ts), so an
   * assistant acting for them changes what every one of their clients shows. `roomId` absent: outside any room.
   */
  v2Layouts: defineTable({ userId: v.string(), roomId: v.optional(v.id("v2Rooms")), layout: v.any(), view: v.optional(v.any()), revision: v.number() })
    .index("by_user_room", ["userId", "roomId"]),

  /** A human's sealed bids in the room's open bid phase (private to them). */
  v2RoomBids: defineTable({ roomId: v.id("v2Rooms"), memberId: v.id("v2Members"), bids: v.array(bidV), done: v.boolean() })
    .index("by_room_member", ["roomId", "memberId"]),
  /**
   * AI spending per (game, member): a human's assistant and pitch drafts, or an AI player's turns, each held to the
   * game's allowance (convex/v2/ai.ts). Tokens are the provider's input plus output tokens; usd at catalogue prices.
   */
  /**
   * Model spend (v2/ai.ts) per member per game, or, between games (`gameId` absent), per UTC day in the room's lobby
   * (`lobbyDay`); `recent` holds the call times of the last minute (the rate limit).
   */
  v2AiUsage: defineTable({
    gameId: v.optional(v.id("v2Games")), lobbyDay: v.optional(v.string()), memberId: v.id("v2Members"),
    tokens: v.number(), usd: v.number(), calls: v.number(), recent: v.optional(v.array(v.number())),
  }).index("by_member_game", ["memberId", "gameId", "lobbyDay"]),
  /** A room's spend per game (or lobby day) per pool: "ai" (its AI players together) or "assistant" (every player's). */
  v2AiPools: defineTable({
    roomId: v.id("v2Rooms"), gameId: v.optional(v.id("v2Games")), lobbyDay: v.optional(v.string()), pool: v.union(v.literal("ai"), v.literal("assistant")),
    tokens: v.number(), usd: v.number(), recent: v.array(v.number()),
  }).index("by_room_game_pool", ["roomId", "gameId", "lobbyDay", "pool"]),
  /** The deployment's spend per UTC day per pool (the daily USD ceilings), in shards by room so rooms never contend. */
  v2AiDaily: defineTable({ day: v.string(), pool: v.union(v.literal("ai"), v.literal("assistant")), shard: v.number(), usd: v.number() })
    .index("by_day_pool_shard", ["day", "pool", "shard"]),
  /** The owner's per-game token quotas (`room.aiQuotas`); a room with no row has the defaults. */
  v2RoomQuotas: defineTable({ roomId: v.id("v2Rooms"), ai: v.number(), assistant: v.number() }).index("by_room", ["roomId"]),
  /** A game's auction: every bid, the order of wins and each winner's handicap (disclosed per preset). */
  v2Auctions: defineTable({
    gameId: v.id("v2Games"), pricing: v.union(v.literal("first"), v.literal("second")),
    disclosure: v.union(v.literal("none"), v.literal("handicaps"), v.literal("all")),
    bids: v.array(v.object({ memberId: v.id("v2Members"), family: v.string(), percent: v.number() })),
    wins: v.array(v.object({ memberId: v.id("v2Members"), family: v.string(), percent: v.number(), handicap: v.number() })),
  }).index("by_game", ["gameId"]),

  /**
   * A human's saved setups (convex/v2/setups.ts; v1's user setups, coordinator's call 35): a preset and its overrides
   * under a name unique among theirs ignoring case (`nameKey`: the name lower-cased), at most 50 each. Shared as in v1:
   * anyone lists, reads, copies and applies them; only the owner changes or removes one. `ownerName` is the owner's
   * name when they last saved it (absent on rows saved before sharing: shown as "a player"). The presets are the system's catalogue beside them.
   */
  v2Setups: defineTable({
    ownerUserId: v.string(), ownerName: v.optional(v.string()), name: v.string(), nameKey: v.string(), preset: v.string(), overrides: overridesV,
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_owner_name", ["ownerUserId", "nameKey"])
    .index("by_name", ["nameKey"]),

  /**
   * Stored panels (convex/v2/panels.ts): TSX a human or their delegates write, compiled on save and rendered by every
   * client of that human in a sandboxed frame with `@sdk` version 2. Scoped to the human (`userId`), across rooms.
   */
  v2Panels: defineTable({
    userId: v.string(), slug: v.string(), title: v.string(), placement: placementV, size: sizeV,
    currentVersion: v.number(), enabled: v.boolean(), updatedAt: v.number(), sdk: v.literal(2),
    /** The current version's author (denormalised for list). */
    author: authorV,
    /** The latest version a delegate wrote (0: none): a client's "let it act" grant older than this is void. */
    lastForeignVersion: v.number(),
  }).index("by_user_slug", ["userId", "slug"]),
  /** Immutable versions; the last LIMITS.versionsKept per panel are kept. */
  v2PanelVersions: defineTable({
    panelId: v.id("v2Panels"), version: v.number(), source: v.string(), compiled: v.string(), diagnostics: v.array(diagnosticV),
    compilerVersion: v.string(), sourceHash: v.string(), author: authorV, manifest: manifestV, createdAt: v.number(),
    /** Code a delegate wrote (also when a browser rollback restored such code). */
    foreign: v.boolean(),
  }).index("by_panel_version", ["panelId", "version"]),
  /** Recent save times per human (rolling-minute rate limit; at most LIMITS.savesPerMinute entries). */
  v2PanelQuotas: defineTable({ userId: v.string(), saves: v.array(v.number()) }).index("by_user", ["userId"]),
  /**
   * A human's code runs (v1's run_code, A15; codeRun.ts): a script's `main(data)` over one dataset of a game, read-only.
   * One row per run, the caller's own: its source, outcome, the result as JSON text (bounded) and the console output.
   */
  v2CodeRuns: defineTable({
    userId: v.string(), gameId: v.optional(v.id("v2Games")), title: v.string(), language: v.string(), source: v.string(),
    dataset: v.string(), status: v.union(v.literal("ok"), v.literal("error")), resultJson: v.optional(v.string()),
    output: v.string(), error: v.optional(v.string()), ms: v.number(), at: v.number(),
  }).index("by_user_at", ["userId", "at"]),
};
