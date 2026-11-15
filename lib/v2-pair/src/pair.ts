/**
 * The two-line system (docs/engine-v2/two-line-systems.md §1): ONE object made of two different lines over Q, each
 * line-q's primitive triple (a, b, c) of a·x + b·y + c = 0. The two lines are an unordered set: the canonical state
 * lists them sorted by (a, b, c), so writing them the other way round is the same object, and a swapped copy is never a
 * second object (owner decision 24). Two lines may be parallel (the answer is then undefined); they may not be equal.
 * φ is the sum of the six numbers' codes (PAIR_CODES: line-q's, with a zero rarer, trial 31), so the law is π ∝ 2^−φ
 * on distinct pairs. Only the rationals (pair-q): the codes are the triple's.
 */
import { Qn, q, type Invalid, type Q, type Variant } from "@workspace/v2-core";
import { mixedIntCode, stepsIntCode, type IntCode } from "@workspace/v2-core";
import { decodeLine, encodeLine, inDomain, LINE_Q_CODES, lineParams, type Line, type LineState } from "@workspace/v2-linear";

/** Exactly two lines, sorted, different. The same shape as a line object, so line-q's mutators move either line. */
export type PairState = LineState;

const cmpBig = (x: bigint, y: bigint): number => (x < y ? -1 : x > y ? 1 : 0);
export const cmpLine = (p: Line, r: Line): number => cmpBig(p.a, r.a) || cmpBig(p.b, r.b) || cmpBig(p.c, r.c);

/** The canonical pair (in the variant's domain, sorted), or why not. */
export function canonicalPair(lines: readonly Line[], v: Variant): PairState | Invalid {
  if (lines.length !== 2) return { invalid: "a system has two lines" };
  const p = lineParams(v);
  const out: Line[] = [];
  for (const l of lines) {
    const n = inDomain(l, p);
    if ("invalid" in n) return n;
    out.push(n);
  }
  out.sort(cmpLine);
  if (cmpLine(out[0]!, out[1]!) === 0) return { invalid: "the two lines of a system must be different" };
  return { lines: out };
}

export const encodePair = (s: PairState): string => s.lines.map(encodeLine).join(";");
export function decodePair(w: string): PairState {
  const parts = w.split(";");
  if (parts.length !== 2) throw new SyntaxError(`Not a system of two lines: ${w}`);
  const lines = parts.map(decodeLine);
  if (cmpLine(lines[0]!, lines[1]!) >= 0) throw new SyntaxError(`Not a canonical system (sorted, different lines): ${w}`);
  return { lines };
}
/**
 * The code of each line's coefficients in a system (the coordinator's declared trial, 15 Nov; two-line-systems.md §11):
 * as line-q's (code C3) but with a zero rarer, a by p(0) = 1/64 and b by p(0) = 1/256. Under line-q's 1/8 and 1/16 a
 * quarter of systems were born with a horizontal or vertical line, and such a pair is a cheap shared basin: a right
 * angle, a crossing at a grid point and a whole x-intercept for nothing (test 2's best states). c keeps line-q's code.
 */
export const PAIR_CODES: { readonly a: IntCode; readonly b: IntCode; readonly c: IntCode } =
  { a: mixedIntCode(1 / 64), b: stepsIntCode(1 / 256), c: LINE_Q_CODES.c };
/** One line's code length in a system. */
export const pairLineBits = (l: Line): number => PAIR_CODES.a.bits(l.a) + PAIR_CODES.b.bits(l.b) + PAIR_CODES.c.bits(l.c);
export const pairBits = (s: PairState, _v: Variant): number => s.lines.reduce((t, l) => t + pairLineBits(l), 0);

// ---------------------------------------------------------------- geometry (exact)

/** What the two equations give together: the determinant, the normals' dot product and Cramer's numerators. */
export interface PairFacts {
  /** D = a1·b2 − a2·b1: "the number you divide by" when you eliminate; 0 for parallel lines. */
  readonly D: bigint;
  /** a1·a2 + b1·b2: 0 for perpendicular lines. */
  readonly dot: bigint;
  readonly nx: bigint;
  readonly ny: bigint;
  /** The answer (the crossing), or null for parallel lines. */
  readonly P: { readonly x: Q; readonly y: Q } | null;
  /** The steeper line's index (a vertical line is steepest; on a tie, the first) and the other's. */
  readonly s: 0 | 1;
  readonly o: 0 | 1;
}
const abs = (x: bigint): bigint => (x < 0n ? -x : x);
export function facts(st: PairState): PairFacts {
  const [L1, L2] = st.lines as [Line, Line];
  const D = L1.a * L2.b - L2.a * L1.b, dot = L1.a * L2.a + L1.b * L2.b;
  const nx = L1.b * L2.c - L2.b * L1.c, ny = L1.c * L2.a - L2.c * L1.a;
  // |a1/b1| < |a2/b2| ⇔ |a1|·b2 < |a2|·b1 (b ≥ 0); b = 0 is steepest.
  const steeper2 = L2.b === 0n ? L1.b !== 0n : L1.b !== 0n && abs(L2.a) * L1.b > abs(L1.a) * L2.b;
  const s = steeper2 ? 1 : 0;
  return { D, dot, nx, ny, P: D === 0n ? null : { x: q(nx, D), y: q(ny, D) }, s, o: (1 - s) as 0 | 1 };
}
export const yIntercept = (l: Line): Q | null => (l.b === 0n ? null : q(-l.c, l.b));
export const xIntercept = (l: Line): Q | null => (l.a === 0n ? null : q(-l.c, l.a));
export const gradient = (l: Line): Q | null => (l.b === 0n ? null : q(-l.a, l.b));
export const qAbs = Qn.abs;

/**
 * Which line of `prev` each line of `next` is, for the views' colours (display only: the state is an unordered set, so
 * its canonical order can flip after a move). A line that did not change keeps its colour; else a line keeps the
 * colour of the line with its normal (a, b) (a translate or a shift); else the moved line takes the other colour.
 * Returns [the prev index of next's line 1, the prev index of next's line 2].
 */
export function matchLines(prev: PairState, next: PairState): [0 | 1, 0 | 1] {
  const same = (x: Line, y: Line) => cmpLine(x, y) === 0, normal = (x: Line, y: Line) => x.a === y.a && x.b === y.b;
  for (const eq of [same, normal]) for (const k of [0, 1] as const) for (const j of [0, 1] as const) {
    if (eq(next.lines[k]!, prev.lines[j]!)) {
      const other = (1 - j) as 0 | 1;
      return k === 0 ? [j, other] : [other, j];
    }
  }
  return [0, 1];
}
