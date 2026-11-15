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

const main = (id: string, title: string, sentence: string | ((p: P) => string), rep: string): Layer<P> =>
  ({ id, title, sentence: p => (typeof sentence === "string" ? sentence : sentence(p)), rep, sense: "min" });
/**
 * No layer here is marked measure "prime": that tail (½ bit per unit) is the cost of a prime WRITTEN as a coefficient,
 * and every prime a pair's rules read is derived (Cramer's rule, an intercept, a gap, a ratio), so it can be big and cheap:
 * −9x + 14y + 5 = 0 with −2x + 3y − 104 = 0 has D = 1 and |x| + |y| = 2417, a prime, for about 60 bits of φ. The
 * size tail (a log ramp) is used instead. The collapse check on pair-q found it (two-line-systems.md §7).
 */
const tb = (id: string, title: string, sentence: string, rep: string, hill: Sense): PairLayer =>
  ({ id, title, sentence: () => sentence, rep, sense: hill === "small" ? "min" : "max", hill });

/** "leaves 2 when divided by 5" (r = 0: "is a multiple of 5"). */
const leaves = (p: P) => (p.r === 0 ? `is a multiple of ${p.q}` : `leaves ${p.r} when divided by ${p.q}`);
export const DEALT_NUMBERS: Readonly<Record<string, readonly P[]>> = {
  "whole-answer": [{ q: 5, r: 2 }, { q: 5, r: 3 }, { q: 5, r: 4 }, { q: 7, r: 5 }],
  "no-fractions": [{ k: 1 }, { k: 3 }],
  "double-gap": [{ k: 2 }, { k: 3 }, { k: 4 }],
  "far-crossing": [{ q: 5, r: 2 }, { q: 5, r: 4 }],
  "high-start": [{ q: 7, r: 2 }, { q: 7, r: 3 }, { q: 7, r: 5 }],
  "steep-ratio": [{ q: 5, r: 1 }, { q: 5, r: 4 }],
};
/**
 * The whole number n leaving r when divided by q (n − r a multiple of q, negatives included: −2 leaves 1 when divided
 * by 3) nearest v, the smaller on a tie, with |n| ≥ minAbs; and how far v is from it.
 */
export function residueAnchor(v: Q, p: P, minAbs = 0n): { n: bigint; off: Q } {
  const Q_ = BigInt(p.q!), R = BigInt(p.r!);
  const t0 = Qn.floor(Qn.div(Qn.sub(v, q(R)), q(Q_)));
  let best: { n: bigint; off: Q } | null = null;
  for (let t = t0 - 2n; t <= t0 + 3n; t++) {
    const n = R + Q_ * t;
    if (absB(n) < minAbs) continue;
    const off = Qn.abs(Qn.sub(v, q(n)));
    if (!best || Qn.cmp(off, best.off) < 0) best = { n, off };
  }
  return best!;
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
const ORD: Record<number, string> = { 2: "halves", 3: "thirds", 4: "quarters", 5: "fifths", 6: "sixths" };
const ordinal = (k: number) => ORD[k] ?? `${k}ths`;
const times = (k: number) => (k === 2 ? "twice" : `${k} times`);

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
  main: main("answer", "the answer is whole numbers", p => `Solve the two equations: the answer (x, y) should be whole numbers, and x ${leaves(p)}. The closer, the better.`, "pair"),
  tieBreakers: [
    tb("peg-divisor", "the answer shares a factor with the number you divide by", "The answer's whole numbers, added up as distances (|x| + |y|), should share as big a factor as possible with the number you divide by when you solve.", "solve", "shared"),
    tb("south-west", "the answer far down and to the left", "The answer's x + y should be as small (as negative) as possible.", "pair", "small"),
  ],
  params: DEALT_NUMBERS["whole-answer"],
  evaluate: (ctx, p) => {
    const a = answer(ctx), d = read(ctx, D)!;
    if (!a) return void (ctx.term("answer", "how far the answer is from whole numbers", PARALLEL, [PX, PY]), allUndefined(ctx, ["peg-divisor", "south-west"], PARALLEL, [X, Y]));
    // The peg: x's whole number with the dealt remainder, y's nearest whole number.
    const px = residueAnchor(a.x, p);
    ctx.term("answer", `how far the answer is from whole numbers with x that ${leaves(p)} (x and y added)`, Qn.add(px.off, distanceToWhole(a.y)), [PX, PY]);
    ctx.term("peg-divisor", "the common factor of |X| + |Y| and the number you divide by", shared(absB(px.n) + absB(a.Y), d.n), [X, Y, D]);
    ctx.term("south-west", "X + Y", q(px.n + a.Y), [X, Y]);
    ctx.mark({ kind: "focus", ref: P });
  },
});

