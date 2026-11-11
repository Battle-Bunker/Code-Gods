/**
 * 🙃 Opposite Nines: one unit per half-turn pair, drawn as a link through the middle of the board. A pair that adds up
 * to the target scores a primary point; every pair deducts its distance from the target in secondary points.
 */
import { lens } from "../lens.ts";
import type { Part } from "../model.ts";
import { halfTurnPairs } from "../../families/grid/beginner/_pairs.ts";
import { ninesTarget } from "../../families/grid/beginner/opposite_nines.ts";
import { pairTally, pairUnit } from "./pair-unit.ts";

type P = Record<string, never>;

export const oppositeNines = lens<P>({
  familyId: "opposite_nines",
  components: (_p, b) => {
    const T = ninesTarget(b.spec);
    return [`opposite pairs adding up to ${T}`, `how far the pairs are from ${T}`];
  },
  breakdown: (_p, b, parts) => {
    const T = ninesTarget(b.spec);
    return { unit: ["opposite pair", "opposite pairs"], items: pairTally(parts, "opposite pair", `adding up to ${T}`, n => `that ${n === 1 ? "misses" : "miss"} ${T}`) };
  },
  parts: (_p, b) => {
    const T = ninesTarget(b.spec), tile = (x: { r: number; c: number }) => b.say.tile(b.sym(x));
    return halfTurnPairs(b.N).map(([x, y]): Part => {
      const total = b.value(x) + b.value(y), gap = total - T, sum = `${tile(x)} + ${tile(y)} = ${total}`;
      return pairUnit([x, y], Math.abs(gap), `opposites make ${total}`, [
        { text: gap === 0 ? sum : `${sum}, not ${T}`, ok: gap === 0 },
        { text: gap === 0 ? `right on ${T}` : `${Math.abs(gap)} too ${gap > 0 ? "many" : "few"}`, ok: gap === 0, tier: 1 },
      ]);
    });
  },
});
