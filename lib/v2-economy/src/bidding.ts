/**
 * The bid phase's mechanism (integration plan §5.9; copied and cleaned from game-utilities' bidding.ts). Before a game
 * is dealt, each player may bid a handicap percentage on rule families. The bids are resolved highest first:
 *
 *   1. Order every bid by percentage, highest first; equal percentages in uniformly random order.
 *   2. Take the highest: that player wins that family. Remove every other bid on that family and every other bid by
 *      that player. Repeat until no bid is left.
 *   3. A family won by bid is exclusive: nobody else is dealt it.
 *   4. Everybody else is dealt by the dealer from the families nobody won, exactly as without bidding.
 *
 * With no bids nothing is drawn from the rng before the dealer, so a table that passes plays exactly the game it would
 * have played without a bid phase. Players and families are opaque ids.
 */
import type { Rng } from "@workspace/v2-core";

/** The smallest and largest bid, in whole percent. A bid of 0 is not a bid: claiming a family for nothing is a pass. */
export const BID_MIN_PERCENT = 1;
export const BID_MAX_PERCENT = 100;

/** What a winner pays: their own bid ("first"), or the best bid they beat on that family ("second"; at least the minimum). */
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
  /** What the winner pays: the percentage taken off their totals. */
  readonly handicap: number;
}

/** Why a bid is not valid, or null. */
export function bidProblem(bid: Bid): string | null {
  if (!Number.isInteger(bid.percent) || bid.percent < BID_MIN_PERCENT || bid.percent > BID_MAX_PERCENT) {
    return `A bid is a whole percentage from ${BID_MIN_PERCENT} to ${BID_MAX_PERCENT}`;
  }
  return null;
}

/**
 * Steps 1 and 2: who wins which family, highest first. Draws from `rng` only to order the bids (nothing when there are
 * fewer than two), so equal bids are won by a uniformly random bidder. Throws on an invalid or repeated bid.
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
  for (let i = order.length - 1; i > 0; i--) { const j = rng.below(i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
  order.sort((a, b) => b.percent - a.percent);
  const wins: BidWin[] = [];
  let left = order;
  while (left.length) {
    const top = left[0]!;
    // Second price: the best bid on this family still standing behind the winner's (bidders who already won another
    // family are out), never below the minimum bid.
    const runnerUp = left.find(b => b !== top && b.familyId === top.familyId);
    wins.push({ playerId: top.playerId, familyId: top.familyId, percent: top.percent,
      handicap: pricing === "second" ? runnerUp?.percent ?? BID_MIN_PERCENT : top.percent });
    left = left.filter(b => b.familyId !== top.familyId && b.playerId !== top.playerId);
  }
  return wins;
}

/** How the deal's dealer is reached: it may throw when it cannot deal (the caller then drops the lowest win). */
export interface BidDealer<D> {
  /** One deal of the family `familyId` for a winner, drawn as the dealer draws it. */
  dealFamily(familyId: string, rng: Rng): D;
  /** `count` deals from the pool without `excluded` (the won families), exactly as the dealer deals without bids. */
  dealRest(count: number, excluded: readonly string[], rng: Rng): D[];
}

export interface BidDeal<D> {
  /** One deal per player, in the order of `playerIds`. */
  readonly deal: D[];
  /** The bids that won, highest first. Empty when nobody bid: then `deal` is exactly the dealer's. */
  readonly wins: BidWin[];
  /** Winning bids that could not be honoured because the others could not be dealt from what was left (lowest first). */
  readonly dropped: BidWin[];
}

/**
 * The whole deal with a bid phase. Bids by players not in `playerIds` or on families outside `pool` are ignored. With
 * no counted bid the deal is `dealer.dealRest(n, [], rng)` with nothing drawn before it. If the players without a win
 * cannot be dealt from the families left (the dealer throws), the lowest winning bid is dropped (that player is dealt
 * with the rest, without a handicap, and the family returns to the pool) until they can.
 */
export function dealWithBids<D>(playerIds: readonly string[], pool: readonly string[], bids: readonly Bid[], rng: Rng,
  dealer: BidDealer<D>, pricing: BidPricing = "first"): BidDeal<D> {
  if (new Set(playerIds).size !== playerIds.length) throw new Error("Duplicate player");
  const players = new Set(playerIds), families = new Set(pool);
  const all = resolveBids(bids.filter(b => players.has(b.playerId) && families.has(b.familyId)), rng, pricing);
  if (!all.length) return { deal: dealer.dealRest(playerIds.length, [], rng), wins: [], dropped: [] };
  for (let kept = all.length; kept > 0; kept--) {
    const wins = all.slice(0, kept);
    try {
      const byPlayer = new Map<string, D>();
      for (const w of wins) byPlayer.set(w.playerId, dealer.dealFamily(w.familyId, rng));
      const rest = playerIds.filter(id => !byPlayer.has(id));
      const dealt = rest.length ? dealer.dealRest(rest.length, wins.map(w => w.familyId), rng) : [];
      rest.forEach((id, i) => byPlayer.set(id, dealt[i]!));
      return { deal: playerIds.map(id => byPlayer.get(id)!), wins, dropped: all.slice(kept).reverse() };
    } catch { /* drop the lowest win and try again */ }
  }
  // No win can be honoured: the dealer's own deal (which throws its own error if the game cannot be dealt at all).
  return { deal: dealer.dealRest(playerIds.length, [], rng), wins: [], dropped: [...all].reverse() };
}

/**
 * A total with a handicap taken off: `percent` of its size, always downwards (net = total − h% × |total|). No handicap
 * (0 or absent) returns the total itself.
 */
export function applyHandicap(total: number, percent: number | undefined): number {
  if (!percent) return total;
  return total - Math.abs(total) * percent / 100;
}
