/** The two-line system object type and its variant (docs/engine-v2/two-line-systems.md §1). */
import type { ObjectType, Variant } from "@workspace/v2-core";
import { normalise, type Line } from "@workspace/v2-linear";
import { canonicalPair, decodePair, encodePair, pairBits, type PairState } from "./pair.ts";
import { pairRepresentations } from "./representations.ts";
import { pairMutators } from "./mutators.ts";
import { pairFamilies } from "./families.ts";

/**
 * Two lines on the rationals, line-q's codes (no box: owner decision 26): linesPerObject 2 makes line-q's mutators price "which line" as
 * one bit. Fifteen mutators, uniform "which" (log2 15).
 */
export const pairQ: Variant = {
  id: "pair-q", objectType: "pair", mutators: pairMutators.map(m => m.id), birthMixSteps: 64,
  params: { domain: "Q", linesPerObject: 2, argDomain: "Q" },
};

export const pairType: ObjectType<PairState> = {
  id: "pair",
  version: 1,
  variants: [pairQ],
  canonical: (s, v) => canonicalPair(s.lines, v),
  encode: encodePair,
  decode: decodePair,
  readLength: pairBits,
  sites: () => 1,
  // The law's centre: the two axes, y = 0 and x = 0.
  origin: () => ({ lines: [{ a: 0n, b: 1n, c: 0n }, { a: 1n, b: 0n, c: 0n }] }),
  *enumerate(v) {
    // Systems of two small lines: primitive triples with |a|, |b| ≤ 3 and |c| ≤ 6, every unordered pair once.
    const small: Line[] = [];
    for (let a = -3n; a <= 3n; a++) for (let b = 0n; b <= 3n; b++) for (let c = -6n; c <= 6n; c++) {
      const n = normalise(a, b, c);
      if (!("invalid" in n) && n.a === a && n.b === b && n.c === c) small.push(n);
    }
    for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
      const s = canonicalPair([small[i]!, small[j]!], v);
      if (!("invalid" in s)) yield s;
    }
  },
  representations: pairRepresentations,
  mutators: pairMutators,
  families: [...pairFamilies],
};