export const noFractions = family({
  id: "no-fractions", title: "No Fractions", depends: ["pair", "solve", "si"],
  main: main("divisor", "the number you divide by is the dealt one", p => p.k === 1
    ? "When you solve the two equations you divide by a number: it should be 1 (or −1), so the answer has no fractions. The closer, the better."
    : `When you solve the two equations you divide by a number: it should be ${p.k} (or −${p.k}), so the answer's fractions are ${ordinal(p.k!)} at most. The closer, the better.`, "solve"),
  tieBreakers: [
    tb("answer-prime", "the answer's distance is a big prime", "The answer's |x| + |y| should have as big a smallest prime factor as possible.", "pair", "prime"),
    tb("answer-gradient", "the answer's distance shares a factor with the steeper gradient", "The answer's |x| + |y| should share as big a factor as possible with the steeper line's gradient (its whole part, ignoring the sign).", "si", "shared"),
  ],
  params: DEALT_NUMBERS["no-fractions"],
  evaluate: (ctx, p) => {
    const d = read(ctx, D)!, a = answer(ctx), k = BigInt(p.k!);
    if (!a) return void (ctx.term("divisor", "how far |D| is from the dealt number", PARALLEL, [D]), allUndefined(ctx, ["answer-prime", "answer-gradient"], PARALLEL, [X, Y]));
    ctx.term("divisor", `how far the number you divide by is from ${k} (|D| − ${k}, ignoring the sign)`, q(absB(absB(d.n) - k)), [D]);
    const t = absB(a.X) + absB(a.Y), m = read(ctx, MS);
    ctx.term("answer-prime", "the smallest prime factor of |X| + |Y|", spf(t), [X, Y]);
    ctx.term("answer-gradient", "the common factor of |X| + |Y| and the steeper gradient's whole part", m === null ? q(0) : shared(t, Qn.floor(Qn.abs(m))), [X, Y, MS]);
  },
});

const OFF_RIGHT = ref("angle", "offRight"), OFF45 = ref("angle", "off45"), YGAP = ref("si", "ygap"), XGAP = ref("si", "xgap");
export const rightAngle = family({
  id: "right-angle", title: "Right Angle", depends: ["angle", "solve", "si"],
  main: main("right", "the lines cross at a right angle", "The two lines should cross at a right angle (their gradients multiply to −1). The closer, the better.", "angle"),
  tieBreakers: [
    tb("prime-divisor", "the number you divide by is a big prime", "The number you divide by when you solve should have as big a smallest prime factor as possible.", "solve", "prime"),
    tb("divisor-intercept", "the number you divide by shares a factor with the steeper line's y-intercept", "The number you divide by should share as big a factor as possible with the steeper line's y-intercept (to the nearest whole number).", "si", "shared"),
  ],
  evaluate: ctx => {
    const off = read(ctx, OFF_RIGHT), d = read(ctx, D)!, c = read(ctx, CS);
    if (off === null) return void (ctx.term("right", "how far from a right angle", PARALLEL, [OFF_RIGHT]), allUndefined(ctx, ["prime-divisor", "divisor-intercept"], PARALLEL, [D]));
    ctx.term("right", "how far from a right angle (|dot ÷ D|)", off, [OFF_RIGHT]);
    ctx.term("prime-divisor", "the smallest prime factor of the number you divide by", spf(d.n), [D]);
    ctx.term("divisor-intercept", "the common factor of D and the steeper line's y-intercept", c === null ? q(0) : shared(d.n, near(c)), [D, CS]);
  },
});

