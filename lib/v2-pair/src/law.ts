/**
 * Direct draws from the walk's stationary law on two-line systems (owner decisions 22 and 23). φ is the sum of six
 * independent mixed codes, so a system is two lines drawn exactly as line-q draws one (each a triple from the mixed
 * code, kept when canonical), sorted, and refused when the two are equal: the law on ordered pairs conditioned on
 * distinct lines, which is π on unordered pairs (each unordered pair arises from two ordered draws of equal weight).
 */
import type { Rng, Variant } from "@workspace/v2-core";
import { lineLaw, type Law } from "@workspace/v2-linear";
import { canonicalPair, type PairState } from "./pair.ts";

export function pairLaw(variant: Variant): Law<PairState> {
  const lines = lineLaw(variant);   // draws linesPerObject = 2 lines on the variant's domain
  return {
    draw(r: Rng, t: number) {
      const d = lines.draw(r, t);
      if (d.state === null) return d;
      const s = canonicalPair(d.state.lines, variant);
      return { state: "invalid" in s ? null : s, bits: d.bits, coords: d.coords };
    },
  };
}
