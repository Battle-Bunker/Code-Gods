/**
 * The rational-native line families (owner-decisions.md, coordinator's list item 10): rules an earlier "exact sums on
 * whole-number lines" filter set aside because they are degenerate on whole numbers (a whole gradient takes one Euclid
 * step, has no repeating decimal, is its own rise over a run of 1). Lines are played on the rationals (decision 2) and
 * a rule no exact sum can value is valued by sampling (decision 22), so they return here, undealt until they pass the
 * collapse tests. Sources: docs/engine-v2/layered-line-rules.md §2.1 and §2.3 (Prime-Factor Intercept, Pell Gradient,
 * Euclid's Long Way, Farey Neighbours, Egyptian Line), §7.2 and docs/engine-v2/scripts/line-families.mjs (Prime Slope),
 * docs/engine-v2/rule-brainstorm/c-negotiation.md §3.8 and §3.12 (Long Division, Steady Gradient). Every layer is a
 * distance, a count or a size, never a threshold (decisions 13 and 23). Every tie-breaker is tied to its main layer's anchor
 * (the number the main layer is about) and, where it can, another aspect of the line (owner decision 29); a source
 * secondary that was an independent wish is replaced by a tied one (marked where it happens).
 *
 * Except Whole Intercept (the owner's decision 12 example, dealable on every variant as before), each is dealable only
 * on rational lines: on whole-number lines it cannot decide anything.
 */
import { Qn, q, ref, type ElementRef, type Q, type Variant } from "@workspace/v2-core";
import { lineParams } from "./line.ts";
import { allUndefined, distance, family, gap, more, num, undef, type Ctx, type Shape } from "./layers.ts";
import { distanceToPrime, distanceToWhole, nearestInteger, nearestSquareRoot, primeFactorCount, smallestPrimeFactor, TRIAL_DIVISION_LIMIT } from "./numbers.ts";

export const onRationals = <P,>(params: P[]) => (v: Variant): P[] => (lineParams(v).domain === "Q" ? params : []);
const abs = (x: bigint): bigint => (x < 0n ? -x : x);

/** Prime-Factor Intercept's smallest prime factor: spf(0) = 2 (every prime divides 0; the smallest is 2), spf(±1) = 1. */
export function spfOrTwo(n: bigint): bigint {
  return n === 0n ? 2n : smallestPrimeFactor(n);
}

/** τ(|n|), the number of divisors (a cofactor with no factor below the trial limit counts as prime); τ(0) = 0. */
export function divisorCount(n: bigint): bigint {
  let m = abs(n);
  if (m === 0n) return 0n;
  let t = 1n;
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) {
    let k = 0n;
    while (m % d === 0n) { m /= d; k++; }
    t *= k + 1n;
  }
  return m > 1n ? t * 2n : t;
}

/** Euclid's algorithm on top/bottom of a fraction in lowest terms (top divided by bottom first, as written): its divisions and the largest quotient. */
export function euclid(x: Q): { steps: number; largest: bigint } {
  let a = abs(x.n), b = x.d, steps = 0, largest = 0n;
  while (b !== 0n) {
    const k = a / b;
    if (k > largest) largest = k;
    [a, b] = [b, a - k * b];
    steps++;
  }
  return { steps, largest };
}

/** The distinct prime factors of n ≥ 1 by trial division (a cofactor with no factor below the limit counts as prime). */
function primeFactors(n: bigint): bigint[] {
  const out: bigint[] = [];
  let m = n;
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) {
    if (m % d === 0n) { out.push(d); while (m % d === 0n) m /= d; }
  }
  if (m > 1n) out.push(m);
  return out;
}
const powMod = (b: bigint, e: bigint, m: bigint): bigint => {
  let r = 1n % m;
  b %= m;
  for (; e > 0n; e >>= 1n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; }
  return r;
};
const lcm = (a: bigint, b: bigint): bigint => { let x = a, y = b; while (y) [x, y] = [y, x % y]; return (a / x) * b; };

/**
 * ℓ(x): the length of the repeating block of x's decimal (0 if it stops), the order of 10 modulo the bottom of x with
 * its 2s and 5s removed (c-negotiation.md §3.8). By Carmichael's λ, cut down by each prime factor while 10 still
 * returns to 1.
 */
