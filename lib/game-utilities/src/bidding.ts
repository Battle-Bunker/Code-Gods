/**
 * The bid phase's assignment (docs/bid-phase.md; the owner's rule, 2026-11-11). Before a game is dealt, each player may
 * bid a handicap percentage on rule families of the game's pool. The bids are resolved highest first:
 *
 *   1. Order every bid by percentage, highest first; equal percentages in uniformly random order.
 *   2. Take the highest: that player wins that family. Remove every other bid on that family and every other bid by
 *      that player. Repeat until no bid is left.
 *   3. A family won by bid is exclusive: nobody else is dealt it. Each winner gets an instance of their family, its
 *      parameters drawn as the dealer draws them.
 *   4. Everybody else is dealt by the game's dealer from the families nobody won, exactly as without bidding (so two
 *      of them may still get the same family).
 *
 * With no bids at all the result IS the dealer's (`selector.select` with the same rng, nothing drawn before it), so a
 * table that passes plays exactly the game it would have played without a bid phase.
 */
import type { Instantiation, Rng } from "@workspace/game-types";
import type { UtilityDescriptor } from "./types.ts";
import { family } from "./catalog.ts";
import { availableFamilies, drawFrom, selector, type SelectOptions } from "./selectors.ts";

/** The smallest and largest bid, in whole percent. A bid of 0 is not a bid: claiming a family for nothing is "pass". */
export const BID_MIN_PERCENT = 1;
export const BID_MAX_PERCENT = 100;

/** What a winner pays: their own bid ("first"), or the highest bid they beat on that family ("second"; at least the minimum bid). */
export type BidPricing = "first" | "second";
export const BID_PRICINGS: readonly BidPricing[] = ["first", "second"];

export interface Bid {
  readonly playerId: string;
  readonly familyId: string;
  /** Whole percent, BID_MIN_PERCENT..BID_MAX_PERCENT. */
  readonly percent: number;
}
export interface BidWin {
  readonly playerId: string;
  readonly familyId: string;
  /** What the winner bid. */
  readonly percent: number;
  /** What the winner pays: the percentage taken off their score. */
  readonly handicap: number;
}

/** Why a bid is not valid, or null. One bid per (player, family); whole percent in range. */
export function bidProblem(bid: Bid): string | null {
  if (!Number.isInteger(bid.percent) || bid.percent < BID_MIN_PERCENT || bid.percent > BID_MAX_PERCENT) {
    return `A bid is a whole percentage from ${BID_MIN_PERCENT} to ${BID_MAX_PERCENT}`;
  }
  return null;
}

/**
 * Steps 1 and 2: who wins which family. Draws from `rng` only to order the bids (none when there are fewer than two),
 * so equal bids are won by a uniformly random bidder. Throws on an invalid or repeated bid.
 */
export function resolveBids(bids: readonly Bid[], rng: Rng, pricing: BidPricing = "first"): BidWin[] {
  const seen = new Set<string>();
  for (const b of bids) {
    const problem = bidProblem(b);
    if (problem) throw new Error(problem);
    const key = `${b.playerId}\0${b.familyId}`;
    if (seen.has(key)) throw new Error(`Two bids by ${b.playerId} on ${b.familyId}`);
    seen.add(key);
  }
  // A uniform shuffle, then a stable sort by percentage: every order of equal bids is equally likely.
  const order = [...bids];
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  order.sort((a, b) => b.percent - a.percent);
  const wins: BidWin[] = [];
  let left = order;
  while (left.length) {
    const top = left[0];
    // Second price: the best bid on this family still standing behind the winner's (bidders who already won another
    // family are out), never below the minimum bid.
    const runnerUp = left.find(b => b !== top && b.familyId === top.familyId);
    wins.push({ playerId: top.playerId, familyId: top.familyId, percent: top.percent,
      handicap: pricing === "second" ? runnerUp?.percent ?? BID_MIN_PERCENT : top.percent });
    left = left.filter(b => b.familyId !== top.familyId && b.playerId !== top.playerId);
  }
  return wins;
}

