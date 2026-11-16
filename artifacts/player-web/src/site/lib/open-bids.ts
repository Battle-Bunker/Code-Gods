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