export function decimalPeriod(x: Q): bigint {
  let d = x.d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  if (d === 1n) return 0n;
  let lambda = 1n;
  let m = d;
  for (const p of primeFactors(d)) {
    let pk = 1n;
    while (m % p === 0n) { m /= p; pk *= p; }
    lambda = lcm(lambda, (pk / p) * (p - 1n));
  }
  let ord = lambda;
  for (const r of primeFactors(lambda)) while (ord % r === 0n && powMod(10n, ord / r, d) === 1n) ord /= r;
  return ord;
}

/** The smallest prime factor of n for a term's label, saying when it is degenerate (0 and ±1) instead of a bare number. */
const spfLabel = (n: bigint): string =>
  n === 0n ? "0: every prime divides it (counted as 2)" : abs(n) === 1n ? `${n} has no prime factor (counted as 1)` : `smallest prime factor of ${n}`;
const gcdB = (a: bigint, b: bigint): bigint => { let x = abs(a), y = abs(b); while (y) [x, y] = [y, x % y]; return x; };
/**
 * gcd(a, b) as a term. With a 0 it is undefined (ranks last): 0 shares every factor, so gcd(0, k) = |k| would turn a
 * line through c = 0 (or a flat step) into an independent wish for one big number, untied from the anchor (decision 29).
 */
export function gcdTerm(a: bigint, b: bigint, what: string): { label: string; value: Q | { undefined: string } } {
  if (a === 0n || b === 0n) return { label: `${what}: one is 0, which shares every factor, so it does not count`, value: { undefined: "0 shares every factor with every number: no common factor to compare" } };
  const g = gcdB(a, b);
  return { label: `${what}: gcd(${a}, ${b}) = ${g}`, value: q(g) };
}

const unitFraction = (x: Q): boolean => x.n === 1n && x.d >= 2n;
const squareDistance = (n: bigint): bigint => { const r = nearestSquareRoot(q(n)); return abs(n - r * r); };

/** Read the gradient (si.m); every layer undefined for a vertical line. */
function readM<P>(ctx: Ctx, shape: Shape<P>): { m: Q; mRef: ElementRef } | null {
  const mRef = ref("si", "m");
  const mv = ctx.read(mRef);
  const m = num(mv);
  if (m === null) { allUndefined(ctx, shape, mv, mRef); return null; }
  return { m, mRef };
}

// ---------------------------------------------------------------- Whole Intercept (Prime-Factor Intercept, §2.1 #1)

