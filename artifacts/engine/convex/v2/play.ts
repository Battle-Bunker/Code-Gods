/**
 * Live queries a seated player's panes subscribe to that value a score (integration plan §2.2): their rule's value
 * function, an object's worth to them, What if. The rest are in playState.ts (they never load valuation). Every answer is the caller's own: their
 * rule, account, values, agents and moves; another player's rule, score or value never leaves the server while the
 * game is live (v2-disclosure.test.ts). Each reads one document or one index page.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { slimKnots, valueFnIn, type ValueScope } from "./values";
import { holdingRows, seatRules } from "./loop";
import { keepsParams, knownFamily } from "./deal";
import { decode, encode, penaltyWeightOf, scopeOf, typeOf, valuesOf, valueWithParts, variantOf } from "./world";
import { callV } from "./tables";
import type { Infer } from "convex/values";
type Call = Infer<typeof callV>;
import { applyCall, isInvalid } from "@workspace/v2-core";
import { fail, requireGameMember, requireSeat } from "./access";
import { objectAndState } from "./playState";
import {
  myRuleV, playObjectV,
} from "./validators";
import { disclosed, disclosesNoise, readingNoise } from "./disclose";
import { knownOf, lookPrice, readPriceWeightOf, readsKnowledge } from "./knowledge";


/** The rule's value function, as valueLookup takes it (knots and tail), with the game's uniqueness correction. */
function valueFn(ruleKey: string, scope: ValueScope) {
  const f = valueFnIn(ruleKey, scope);
  if (!f) return null;   // a rule valued by the dynamic measure (energy.md) has no table
  return { ...f, knots: slimKnots(f.knots), tail: f.tail as unknown };
}

export const myRule = query({
  args: { gameId: v.string() },
  returns: myRuleV,
  handler: async (ctx, { gameId }) => {
    const { rule: r, game } = await requireSeat(ctx, gameId);
    return {
      family: r.family, title: r.title, params: r.params, layers: r.layers, tieBreaker: r.tieBreaker, card: r.card, depends: r.depends, primary: r.primary,
      ruleKey: r.ruleKey, contentHash: r.contentHash, drifts: r.drifts ?? 0, driftedAt: r.driftedAt ?? null, keepsParams: keepsParams(r.family), previous: r.previous ?? null, value: valueFn(r.ruleKey, scopeOf(game)), bid: r.bid ?? null, handicap: r.handicap ?? null,
    };
  },
});



/** One object: its shared state, and the caller's value of it when seated (null for a spectator). */
export const object = query({
  args: { objectId: v.string() },
  returns: playObjectV,
  handler: async (ctx, { objectId }) => {
    const { object, state } = await objectAndState(ctx, objectId);
    const { game, member } = await requireGameMember(ctx, object.gameId);
    // Paid observation (knowledge.ts): the object as the player was last told it; its activity (changes since) is public.
    if (readsKnowledge(game, member._id)) {
      const k = await knownOf(ctx, object._id, member._id);
      return {
        objectId: object._id, number: object.number, bornAt: object.bornAt, retiredAt: object.retiredAt, state: k?.state ?? "", version: k?.version ?? 0, changedAt: state.changedAt,
        value: k ? { score: k.score, rarityBits: k.rarityBits, want: k.want, points: k.points, version: k.version, parts: await ownParts(ctx, game, member._id, k.state) } : null,
        knownAt: k?.learnedAt ?? null, changesSince: state.version - (k?.version ?? 0),
        // What a look at it costs now (decision 35): its full read at the read price times the game's weight.
        // (none on a retired line: it is told to every player as it retires)
        lookPrice: object.retiredAt === undefined ? lookPrice(game.variant, state.state, readPriceWeightOf(game)) : undefined,
      };
    }
    const value = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id).eq("memberId", member._id)).unique();
    return {
      objectId: object._id, number: object.number, bornAt: object.bornAt, retiredAt: object.retiredAt, state: state.state, version: state.version, changedAt: state.changedAt,
      // The others' sum and the points as disclosed while live (disclose.ts), exact after the end.
      value: value ? { score: value.score, rarityBits: value.rarityBits, ...disclosed(game, value), version: value.version, parts: await ownParts(ctx, game, member._id, state.state) } : null,
    };
  },
});

/**
 * The caller's own bits on a state as a points tree (world.ts valueWithParts), for a tree-valued rule only: one cold
 * v2Rules document and a pure evaluation; null for a lexicographic rule (no evaluation) or a member without a rule.
 * Only the caller's own rule: nothing about another player.
 */
