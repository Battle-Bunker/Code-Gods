/**
 * ↙️ Crosswise Threes: one unit per pair across the fold line (the diagonal from the top-right corner to the
 * bottom-left), drawn as a link across it. A pair 3 apart scores a primary point; every pair deducts how far its
 * difference is from 3. Cells on the fold line have no partner and score nothing, so they are no unit.
 */
import { lens } from "../lens.ts";
import type { Part } from "../model.ts";
import { APART, crosswisePairs } from "../../families/grid/beginner/crosswise_threes.ts";
import { pairTally, pairUnit } from "./pair-unit.ts";

type P = Record<string, never>;

export const crosswiseThrees = lens<P>({
  familyId: "crosswise_threes",
  components: () => [`crosswise pairs ${APART} apart`, `how far the pairs are from ${APART} apart`],
  breakdown: (_p, _b, parts) => ({ unit: ["pair", "pairs"], items: pairTally(parts, "pair", `${APART} apart`, () => `not ${APART} apart`) }),
  parts: (_p, b) => {
    const tile = (x: { r: number; c: number }) => b.say.tile(b.sym(x));
    return crosswisePairs(b.N).map(([x, y]): Part => {
      const apart = Math.abs(b.value(x) - b.value(y)), off = Math.abs(apart - APART), both = `${tile(x)} and ${tile(y)}`;
      return pairUnit([x, y], off, apart === 0 ? "the same" : `${apart} apart`, [
        { text: off === 0 ? `${both} are ${APART} apart` : apart === 0 ? `${both} are the same, not ${APART} apart` : `${both} are ${apart} apart, not ${APART}`, ok: off === 0 },
        { text: off === 0 ? `exactly ${APART} apart` : `${off} too ${apart < APART ? "close" : "far"}`, ok: off === 0, tier: 1 },
      ]);
    });
  },
});
