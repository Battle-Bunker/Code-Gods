/**
 * The v2 API contract (W3-1): what every live query returns. Each query declares one of these as its `returns`, so the
 * app's types come from the generated api (`FunctionReturnType<typeof api.v2.play.object>`) and a change here is a
 * change to the contract. Projections, not raw documents: internal fields never reach a client.
 */
import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { bidV, callV, languageV, memberKindV, offerV, overridesV, phaseV, scoreWireV, valueSnapV } from "./tables.ts";

export const roomPhaseV = v.union(v.literal("lobby"), phaseV);

export const memberRowV = v.object({
  memberId: v.id("v2Members"), name: v.string(), kind: memberKindV, spectator: v.boolean(), owner: v.boolean(),
  /** Whether this row is the caller. */
  me: v.boolean(),
});
export const gameHeadV = v.object({ gameId: v.id("v2Games"), number: v.number(), phase: phaseV });

/** `v2/rooms:get`: the room, its members (≤ 16) and its current and last game. */
export const roomV = v.object({
  roomId: v.id("v2Rooms"), code: v.string(), name: v.string(), ownerId: v.string(), revision: v.number(),
  preset: v.string(), overrides: overridesV, phase: roomPhaseV,
  members: v.array(memberRowV),
  game: v.union(gameHeadV, v.null()), lastGame: v.union(gameHeadV, v.null()),
  bidding: v.union(v.object({
    deadline: v.number(), pricing: v.union(v.literal("first"), v.literal("second")), families: v.array(offerV),
    visibility: v.optional(v.union(v.literal("sealed"), v.literal("open"))),
  }), v.null()),
});
export const roomListV = paginationResultValidator(v.object({ roomId: v.id("v2Rooms"), memberId: v.id("v2Members"), joinedAt: v.number() }));
export const chatPageV = paginationResultValidator(v.object({ id: v.id("v2Chat"), from: v.string(), memberId: v.union(v.id("v2Members"), v.null()), text: v.string(), at: v.number() }));
/** `v2/rooms:round`: the current rotation round's games and each seat's running net total. */
export const roundV = v.union(v.object({
  round: v.number(), of: v.number(), games: v.array(v.object({ gameId: v.id("v2Games"), number: v.number() })),
  totals: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), net: v.number() })),
}), v.null());
export const historyPageV = paginationResultValidator(v.object({
  gameId: v.id("v2Games"), number: v.number(), endedAt: v.union(v.number(), v.null()), winner: v.union(v.id("v2Members"), v.null()),
}));

