/**
 * 🪑 Step-Stool Mirror: one unit per folded pair (a cell and the one it lands on when the board folds top onto bottom),
 * drawn as a vertical link. A pair one apart scores a primary point; every pair deducts how far its difference is from 1.
 */
import { lens } from "../lens.ts";
import type { Part } from "../model.ts";
import { foldPairs } from "../../families/grid/beginner/_pairs.ts";
import { pairTally, pairUnit } from "./pair-unit.ts";

type P = Record<string, never>;

export const stepStool = lens<P>({
  familyId: "step_stool",
  components: () => ["folded pairs one apart", "how far the pairs are from one apart"],
  breakdown: (_p, _b, parts) => ({ unit: ["pair", "pairs"], items: pairTally(parts, "pair", "one apart", () => "not one apart") }),
  parts: (_p, b) => {
    const tile = (x: { r: number; c: number }) => b.say.tile(b.sym(x));
    return foldPairs(b.N).map(([x, y]): Part => {
      const apart = Math.abs(b.value(x) - b.value(y)), off = Math.abs(apart - 1), both = `${tile(x)} and ${tile(y)}`;
      return pairUnit([x, y], off, off === 0 ? "one apart" : apart === 0 ? "the same" : `${apart} apart`, [
        { text: off === 0 ? `${both} are one apart` : apart === 0 ? `${both} are the same, not one apart` : `${both} are ${apart} apart, not one`, ok: off === 0 },
        { text: off === 0 ? "exactly one apart" : `${off} too ${apart === 0 ? "close" : "far"}`, ok: off === 0, tier: 1 },
      ]);
    });
  },
});
