/**
 * Direct draws from the walk's stationary law on two-line systems (owner decisions 22 and 23). φ is the sum of six
 * independent codes (PAIR_CODES: line-q's, with a zero rarer), so a system is two lines each drawn as a triple and
 * kept when canonical, sorted, and refused when the two are equal: the law on ordered pairs conditioned on
 * distinct lines, which is π on unordered pairs (each unordered pair arises from two ordered draws of equal weight).
 */
import type { Rng, Variant } from "@workspace/v2-core";
import { inDomain, lineParams, normalise, type Law, type Line } from "@workspace/v2-linear";
import { canonicalPair, PAIR_CODES, type PairState } from "./pair.ts";

const CODES = [PAIR_CODES.a, PAIR_CODES.b, PAIR_CODES.c];

export function pairLaw(variant: Variant): Law<PairState> {
  const p = lineParams(variant);
  return {
    draw(r: Rng, t: number) {
      const lines: Line[] = [];
      let bits = 0, ok = true;
      for (let i = 0; i < 2; i++) {
        const [a, b, c] = CODES.map(code => { const n = code.sample(r, t); bits += code.bits(n); return n; }) as [bigint, bigint, bigint];
        const l = inDomain(normalise(a, b, c), p);
        if ("invalid" in l || l.a !== a || l.b !== b || l.c !== c) ok = false; else lines.push(l);
      }
      if (!ok) return { state: null, bits };
      const s = canonicalPair(lines, variant);
      return { state: "invalid" in s ? null : s, bits };
    },
    log2Norm: t => 2 * CODES.reduce((s, code) => s + code.log2Norm(t), 0),
  };
}
