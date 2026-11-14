/**
 * The v2 API contract (W3-1): what every live query returns. Each query declares one of these as its `returns`, so the
 * app's types come from the generated api (`FunctionReturnType<typeof api.v2.play.object>`) and a change here is a
 * change to the contract. Projections, not raw documents: internal fields never reach a client.
 */
import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { bidV, callV, languageV, memberKindV, offerV, overridesV, phaseV, rungV, scoreWireV, valueSnapV } from "./tables";

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
  bidding: v.union(v.object({ deadline: v.number(), pricing: v.union(v.literal("first"), v.literal("second")), families: v.array(offerV) }), v.null()),
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
  /** The caller's seat in this game, or null for a spectator. */
  me: v.union(v.id("v2Members"), v.null()),
  summary: v.union(v.object({ winner: v.union(v.id("v2Members"), v.null()), objects: v.number(), acts: v.number() }), v.null()),
});
export const standingsV = v.object({
  seq: v.number(), worldSeconds: v.number(),
  rows: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), total: v.number(), handicap: v.number(), net: v.number(), rank: v.number() })),
});
export const standingsHistoryV = v.array(v.object({ seq: v.number(), worldSeconds: v.number(), totals: v.array(v.object({ memberId: v.id("v2Members"), net: v.number() })) }));

/** `v2/play:myRule`: the caller's private rule. */
export const myRuleV = v.object({
  family: v.string(), title: v.string(), params: v.any(), layers: v.array(v.string()), tieBreaker: v.union(v.string(), v.null()), card: v.string(),
  depends: v.array(v.string()), primary: v.string(), ladder: v.array(rungV), ruleKey: v.string(),
  bid: v.union(v.number(), v.null()), handicap: v.union(v.number(), v.null()),
});
/** `v2/play:me`: the caller's account (hot, one document). */
export const meV = v.object({
  memberId: v.id("v2Members"), energy: v.number(), power: v.number(), ready: v.boolean(), pauseUsed: v.boolean(), agents: v.number(),
});
export const objectSortV = v.union(v.literal("points"), v.literal("rarity"), v.literal("want"), v.literal("born"), v.literal("recent"));
export const objectIdsV = paginationResultValidator(v.object({ objectId: v.id("v2Objects"), number: v.number() }));
/** `v2/play:object`: one object's shared state and the caller's value of it. */
export const playObjectV = v.object({
  objectId: v.id("v2Objects"), number: v.number(), bornAt: v.number(),
  state: v.string(), version: v.number(), changedAt: v.number(),
  value: v.union(v.object({ score: scoreWireV, level: v.number(), rarityBits: v.number(), want: v.number(), points: v.number(), version: v.number() }), v.null()),
});
export const agentRowV = v.object({
  agentId: v.id("v2Agents"), name: v.string(), language: languageV, version: v.number(), share: v.number(), createdAt: v.number(),
});
export const agentEnergyV = v.object({
  agentId: v.id("v2Agents"), energy: v.number(), acts: v.number(), skips: v.number(), failures: v.number(), spend: v.number(),
  pointsGained: v.number(), lastActAt: v.union(v.number(), v.null()),
});
export const agentProgramsV = v.array(v.object({
  version: v.number(), language: languageV, source: v.string(), price: v.number(), summonedAt: v.number(), acts: v.number(), pointsGained: v.number(),
}));
export const movesPageV = paginationResultValidator(v.object({
  seq: v.number(), worldSeconds: v.number(), objectId: v.id("v2Objects"), number: v.number(),
  agentId: v.union(v.id("v2Agents"), v.null()), mine: v.boolean(), calls: v.array(callV), rep: v.string(),
  stateBefore: v.string(), stateAfter: v.string(), before: valueSnapV, after: valueSnapV, charge: v.union(v.number(), v.null()),
}));
export const digestV = v.object({ version: v.number(), packed: v.array(v.number()) });

/** Spectators: every object's shared state, no values. */
export const spectateObjectV = v.object({ objectId: v.id("v2Objects"), number: v.number(), bornAt: v.number(), state: v.string(), version: v.number(), changedAt: v.number() });

export const layoutV = v.union(v.object({ layout: v.any(), view: v.union(v.any(), v.null()), revision: v.number() }), v.null());
export const replayV = v.object({ stored: v.boolean() });

/** `v2/bids:state`: the open bid phase as the caller may see it (their own bids only). */
export const bidStateV = v.object({
  open: v.boolean(), deadline: v.union(v.number(), v.null()), families: v.array(offerV),
  mine: v.array(bidV), done: v.boolean(),
  players: v.array(v.object({ memberId: v.id("v2Members"), name: v.string(), done: v.boolean() })),
});
