/**
 * Direct draws from the walk's stationary law on lines (owner decisions 22 and 23).
 *
 * Under the potential the law is π ∝ 2^−φ, and φ is a sum of independent complete integer codes: the mixed code on
 * (m, c) on whole-number lines, LINE_Q_CODES on the primitive triple (a, b, c) on fraction lines, and one such code per
 * line on a tuple of lines. Each code is complete (its Kraft sum is 1), so each coordinate is drawn exactly from
 * p(n) = 2^−bits(n), and a fraction line is a triple drawn this way and kept only when it is canonical (primitive,
 * b > 0 or b = 0 < a): the law conditioned on lines, which is π. There is no box on the coefficients (owner
 * decision 26): the codes alone normalise the law, so the canonical triples hold mass at most 1.
 *
 * A tilt t < 1 draws each coordinate from q_t(n) = 2^(−t·bits(n))/Z_t instead: heavier tails, for importance sampling
 * of rare scores. A draw reports φ (its total bits), and the law log2 Π Z_t over the coordinates every draw makes, so a
 * caller can weigh a draw by p/q = 2^(−φ) / Π q_t = 2^(−(1 − t)φ + log2Norm(t)).
 */
import { mixedInt, type IntCode, type Rng, type Variant } from "@workspace/v2-core";
import { inDomain, LINE_Q_CODES, lineParams, normalise, type Line, type LineState } from "./line.ts";

export interface LawDraw<S> {
  /** The drawn state, or null when the drawn coordinates are not a canonical state (the draw still counts). */
  readonly state: S | null;
  /** φ of the drawn coordinates (bits). */
  readonly bits: number;
}

export interface Law<S> {
  draw(r: Rng, t: number): LawDraw<S>;
  /** log2 of the product of Z_t over the coordinates one draw makes (0 at t = 1). */
  log2Norm(t: number): number;
}

export function lineLaw(variant: Variant): Law<LineState> {
  const p = lineParams(variant);
  // The codes one line's coordinates are drawn from, in order: (m, c) on Z, (a, b, c) on Q.
  const codes: readonly IntCode[] = p.domain === "Z" ? [mixedInt, mixedInt] : [LINE_Q_CODES.a, LINE_Q_CODES.b, LINE_Q_CODES.c];
  return {
    draw(r, t) {
      const lines: Line[] = [];
      let bits = 0, ok = true;
      for (let i = 0; i < p.linesPerObject; i++) {
        const xs = codes.map(code => { const n = code.sample(r, t); bits += code.bits(n); return n; });
        if (p.domain === "Z") {
          const [m, c] = xs as [bigint, bigint];
          const l = inDomain({ a: -m, b: 1n, c: -c }, p);
          if ("invalid" in l) ok = false; else lines.push(l);
        } else {
          const [a, b, c] = xs as [bigint, bigint, bigint];
          const l = inDomain(normalise(a, b, c), p);
          if ("invalid" in l || l.a !== a || l.b !== b || l.c !== c) ok = false; else lines.push(l);
        }
      }
      return { state: ok ? { lines } : null, bits };
    },
    log2Norm: t => p.linesPerObject * codes.reduce((s, code) => s + code.log2Norm(t), 0),
  };
}
