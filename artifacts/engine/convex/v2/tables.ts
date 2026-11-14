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
import { v } from "convex/values";

// ---------------------------------------------------------------- shared shapes

export const phaseV = v.union(v.literal("planning"), v.literal("live"), v.literal("paused"), v.literal("ended"));
export const memberKindV = v.union(v.literal("human"), v.literal("practice"), v.literal("ai"));
export const languageV = v.union(v.literal("typescript"), v.literal("python"));
/** A rule score on the wire: rationals as "p/q" strings, a component null when undefined; null is WORST (spec §4). */
export const scoreWireV = v.union(v.array(v.union(v.string(), v.null())), v.null());
/** One mutator call (spec §5): rationals and choices as strings. */
export const callV = v.object({ mutator: v.string(), site: v.number(), args: v.record(v.string(), v.string()) });
/** The room's overrides of its preset (affordance `room.settings`). */
export const overridesV = v.object({
  planningSeconds: v.optional(v.number()), worldSeconds: v.optional(v.number()), startingEnergy: v.optional(v.number()),
});
/** One rung of a dealt rule's ladder, with its calibrated ✨ rarity and the layer it belongs to (layered rules). */
export const rungV = v.object({ level: v.number(), label: v.string(), rarityBits: v.number(), layer: v.optional(v.string()) });
/** A player's view of an object at one moment (a move's before and after). */
export const valueSnapV = v.object({ score: scoreWireV, level: v.number(), rarityBits: v.number(), want: v.number(), points: v.number() });
export const bidV = v.object({ family: v.string(), percent: v.number() });
/** A family on offer in the bid phase, as a player judges it: its card and the top of its ladder in ✨ rarity. */
export const offerV = v.object({ family: v.string(), title: v.string(), card: v.string(), topRarityBits: v.number() });

export const eventKindV = v.union(
  v.literal("gameStarted"), v.literal("objectBorn"), v.literal("act"), v.literal("values"), v.literal("tick"),
  v.literal("phase"), v.literal("command"), v.literal("gameEnded"),
);

// ---------------------------------------------------------------- the tables

