/**
 * Open bidding (archive/engine-v1 site/components/bidding.tsx EveryonesBids, the setup's bid visibility "open"): every
 * player's bids per rule family on offer, highest first, the viewer's own as "you". Families nobody bid on are left out.
 */
export interface OpenBid { who: string; percent: number; mine: boolean }
export function everyonesBids(
  families: readonly { family: string; title: string }[],
  others: readonly { name: string; bids: readonly { family: string; percent: number }[] }[],
  mine: readonly { family: string; percent: number }[],
): { family: string; title: string; bids: OpenBid[] }[] {
  return families.map(f => ({
    family: f.family, title: f.title,
    bids: [
      ...others.flatMap(o => o.bids.filter(b => b.family === f.family).map(b => ({ who: o.name, percent: b.percent, mine: false }))),
      ...mine.filter(b => b.family === f.family).map(b => ({ who: "you", percent: b.percent, mine: true })),
    ].sort((a, b) => b.percent - a.percent),
  })).filter(r => r.bids.length > 0);
}

/** The primary button (v1): Pass with no bids, Done bidding with some. */
export const primaryLabel = (bids: readonly unknown[]) => (bids.length ? "Done bidding" : "Pass");
/** After the press (v1's doneLine): "You passed. Waiting for 1 more player…", or that the rules are being dealt. */
export function doneLine(bids: readonly unknown[], waitingFor: number): string {
  const said = bids.length ? "You are done." : "You passed.";
  return waitingFor > 0 ? `${said} Waiting for ${waitingFor} more ${waitingFor === 1 ? "player" : "players"}…` : `${said} Everyone is done: dealing the rules…`;
}
/** The pricing in one example (v1's bidExample, its words). */
export const bidExample = (pricing: "first" | "second") => (pricing === "second"
  ? "Bid 10% on a rule: if you win it, at most 10% is taken off your final score (you pay the next-highest bid on it). If nobody bids, rules are dealt at random as usual."
  : "Bid 10% on a rule: if you win it, 10% is taken off your final score. If nobody bids, rules are dealt at random as usual.");