const wholeShape: Shape<object> = {
  main: distance("frac", "y-intercept close to a whole number", "Make the y-intercept as close as possible to a whole number.", "si"),
  tieBreakers: [
    more("spf", "smallest prime factor of that whole number",
      "That whole number's smallest prime factor should be as big as possible (0 counts as even, so 2; 1 and −1 have none, so 1). Halfway between two whole numbers, the one with the bigger smallest prime factor counts.", "si"),
    // The source's two-element version, as one graded tie-breaker: first m whole (its distance from whole, below every
    // whole m's value), then the smaller of the two smallest prime factors.
    more("mc-spf", "the gradient whole too, and the smaller smallest prime factor",
      "The gradient should be a whole number too (as close as possible), and then the smaller of the two numbers' smallest prime factors should be as big as possible.", "si"),
    more("omega", "prime factors of that whole number", "That whole number should have as many prime factors as possible (counting repeats).", "si"),
    // Owner decision 29's own example: tie the anchor (that whole number) to another aspect of the line.
    more("gcd-floor-m", "common factor of that whole number and the gradient rounded down",
      "That whole number and the gradient rounded down should have as big a common factor as possible.", "si"),
    // §A2 (line-rules-v3-proposals.md): the anchor against the gradient's bottom number.
    more("gcd-den-m", "common factor of that whole number and the gradient's bottom",
      "That whole number and the gradient's bottom number (in lowest terms) should have as big a common factor as possible.", "si"),
  ],
};
export const wholeIntercept = family("whole-intercept", "Whole Intercept", ["si", "cart"], wholeShape, [{}], ctx => {
  const cRef = ref("si", "c"), mRef = ref("si", "m");
  const cv = ctx.read(cRef);
  const c = num(cv);
  if (c === null) return allUndefined(ctx, wholeShape, cv, cRef);
  const m = num(ctx.read(mRef))!;
  const d = distanceToWhole(c);
  // The nearest whole number; exactly halfway, the neighbour with the bigger smallest prime factor (two neighbours
  // are never equal: one is even, spf 2, and the other odd, spf ≥ 3 or 1 for ±1).
  let n = nearestInteger(c);
  if (Qn.eq(d, q(1, 2)) && spfOrTwo(n - 1n) > spfOrTwo(n)) n -= 1n;
  const spf = spfOrTwo(n);
  const mDist = distanceToWhole(m);
  const mark = ref("cart", "yAxisMark", { y: n });
  ctx.read(mark);
  ctx.term("frac", `distance from c to ${n}`, d, [cRef]);
  ctx.term("spf", spfLabel(n), q(spf), [cRef]);
  ctx.term("mc-spf", Qn.isZero(mDist) ? `the smaller of (${spfLabel(m.n)}) and (${spfLabel(n)})` : "minus the gradient's distance from a whole number",
    Qn.isZero(mDist) ? q(spfOrTwo(m.n) < spf ? spfOrTwo(m.n) : spf) : Qn.neg(mDist), [mRef, cRef]);
  ctx.term("omega", n === 0n || abs(n) === 1n ? `${n} has no prime factors (counted as 0)` : `prime factors of ${n}`, q(primeFactorCount(n)), [cRef]);
  const g = gcdTerm(n, Qn.floor(m), `common factor of ${n} and ⌊m⌋ = ${Qn.floor(m)}`);
  ctx.term("gcd-floor-m", g.label, g.value, [mRef, cRef]);
  const gq = gcdTerm(n, m.d, `common factor of ${n} and the gradient's bottom ${m.d}`);
  ctx.term("gcd-den-m", gq.label, gq.value, [mRef, cRef]);
  ctx.mark({ kind: "focus", ref: cRef });
  ctx.mark({ kind: "candidate", ref: mark, term: "frac" });
});

// ---------------------------------------------------------------- Pell Gradient (§2.3 #8)

/** |m² − k·m − D|: k = 0 is "m × m close to D"; k = 1, D = 1 the golden version (m × m − m close to 1). */
export type PellParams = { D: number; k: number };
const pellShape: Shape<PellParams> = {
  main: { ...distance<PellParams>("pell", "the gradient squared close to D", "", "si"),
    sentence: p => (p.k === 0
      ? `The gradient times itself should be as close as possible to ${p.D}.`
      : `The gradient times itself, take away the gradient, should be as close as possible to ${p.D}.`) },
  tieBreakers: [
    // Proposed (the source has one component): its annotation sets p² beside D·q² with their difference; Pell's
    // equation asks that difference to be ±1.
    { ...distance<PellParams>("difference", "the whole-number difference (Pell's equation)", "", "si"),
      sentence: p => (p.k === 0
        ? `Writing the gradient as a fraction top/bottom in lowest terms, top × top and ${p.D} × bottom × bottom should be as close as possible to each other.`
        : "Writing the gradient as a fraction top/bottom in lowest terms, top × top − top × bottom and bottom × bottom should be as close as possible to each other.") },
    // §A2 (line-rules-v3-proposals.md): Pell's leftover tied to the y-intercept's top number.
    { ...distance<PellParams>("pell-c", "the leftover equal to the y-intercept's top", "", "si"),
      sentence: p => (p.k === 0
        ? `Writing the gradient as top/bottom and the y-intercept as top/bottom in lowest terms, the gradient's top × top − ${p.D} × bottom × bottom should be as close as possible to the y-intercept's top number.`
        : `Writing the gradient as top/bottom and the y-intercept as top/bottom in lowest terms, the gradient's top × top − top × bottom − ${p.D} × bottom × bottom should be as close as possible to the y-intercept's top number.`) },
    distance("share-den", "the y-intercept a multiple of 1 over the gradient's bottom",
      "The y-intercept times the gradient's bottom number (in lowest terms) should be as close as possible to a whole number: the y-intercept a multiple of 1/bottom.", "si"),
  ],
};
export const pellGradient = family<PellParams>("pell-gradient", "Pell Gradient", ["si"], pellShape,
  onRationals([2, 3, 5, 6, 7].map(D => ({ D, k: 0 })).concat([{ D: 1, k: 1 }])), (ctx, p) => {
    const r = readM(ctx, pellShape);
    if (!r) return;
    const { m, mRef } = r, D = BigInt(p.D), k = BigInt(p.k);
    const err = Qn.abs(Qn.sub(Qn.sub(Qn.mul(m, m), Qn.mul(q(k), m)), q(D)));
    const top = m.n * m.n - k * m.n * m.d, bottom = D * m.d * m.d;
    ctx.term("pell", p.k === 0 ? `distance from m² to ${p.D}` : `distance from m² − m to ${p.D}`, err, [mRef]);
    ctx.term("difference", `|${top} − ${bottom}|`, q(abs(top - bottom)), [mRef]);
    const cRef = ref("si", "c");
    const c = num(ctx.read(cRef))!;
    ctx.term("pell-c", `|${top - bottom} − ${c.n}| (the leftover against the y-intercept's top)`, q(abs(top - bottom - c.n)), [mRef, cRef]);
    ctx.term("share-den", `distance from ${Qn.toWire(c)} × ${m.d} to a whole number`, distanceToWhole(Qn.mul(c, q(m.d))), [mRef, cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "note", ref: mRef, text: `${Qn.toWire(m)}: ${top} against ${bottom}, off by ${abs(top - bottom)} over ${m.d * m.d}` });
  });