export interface BidDeal {
  /** One utility function per player, in the order of `playerIds`. */
  readonly deal: UtilityDescriptor[];
  /** The bids that won, highest first. Empty when nobody bid: then `deal` is exactly the dealer's. */
  readonly wins: BidWin[];
  /** Winning bids that could not be honoured because the other players could not be dealt from what was left (lowest first). */
  readonly dropped: BidWin[];
}

/**
 * The whole deal of a game with a bid phase. `bids` by players not in `playerIds`, or on families the game does not
 * deal (unknown, excluded, unavailable on this instantiation), are ignored: the caller validates what players send, and
 * a player who left takes their bids with them.
 *
 * If the players without a win cannot be dealt from the families left (every family was won, or too few distinct rules
 * remain), the lowest winning bid is dropped (that player is dealt at random, with no handicap, and the family returns
 * to the pool) until they can.
 */
export function dealWithBids(selectorId: string, inst: Instantiation, playerIds: readonly string[], bids: readonly Bid[], rng: Rng,
  options: SelectOptions = {}, pricing: BidPricing = "first"): BidDeal {
  const dealer = selector(selectorId);
  if (new Set(playerIds).size !== playerIds.length) throw new Error("Duplicate player");
  const pool = new Set(availableFamilies(inst, "reward", options.exclude).map(f => f.id));
  const players = new Set(playerIds);
  const valid = bids.filter(b => players.has(b.playerId) && pool.has(b.familyId));
  const all = resolveBids(valid, rng, pricing);
  // Nobody bid: the dealer's own deal, untouched (the same rng, nothing drawn before it).
  if (!all.length) return { deal: dealer.select(inst, playerIds.length, rng, options), wins: [], dropped: [] };
  const hasTable = options.hasTable ?? (() => true);
  const penalties = options.defenceGoals === true ? availableFamilies(inst, "penalty", options.excludeDefence) : [];
  let failure: unknown;
  for (let kept = all.length; kept > 0; kept--) {
    const wins = all.slice(0, kept);
    try {
      const byPlayer = new Map<string, UtilityDescriptor>();
      for (const w of wins) {
        const reward = drawFrom([family(w.familyId)], inst, rng, hasTable);
        if (!reward) throw new Error(`No rule of the family ${w.familyId} can be dealt for ${inst.key}`);
        const penalty = options.defenceGoals === true ? drawFrom(penalties, inst, rng, hasTable) : null;
        if (options.defenceGoals === true && !penalty) throw new Error(`No calibrated defence goal is allowed for ${inst.key}`);
        byPlayer.set(w.playerId, penalty ? { ...reward, penalty } : reward);
      }
      const rest = playerIds.filter(id => !byPlayer.has(id));
      const dealt = rest.length
        ? dealer.select(inst, rest.length, rng, { ...options, exclude: [...(options.exclude ?? []), ...wins.map(w => w.familyId)] })
        : [];
      rest.forEach((id, i) => byPlayer.set(id, dealt[i]));
      return { deal: playerIds.map(id => byPlayer.get(id)!), wins, dropped: all.slice(kept).reverse() };
    } catch (error) { failure = error; }
  }
  // No bid can be honoured: the dealer's own deal (which throws its own error if the game cannot be dealt at all).
  void failure;
  return { deal: dealer.select(inst, playerIds.length, rng, options), wins: [], dropped: [...all].reverse() };
}

/**
 * A total with a handicap taken off: `percent` of its size, always downwards (a negative total, possible with defence
 * goals, gets more negative: a handicap never helps). No handicap (0 or absent) returns the total itself.
 */
export function applyHandicap(total: number, percent: number | undefined): number {
  if (!percent) return total;
  return total - Math.abs(total) * percent / 100;
}