export const fortyFive = family({
  id: "forty-five", title: "Forty-Five", depends: ["angle", "solve", "si"],
  main: main("forty-five", "the lines cross at 45°", "The two lines should cross at 45° (half a right angle). The closer, the better.", "angle"),
  tieBreakers: [
    tb("smooth-divisor", "the number you divide by has many prime factors", "The number you divide by when you solve should have as many prime factors as possible.", "solve", "smooth"),
    tb("divisor-gap", "the number you divide by shares a factor with the y-intercepts' gap", "The number you divide by should share as big a factor as possible with the gap between the y-intercepts (to the nearest whole number).", "si", "shared"),
  ],
  evaluate: ctx => {
    const off = read(ctx, OFF45)!, d = read(ctx, D)!, g = read(ctx, YGAP);
    // Parallel lines never cross, so they have no angle (as in every other family that reads the crossing or the angle).
    if (d.n === 0n) return void (ctx.term("forty-five", "how far from 45°", PARALLEL, [OFF45]), allUndefined(ctx, ["smooth-divisor", "divisor-gap"], PARALLEL, [D]));
    ctx.term("forty-five", "how far from 45° (the gap between |D| and |dot|, over their total)", off, [OFF45]);
    ctx.term("smooth-divisor", "how many prime factors the number you divide by has", omega(d.n), [D]);
    ctx.term("divisor-gap", "the common factor of D and the y-intercepts' gap", g === null ? U("a vertical line has no y-intercept") : shared(d.n, near(g)), [D, YGAP]);
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
  id: "double-gap", title: "Double Gap", depends: ["si", "solve"],
  main: main("gaps", "the gap on the y-axis is a whole number, the dealt number of times the gap on the x-axis", p => `The gap between the lines' y-intercepts should be a whole number and ${times(p.k!)} the gap between their x-intercepts, and neither line may pass through (0, 0). The closer, the better.`, "si"),
  tieBreakers: [
    tb("gap-divisor", "the gap shares a factor with the number you divide by", "The gap between the y-intercepts (to the nearest whole number) should share as big a factor as possible with the number you divide by when you solve.", "solve", "shared"),
    tb("gap-prime", "the gap is a big prime", "The gap between the y-intercepts (to the nearest whole number) should have as big a smallest prime factor as possible.", "si", "prime"),
  ],
  params: DEALT_NUMBERS["double-gap"],
  evaluate: (ctx, p) => {
    const yg = read(ctx, YGAP), xg = read(ctx, XGAP);
    // A line through the origin has both intercepts 0, and would double any other line's gaps for free.
    if (yg === null || xg === null || ctx.state.lines.some(l => l.c === 0n)) {
      const why = U(yg === null || xg === null ? "a gap needs both lines to cross both axes once" : "a line through the origin has no gap to give");
      return void (ctx.term("gaps", "the two gaps' difference", why, [YGAP, XGAP]), allUndefined(ctx, ["gap-divisor", "gap-prime"], why, [YGAP]));
    }
    ctx.term("gaps", `how far the y-intercepts' gap is from ${times(p.k!)} the x-intercepts' gap, plus how far it is from a whole number`, Qn.add(Qn.abs(Qn.sub(yg, Qn.mul(q(p.k!), xg))), distanceToWhole(yg)), [YGAP, XGAP]);
    ctx.term("gap-divisor", "the common factor of the y-intercepts' gap and D", shared(near(yg), read(ctx, D)!.n), [YGAP, D]);
    ctx.term("gap-prime", "the smallest prime factor of the y-intercepts' gap", spf(near(yg)), [YGAP]);
  },
});

export const farCrossing = family({
  id: "far-crossing", title: "Far Crossing", depends: ["si"],
  main: main("far", "the steeper line crosses the x-axis at a whole number with the dealt remainder", p => `The steeper line should cross the x-axis at a whole number that ${leaves(p)}. The closer, the better.`, "si"),
  tieBreakers: [
    tb("far-right", "the steeper line crosses the x-axis far to the right", "That whole number should be as big as possible.", "si", "big"),
    tb("far-prime", "the steeper line's x-intercept is a big prime", "That whole number should have as big a smallest prime factor as possible.", "si", "prime"),
  ],
  params: DEALT_NUMBERS["far-crossing"],
  evaluate: (ctx, p) => {
    const r = read(ctx, RS);
    if (r === null) { const why = U("the steeper line is flat: it never meets the x-axis"); return void (ctx.term("far", "x-intercept", why, [RS]), allUndefined(ctx, ["far-right", "far-prime"], why, [RS])); }
    const a = residueAnchor(r, p);
    ctx.term("far", `how far the steeper line's x-intercept is from a whole number that ${leaves(p)}`, a.off, [RS]);
    ctx.term("far-right", "that whole number", q(a.n), [RS]);
    ctx.term("far-prime", "the smallest prime factor of that whole number", spf(a.n), [RS]);
  },
});

/**
 * High Start reads the GENTLER line (the coordinator's trial, 15 Nov, two-line-systems.md §8.2): on the steeper line it
 * shared Steep Ratio's hill (a stretch of the steeper line raised both). On the gentler line a stretch that raises its
 * start lowers the ratio of gradients, so the two pull against each other.
 */
export const highStart = family({
  id: "high-start", title: "High Start", depends: ["si", "solve"],
  main: main("start", "the gentler line crosses the y-axis at a whole number with the dealt remainder", p => `The gentler line should cross the y-axis at a whole number that ${leaves(p)}. The closer, the better.`, "si"),
  tieBreakers: [
    tb("high-and-rising", "the gentler line high and rising", "The smaller of that y-intercept and the gentler gradient's whole part should be as big as possible.", "si", "big"),
    tb("start-factors", "that y-intercept shares many prime factors with the number you divide by", "The common factor of that y-intercept and the number you divide by should have as many prime factors as possible.", "solve", "smooth"),
  ],
  params: DEALT_NUMBERS["high-start"],
  evaluate: (ctx, p) => {
    const c = read(ctx, CG), m = read(ctx, MG), d = read(ctx, D)!;
    if (c === null || m === null) { const why = U("the gentler line is vertical: it has no y-intercept"); return void (ctx.term("start", "y-intercept", why, [CG]), allUndefined(ctx, ["high-and-rising", "start-factors"], why, [CG])); }
    const a = residueAnchor(c, p);
    ctx.term("start", `how far the gentler line's y-intercept is from a whole number that ${leaves(p)}`, a.off, [CG]);
    const h = a.n, mf = Qn.floor(m);
    ctx.term("high-and-rising", "the smaller of the y-intercept and the gradient's whole part", q(h < mf ? h : mf), [CG, MG]);
    ctx.term("start-factors", "how many prime factors the y-intercept shares with D", omega(h === 0n || d.n === 0n ? 0n : gcdB(h, d.n)), [CG, D]);
  },
});

export const steepRatio = family({
  id: "steep-ratio", title: "Steep Ratio", depends: ["si"],
  main: main("ratio", "one line a whole number of times as steep as the other, with the dealt remainder", p => `The steeper line should be a whole number of times as steep as the other (2, 3, 4 … times, or −2, −3 …), a number that ${leaves(p)}. The closer, the better.`, "si"),
  tieBreakers: [
    tb("ratio-gap", "that number shares a factor with the y-intercepts' gap", "That whole number of times should share as big a factor as possible with the gap between the y-intercepts.", "si", "shared"),
    tb("ratio-prime", "that number is a big prime", "That whole number of times should have as big a smallest prime factor as possible.", "si", "prime"),
  ],
  params: DEALT_NUMBERS["steep-ratio"],
  evaluate: (ctx, p) => {
    const r = read(ctx, RATIO), g = read(ctx, YGAP);
    if (r === null) { const why = U("a ratio needs two lines with gradients, the gentler not flat"); return void (ctx.term("ratio", "ratio", why, [RATIO]), allUndefined(ctx, ["ratio-gap", "ratio-prime"], why, [RATIO])); }
    const { n: k, off } = residueAnchor(r, p, 2n);
    ctx.term("ratio", `how far the ratio of gradients is from a whole number of times that ${leaves(p)}`, off, [RATIO]);
    ctx.term("ratio-gap", "the common factor of that number and the y-intercepts' gap", g === null ? U("a vertical line has no y-intercept") : shared(k, near(g)), [RATIO, YGAP]);
    ctx.term("ratio-prime", "the smallest prime factor of that number", spf(k), [RATIO]);
  },
});

export const pairFamilies: readonly RuleFamily<PairState, P>[] = [wholeAnswer, noFractions, rightAngle, fortyFive, onTheDiagonal, doubleGap, farCrossing, highStart, steepRatio];