/** `v2/games:header`: the cold game header every screen routes on. */
export const headerV = v.object({
  gameId: v.id("v2Games"), roomId: v.id("v2Rooms"), number: v.number(), code: v.string(), phase: phaseV,
  preset: v.string(), variant: v.string(),
  planningSeconds: v.number(), worldSeconds: v.number(), startingEnergy: v.number(),
  planningEndsAt: v.union(v.number(), v.null()), endsAt: v.union(v.number(), v.null()),
  startedAt: v.union(v.number(), v.null()), endedAt: v.union(v.number(), v.null()),
  roster: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), kind: memberKindV })),
  pausedBy: v.union(v.id("v2Members"), v.null()),
  /** When a player's pause ends by itself (v1's pauseSeconds), or null when not paused by a player. */
  pauseEndsAt: v.union(v.number(), v.null()),
  /** The caller's seat in this game, or null for a spectator. */
  me: v.union(v.id("v2Members"), v.null()),
  summary: v.union(v.object({ winner: v.union(v.id("v2Members"), v.null()), objects: v.number(), acts: v.number() }), v.null()),
  /** The variance, bits², of each reading of the others' sums while live (disclose.ts, decision 32); 0: exact. */
  peerNoiseVariance: v.number(),
  /** Its standard deviation, bits (√ peerNoiseVariance): what "about ± σ" shows. */
  peerNoiseBits: v.number(),
  /**
   * How the game ends (duration.ts): "fixed" at `worldSeconds` (and `endsAt`); "halfLife" at a hidden random moment, half
   * of games within `worldSeconds`, so `endsAt` is null while live (show the 90% interval, about 0.074 to 4.32 × it).
   */
  durationMode: v.union(v.literal("fixed"), v.literal("halfLife")),
  /** World seconds between published standings. */
  scoreIntervalSeconds: v.number(),
  /** "paid": a seated player sees each object as last told and pays to look (knowledge.ts); "free": as it is. */
  /** The weight on a look's read price (bits ÷ κ × weight; decision 35); 0: the live world reads free. */
  readPriceWeight: v.number(),
  /** The factor on summon and edit prices: the game's power ÷ 64 (v2-economy summonPriceScale). */
  priceScale: v.number(),
  /** Parameter drift's interval in world seconds (drift.ts; 0: off): drift k happens at world second k × it. */
  driftSeconds: v.number(),
  /** Line turnover (retirement-design.md): at most this many live lines, the oldest retiring; null: every line stays. */
  liveCap: v.union(v.number(), v.null()),
  /** The game's time dilation (decision 37): 1 unless a simulation or local playtest sped it up. */
  timeScale: v.number(),
  /** Paused because nobody acted for 30 minutes: any human activity (`account.touch`) resumes it. */
  parked: v.boolean(),
});
export const standingsV = v.object({
  seq: v.number(), worldSeconds: v.number(),
  rows: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), total: v.number(), handicap: v.number(), net: v.number(), rank: v.number() })),
});
export const standingsHistoryV = v.array(v.object({ seq: v.number(), worldSeconds: v.number(), totals: v.array(v.object({ memberId: v.id("v2Members"), net: v.number() })) }));

/** The uniqueness correction's table for the game's variant and the object count its values assume (world.ts valueObjects). */
export const uniquenessV = v.object({ ns: v.array(v.number()), heldMass: v.array(v.number()), objects: v.number() });

