/**
 * Direct draws from the walk's stationary law on lines (owner decisions 22 and 23).
 *
 * Under the potential the law is π ∝ 2^−φ, and φ is a sum of independent mixed-integer codes: (m, c) on whole-number
 * lines, the primitive triple (a, b, c) on fraction lines, and one such code per line on a tuple of lines. The code is
 * complete (its Kraft sum is 1), so each coordinate is drawn exactly from p(n) = 2^−mixedInt(n) (sampleMixedInt), and a
 * fraction line is a triple drawn this way and kept only when it is canonical (primitive, b > 0 or b = 0 < a): the law
 * conditioned on lines, which is π. There is no box on the coefficients (owner decision 26): the code alone normalises
 * the law (Σ over all integers of 2^−mixedInt(n) is 1, so the canonical triples hold mass at most 1).
 *
 * A tilt t < 1 draws each coordinate from q_t(n) = 2^(−t·mixedInt(n))/Z_t instead: heavier tails, for importance
 * sampling of rare scores. A draw reports φ (its total bits) and how many coordinates it drew, so a caller can weigh it
 * by p/q = 2^(−φ) / Π q_t = 2^(−(1 − t)φ + k·log2 Z_t).
 */
import { mixedIntBits, sampleMixedInt, type Rng, type Variant } from "@workspace/v2-core";
import { inDomain, lineParams, normalise, type Line, type LineState } from "./line.ts";

export interface LawDraw<S> {
  /** The drawn state, or null when the drawn coordinates are not a canonical state (the draw still counts). */
  readonly state: S | null;
  /** φ of the drawn coordinates (bits). */
  readonly bits: number;
  /** How many coordinates were drawn (each from q_t). */
  readonly coords: number;
}

export interface Law<S> {
  draw(r: Rng, t: number): LawDraw<S>;
}

export function lineLaw(variant: Variant): Law<LineState> {
  const p = lineParams(variant);
  return {
    draw(r, t) {
      const lines: Line[] = [];
      let bits = 0, coords = 0, ok = true;
      for (let i = 0; i < p.linesPerObject; i++) {
        if (p.domain === "Z") {
          const m = sampleMixedInt(r, t), c = sampleMixedInt(r, t);
          bits += mixedIntBits(m) + mixedIntBits(c);
          coords += 2;
          const l = inDomain({ a: -m, b: 1n, c: -c }, p);
          if ("invalid" in l) ok = false; else lines.push(l);
        } else {
          const a = sampleMixedInt(r, t), b = sampleMixedInt(r, t), c = sampleMixedInt(r, t);
          bits += mixedIntBits(a) + mixedIntBits(b) + mixedIntBits(c);
          coords += 3;
          const l = inDomain(normalise(a, b, c), p);
          if ("invalid" in l || l.a !== a || l.b !== b || l.c !== c) ok = false; else lines.push(l);
        }
      }
      return { state: ok ? { lines } : null, bits, coords };
    },
  };
}