export const v2Tables = {
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
    bidding: v.optional(v.object({ deadline: v.number(), families: v.array(offerV) })),
    /** The deal rotation's state across the room's games (rule keys by seat), absent before the first deal. */
    rotation: v.optional(v.any()),
  }).index("by_code", ["code"]),

  /** A seat or a spectator in a room (≤ 16 per room): a human, a practice partner or an AI player. */
  v2Members: defineTable({
    roomId: v.id("v2Rooms"), kind: memberKindV, name: v.string(), spectator: v.boolean(), joinedAt: v.number(),
    /** The human's user id (Better Auth subject); absent for practice partners and AI players. */
    userId: v.optional(v.string()),
    aiTemplate: v.optional(v.string()),
  }).index("by_room", ["roomId", "joinedAt"]).index("by_user", ["userId", "joinedAt"]).index("by_room_user", ["roomId", "userId"]),

  v2Chat: defineTable({ roomId: v.id("v2Rooms"), memberId: v.optional(v.id("v2Members")), from: v.string(), text: v.string(), at: v.number() })
    .index("by_room", ["roomId", "at"]),

  /** Completed writes by (caller, affordance, requestId): a retry is answered, never applied twice. */
  v2Receipts: defineTable({ key: v.string(), outcome: v.any(), at: v.number() }).index("by_key", ["key"]),

  /** A game's header (cold: written by the lobby, and by the loop only when the phase changes). */
  v2Games: defineTable({
    roomId: v.id("v2Rooms"), number: v.number(), code: v.string(), phase: phaseV,
    preset: v.string(), variant: v.string(), seed: v.string(),
    /** The economy and timing the game was started with (preset plus overrides), frozen at the start. */
    settings: v.object({
      planningSeconds: v.number(), worldSeconds: v.number(), startingEnergy: v.number(), startingObjects: v.number(),
      minPlayers: v.number(), bid: v.optional(v.object({ pricing: v.union(v.literal("first"), v.literal("second")), disclosure: v.union(v.literal("none"), v.literal("handicaps"), v.literal("all")) })),
    }),
    roster: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), kind: memberKindV })),
    createdAt: v.number(),
    /** Wall-clock deadlines: planning's end, and the world's end (null while paused; recomputed on resume). */
    planningEndsAt: v.optional(v.number()), endsAt: v.optional(v.number()),
    startedAt: v.optional(v.number()), endedAt: v.optional(v.number()), pausedBy: v.optional(v.id("v2Members")),
    /** Each dealt rule's artefact content hash, by member (the header of spec §9.1). */
    artefacts: v.array(v.object({ memberId: v.id("v2Members"), ruleKey: v.string(), contentHash: v.string() })),
    /** Whether this game's deal continues the room's rotation (plan §5.9: not after a won bid). */
    rotates: v.boolean(),
    summary: v.optional(v.object({ winner: v.union(v.id("v2Members"), v.null()), objects: v.number(), acts: v.number() })),
    replayFile: v.optional(v.id("_storage")),
  }).index("by_room_phase", ["roomId", "phase", "number"]).index("by_room", ["roomId", "number"]).index("by_code", ["code"]),

  /** Hot: world time and counts, written by every commit; no public query reads it (clients interpolate). */
  v2Clocks: defineTable({
    gameId: v.id("v2Games"), tick: v.number(), worldSeconds: v.number(), lastTickAt: v.number(),
    objects: v.number(), agents: v.number(), commits: v.number(), events: v.number(),
  }).index("by_game", ["gameId"]),

  /** The loop's private state: lease, watchdog, the next birth and offer, failures. */
  v2Engine: defineTable({
    gameId: v.id("v2Games"), leaseId: v.string(), leaseUntil: v.number(), failures: v.number(),
    nextBirthAt: v.number(), nextObject: v.number(), moves: v.number(), loop: v.any(),
  }).index("by_game", ["gameId"]),

  /** A player's dealt rule (private to that player): `{family, params, layers}`, its card and its ladder. */
  v2Rules: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"),
    family: v.string(), params: v.any(), layers: v.array(v.any()), ruleKey: v.string(), contentHash: v.string(),
    title: v.string(), card: v.string(), depends: v.array(v.string()), primary: v.string(), ladder: v.array(rungV),
    /** Won by a bid (the percent bid) and the handicap the winner pays, percent of totals. */
    bid: v.optional(v.number()), handicap: v.optional(v.number()),
  }).index("by_game_member", ["gameId", "memberId"]),

  /** A player's account in one game (hot, one per player): energy store, power, ready, pause. */
  v2Players: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), userId: v.optional(v.string()), kind: memberKindV,
    energy: v.number(), power: v.number(), ready: v.boolean(), pauseUsed: v.boolean(), agents: v.number(),
  }).index("by_game_member", ["gameId", "memberId"]).index("by_game", ["gameId"]),

  /** An object's cold part. */
  v2Objects: defineTable({ gameId: v.id("v2Games"), number: v.number(), bornAt: v.number() })
    .index("by_game", ["gameId", "number"]),
  /** An object's hot part, shared by every viewer: the state on the wire. */
  v2ObjectStates: defineTable({
    objectId: v.id("v2Objects"), gameId: v.id("v2Games"), state: v.string(), version: v.number(), changedAt: v.number(),
  }).index("by_object", ["objectId"]),
  /**
   * One player's value of one object (spec §7.7, §8): score, level, own rarity n_i (bits), the others' sum
   * Σ_{j≠i} n_j (`want`) and points π_i = n_i · want. Private to that player during a live game.
   */
  v2ObjectValues: defineTable({
    objectId: v.id("v2Objects"), gameId: v.id("v2Games"), memberId: v.id("v2Members"), number: v.number(),
    score: scoreWireV, level: v.number(), rarityBits: v.number(), want: v.number(), points: v.number(),
    version: v.number(), changedAt: v.number(),
  }).index("by_object_member", ["objectId", "memberId"])
    .index("by_game_member_points", ["gameId", "memberId", "points"])
    .index("by_game_member_rarity", ["gameId", "memberId", "rarityBits"])
    .index("by_game_member_want", ["gameId", "memberId", "want"])
    .index("by_game_member_born", ["gameId", "memberId", "number"])
    .index("by_game_member_changed", ["gameId", "memberId", "changedAt"]),

  /** An agent's cold part. */
  v2Agents: defineTable({
    gameId: v.id("v2Games"), memberId: v.id("v2Members"), name: v.string(), language: languageV,
    sourceHash: v.string(), version: v.number(), share: v.number(), createdAt: v.number(), destroyedAt: v.optional(v.number()),
  }).index("by_game_member", ["gameId", "memberId"]).index("by_game", ["gameId"]),
  /** An agent's hot part. */
  v2AgentEnergy: defineTable({
    agentId: v.id("v2Agents"), gameId: v.id("v2Games"), energy: v.number(), acts: v.number(), skips: v.number(),
    failures: v.number(), spend: v.number(), pointsGained: v.number(), lastActAt: v.optional(v.number()),
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
    calls: v.array(callV), rep: v.string(), stateBefore: v.string(), stateAfter: v.string(),
    before: valueSnapV, after: valueSnapV, charge: v.optional(v.number()),
  }).index("by_game_member_seq", ["gameId", "memberId", "seq"]),

  /** Per player: every object's own rarity and want, packed [number, rarityBits, want, …] (the others-care scatter). */
  v2Digests: defineTable({ gameId: v.id("v2Games"), memberId: v.id("v2Members"), packed: v.array(v.number()), version: v.number() })
    .index("by_game_member", ["gameId", "memberId"]),

  /** The record (spec §9.1): append-only, dense `seq` from 0; replay folds it. */
  v2Events: defineTable({ gameId: v.id("v2Games"), seq: v.number(), kind: eventKindV, data: v.any() })
    .index("by_game_seq", ["gameId", "seq"]).index("by_game_kind", ["gameId", "kind", "seq"]),

  /** A human's dock layout in one room, including client affordances' state (representation pins). */
  v2Layouts: defineTable({ userId: v.string(), roomId: v.id("v2Rooms"), layout: v.any(), revision: v.number() })
    .index("by_user_room", ["userId", "roomId"]),

  /** A human's sealed bids in the room's open bid phase (private to them). */
  v2RoomBids: defineTable({ roomId: v.id("v2Rooms"), memberId: v.id("v2Members"), bids: v.array(bidV), done: v.boolean() })
    .index("by_room_member", ["roomId", "memberId"]),
  /** A game's auction: every bid, the order of wins and each winner's handicap (disclosed per preset). */
  v2Auctions: defineTable({
    gameId: v.id("v2Games"), pricing: v.union(v.literal("first"), v.literal("second")),
    disclosure: v.union(v.literal("none"), v.literal("handicaps"), v.literal("all")),
    bids: v.array(v.object({ memberId: v.id("v2Members"), family: v.string(), percent: v.number() })),
    wins: v.array(v.object({ memberId: v.id("v2Members"), family: v.string(), percent: v.number(), handicap: v.number() })),
  }).index("by_game", ["gameId"]),
};