// ---------------------------------------------------------------- Euclid's Long Way (§2.3 #10)

const euclidShape: Shape<object> = {
  main: more("steps", "steps of Euclid's algorithm on the gradient",
    "Write the gradient as a fraction in lowest terms and run Euclid's algorithm on its top and bottom (divide, keep the remainder, repeat): it should take as many steps as possible.", "si"),
  tieBreakers: [
    distance("largest-quotient", "the largest quotient", "The largest number of times any division goes should be as small as possible.", "si"),
  ],
};
export const euclidSteps = family("euclid-steps", "Euclid's Long Way", ["si"], euclidShape, onRationals([{}]), ctx => {
  const r = readM(ctx, euclidShape);
  if (!r) return;
  const e = euclid(r.m);
  ctx.term("steps", `steps of Euclid's algorithm on ${abs(r.m.n)} and ${r.m.d}`, q(e.steps), [r.mRef]);
  ctx.term("largest-quotient", "the largest quotient", q(e.largest), [r.mRef]);
  ctx.mark({ kind: "focus", ref: r.mRef });
  ctx.mark({ kind: "note", ref: r.mRef, text: `${e.steps} steps, largest quotient ${e.largest}` });
});

// ---------------------------------------------------------------- Farey Neighbours (§2.3 #11)

const fareyShape: Shape<object> = {
  main: distance("neighbours", "|p·s − q·r| close to 1",
    "Write the gradient and the y-intercept as fractions p/q and r/s in lowest terms: p·s − q·r should be as close as possible to 1 or −1 (then they are neighbours: no simpler fraction fits between them).", "si"),
  tieBreakers: [
    more("bottoms", "the smaller bottom", "The smaller of the two bottom numbers should be as big as possible.", "si"),
    // §A2 (line-rules-v3-proposals.md): the anchor (the mediant (p + r)/(q + s)) against the x-intercept.
    more("mediant-x", "common factor of the in-between fraction's bottom and the x-intercept's bottom",
      "The in-between fraction (p + r)/(q + s) has bottom number q + s: it and the bottom number of the x-intercept (where the line crosses the x-axis, in lowest terms) should have as big a common factor as possible.", "crossing"),
  ],
};
export const fareyNeighbours = family("farey-neighbours", "Farey Neighbours", ["si", "crossing"], fareyShape, onRationals([{}]), ctx => {
  const r = readM(ctx, fareyShape);
  if (!r) return;
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!, m = r.m;
  const det = m.n * c.d - m.d * c.n;
  ctx.term("neighbours", `| |${det}| − 1 |`, q(abs(abs(det) - 1n)), [r.mRef, cRef]);
  ctx.term("bottoms", "the smaller bottom", q(m.d < c.d ? m.d : c.d), [r.mRef, cRef]);
  // The x-intercept −c/m: a flat line never crosses, so its term is undefined (ranks last). q + s ≥ 2, never 0.
  const xRef = ref("crossing", "x0");
  const xv = ctx.read(xRef), x = num(xv);
  const g = x === null ? null : gcdTerm(m.d + c.d, x.d, `common factor of ${m.d} + ${c.d} = ${m.d + c.d} and the x-intercept ${Qn.toWire(x)}'s bottom ${x.d}`);
  ctx.term("mediant-x", g ? g.label : "the x-intercept's bottom", g ? g.value : undef(xv), [r.mRef, cRef, xRef]);
  ctx.mark({ kind: "focus", ref: r.mRef });
  ctx.mark({ kind: "focus", ref: cRef });
});

