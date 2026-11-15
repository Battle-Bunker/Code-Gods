/**
 * The two-line pool (docs/engine-v2/two-line-systems.md §3): nine families, each a primary a 12-year-old can check on
 * the graph or the stacked equations (a distance to an exact condition, smaller better) and two tie-breakers tied to
 * the primary's ANCHOR, the whole number it closes in on (owner decision 29). Every tie-breaker is unbounded (decision
 * 26) and has a declared sense: big, small, prime (a big smallest prime factor), smooth (many prime factors) or shared (a
 * big common factor with another aspect). Senses are balanced so that one basic strategy (a smooth scale-up of the
 * picture, a big prime on an axis) does not climb most of a table at once (decision 30); §4 of the doc measures it.
 */
import { Qn, q, ref, type ElementRef, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import { distanceToWhole, nearestInteger, primeFactorCount, smallestPrimeFactor } from "@workspace/v2-linear";
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
/** How far v is from the nearest whole multiple of m (m ≥ 1). */
export function offMultiple(v: Q, m: bigint): Q {
  const t = Qn.div(v, q(m)), f = t.n / t.d - (t.n % t.d < 0n ? 1n : 0n);   // ⌊v / m⌋, rounding down for negatives too
  const lo = q(f * m), below = Qn.sub(v, lo), above = Qn.sub(q((f + 1n) * m), v);
  return Qn.cmp(below, above) <= 0 ? below : above;
}
/**
 * A tie-breaker that reads the level the main part reached (design-principles.md row 3; the coordinator, 15 Nov):
 * a number should be a multiple of q^(L+1), L the level (q⁰ = 1 below level 0), so each step up the ladder makes the
 * target q times coarser and restarts the tie-breaker's climb.
 */
const levelTarget = (qq: number, level: number): bigint => BigInt(qq) ** BigInt(Math.max(0, level + 1));
const targetWords = (qq: number) => `a whole multiple of ${qq}; once your number climbs a level, of ${qq * qq}; then of ${qq ** 3}, and so on`;

/**
 * The ladder with no top (docs/engine-v2/design-principles.md row 1, the coordinator's call applying the owner's
 * principles, 15 Nov): every dealt main part climbs levels 1, 2, 3, … without end, each level rarer and dearer than the
 * last. A residue ladder (q, r) asks for a whole number leaving r when divided by q, then leaving R₂ = r + rq when
 * divided by q², then R₃ = r + rq + rq² when divided by q³, and so on (written in base q, it ends in the digit r, then
 * rr, then rrr): level j is q times rarer than level j − 1 and needs a number at least about q^(j−1), so it costs about
 * log₂ q more bits of φ. The remainder r is never 0 or q − 1, the two remainders a single number (0 or −1) meets at
 * every level, which would make a top. A power ladder (k) asks for k, then k², then k³, ….
 *
 * The score is q^L × (1 + 1/(1 + d)) (or k^L × …), bigger better: L the highest level met, d how far the state is from
 * the next level (0 never, or that level would be met). So every met level beats every state below it, nearer the
 * next level is better, and the score doubles at most once per level as its size (log₂ q bits per level, what the law
 * charges for the number): the value tail of a pair (1 bit per doubling, lib/v2-valuation PAIR_SIZE_RATE) cannot pay a
 * level more than its rarity.
 */
const ladderScore = (base: bigint, level: number, next: Q): Q => Qn.mul(q(base ** BigInt(level)), Qn.add(q(1), Qn.inv(Qn.add(q(1), next))));
/** The highest level met (off(j) = 0) and the score; off(j) is non-decreasing in j for a residue ladder. */
function climb(base: bigint, off: (j: number) => Q): { level: number; u: Q } {
  let level = 0, d = off(1);
  // A level needs a number of size about base^(level − 1), so a state's levels are bounded by its size.
  while (level < 4096 && Qn.isZero(d)) d = off(++level + 1);
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
 * grows one factor q per LEVEL (not per stretch), so beyond the measured knots the value tail (at most 1 bit per doubling
 * of the score, PAIR_SIZE_RATE) pays log₂ q bits a level while a level costs ever more stretches: a seat's bits grow like
 * the square root of the energy it spends, not linearly (the runaway of §9: 59 bits in a 600 s game). n: the number on
 * the ladder, else the nearest number leaving r when divided by q.
 */
const triangle = (L: number) => (L * (L + 1)) / 2;
export function valuationLadder(v: Q, p: P, other: Q = q(0), minAbs = 0n): { level: number; u: Q; n: bigint } {
  const qq = BigInt(p.q!), r = BigInt(p.r!);
  let level = -1;
  if (Qn.isZero(other) && v.d === 1n && v.n !== 0n && absB(v.n) >= minAbs) {
    let m = v.n, t = 0;
    while (m % qq === 0n) { m /= qq; t++; }
    if (((m % qq) + qq) % qq === r) { level = 0; while (triangle(level + 1) <= t) level++; }
  }
  const T = BigInt(triangle(level + 1)), d = Qn.add(other, anchorB(v, qq ** (T + 1n), r * qq ** T, minAbs).off);
  const u = Qn.mul(level >= 0 ? q(qq ** BigInt(level)) : q(1n, qq), Qn.add(q(1), Qn.inv(Qn.add(q(1), d))));
  return { level, u, n: level >= 0 ? v.n : anchorB(v, qq, r, minAbs).n };
}
/** "a whole number leaving 2 when divided by 7; better still 7 times such a number, then 343 times, then 117,649 times, and so on". */
export const valuationWords = (p: P) => `a whole number leaving ${p.r} when divided by ${p.q}; better still ${p.q} times such a number, then ${(p.q! ** 3).toLocaleString("en")} times, then ${(p.q! ** 6).toLocaleString("en")} times, and so on`;
/**
 * The power ladder: off(t) is the distance from the level whose number is t (with `other` added), V-shaped in t. Its
 * levels are not nested (k² is not k), so level L is met at an exact k^L (off 0; the highest such, L ≥ 1), and d is the
 * distance to k^(L+1); a state on no level (L 0) takes d to the nearest power, so a climber near k³ is rewarded as near
 * k. The scan stops where off stops falling, past the state's size.
 */
export function powerLadder(k: number, off: (target: bigint) => Q): { level: number; u: Q } {
  const kb = BigInt(k);
  let level = 0, best: Q | null = null, prev: Q | null = null;
  for (let j = 1; j <= 4096; j++) {
    const o = off(kb ** BigInt(j));
    if (Qn.isZero(o)) level = j;
    if (best === null || Qn.cmp(o, best) < 0) best = o;
    if (prev !== null && Qn.cmp(o, prev) >= 0) break;
    prev = o;
  }
  return { level, u: ladderScore(kb, level, level > 0 ? off(kb ** BigInt(level + 1)) : best!) };
}
/** "leaves 3 when divided by 7; better still, leaves 24 when divided by 49, then 171 when divided by 343, and so on". */
export function ladderWords(p: P): string {
  const qq = BigInt(p.q!), r = BigInt(p.r!);
  return `leaves ${r} when divided by ${qq}; better still, leaves ${rungRemainder(qq, r, 2)} when divided by ${qq ** 2n}, then ${rungRemainder(qq, r, 3)} when divided by ${qq ** 3n}, and so on`;
}
/** "4 (or −4); better still 16, then 64, and so on". */
const powerWords = (k: number, sign = true) => `${k}${sign ? ` (or −${k})` : ""}; better still ${k * k}, then ${k ** 3}, and so on`;
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
  "whole-answer": [...R(5, 1, 4), ...R(7, 2, 4, 5)],
  "no-fractions": [4, 5, 8, 9].map(k => ({ k })),
  "right-angle": [...R(5, 1, 2, 3), ...R(7, 1, 2, 3, 5), ...R(11, 1, 2, 9)],
  "forty-five": [...R(5, 1, 2, 3), ...R(7, 1, 2, 3, 4, 5), ...R(11, 1, 2, 3, 4, 5, 6, 7, 9)],
  "double-gap": [3, 4, 5, 6].map(k => ({ k })),
  "far-crossing": [...R(7, 4), ...R(11, 2, 3, 4, 5, 6, 8)],
  "high-start": [...R(5, 1, 4), ...R(7, 2, 3, 4, 5)],
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
  evaluate(ctx: Ctx, p: P): void;
}
function family(s: Spec): RuleFamily<PairState, P> {
  const decls = [...new Set((s.params ?? []).flatMap(p => Object.keys(p)))].map(name => ({ name, domain: "Z" as const }));
  return {
    id: s.id, title: s.title, params: decls, dealable: () => s.params ?? [{}], depends: [...s.depends], main: s.main, tieBreakers: s.tieBreakers,
    card: (p, t: TieBreaker) => { const x = t === null ? undefined : s.tieBreakers.find(l => l.id === t); return x ? `${s.main.sentence(p)} Tie-breaker: ${x.sentence(p)}` : s.main.sentence(p); },
    evaluate: (ctx, p) => s.evaluate(ctx, p),
  };
}

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
  main: main("answer", "the answer is whole numbers, y on the dealt ladder", p => `Solve the two equations: the answer (x, y) should be whole numbers, y ${valuationWords(p)}. The closer, the better.`, "pair", "max"),
  tieBreakers: [
    tb("peg-divisor", "the answer shares a factor with the number you divide by", "The answer's whole numbers, added up as distances (|x| + |y|), should share as big a factor as possible with the number you divide by when you solve.", "solve", "shared"),
    tb("south-west", "the answer far down and to the left", "The answer's x + y should be as small (as negative) as possible.", "pair", "small"),
  ],
  params: DEALT_NUMBERS["whole-answer"],
  evaluate: (ctx, p) => {
    const a = answer(ctx), d = read(ctx, D)!;
    if (!a) return void (ctx.term("answer", "the answer's ladder", PARALLEL, [PX, PY]), allUndefined(ctx, ["peg-divisor", "south-west"], PARALLEL, [X, Y]));
    // The peg: y's number on the ladder (stretching both lines by q multiplies it by q), x's nearest whole number.
    const l = valuationLadder(a.y, p, distanceToWhole(a.x));
    ctx.term("answer", `the answer's level: whole numbers, y ${valuationWords(p)}`, l.u, [PX, PY]);
    ctx.term("peg-divisor", "the common factor of |X| + |Y| (Y on the ladder) and the number you divide by", shared(absB(a.X) + absB(l.n), d.n), [X, PY, D]);
    ctx.term("south-west", "X + Y (Y on the ladder)", q(a.X + l.n), [X, PY]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

/**
 * Divide By: the number you divide by climbs the powers of k. Its tie-breakers read the answer's numerators, x and y
 * times that number (whole numbers, by Cramer's rule): what they are depends on the number the main part reached.
 */
export const noFractions = family({
  id: "no-fractions", title: "Divide By", depends: ["pair", "solve"],
  main: main("divisor", "the number you divide by on the dealt powers", p => `When you solve the two equations you divide by a number: it should be ${powerWords(p.k!)}. The closer, the better.`, "solve", "max"),
  tieBreakers: [
    tb("numerator-smooth", "the answer's numerators add up to a number with many prime factors", "The answer's numerators (x and y times the number you divide by), added up as distances, should have as many prime factors as possible.", "pair", "smooth"),
    tb("numerator-shared", "the answer's numerators share a big factor", "The answer's two numerators (x and y times the number you divide by) should share as big a factor as possible.", "pair", "shared"),
  ],
  params: DEALT_NUMBERS["no-fractions"],
  evaluate: (ctx, p) => {
    const d = read(ctx, D)!, a = answer(ctx);
    if (!a) return void (ctx.term("divisor", "the number you divide by's level", PARALLEL, [D]), allUndefined(ctx, ["numerator-smooth", "numerator-shared"], PARALLEL, [PX, PY]));
    const size = absB(d.n);
    ctx.term("divisor", `the level of the number you divide by on ${powerWords(p.k!)}`, powerLadder(p.k!, t => q(absB(size - t))).u, [D]);
    const nx = Qn.mul(a.x, d).n, ny = Qn.mul(a.y, d).n;
    // Many prime factors, not a big prime: a prime built from derived numbers is cheap (its reach was 11–13 bits against
    // the pool's 6–11; two-line-systems.md §9).
    ctx.term("numerator-smooth", "how many prime factors |x·D| + |y·D| has", omega(absB(nx) + absB(ny)), [PX, PY, D]);
    ctx.term("numerator-shared", "the common factor of x·D and y·D", shared(nx, ny), [PX, PY, D]);
  },
});

const OFF_RIGHT = ref("angle", "offRight"), OFF45 = ref("angle", "off45"), YGAP = ref("si", "ygap"), XGAP = ref("si", "xgap");
/** Right Angle: perpendicular lines crossing at a grid point whose y is on the dealt ladder; the tie-breakers read that corner. */
export const rightAngle = family({
  id: "right-angle", title: "Right Angle", depends: ["angle", "pair", "si"],
  main: main("right", "the lines cross at a right angle at a grid point, y on the dealt ladder", p => `The two lines should cross at a right angle (their gradients multiply to −1) at a grid point (whole x and y) whose y ${ladderWords(p)}. The closer, the better.`, "angle", "max"),
  tieBreakers: [
    tb("corner-prime", "the corner's distance is a big prime", "The corner's whole numbers, added up as distances (|x| + |y|), should have as big a smallest prime factor as possible.", "pair", "prime"),
    tb("corner-steep", "the corner's distance shares a factor with the steeper gradient", "The corner's |x| + |y| should share as big a factor as possible with the steeper line's gradient (its whole part, ignoring the sign).", "si", "shared"),
  ],
  params: DEALT_NUMBERS["right-angle"],
  evaluate: (ctx, p) => {
    const off = read(ctx, OFF_RIGHT), a = answer(ctx);
    if (off === null || !a) return void (ctx.term("right", "the corner's level", PARALLEL, [OFF_RIGHT]), allUndefined(ctx, ["corner-prime", "corner-steep"], PARALLEL, [PX, PY]));
    const l = residueLadder(a.y, p, Qn.add(off, distanceToWhole(a.x))), t = absB(a.X) + absB(l.n), m = read(ctx, MS);
    ctx.term("right", `the corner's level: a right angle at a grid point whose y ${ladderWords(p)}`, l.u, [OFF_RIGHT, PX, PY]);
    ctx.term("corner-prime", "the smallest prime factor of |X| + |Y| (Y with the remainder)", spf(t), [PX, PY]);
    ctx.term("corner-steep", "the common factor of |X| + |Y| and the steeper gradient's whole part", m === null ? q(0) : shared(t, Qn.floor(Qn.abs(m))), [PX, PY, MS]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

/** Forty-Five: lines crossing at 45° at a grid point whose |x| + |y| is on the dealt ladder; the tie-breakers read that number. */
export const fortyFive = family({
  id: "forty-five", title: "Forty-Five", depends: ["angle", "pair", "solve", "si"],
  main: main("forty-five", "the lines cross at 45° at a grid point, |x| + |y| on the dealt ladder", p => `The two lines should cross at 45° (half a right angle) at a grid point (whole x and y) whose |x| + |y| ${ladderWords(p)}. The closer, the better.`, "angle", "max"),
  tieBreakers: [
    tb("corner-smooth", "that distance has many prime factors", "That |x| + |y| should have as many prime factors as possible.", "pair", "smooth"),
    tb("corner-gap", "that distance shares a factor with the y-intercepts' gap", "That |x| + |y| should share as big a factor as possible with the gap between the y-intercepts (to the nearest whole number).", "si", "shared"),
  ],
  params: DEALT_NUMBERS["forty-five"],
  evaluate: (ctx, p) => {
    const off = read(ctx, OFF45)!, d = read(ctx, D)!, a = answer(ctx), g = read(ctx, YGAP);
    // Parallel lines never cross, so they have no angle (as in every other family that reads the crossing or the angle).
    if (d.n === 0n || !a) return void (ctx.term("forty-five", "the corner's level", PARALLEL, [OFF45]), allUndefined(ctx, ["corner-smooth", "corner-gap"], PARALLEL, [PX, PY]));
    const l = residueLadder(Qn.add(Qn.abs(a.x), Qn.abs(a.y)), p, Qn.add(off, distanceToWhole(a.x)));
    ctx.term("forty-five", `the corner's level: 45° at a grid point whose |x| + |y| ${ladderWords(p)}`, l.u, [OFF45, PX, PY]);
    ctx.term("corner-smooth", "how many prime factors |X| + |Y| has (with the remainder)", omega(l.n), [PX, PY]);
    ctx.term("corner-gap", "the common factor of |X| + |Y| and the y-intercepts' gap", g === null ? U("a vertical line has no y-intercept") : shared(l.n, near(g)), [PX, PY, YGAP]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

export const onTheDiagonal = family({
  id: "on-the-diagonal", title: "On the Diagonal", depends: ["pair", "si"],
  main: main("diagonal", "the lines cross on the line y = x at a grid point", "The two lines should cross on the diagonal y = x at a grid point (x and y the same whole number), and neither line may be the diagonal itself. The closer, the better.", "pair"),
  tieBreakers: [
    tb("north-east", "the crossing far up the diagonal", "The crossing's x (to the nearest whole number) should be as big as possible.", "pair", "big"),
    tb("diagonal-prime", "the crossing's x is a big prime", "The crossing's x (to the nearest whole number) should have as big a smallest prime factor as possible.", "pair", "prime"),
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
  main: main("gaps", "the gap on the y-axis a whole number, the dealt powers times the gap on the x-axis", p => `The gap between the lines' y-intercepts should be a whole number and ${p.k} times the gap between their x-intercepts; better still ${p.k! * p.k!} times, then ${p.k! ** 3} times, and so on. Neither line may pass through (0, 0). The closer, the better.`, "si", "max"),
  tieBreakers: [
    tb("gap-divisor", "the gap shares a factor with the number you divide by", "The gap between the y-intercepts (to the nearest whole number) should share as big a factor as possible with the number you divide by when you solve.", "solve", "shared"),
    tb("gap-prime", "the gap is a big prime", "The gap between the y-intercepts (to the nearest whole number) should have as big a smallest prime factor as possible.", "si", "prime"),
  ],
  params: DEALT_NUMBERS["double-gap"],
  evaluate: (ctx, p) => {
    const yg = read(ctx, YGAP), xg = read(ctx, XGAP);
    // A line through the origin has both intercepts 0, and would meet any gap rule for free.
    if (yg === null || xg === null || ctx.state.lines.some(l => l.c === 0n)) {
      const why = U(yg === null || xg === null ? "a gap needs both lines to cross both axes once" : "a line through the origin has no gap to give");
      return void (ctx.term("gaps", "the gaps' level", why, [YGAP, XGAP]), allUndefined(ctx, ["gap-divisor", "gap-prime"], why, [YGAP]));
    }
    const whole = distanceToWhole(yg);
    ctx.term("gaps", `the gaps' level: the y-intercepts' gap whole and ${p.k}, ${p.k! * p.k!}, … times the x-intercepts' gap`, powerLadder(p.k!, t => Qn.add(whole, Qn.abs(Qn.sub(yg, Qn.mul(q(t), xg))))).u, [YGAP, XGAP]);
    ctx.term("gap-divisor", "the common factor of the y-intercepts' gap and D", shared(near(yg), read(ctx, D)!.n), [YGAP, D]);
    ctx.term("gap-prime", "the smallest prime factor of the y-intercepts' gap", spf(near(yg)), [YGAP]);
  },
});

export const farCrossing = family({
  id: "far-crossing", title: "Far Crossing", depends: ["si", "pair"],
  main: main("far", "the steeper line crosses the x-axis at a whole number on the dealt ladder", p => `The steeper line should cross the x-axis at a whole number that ${ladderWords(p)}. The closer, the better.`, "si", "max"),
  tieBreakers: [
    tb("far-gap", "the gap between the x-intercepts a multiple of q to your level", p => `The gap between the two lines' x-intercepts should be ${targetWords(p.q!)}. The closer, the better.`, "si", "small"),
    tb("far-height", "the lines cross at a height that is a multiple of q to your level", p => `The two lines should cross at a height (y) that is ${targetWords(p.q!)}. The closer, the better.`, "pair", "small"),
  ],
  params: DEALT_NUMBERS["far-crossing"],
  evaluate: (ctx, p) => {
    const r = read(ctx, RS);
    if (r === null) { const why = U("the steeper line is flat: it never meets the x-axis"); return void (ctx.term("far", "x-intercept", why, [RS]), allUndefined(ctx, ["far-gap", "far-height"], why, [RS])); }
    const l = residueLadder(r, p), m = levelTarget(p.q!, l.level), xg = read(ctx, XGAP), y = read(ctx, PY);
    ctx.term("far", `the steeper line's x-intercept's level: a whole number that ${ladderWords(p)}`, l.u, [RS]);
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
  main: main("start", "the gentler line crosses the y-axis on the dealt ladder", p => `The gentler line should cross the y-axis at ${valuationWords(p)}. The closer, the better.`, "si", "max"),
  tieBreakers: [
    tb("start-echo", "the steeper line's y-intercept a multiple of q to your level", p => `The steeper line's y-intercept should be ${targetWords(p.q!)}. The closer, the better.`, "si", "small"),
    tb("start-crossing", "the lines cross at an x that is a multiple of q to your level", p => `The two lines should cross at an x that is ${targetWords(p.q!)}. The closer, the better.`, "pair", "small"),
  ],
  params: DEALT_NUMBERS["high-start"],
  evaluate: (ctx, p) => {
    const c = read(ctx, CG), m = read(ctx, MG);
    if (c === null || m === null) { const why = U("the gentler line is vertical: it has no y-intercept"); return void (ctx.term("start", "y-intercept", why, [CG]), allUndefined(ctx, ["start-echo", "start-crossing"], why, [CG])); }
    const l = valuationLadder(c, p), t = levelTarget(p.q!, l.level), cs = read(ctx, CS), x = read(ctx, PX);
    ctx.term("start", `the gentler line's y-intercept's level: ${valuationWords(p)}`, l.u, [CG]);
    ctx.term("start-echo", `how far the steeper line's y-intercept is from a multiple of ${t}`, cs === null ? U("a vertical line has no y-intercept") : offMultiple(cs, t), [CG, CS]);
    ctx.term("start-crossing", `how far the crossing's x is from a multiple of ${t}`, x === null ? PARALLEL : offMultiple(x, t), [CG, PX]);
  },
});

export const steepRatio = family({
  id: "steep-ratio", title: "Steep Ratio", depends: ["si"],
  main: main("ratio", "one line a whole number of times as steep as the other, on the dealt ladder", p => `The steeper line should be a whole number of times as steep as the other (2, 3, … or −2, −3, … times): ${valuationWords(p)}. The closer, the better.`, "si", "max"),
  tieBreakers: [
    tb("ratio-gap", "that number shares a factor with the y-intercepts' gap", "That whole number of times should share as big a factor as possible with the gap between the y-intercepts.", "si", "shared"),
    tb("ratio-prime", "that number is a big prime", "That whole number of times should have as big a smallest prime factor as possible.", "si", "prime"),
  ],
  params: DEALT_NUMBERS["steep-ratio"],
  evaluate: (ctx, p) => {
    const r = read(ctx, RATIO), g = read(ctx, YGAP);
    if (r === null) { const why = U("a ratio needs two lines with gradients, the gentler not flat"); return void (ctx.term("ratio", "ratio", why, [RATIO]), allUndefined(ctx, ["ratio-gap", "ratio-prime"], why, [RATIO])); }
    const l = valuationLadder(r, p, q(0), 2n), k = l.n;
    ctx.term("ratio", `the ratio of gradients' level: ${valuationWords(p)}`, l.u, [RATIO]);
    ctx.term("ratio-gap", "the common factor of that number and the y-intercepts' gap", g === null ? U("a vertical line has no y-intercept") : shared(k, near(g)), [RATIO, YGAP]);
    ctx.term("ratio-prime", "the smallest prime factor of that number", spf(k), [RATIO]);
  },
});

export const pairFamilies: readonly RuleFamily<PairState, P>[] = [wholeAnswer, noFractions, rightAngle, fortyFive, onTheDiagonal, doubleGap, farCrossing, highStart, steepRatio];
