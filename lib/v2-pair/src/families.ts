/**
 * The two-line pool (docs/engine-v2/two-line-systems.md §3): nine families, each a primary a 12-year-old can check on
 * the graph or the stacked equations (a distance to an exact condition, smaller better) and two tie-breakers tied to
 * the primary's ANCHOR, the whole number it closes in on (owner decision 29). Every tie-breaker is unbounded (decision
 * 26) and has a declared sense: big, small, prime (a big smallest prime factor), smooth (many prime factors) or shared (a
 * big common factor with another aspect). Senses are balanced so that one basic strategy (a smooth scale-up of the
 * picture, a big prime on an axis) does not climb most of a table at once (decision 30); §4 of the doc measures it.
 */
import { Qn, q, ref, type ElementRef, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import { distanceToWhole, fromMC, nearestInteger, normalise, primeFactorCount, smallestPrimeFactor, type Line } from "@workspace/v2-linear";
import type { PairState } from "./pair.ts";

type Ctx = EvalContext<PairState>;
/**
 * A family's dealt numbers (owner decision 41; the coordinator's call 18, parameter drift): a residue filter (q, r) on
 * the whole number the primary closes in on, or a target k. Families without a natural number on the card take {}.
 */
export type PairParams = { readonly q?: number; readonly r?: number; readonly k?: number };
type P = PairParams;
export type Sense = "big" | "small" | "prime" | "smooth" | "shared";
/** A tie-breaker with its declared sense (what the deal and the tension measurements read). */
export interface PairLayer extends Layer<P> { readonly hill: Sense }

const main = (id: string, title: string, sentence: string | ((p: P) => string), rep: string, sense: "min" | "max" = "min"): Layer<P> =>
  ({ id, title, sentence: p => (typeof sentence === "string" ? sentence : sentence(p)), rep, sense });
/**
 * No layer here is marked measure "prime": that tail (½ bit per unit) is the cost of a prime WRITTEN as a coefficient,
 * and every prime a pair's rules read is derived (Cramer's rule, an intercept, a gap, a ratio), so it can be big and cheap:
 * −9x + 14y + 5 = 0 with −2x + 3y − 104 = 0 has D = 1 and |x| + |y| = 2417, a prime, for about 60 bits of φ. The
 * size tail (a log ramp) is used instead. The collapse check on pair-q found it (two-line-systems.md §7).
 */
const tb = (id: string, title: string, sentence: string | ((p: P) => string), rep: string, hill: Sense): PairLayer =>
  ({ id, title, sentence: typeof sentence === "string" ? () => sentence : sentence, rep, sense: hill === "small" ? "min" : "max", hill });
/**
 * How far v is from the nearest non-zero whole multiple of m (m ≥ 1). 0 is no multiple: two lines through one point of
 * an axis would otherwise meet every level's target at once (a top the climb never leaves; the review of §10).
 */
export function offMultiple(v: Q, m: bigint): Q {
  const t = Qn.div(v, q(m)), f = t.n / t.d - (t.n % t.d < 0n ? 1n : 0n);   // ⌊v / m⌋, rounding down for negatives too
  const lo = f === 0n ? -1n : f, hi = f + 1n === 0n ? 1n : f + 1n;
  const below = Qn.abs(Qn.sub(v, q(lo * m))), above = Qn.abs(Qn.sub(q(hi * m), v));
  return Qn.cmp(below, above) <= 0 ? below : above;
}
/**
 * A tie-breaker that reads the level the main part reached (design-principles.md row 3; the coordinator, 15 Nov):
 * a number should be a multiple of q^(L+1), L the level (q⁰ = 1 below level 0), so each step up the ladder makes the
 * target q times coarser and restarts the tie-breaker's climb.
 */
/** Word helpers for the cards (round 24: at most 30 words, the pattern shown by numbers). */
const big = (n: number) => n.toLocaleString("en");
const times = (qq: number, e: number) => `${big(qq ** e)} times`;
/** "(that − 4) ÷ 7 does too, and so on": the residue ladder's next step said as a rule a child can follow. */
const again = (what: string, p: P) => `(${what} − ${p.r}) ÷ ${p.q} does too, and so on.`;
/** A ladder's place said in words for the card (no "level"): a residue or power ladder from 1 up, a valuation from 0. */
const stepsUp = (L: number, from = 1) => (L < from ? "not on your pattern yet" : L === from ? "on your pattern" : `on your pattern, ${L - from} step${L - from === 1 ? "" : "s"} up`);
/** A power ladder's own number at level L: k^T(L) (1 below the first rung), times k: the next multiplication's size. */
const powerNumber = (k: number, level: number): bigint => BigInt(k) ** BigInt(triangle(Math.max(0, level)) + 1);
/** |n|, at least 1: a level's number read as a modulus or a factor. */
const mod1 = (n: bigint): bigint => (absB(n) > 0n ? absB(n) : 1n);
const levelTarget = (qq: number, level: number): bigint => BigInt(qq) ** BigInt(Math.max(0, level + 1));

/**
 * The ladder with no top (docs/engine-v2/design-principles.md row 1, the coordinator's call applying the owner's
 * principles, 15 Nov): every dealt main part climbs levels 1, 2, 3, … without end, each level rarer and dearer than the
 * last. A residue ladder (q, r) asks for a whole number leaving r when divided by q, then leaving R₂ = r + rq when
 * divided by q², then R₃ = r + rq + rq² when divided by q³, and so on (written in base q, it ends in the digit r, then
 * rr, then rrr): level j is q times rarer than level j − 1 and needs a number at least about q^(j−1), so it costs about
 * log₂ q more bits of φ. The remainder r is never 0 or q − 1, the two remainders a single number (0 or −1) meets at
 * every level, which would make a top. A power ladder (k) asks for k, then k³, then k⁶, … (powerLadder).
 *
 * The score is q^L × (1 + 1/(1 + d)) (or k^L × …), bigger better: L the highest level met, d how far the state is from
 * the next level (0 never, or that level would be met). So every met level beats every state below it, nearer the
 * next level is better. Past the measured knots the value tail runs along the level at the rate measured between levels
 * ("ladder-log", trial 28 for pairs), capped at each level by the φ of a cheap system reaching it (`witness`): a level
 * never pays more than a state that reaches it costs.
 */
/**
 * A rung is a window, not a point (trial 34, the coordinator's order after #856): level L is held while the state is
 * within 1/(L + 2) of it (its distance to the level's number plus any exactness the main part asks, an angle or a whole
 * x), so ½ at the first valuation level, ⅓ at the first residue or power level, narrower each level up. Exact rungs
 * froze a seat on a rung: almost every single move broke the level (two-line-systems.md §13), so a seat there had no
 * tie-breaker work and no next step. The tie-breakers read the rung's own number, rounded.
 */
export const rungWindow = (level: number): Q => q(1n, BigInt(level + 2));
const ladderScore = (base: bigint, level: number, next: Q): Q => Qn.mul(q(base ** BigInt(level)), Qn.add(q(1), Qn.inv(Qn.add(q(1), next))));
/** The highest level met (off(j) = 0) and the score; off(j) is non-decreasing in j for a residue ladder. */
function climb(base: bigint, off: (j: number) => Q): { level: number; u: Q } {
  let level = 0, d = off(1);
  // A level needs a number of size about base^(level − 1), so a state's levels are bounded by its size.
  while (level < 4096 && Qn.cmp(d, rungWindow(level + 1)) <= 0) d = off(++level + 1);
  return { level, u: ladderScore(base, level, d) };
}
/** R_j: the remainder at level j, j base-q digits r. */
const rungRemainder = (qq: bigint, r: bigint, j: number): bigint => { let R = 0n; for (let i = 0; i < j; i++) R = R * qq + r; return R; };
/** The residue ladder of v (with `other`, the rest of the main part's exact condition, added at every level). */
export function residueLadder(v: Q, p: P, other: Q = q(0), minAbs = 0n): { level: number; u: Q; n: bigint } {
  const qq = BigInt(p.q!), r = BigInt(p.r!);
  const { level, u } = climb(qq, j => Qn.add(other, anchorB(v, qq ** BigInt(j), rungRemainder(qq, r, j), minAbs).off));
  return { level, u, n: anchorB(v, qq, r, minAbs).n };
}
/**
 * The valuation ladder (the coordinator's calls, 15 Nov: rungs joined by a representation shortcut, decision 25; each
 * level harder than the last, decisions 26 and 30): v a whole number q^t × m with m leaving r when divided by q (and
 * `other` 0) is at level L, the highest with T(L) = L(L + 1)/2 ≤ t. A stretch by q (one move, priced as a choice)
 * multiplies the number by q, so level L + 1 is L + 1 stretches above level L: the climb is ongoing and dearer at every
 * level. 0 is on no level (m ≠ 0). The score is q^L × (1 + 1/(1 + d)), d how far from level L + 1 (the nearest q^T(L+1)
 * × m', m' leaving r); off the ladder, (1/q) × (1 + 1/(1 + d)), d how far from level 0, below every level. The score
 * grows one factor q per LEVEL (not per stretch), and a level costs ever more stretches, each dearer on a bigger line
 * (trial 29's shortcut floor), while the value of a level is capped by a witness's φ (trial 28): the runaway of §9
 * (59 bits in a 600 s game) stays closed. n: the number on
 * the ladder, else the nearest number leaving r when divided by q.
 */
const triangle = (L: number) => (L * (L + 1)) / 2;
export function valuationLadder(v: Q, p: P, other: Q = q(0), minAbs = 0n): { level: number; u: Q; n: bigint } {
  const qq = BigInt(p.q!), r = BigInt(p.r!);
  let level = -1;
  // The rounded number (the lower on a tie), held while within the window of its level (rungWindow).
  const n0 = Qn.floor(v), nr = Qn.cmp(Qn.sub(v, q(n0)), q(1n, 2n)) <= 0 ? n0 : n0 + 1n, dist = Qn.add(other, Qn.abs(Qn.sub(v, q(nr))));
  if (nr !== 0n && absB(nr) >= minAbs) {
    let m = nr, t = 0;
    while (m % qq === 0n) { m /= qq; t++; }
    if (((m % qq) + qq) % qq === r) { level = 0; while (triangle(level + 1) <= t) level++; }
    while (level >= 0 && Qn.cmp(dist, rungWindow(level)) > 0) level--;
  }
  const T = BigInt(triangle(level + 1)), d = Qn.add(other, anchorB(v, qq ** (T + 1n), r * qq ** T, minAbs).off);
  const u = Qn.mul(level >= 0 ? q(qq ** BigInt(level)) : q(1n, qq), Qn.add(q(1), Qn.inv(Qn.add(q(1), d))));
  return { level, u, n: level >= 0 ? nr : anchorB(v, qq, r, minAbs).n };
}
/**
 * The power ladder: off(t) is the distance from the rung whose number is t (with `other` added), V-shaped in t. Its
 * rungs are triangular, as the valuation ladder's: level L at k^T(L), T(L) = L(L + 1)/2 (k, k³, k⁶, …), so each level
 * takes one more multiplication by k than the last (with a rung at every power, one stretch or turn a level, a Divide By
 * object climbed 40 levels and 84 bits in a game). The rungs are not nested (k³ is not k), so level L is met at an exact
 * k^T(L) (off 0), and d is the distance to the next rung; a state on no rung (L 0) takes d to the nearest rung. The scan
 * stops where off stops falling, past the state's size.
 */
export function powerLadder(k: number, off: (target: bigint) => Q): { level: number; u: Q } {
  const kb = BigInt(k), rung = (L: number) => kb ** BigInt(triangle(L));
  let level = 0, best: Q | null = null, prev: Q | null = null;
  for (let j = 1; j <= 4096; j++) {
    const o = off(rung(j));
    if (Qn.cmp(o, rungWindow(j)) <= 0) level = j;
    if (best === null || Qn.cmp(o, best) < 0) best = o;
    if (prev !== null && Qn.cmp(o, prev) >= 0) break;
    prev = o;
  }
  return { level, u: ladderScore(kb, level, level > 0 ? off(rung(level + 1)) : best!) };
}
/**
 * The valuation ladders dealt: q 5 or 7 and every r from 1 to q − 1 (a level never meets 0). q 3 was measured and is not
 * dealt: a stretch by 3 is so cheap a move that a climber blind to cost reached 34–51 bits on Steep Ratio in 30 moves
 * (two-line-systems.md §9).
 */
export const VALUATIONS: readonly P[] = [5, 7].flatMap(q => Array.from({ length: q - 1 }, (_, i) => ({ q, r: i + 1 })));
/** The residue ladders measured for the pool: q 5, 7 or 11, r from 1 to q − 2 (never 0 or q − 1: those have a top). */
export const LADDERS: readonly P[] = [5, 7, 11].flatMap(q => Array.from({ length: q - 2 }, (_, i) => ({ q, r: i + 1 })));

/**
 * The dealt numbers (two-line-systems.md §9.2, lib/v2-agents scripts/pair-reach.ts). Measured over LADDERS, VALUATIONS,
 * k 2–11 (Divide By) and 2–7 (Gap Ratio). Dealt: per family, the largest set where for every tie-breaker
 *  - a greedy climber from 40 births reaches within 1 bit of the family's median;
 *  - and whose value functions pass the engine's equal-opportunity audit (test/unit/v2-params-equal.test.ts): for the
 *    valuation ladders (Whole Answer, High Start, Steep Ratio) the ladder audit, each level's least bits less the code
 *    cost of its cheapest number within 0.5 bits (the coordinator's call 19); for the others top and median knots
 *    within 1 bit as intervals (the band under drift).
 */
const R = (q: number, ...rs: number[]) => rs.map(r => ({ q, r }));
export const DEALT_NUMBERS: Readonly<Record<string, readonly P[]>> = {
  "whole-answer": [...R(5, 3), ...R(7, 2, 3, 4, 5)],
  "no-fractions": [3, 6, 7, 8, 9, 11].map(k => ({ k })),
  "right-angle": [...R(5, 1, 2, 3), ...R(7, 1, 2, 3, 5), ...R(11, 1, 2, 9)],
  "forty-five": [...R(5, 1, 2, 3), ...R(7, 1, 2, 3, 4, 5), ...R(11, 1, 2, 3, 4, 5, 6, 7, 9)],
  "double-gap": [3, 4, 5, 6].map(k => ({ k })),
  "far-crossing": [...R(7, 4), ...R(11, 2, 3, 4, 5, 6, 8)],
  "high-start": [...R(5, 1, 4), ...R(7, 2, 3, 4)],
  "steep-ratio": [...R(5, 2, 3), ...R(7, 3, 4)],
};
/**
 * The whole number n leaving r when divided by q (n − r a multiple of q, negatives included: −2 leaves 1 when divided
 * by 3) nearest v, the smaller on a tie, with |n| ≥ minAbs; and how far v is from it.
 */
export const residueAnchor = (v: Q, p: P, minAbs = 0n): { n: bigint; off: Q } => anchorB(v, BigInt(p.q!), BigInt(p.r!), minAbs);
function anchorB(v: Q, Q_: bigint, R: bigint, minAbs: bigint): { n: bigint; off: Q } {
  // The two numbers with the remainder either side of v, moved outwards past |n| < minAbs; the lower wins a tie. The
  // agents' kit (lib/v2-sandbox guest helpers nearestLeaving) does the same, step for step.
  const ok = (n: bigint) => absB(n) >= minAbs;
  let lo = R + Q_ * Qn.floor(Qn.div(Qn.sub(v, q(R)), q(Q_))), hi = lo + Q_;
  while (!ok(lo)) lo -= Q_;
  while (!ok(hi)) hi += Q_;
  const dLo = Qn.sub(v, q(lo)), dHi = Qn.sub(q(hi), v);
  return Qn.cmp(dLo, dHi) <= 0 ? { n: lo, off: dLo } : { n: hi, off: dHi };
}

/** The value of a number element, or null when it is undefined. */
function read(ctx: Ctx, r: ElementRef): Q | null {
  const v = ctx.read(r);
  return v.kind === "number" ? v.q : null;
}
const U = (why: string): Undef => ({ undefined: why });
const absB = (x: bigint): bigint => (x < 0n ? -x : x);
const gcdB = (x: bigint, y: bigint): bigint => { let a = absB(x), b = absB(y); while (b) [a, b] = [b, a % b]; return a; };
/** A common factor of two anchors; an anchor of 0 earns nothing (0), so the trivial anchor is the bottom. */
const shared = (x: bigint, y: bigint): Q => q(x === 0n || y === 0n ? 0n : gcdB(x, y));
const spf = (x: bigint): Q => q(smallestPrimeFactor(x));
const omega = (x: bigint): Q => q(primeFactorCount(x));
const near = nearestInteger;

interface Spec {
  readonly id: string; readonly title: string; readonly depends: readonly string[];
  readonly main: Layer<P>; readonly tieBreakers: readonly PairLayer[];
  /** The dealt numbers (decision 41); [{}] when the card has none. */
  readonly params?: readonly P[];
  /** A ladder family's cheap states reaching level n (the tail cap of trial 28, RuleFamily.witness). */
  readonly witness?: (p: P, n: number) => readonly PairState[];
  evaluate(ctx: Ctx, p: P): void;
}
function family(s: Spec): RuleFamily<PairState, P> {
  const decls = [...new Set((s.params ?? []).flatMap(p => Object.keys(p)))].map(name => ({ name, domain: "Z" as const }));
  return {
    id: s.id, title: s.title, params: decls, dealable: () => s.params ?? [{}], depends: [...s.depends], main: s.main, tieBreakers: s.tieBreakers,
    card: (p, t: TieBreaker) => { const x = t === null ? undefined : s.tieBreakers.find(l => l.id === t); return x ? `${s.main.sentence(p)} Tie-breaker: ${x.sentence(p)}` : s.main.sentence(p); },
    evaluate: (ctx, p) => s.evaluate(ctx, p),
    // Every dealt two-line family is a ladder (§9.1): its numbers are never redrawn (a redraw reset the climb, the
    // coordinator's amendment of call 18) and its value tail runs along the level, capped by its witnesses (trial 28).
    ...(s.witness ? { keepsParams: true, witness: s.witness } : {}),
  };
}

// ---------------------------------------------------------------- witnesses (trial 28: a tail never outgrows φ)
//
// For level n of a ladder, a few cheap systems that reach it: two lines through a point (0, N), or a pair whose number
// to divide by or whose gaps are set. They need not be the cheapest; a cheaper one only tightens the cap.
const mc = (m: Q, c: Q): Line => fromMC(m, c);
const sysOf = (a: Line, b: Line): PairState => ({ lines: [a, b] });
/** The residue ladder's numbers at level n: n digits r in base q, and that less q^n (the nearest on the other side). */
const residueAt = (p: P, n: number): bigint[] => { const qq = BigInt(p.q!), R = rungRemainder(qq, BigInt(p.r!), n); return [R, R - qq ** BigInt(n)]; };
/** The valuation ladder's numbers at level n: q^T(n) × m, m leaving r (r or r − q). */
const valuationAt = (p: P, n: number): bigint[] => { const t = BigInt(p.q!) ** BigInt(triangle(n)); return [t * BigInt(p.r!), t * BigInt(p.r! - p.q!)]; };
/** Two lines crossing at (0, N) at a right angle (gradients 1 and −1), and at 45° (gradients 3 and ½). */
const squareAt = (N: bigint): PairState => sysOf(mc(q(1), q(N)), mc(q(-1), q(N)));
const fortyFiveAt = (N: bigint): PairState => sysOf(mc(q(3), q(N)), mc(q(1, 2), q(N)));

// Refs every family reads.
const X = ref("pair", "X"), Y = ref("pair", "Y"), PX = ref("pair", "x"), PY = ref("pair", "y"), P = ref("pair", "P");
const D = ref("solve", "D");
const RS = ref("si", "rs"), CS = ref("si", "cs"), MS = ref("si", "ms"), RATIO = ref("si", "ratio"), CG = ref("si", "cg"), MG = ref("si", "mg");
const PARALLEL = U("the lines are parallel: they never cross");

/** Record every tie-breaker as undefined (the primary is undefined too). */
function allUndefined(ctx: Ctx, ids: readonly string[], why: Undef, from: readonly ElementRef[]): void {
  for (const id of ids) ctx.term(id, id, why, from);
}

/** The answer's peg: X, Y and |X| + |Y|, or null for parallel lines. */
function answer(ctx: Ctx): { x: Q; y: Q; X: bigint; Y: bigint } | null {
  ctx.read(P);
  const x = read(ctx, PX), y = read(ctx, PY), Xq = read(ctx, X), Yq = read(ctx, Y);
  return x && y && Xq && Yq ? { x, y, X: Xq.n, Y: Yq.n } : null;
}

// ---------------------------------------------------------------- the nine

export const wholeAnswer = family({
  id: "whole-answer", title: "Whole Answer", depends: ["pair", "solve"],
  main: main("answer", "the answer's y on your pattern", p => `The answer: x near whole, and y near a whole number leaving ${p.r} when divided by ${p.q}; better, ${p.q} times one; then ${times(p.q!, 3)}; then ${times(p.q!, 6)}.`, "pair", "max"),
  tieBreakers: [
    tb("divisor-multiple", "the number you divide by near a multiple of the answer's y", "The number you divide by: near a multiple of the answer's y (on your pattern, rounded), other than 0.", "solve", "small"),
    tb("x-multiple", "the answer's x near a multiple of its y", "The answer's x: near a multiple of its y (on your pattern, rounded), other than 0.", "pair", "small"),
  ],
  params: DEALT_NUMBERS["whole-answer"],
  witness: (p, n) => valuationAt(p, n).flatMap(N => [squareAt(N), fortyFiveAt(N)]),
  evaluate: (ctx, p) => {
    const a = answer(ctx), d = read(ctx, D)!;
    if (!a) return void (ctx.term("answer", "the answer", PARALLEL, [PX, PY]), allUndefined(ctx, ["divisor-multiple", "x-multiple"], PARALLEL, [X, Y]));
    // The peg: y's number on the ladder (stretching both lines by q multiplies it by q), x's nearest whole number.
    const l = valuationLadder(a.y, p, distanceToWhole(a.x));
    ctx.term("answer", `the answer's y: ${stepsUp(l.level, 0)}`, l.u, [PX, PY]);
    // Trial 35: each tie-breaker a relation to the level's own number N (row 3): stepping up changes N and restarts it.
    // Near a multiple, not a common factor: a stretch by q multiplies y and D together, so a common factor would climb
    // with the main part (an aligned hill, 52 bits on the energy gate); a distance to a multiple grows with it instead.
    ctx.term("divisor-multiple", "how far D is from a multiple of N (y on the ladder), other than 0", offMultiple(d, mod1(l.n)), [PY, D]);
    ctx.term("x-multiple", "how far x is from a multiple of N (y on the ladder), other than 0", offMultiple(a.x, mod1(l.n)), [PX, PY]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

/**
 * Divide By: the number you divide by climbs the powers of k. Its tie-breakers read the answer's numerators, x and y
 * times that number (whole numbers, by Cramer's rule): what they are depends on the number the main part reached.
 */
export const noFractions = family({
  id: "no-fractions", title: "Divide By", depends: ["pair", "solve"],
  main: main("divisor", "the number you divide by on your powers", p => `When you solve, you divide by a number: it should be ${p.k} or −${p.k}; better, ${big(p.k! ** 3)}; then ${big(p.k! ** 6)}.`, "solve", "max"),
  tieBreakers: [
    tb("numerator-step", "x times the number you divide by near a multiple of your next power", p => `x times the number you divide by: near a multiple of ${p.k} times your power reached, other than 0.`, "pair", "small"),
    tb("numerator-power", "y times the number you divide by shares a factor with your next power", p => `y times the number you divide by, and ${p.k} times your power reached: their biggest common factor.`, "pair", "shared"),
  ],
  params: DEALT_NUMBERS["no-fractions"],
  witness: (p, n) => { const K = BigInt(p.k!) ** BigInt(triangle(n)); return [sysOf(normalise(K + 1n, 1n, 0n) as Line, normalise(1n, 1n, -1n) as Line)]; },   // you divide by K
  evaluate: (ctx, p) => {
    const d = read(ctx, D)!, a = answer(ctx);
    if (!a) return void (ctx.term("divisor", "the number you divide by", PARALLEL, [D]), allUndefined(ctx, ["numerator-step", "numerator-power"], PARALLEL, [PX, PY]));
    const size = absB(d.n);
    const pl = powerLadder(p.k!, t => q(absB(size - t)));
    ctx.term("divisor", `the number you divide by: ${stepsUp(pl.level)}`, pl.u, [D]);
    const nx = Qn.mul(a.x, d).n, ny = Qn.mul(a.y, d).n, N = powerNumber(p.k!, pl.level);   // k^T(L) × k (trial 35)
    ctx.term("numerator-step", "how far x·D is from a multiple of k^T(L) × k, other than 0", offMultiple(q(nx), N), [PX, D]);
    ctx.term("numerator-power", "the common factor of y·D and k^T(L) × k", shared(ny, N), [PY, D]);
  },
});

const OFF_RIGHT = ref("angle", "offRight"), OFF45 = ref("angle", "off45"), YGAP = ref("si", "ygap"), XGAP = ref("si", "xgap");
/** Right Angle: perpendicular lines crossing at a grid point whose y is on the dealt ladder; the tie-breakers read that corner. */
export const rightAngle = family({
  id: "right-angle", title: "Right Angle", depends: ["angle", "pair", "si"],
  main: main("right", "a right angle at whole x and y, y on your pattern", p => `Lines cross at a right angle near whole x and y, y leaving ${p.r} when divided by ${p.q}; better if ${again("y", p)}`, "angle", "max"),
  tieBreakers: [
    tb("corner-multiple", "the corner's x near a multiple of its y", "The corner's x: near a multiple of its y (on your pattern, rounded), other than 0.", "pair", "small"),
    tb("corner-steep", "the corner's y shares a factor with the steeper gradient", "The corner's y (on your pattern, rounded) and the steeper gradient's whole part: their biggest common factor.", "si", "shared"),
  ],
  params: DEALT_NUMBERS["right-angle"],
  witness: (p, n) => residueAt(p, n).map(squareAt),
  evaluate: (ctx, p) => {
    const off = read(ctx, OFF_RIGHT), a = answer(ctx);
    if (off === null || !a) return void (ctx.term("right", "the corner", PARALLEL, [OFF_RIGHT]), allUndefined(ctx, ["corner-multiple", "corner-steep"], PARALLEL, [PX, PY]));
    const l = residueLadder(a.y, p, Qn.add(off, distanceToWhole(a.x))), m = read(ctx, MS);
    ctx.term("right", `the corner's y: ${stepsUp(l.level)}`, l.u, [OFF_RIGHT, PX, PY]);
    // Trial 35: relations to the level's own number N, the corner's y with the remainder.
    ctx.term("corner-multiple", "how far x is from a multiple of N (y with the remainder), other than 0", offMultiple(a.x, mod1(l.n)), [PX, PY]);
    ctx.term("corner-steep", "the common factor of N (y with the remainder) and the steeper gradient's whole part", m === null ? q(0) : shared(l.n, Qn.floor(Qn.abs(m))), [PY, MS]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

/** Forty-Five: lines crossing at 45° at a grid point whose |x| + |y| is on the dealt ladder; the tie-breakers read that number. */
export const fortyFive = family({
  id: "forty-five", title: "Forty-Five", depends: ["angle", "pair", "solve", "si"],
  main: main("forty-five", "45° at whole x and y, |x| + |y| on your pattern", p => `Lines cross at 45° near whole x and y, |x| + |y| leaving ${p.r} when divided by ${p.q}; better if ${again("that", p)}`, "angle", "max"),
  tieBreakers: [
    tb("corner-divisor", "that |x| + |y| shares a factor with the number you divide by", "That |x| + |y| (on your pattern, rounded) and the number you divide by: their biggest common factor.", "solve", "shared"),
    tb("corner-gap", "the y-intercepts' gap near a multiple of that |x| + |y|", "The y-intercepts' gap: near a multiple of that |x| + |y| (on your pattern, rounded), other than 0.", "si", "small"),
  ],
  params: DEALT_NUMBERS["forty-five"],
  witness: (p, n) => residueAt(p, n).filter(N => N > 0n).map(fortyFiveAt),
  evaluate: (ctx, p) => {
    const off = read(ctx, OFF45)!, d = read(ctx, D)!, a = answer(ctx), g = read(ctx, YGAP);
    // Parallel lines never cross, so they have no angle (as in every other family that reads the crossing or the angle).
    if (d.n === 0n || !a) return void (ctx.term("forty-five", "the corner", PARALLEL, [OFF45]), allUndefined(ctx, ["corner-divisor", "corner-gap"], PARALLEL, [PX, PY]));
    const l = residueLadder(Qn.add(Qn.abs(a.x), Qn.abs(a.y)), p, Qn.add(off, distanceToWhole(a.x)));
    ctx.term("forty-five", `the corner's |x| + |y|: ${stepsUp(l.level)}`, l.u, [OFF45, PX, PY]);
    // Trial 35: relations to the level's own number N, |x| + |y| with the remainder.
    ctx.term("corner-divisor", "the common factor of N (|x| + |y| with the remainder) and the number you divide by", shared(l.n, d.n), [PX, PY, D]);
    ctx.term("corner-gap", "how far the y-intercepts' gap is from a multiple of N, other than 0", g === null ? U("a vertical line has no y-intercept") : offMultiple(g, mod1(l.n)), [PX, PY, YGAP]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

export const onTheDiagonal = family({
  id: "on-the-diagonal", title: "On the Diagonal", depends: ["pair", "si"],
  main: main("diagonal", "the lines cross on y = x at whole x and y", "The lines cross on the diagonal y = x at whole x and y; neither line may be the diagonal itself.", "pair"),
  tieBreakers: [
    tb("north-east", "the crossing far up the diagonal", "The crossing's x, rounded.", "pair", "big"),
    tb("diagonal-prime", "the crossing's x has a big smallest prime factor", "The crossing's x, rounded: its smallest prime factor.", "pair", "prime"),
  ],
  evaluate: ctx => {
    const a = answer(ctx);
    if (!a) return void (ctx.term("diagonal", "how far the crossing is from y = x", PARALLEL, [PX, PY]), allUndefined(ctx, ["north-east", "diagonal-prime"], PARALLEL, [X]));
    // A primary may not be met by one line alone: the diagonal itself meets every other line on the diagonal.
    if (ctx.state.lines.some(l => l.a === -1n && l.b === 1n && l.c === 0n)) {
      const why = U("one of the lines is the diagonal y = x itself");
      return void (ctx.term("diagonal", "how far the crossing is from y = x", why, [PX, PY]), allUndefined(ctx, ["north-east", "diagonal-prime"], why, [X]));
    }
    ctx.term("diagonal", "how far the crossing is from y = x, plus how far x is from a whole number", Qn.add(Qn.abs(Qn.sub(a.x, a.y)), distanceToWhole(a.x)), [PX, PY]);
    ctx.term("north-east", "the whole number nearest the crossing's x", q(a.X), [X]);
    ctx.term("diagonal-prime", "the smallest prime factor of the crossing's x", spf(a.X), [X]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

export const doubleGap = family({
  id: "double-gap", title: "Gap Ratio", depends: ["si", "solve"],
  main: main("gaps", "the y-intercepts' gap whole and your power times the x-intercepts' gap", p => `The y-intercepts' gap near whole and near ${p.k} times the x-intercepts' gap; better ${times(p.k!, 3)}; then ${times(p.k!, 6)}. Neither line through (0, 0).`, "si", "max"),
  tieBreakers: [
    tb("gap-divisor", "the number you divide by shares a factor with your next power", p => `The number you divide by, and ${p.k} times your power reached: their biggest common factor.`, "solve", "shared"),
    tb("gap-step", "the y-intercepts' gap near a multiple of your next power", p => `The y-intercepts' gap: near a multiple of ${p.k} times your power reached, other than 0.`, "si", "small"),
  ],
  params: DEALT_NUMBERS["double-gap"],
  witness: (p, n) => { const K = BigInt(p.k!) ** BigInt(triangle(n)); return [sysOf(mc(q(1), q(1)), mc(q(K + 1n, 2n), q(K + 1n)))]; },   // gaps K and 1
  evaluate: (ctx, p) => {
    const yg = read(ctx, YGAP), xg = read(ctx, XGAP);
    // A line through the origin has both intercepts 0, and would meet any gap rule for free.
    if (yg === null || xg === null || ctx.state.lines.some(l => l.c === 0n)) {
      const why = U(yg === null || xg === null ? "a gap needs both lines to cross both axes once" : "a line through the origin has no gap to give");
      return void (ctx.term("gaps", "the gaps", why, [YGAP, XGAP]), allUndefined(ctx, ["gap-divisor", "gap-step"], why, [YGAP]));
    }
    const whole = distanceToWhole(yg);
    const gl = powerLadder(p.k!, t => Qn.add(whole, Qn.abs(Qn.sub(yg, Qn.mul(q(t), xg)))));
    ctx.term("gaps", `the gaps: ${stepsUp(gl.level)}`, gl.u, [YGAP, XGAP]);
    const N = powerNumber(p.k!, gl.level);   // trial 35: k^T(L) × k, the level's own number
    ctx.term("gap-divisor", "the common factor of D and k^T(L) × k", shared(read(ctx, D)!.n, N), [YGAP, XGAP, D]);
    ctx.term("gap-step", "how far the y-intercepts' gap is from a multiple of k^T(L) × k, other than 0", offMultiple(yg, N), [YGAP, XGAP]);
  },
});

export const farCrossing = family({
  id: "far-crossing", title: "Far Crossing", depends: ["si", "pair"],
  main: main("far", "the steeper line crosses the x-axis on your pattern", p => `The steeper line crosses the x-axis near a whole number leaving ${p.r} when divided by ${p.q}; better if ${again("that number", p)}`, "si", "max"),
  tieBreakers: [
    tb("far-gap", "the x-intercepts' gap near a multiple of your number", p => `The x-intercepts' gap: near a multiple of ${p.q} other than 0; of ${p.q! ** 2} once on your pattern; then ${p.q! ** 3}.`, "si", "small"),
    tb("far-height", "the crossing's height near a multiple of your number", p => `The crossing's height: near a multiple of ${p.q} other than 0; of ${p.q! ** 2} once on your pattern; then ${p.q! ** 3}.`, "pair", "small"),
  ],
  params: DEALT_NUMBERS["far-crossing"],
  witness: (p, n) => residueAt(p, n).map(N => sysOf(mc(q(2), q(-2n * N)), mc(q(1, 2), q(1)))),   // the steeper line meets the x-axis at N
  evaluate: (ctx, p) => {
    const r = read(ctx, RS);
    if (r === null) { const why = U("the steeper line is flat: it never meets the x-axis"); return void (ctx.term("far", "x-intercept", why, [RS]), allUndefined(ctx, ["far-gap", "far-height"], why, [RS])); }
    const l = residueLadder(r, p), m = levelTarget(p.q!, l.level), xg = read(ctx, XGAP), y = read(ctx, PY);
    ctx.term("far", `the steeper line's x-intercept: ${stepsUp(l.level)}`, l.u, [RS]);
    ctx.term("far-gap", `how far the x-intercepts' gap is from a multiple of ${m}`, xg === null ? U("a flat line has no x-intercept") : offMultiple(xg, m), [RS, XGAP]);
    ctx.term("far-height", `how far the crossing's height is from a multiple of ${m}`, y === null ? PARALLEL : offMultiple(y, m), [RS, PY]);
  },
});

/**
 * High Start reads the GENTLER line (two-line-systems.md §8.2): on the steeper line it shared Steep Ratio's hill (a
 * stretch of the steeper line raised both). On the gentler line a stretch that raises its start lowers the ratio of
 * gradients, so the two pull against each other.
 */
export const highStart = family({
  id: "high-start", title: "High Start", depends: ["si", "pair"],
  main: main("start", "the gentler line crosses the y-axis on your pattern", p => `The gentler line crosses the y-axis near a whole number leaving ${p.r} when divided by ${p.q}; better, ${p.q} times one; then ${times(p.q!, 3)}; then ${times(p.q!, 6)}.`, "si", "max"),
  tieBreakers: [
    tb("start-echo", "the y-intercepts' gap near a multiple of your number", p => `The y-intercepts' gap: near a whole number other than 0; on your pattern, a multiple of ${p.q}; then ${p.q! ** 2}.`, "si", "small"),
    tb("start-crossing", "the crossing's x near a multiple of your number", p => `The crossing's x: near a whole number other than 0; on your pattern, a multiple of ${p.q}; then ${p.q! ** 2}.`, "pair", "small"),
  ],
  params: DEALT_NUMBERS["high-start"],
  witness: (p, n) => valuationAt(p, n).map(N => sysOf(mc(q(1, 2), q(N)), mc(q(2), q(1)))),   // the gentler line meets the y-axis at N
  evaluate: (ctx, p) => {
    const c = read(ctx, CG), m = read(ctx, MG);
    if (c === null || m === null) { const why = U("the gentler line is vertical: it has no y-intercept"); return void (ctx.term("start", "y-intercept", why, [CG]), allUndefined(ctx, ["start-echo", "start-crossing"], why, [CG])); }
    const l = valuationLadder(c, p), t = levelTarget(p.q!, l.level), yg = read(ctx, YGAP), x = read(ctx, PX);
    ctx.term("start", `the gentler line's y-intercept: ${stepsUp(l.level, 0)}`, l.u, [CG]);
    ctx.term("start-echo", `how far the gap between the y-intercepts is from a multiple of ${t}`, yg === null ? U("a vertical line has no y-intercept") : offMultiple(yg, t), [CG, YGAP]);
    ctx.term("start-crossing", `how far the crossing's x is from a multiple of ${t}`, x === null ? PARALLEL : offMultiple(x, t), [CG, PX]);
  },
});

export const steepRatio = family({
  id: "steep-ratio", title: "Steep Ratio", depends: ["si", "solve"],
  main: main("ratio", "one line a whole number of times as steep, on your pattern", p => `The steeper line is near a whole number of times as steep as the other, that number leaving ${p.r} when divided by ${p.q}; better, ${p.q} times one; then ${times(p.q!, 3)}.`, "si", "max"),
  tieBreakers: [
    tb("ratio-gap", "the y-intercepts' gap near a multiple of that number", "The y-intercepts' gap: near a multiple of that number of times (rounded), other than 0.", "si", "small"),
    tb("ratio-divisor", "the number you divide by near a multiple of that number", "The number you divide by: near a multiple of that number of times (rounded), other than 0.", "solve", "small"),
  ],
  params: DEALT_NUMBERS["steep-ratio"],
  witness: (p, n) => valuationAt(p, n).filter(K => K >= 2n || K <= -2n).map(K => sysOf(mc(q(K), q(1)), mc(q(1), q(0)))),   // K times as steep
  evaluate: (ctx, p) => {
    const r = read(ctx, RATIO), g = read(ctx, YGAP);
    if (r === null) { const why = U("a ratio needs two lines with gradients, the gentler not flat"); return void (ctx.term("ratio", "ratio", why, [RATIO]), allUndefined(ctx, ["ratio-gap", "ratio-divisor"], why, [RATIO])); }
    const l = valuationLadder(r, p, q(0), 2n), k = l.n;
    ctx.term("ratio", `the number of times as steep: ${stepsUp(l.level, 0)}`, l.u, [RATIO]);
    // Trial 35: relations to the level's own number, the ratio K rounded.
    ctx.term("ratio-gap", "how far the y-intercepts' gap is from a multiple of K, other than 0", g === null ? U("a vertical line has no y-intercept") : offMultiple(g, mod1(k)), [RATIO, YGAP]);
    // Near a multiple, not a common factor: a stretch of the steeper line multiplies K and D together (aligned).
    ctx.term("ratio-divisor", "how far D is from a multiple of K, other than 0", offMultiple(read(ctx, D)!, mod1(k)), [RATIO, D]);
  },
});

export const pairFamilies: readonly RuleFamily<PairState, P>[] = [wholeAnswer, noFractions, rightAngle, fortyFive, onTheDiagonal, doubleGap, farCrossing, highStart, steepRatio];