// ---------------------------------------------------------------- Egyptian Line (§2.3 #12)

const egyptShape: Shape<object> = {
  main: more("units", "unit fractions among m, c and m + c",
    "The gradient, the y-intercept and y(1) = m + c should be unit fractions (one over a whole number, like ⅓): as many of the three as possible.", "si"),
  tieBreakers: [
    more("bottom", "with all three, the bigger bottom of m and c",
      "With all three unit fractions, the bigger of the gradient's and the y-intercept's bottom numbers should be as big as possible.", "si"),
  ],
};
export const egyptianLine = family("egyptian-line", "Egyptian Line", ["si", "table"], egyptShape, onRationals([{}]), ctx => {
  const r = readM(ctx, egyptShape);
  if (!r) return;
  const cRef = ref("si", "c"), yRef = ref("table", "y", { x: 1 });
  const c = num(ctx.read(cRef))!, y1 = num(ctx.read(yRef))!, m = r.m;
  const units = [m, c, y1].filter(unitFraction).length;
  ctx.term("units", "unit fractions among m, c and y(1)", q(units), [r.mRef, cRef, yRef]);
  ctx.term("bottom", "with all three, the bigger bottom", q(units === 3 ? (m.d > c.d ? m.d : c.d) : 0n), [r.mRef, cRef]);
  for (const [x, at] of [[m, r.mRef], [c, cRef], [y1, yRef]] as const) if (unitFraction(x)) ctx.mark({ kind: "focus", ref: at });
});

// ---------------------------------------------------------------- Long Division (c-negotiation.md §3.8)

const PERIOD = 6n;
const longShape: Shape<object> = {
  main: distance("period", "the repeating block six digits long",
    "Work the gradient out as a decimal: its repeating block should be as close as possible to six digits long, like 1/7 = 0.142857 142857 ….", "si"),
  tieBreakers: [
    distance("m-top", "the gradient's top small", "The top of the gradient (as a fraction in lowest terms, ignoring its sign) should be as small as possible.", "si"),
    more("m-bottom-spf", "the gradient's bottom's smallest prime factor", "The smallest prime factor of the gradient's bottom number should be as big as possible.", "si"),
    // Replaces the source's S3 (min den(c), an independent wish) under owner decision 29: tied to the period.
    distance("c-period", "the y-intercept's repeating block as long as the gradient's",
      "Worked out as a decimal too, the y-intercept's repeating block should be as close as possible to the same length as the gradient's.", "si"),
  ],
};
export const longDivision = family("long-division", "Long Division", ["si"], longShape, onRationals([{}]), ctx => {
  const r = readM(ctx, longShape);
  if (!r) return;
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!, m = r.m;
  const l = decimalPeriod(m);
  ctx.term("period", `|${l} − ${PERIOD}| (the repeating block of ${Qn.toWire(m)} is ${l} long)`, q(abs(l - PERIOD)), [r.mRef]);
  ctx.term("m-top", "the gradient's top", q(abs(m.n)), [r.mRef]);
  ctx.term("m-bottom-spf", m.d === 1n ? "a whole gradient's bottom is 1, with no prime factor (counted as 1)" : `smallest prime factor of ${m.d}`, q(smallestPrimeFactor(m.d)), [r.mRef]);
  const lc = decimalPeriod(c);
  ctx.term("c-period", `|${lc} − ${l}| (the y-intercept's repeating block against the gradient's)`, q(abs(lc - l)), [r.mRef, cRef]);
  ctx.mark({ kind: "focus", ref: r.mRef });
  ctx.mark({ kind: "note", ref: r.mRef, text: l === 0n ? "the decimal stops" : `the decimal repeats every ${l} digits` });
});