async function ownParts(ctx: QueryCtx, game: Doc<"v2Games">, memberId: Id<"v2Members">, wire: string) {
  const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", memberId)).unique();
  if (!r || knownFamily(r.family)?.valuation !== "tree") return null;
  const rule = { family: r.family, params: r.params, tieBreaker: r.tieBreaker, ruleKey: r.ruleKey, contentHash: r.contentHash };
  const defence = r.defence ? { family: r.defence.family, params: r.defence.params, ruleKey: r.defence.ruleKey } : undefined;
  return valueWithParts(decode(wire, game.variant), game.variant, rule, scopeOf(game).objects, defence, penaltyWeightOf(game)).parts;
}



/** At most this many candidate moves per read (the face lists a few candidates). */
export const MAX_CANDIDATES = 4;

/**
 * The others' total bits on an object after each candidate move (playtest round 8: a player may see the others' TOTAL
 * before and after a candidate, never one player's rule or bits). The server applies each call to the object's live
 * state itself, so only states one move from where the object is can be asked about, not any state at all; at most four
 * per read. Reads the object, its state, the caller's seat, the seated players' rules (≤ 16, cold) and, per candidate,
 * whether another object holds its state (objects are unique; ≤ 4 index reads of ≤ 2 rows): it re-runs when this object moves or
 * another object moves onto or off a candidate's state. An invalid call answers null.
 */
/**
 * What the others' sum on an object would read after each candidate call, from the state the player knows (knowledge.ts)
 * (coordinator's call 33: a What if quote while the game runs is paid, `object.whatIf`, and blurred like every live
 * disclosure, a fresh draw per quote (`salt`); after the end, exact and free here). A candidate onto a state another
 * object holds says which object holds it (decision 24).
 */
export async function quoteOthers(ctx: QueryCtx, game: Doc<"v2Games">, memberId: Id<"v2Members">, object: Doc<"v2Objects">, state: Doc<"v2ObjectStates">, calls: Call[], salt: string | null) {
  const seats = await seatRules(ctx, game);
  const from = readsKnowledge(game, memberId) ? (await knownOf(ctx, object._id, memberId))?.state ?? state.state : state.state;
  const now = decode(from, game.variant), type = typeOf(game.variant), variant = variantOf(game.variant);
  const after = [];
  for (const call of calls) {
    const r = applyCall(type, variant, now, call);
    if (isInvalid(r)) { after.push(null); continue; }
    const wire = encode(r.result, game.variant);
    const exact = valuesOf(r.result, game.variant, seats, scopeOf(game).objects, penaltyWeightOf(game)).find(x => x.memberId === memberId)?.want ?? 0;
    const want = exact + (salt !== null && disclosesNoise(game) ? readingNoise(game, memberId, `quote:${object._id}:${state.version}:${wire}:${salt}`) : 0);
    const holders = await holdingRows(ctx, game._id, wire).take(2);
    const holder = holders.find(h => h.objectId !== object._id);
    const taken = holder ? (await ctx.db.get(holder.objectId))?.number ?? null : null;
    after.push({ state: wire, want, taken });
  }
  return { state: from, after };
}

/**
 * What if, free and exact: the app's live What if until it moves to `object.whatIf` (coordinator's call 33: while the
 * game runs a quote is paid and blurred); then this query goes, or serves only ended games.
 */
export const othersAt = query({
  args: { objectId: v.string(), calls: v.array(callV) },
  returns: v.object({ state: v.string(), after: v.array(v.union(v.object({ state: v.string(), want: v.number(), taken: v.union(v.number(), v.null()) }), v.null())) }),
  handler: async (ctx, { objectId, calls }) => {
    const { object, state } = await objectAndState(ctx, objectId);
    if (calls.length > MAX_CANDIDATES) fail("BAD_REQUEST", `Ask for at most ${MAX_CANDIDATES} moves`);
    const { game, member } = await requireSeat(ctx, object.gameId);
    // Exact sums are the ended game's (W5's #897: a live What if quotes the blurred reading through object.whatIf).
    if (game.phase !== "ended") fail("BAD_REQUEST", "The others' exact totals are shown once the game has ended");
    return await quoteOthers(ctx, game, member._id, object, state, calls, null);
  },
});

// Moved to playState.ts (queries that value nothing); re-exported for the engine modules that use them.
export { liveAgentsOf, logPage, objectAndState, MAX_AGENTS, MAX_OBJECT_MOVES, MAX_PROGRAMS, MAX_TUGS, MIN_TUG_FLIPS, moveView, ownAgent } from "./playState";