/** `v2/play:myRule`: the caller's private rule. */
export const myRuleV = v.object({
  family: v.string(), title: v.string(), params: v.any(), layers: v.array(v.string()), tieBreaker: v.union(v.string(), v.null()), card: v.string(),
  depends: v.array(v.string()), primary: v.string(), ruleKey: v.string(),
  /** Parameter drift (drift.ts): times this rule's parameters were redrawn (0: never), and the world second of the last. */
  drifts: v.number(), driftedAt: v.union(v.number(), v.null()),
  /** A ladder family (RuleFamily.keepsParams): drift never redraws this rule, so the app shows no redraw countdown. */
  keepsParams: v.boolean(),
  /** The rule before its last redraw (params and card), or null when it never drifted. */
  previous: v.union(v.object({ params: v.any(), card: v.string() }), v.null()),
  /** The rule's value function (decision 23), as `valueLookup` takes it: what any utility is worth, in bits. */
  value: v.object({
    knots: v.array(v.object({ u: scoreWireV, bits: v.number(), lo: v.number(), hi: v.number() })), tail: v.any(),
    /** The game's uniqueness correction (decision 24): `withUniqueness(valueLookup(value), uniqueness, uniqueness.objects)`. */
    uniqueness: v.optional(uniquenessV),
  }),
  contentHash: v.string(),
  bid: v.union(v.number(), v.null()), handicap: v.union(v.number(), v.null()),
});
/** `v2/play:me`: the caller's account (hot, one document). */
export const meV = v.object({
  memberId: v.id("v2Members"), energy: v.number(), power: v.number(), ready: v.boolean(), pauseUsed: v.boolean(), agents: v.number(),
  /**
   * The own store's income (the unallocated power, energy per second) and what it holds at most (that income times the full-charge
   * seconds): at capacity it stops growing until something is spent. `energy` is as of the world clock's last tick;
   * `settledAt` is that world second, so the app can interpolate between ticks with its own clock.
   */
  ownPerSecond: v.number(), capacity: v.number(), settledAt: v.number(),
});
/** v1's sorts and filters (objectOrder.ts). */
export const objectSortV = v.union(v.literal("points"), v.literal("rarity"), v.literal("want"), v.literal("mutations"), v.literal("born"), v.literal("oldest"), v.literal("recent"));
export const objectFilterV = v.union(v.literal("all"), v.literal("positive"), v.literal("contested"), v.literal("chips"));
export const objectIdsV = paginationResultValidator(v.object({ objectId: v.id("v2Objects"), number: v.number() }));
/** `v2/play:object`: one object's shared state and the caller's value of it. */
export const playObjectV = v.object({
  objectId: v.id("v2Objects"), number: v.number(), bornAt: v.number(),
  state: v.string(), version: v.number(), changedAt: v.number(),
  value: v.union(v.object({ score: scoreWireV, rarityBits: v.number(), want: v.number(), points: v.number(), version: v.number() }), v.null()),
  /** Paid observation (knowledge.ts): when the caller was last told this object (world seconds), and how many changes it has had since (public). */
  knownAt: v.optional(v.union(v.number(), v.null())), changesSince: v.optional(v.number()),
  /** In a game that pays to read (decision 35), live and seated: what a look at it costs now, in energy. */
  lookPrice: v.optional(v.number()),
});
export const agentRowV = v.object({
  agentId: v.id("v2Agents"), name: v.string(), language: languageV, version: v.number(), share: v.number(), createdAt: v.number(),
});
/** The caller's live agents, a page at a time (≤ 200 a player, call 35; pages ≤ 50, R1); each row's energy is `agentEnergy`. */
export const agentsPageV = paginationResultValidator(agentRowV);
export const agentEnergyV = v.object({
  agentId: v.id("v2Agents"), energy: v.number(), acts: v.number(), skips: v.number(), failures: v.number(), spend: v.number(),
  pointsGained: v.number(), lastActAt: v.union(v.number(), v.null()),
  /** As the own store's: the agent's income and capacity, and `energy` settled to the world second `settledAt`. */
  perSecond: v.number(), capacity: v.number(), settledAt: v.number(),
  /** The balance just after each act, oldest first (≤ AGENT_HISTORY); between samples it grows at perSecond up to capacity. */
  history: v.array(v.object({ at: v.number(), energy: v.number() })),
});
export const agentProgramsV = v.array(v.object({
  version: v.number(), language: languageV, source: v.string(), price: v.number(), summonedAt: v.number(), acts: v.number(), pointsGained: v.number(),
}));
export const movesPageV = paginationResultValidator(v.object({
  seq: v.number(), worldSeconds: v.number(), objectId: v.id("v2Objects"), number: v.number(),
  agentId: v.union(v.id("v2Agents"), v.null()), mine: v.boolean(), calls: v.array(callV), rep: v.string(),
  stateBefore: v.string(), stateAfter: v.string(), before: valueSnapV, after: valueSnapV,
  /** What the move cost: the caller's own agents' moves only (another player's spend is theirs). */
  charge: v.union(v.number(), v.null()),
  /** The player whose agent moved the line (the caller for their own moves). */
  by: v.union(v.object({ memberId: v.id("v2Members"), name: v.string() }), v.null()),
  /** What the caller's own agent noted for them on this move (lib/v2-agents `note`); empty on others' moves. */
  notes: v.array(v.string()),
}));
/** The caller's tugs-of-war: lines that changed hands between their agents and others' at least MIN_TUG_FLIPS times. */
export const tugsV = v.array(v.object({
  objectId: v.id("v2Objects"), number: v.number(), moves: v.number(), flips: v.number(), mySpend: v.number(),
  /** The other players whose agents moved it, by name. */
  others: v.array(v.object({ memberId: v.id("v2Members"), name: v.string() })),
  /** World seconds of the first and last move. */
  from: v.number(), to: v.number(),
  /** The state it passed through that was worth most to the caller, and those points. */
  best: v.union(v.object({ state: v.string(), points: v.number() }), v.null()),
}));
/** `v2/play:log`: the public log, newest first, as the caller reads it (bits null for a member not seated). */
export const logPageV = paginationResultValidator(v.object({
  seq: v.number(), worldSeconds: v.number(), kind: v.union(v.literal("born"), v.literal("move")), objectId: v.id("v2Objects"), number: v.number(),
  /** `state` null: another player's move in a paid game, while live (its content is paid: knowledge.ts). */
  version: v.number(), stateBefore: v.union(v.string(), v.null()), state: v.union(v.string(), v.null()),
  /** The caller's own move (theirs while live; any move after the end is attributed). */
  mine: v.boolean(),
  /** The caller's bits, the others' summed bits (with the disclosure noise while live) and the caller's points, after and before. */
  own: v.union(v.number(), v.null()), others: v.union(v.number(), v.null()), points: v.union(v.number(), v.null()),
  ownBefore: v.union(v.number(), v.null()), othersBefore: v.union(v.number(), v.null()), pointsBefore: v.union(v.number(), v.null()),
  /** Who moved it, their agent, calls and cost: the caller's own moves while live, every move after the end. */
  by: v.union(v.object({ memberId: v.id("v2Members"), name: v.string() }), v.null()), agentId: v.union(v.id("v2Agents"), v.null()),
  calls: v.union(v.array(callV), v.null()), charge: v.union(v.number(), v.null()),
}));
export const digestV = v.object({ version: v.number(), packed: v.array(v.number()) });

