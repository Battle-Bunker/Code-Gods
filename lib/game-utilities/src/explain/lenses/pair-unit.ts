/**
 * One fixed pair of cells as a scoring unit, for the beginner pair families (🙃 Opposite Nines, 🪑 Step-Stool Mirror):
 * a capsule with a link between its two cells, a primary point when the pair hits (`miss` 0) and `miss` secondary
 * points deducted. Every cell is in exactly one pair, so the board picks the pair of the cell under the pointer.
 */
import type { Pair } from "../../families/grid/beginner/_pairs.ts";
import { count, tally } from "../lens.ts";
import type { BreakdownItem, Fact, Part } from "../model.ts";

export function pairUnit(pair: Pair, miss: number, title: string, facts: readonly Fact[]): Part {
  const [a, b] = pair;
  return {
    id: `pair:${a.r},${a.c}`, shape: "pair", group: "pair", cells: [a, b], points: [miss === 0 ? 1 : 0, -miss],
    title, facts, links: [{ from: a, to: b, ok: miss === 0 }],
  };
}

/** "2 opposite pairs adding up to 9", "6 opposite pairs that miss 9, 25 away in all". */
export const pairTally = (parts: readonly Part[], kind: string, hit: string, missed: (n: number) => string): BreakdownItem[] => tally(parts, [
  { of: t => t.points[0] > 0, text: n => `${count(n, kind)} ${hit}` },
  { of: () => true, text: (n, pts) => `${count(n, kind)} ${missed(n)}, ${-pts[1]} away in all` },
]);