// ---------------------------------------------------------------- Prime Slope (§7.2, K6)

const slopeShape: Shape<object> = {
  main: distance("primes", "rise and run close to primes",
    "Writing the gradient as rise over run in simplest form, the rise (ignoring its sign) and the run should each be as close as possible to a prime (distances added).", "cart"),
  tieBreakers: [
    distance("twins", "rise and run two apart", "The rise and the run should be as close as possible to two apart.", "cart"),
    distance("square-sum", "rise + run close to a square", "Rise plus run should be as close as possible to a square number.", "cart"),
    distance("matching-c", "the y-intercept's bottom close to the run", "The y-intercept's bottom number should be as close as possible to the run.", "si"),
  ],
};
export const primeSlope = family("prime-slope", "Prime Slope", ["cart", "si"], slopeShape, onRationals([{}]), ctx => {
  const sRef = ref("cart", "slope");
  const sv = ctx.read(sRef);
  const m = num(sv);
  if (m === null) return allUndefined(ctx, slopeShape, sv, sRef);
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!;
  const rise = abs(m.n), run = m.d;
  ctx.term("primes", `distances of ${rise} and ${run} from primes, added`, Qn.add(distanceToPrime(q(rise)), distanceToPrime(q(run))), [sRef]);
  ctx.term("twins", `| |${rise} − ${run}| − 2 |`, q(abs(abs(rise - run) - 2n)), [sRef]);
  ctx.term("square-sum", `distance from ${rise + run} to a square`, q(squareDistance(rise + run)), [sRef]);
  ctx.term("matching-c", `|${c.d} − ${run}|`, q(abs(c.d - run)), [sRef, cRef]);
  ctx.mark({ kind: "focus", ref: sRef });
  ctx.mark({ kind: "note", ref: sRef, text: `rise ${m.n}, run ${run}` });
});

// ---------------------------------------------------------------- Steady Gradient (c-negotiation.md §3.12)

const steadyShape: Shape<object> = {
  main: distance("whole-step", "the gradient close to a whole number",
    "The gradient (how far the line goes up for each step right) should be as close as possible to a whole number.", "seq"),
  tieBreakers: [
    more("divisors", "divisors of that whole number", "That whole number should have as many divisors as possible (12 has six: 1, 2, 3, 4, 6, 12; 0 has none).", "seq"),
    // Replaces the source's S2 (min den(c), an independent wish) under owner decision 29: tied to that whole number.
    more("gcd-c", "common factor of that whole number and the y-intercept's nearest whole number",
      "That whole number and the whole number nearest the y-intercept should have as big a common factor as possible.", "si"),
    distance("x-whole", "the x-intercept close to whole", "The y-intercept divided by that whole number (where the line would cross the x-axis) should be as close as possible to a whole number too (as bad as can be when it is 0).", "si"),
  ],
};
export const steadyGradient = family("steady-gradient", "Steady Gradient", ["seq", "si"], steadyShape, onRationals([{}]), ctx => {
  const stepRef = ref("seq", "step");
  const sv = ctx.read(stepRef);
  const m = num(sv);
  if (m === null) return allUndefined(ctx, steadyShape, sv, stepRef);
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!;
  const M = nearestInteger(m);
  ctx.term("whole-step", `distance from the step to ${M}`, gap(m, q(M)), [stepRef]);
  ctx.term("divisors", M === 0n ? "0: every number divides it (counted as none)" : `divisors of ${M}`, q(divisorCount(M)), [stepRef]);
  const nc = nearestInteger(c);
  const g = gcdTerm(M, nc, `common factor of ${M} and ${nc}`);
  ctx.term("gcd-c", g.label, g.value, [stepRef, cRef]);
  ctx.term("x-whole", M === 0n ? "no x-intercept from a step of 0" : `distance from c/${M} to a whole number`,
    M === 0n ? Qn.ONE : distanceToWhole(Qn.div(c, q(M))), [stepRef, cRef]);
  ctx.mark({ kind: "focus", ref: stepRef });
});

/** The rational-native families: on the line type, not in any pool yet (dealt once they pass the collapse tests). */
export const rationalFamilies = [wholeIntercept, pellGradient, euclidSteps, fareyNeighbours, egyptianLine, longDivision, primeSlope, steadyGradient] as const;