/** Spectators: every object's shared state, no values. */
export const spectateObjectV = v.object({ objectId: v.id("v2Objects"), number: v.number(), bornAt: v.number(), state: v.string(), version: v.number(), changedAt: v.number() });

export const layoutV = v.union(v.object({ layout: v.any(), view: v.union(v.any(), v.null()), revision: v.number() }), v.null());
export const replayV = v.object({ stored: v.boolean() });

/** `v2/bids:state`: the open bid phase as the caller may see it (their own bids; the others' only when bidding is open). */
export const bidStateV = v.object({
  open: v.boolean(), deadline: v.union(v.number(), v.null()), families: v.array(offerV),
  mine: v.array(bidV), done: v.boolean(),
  players: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), done: v.boolean() })),
  /** v1's open bidding: "open" shows every other player's bids as they are placed; sealed shows none. */
  visibility: v.union(v.literal("sealed"), v.literal("open")),
  others: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), bids: v.array(bidV) })),
});

/**
 * `v2/games:details` (v1's "Game details"): the settings as frozen at the start (tables.ts v2Games.settings), the
 * timings, and after the end every seat's rule (null while live: who holds which rule is private until the end).
 */
export const gameDetailsV = v.object({
  gameId: v.id("v2Games"), phase: v.string(), preset: v.string(), variant: v.string(),
  settings: v.any(),
  createdAt: v.number(), startedAt: v.union(v.number(), v.null()), planningEndsAt: v.union(v.number(), v.null()),
  endsAt: v.union(v.number(), v.null()), endedAt: v.union(v.number(), v.null()),
  /** The world second the game ended at (after the end only: a halfLife game's end is hidden while live). */
  endWorld: v.union(v.number(), v.null()),
  rules: v.union(v.null(), v.array(v.object({
    memberId: v.id("v2Members"), name: v.string(), kind: v.string(),
    family: v.string(), params: v.any(), tieBreaker: v.union(v.string(), v.null()), title: v.string(), card: v.string(),
    bid: v.union(v.number(), v.null()), handicap: v.union(v.number(), v.null()), drifts: v.number(),
  }))),
});
