/**
 * The beginner families (docs/engine-v2/layered-line-rules.md §10.5, the curator's exact-only pool; Prime Gradient is
 * in families.ts): each a main layer a 12-year-old on a standard linear-equations course can read, and the curator's
 * dealable tie-breakers, every one valued by an exact sum (sums.ts). Every layer is graded (owner decision 13). A dealt
 * rule is the main layer plus one tie-breaker (decision 14 and its clarification).
 */
import { gcd, Qn, q, ref, type ElementRef, type Q } from "@workspace/v2-core";
import { lineParams } from "./line.ts";
import { allUndefined, distance, family, gap, more, num, prime, undef, undealt, type Ctx, type L, type Shape } from "./layers.ts";
import { gcdTerm } from "./rational.ts";
import { nearestResidue, distanceToPrime, distanceToPrimeEnding, distanceToWhole, isPrimeEnding, nearestPrimeEnding, PRIME_ENDINGS, isPrime, largestPrimeFactor, nearbyPrimes, nearestInteger, nearestSquareRoot, primeFactorCount, smallestPrimeFactor } from "./numbers.ts";

/** The smallest and largest prime factor of a whole number (|n|); 1 for 0, ±1 and fractions. */
const spfQ = (x: Q): Q => q(x.d === 1n ? smallestPrimeFactor(x.n) : 1n);
const gpfQ = (x: Q): Q => q(x.d === 1n ? largestPrimeFactor(x.n) : 1n);
/**
 * A prime-factor term's label: 0, 1, −1 and fractions have no prime factor, and the term then counts as 1 (the lowest
 * a whole number with a factor can score is 2), so the label says so rather than showing a bare "smallest prime factor: 1".
 */
export function factorLabel(which: "smallest" | "largest", what: string, x: Q): string {
  if (x.d !== 1n) return `${what} (${Qn.toWire(x)}) is not a whole number, so it has no prime factor: counts as 1`;
  if (x.n >= -1n && x.n <= 1n) return `${what} (${x.n}) has no prime factor: counts as 1`;
  return `${what}'s ${which} prime factor`;
}
/** Tie-breakers on the prime factors of a coefficient (the curator's §10.5: graded, an exact Euler-type sum). */
const factorTies = <P,>(of: "m" | "c", what: string): L<P>[] => [
  prime(more(`${of}-spf`, `${what}'s smallest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s smallest prime factor should be as big as possible.`, "si")),
  prime(more(`${of}-gpf`, `${what}'s largest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s largest prime factor should be as big as possible.`, "si")),
];

const squareGap = (x: Q): { root: bigint; d: Q } => { const r = nearestSquareRoot(x); return { root: r, d: gap(x, q(r * r)) }; };

// ---------------------------------------------------------------- vertical lines (the coordinator's call, 15 Nov)
// A vertical line x = k is a real line a 12-year-old knows. Rules with an honest reading of it score it (its main part
// read through another lens); its tie-breakers that need a gradient or a y-intercept stay undefined (the worst).

const VERTICAL_NO = "a vertical line has no gradient or y-intercept";
/** Where a vertical line stands (x = −c/a), read from the general form; null for any other line. */
function verticalAt(ctx: Ctx): { x: Q; from: ElementRef[] } | null {
  const bRef = ref("gen", "b");
  if (num(ctx.read(bRef))!.n !== 0n) return null;
  const aRef = ref("gen", "a"), cRef = ref("gen", "c");
  const a = num(ctx.read(aRef))!, c = num(ctx.read(cRef))!;
  return { x: Qn.neg(Qn.div(c, a)), from: [aRef, bRef, cRef] };
}
/** Score only the main part (the tie-breakers undefined) for a vertical line. */
function verticalMain<P>(ctx: Ctx, f: Shape<P>, label: string, value: Q, from: ElementRef[]): void {
  ctx.term(f.main.id, label, value, from);
  for (const l of f.tieBreakers) ctx.term(l.id, l.title, { undefined: VERTICAL_NO }, from);
  ctx.mark({ kind: "note", ref: from[0]!, text: `a vertical line: ${label}` });
}

// ---------------------------------------------------------------- 1. Prime Staircase

/** A dealt prime filter (owner decision 41): the primes this rule counts end in this digit. */
type Ends = { ends: number; side?: 1 | -1 };
/**
 * Ladder families (Prime Staircase, Prime Landing) deal every ending in PRIME_ENDINGS (numbers.ts): the
 * equal-opportunity audit compares a rung's bits minus its code cost (coordinator's call 19), so the law's favour for
 * small primes does not rule an ending out. `side` is the mirror (minus the primes) that Prime Gradient deals.
 */
/** "minus " for the mirror (side −1). */
const minus = (p: Ends) => (p.side === -1 ? "minus " : "");
/** x, or −x on the mirror. */
const sided = (p: Ends, x: Q): Q => (p.side === -1 ? Qn.neg(x) : x);
const primeEnding = (p: Ends) => `a prime ending in ${p.ends}`;
/** A layer whose sentence names the dealt filter. */
const withEnds = <X extends { sentence: (p: Ends) => string }>(l: X, sentence: (p: Ends) => string): X => ({ ...l, sentence });

/**
 * Prime Staircase as a ladder (design-principles.md). Main part, unbounded: the run L of different primes ending in k
 * that y(0), y(1), … start with, graded towards the next rung by how near the breaking term y(L) is to such a prime
 * (u = L + 1/(2 + d), so a longer run always wins and a near miss beats a far one). Tie-breakers read the run: the factor
 * its last prime minus 1 shares with its first prime minus 1 (gcd(m(L − 1), c − 1): a longer run changes it, so the
 * climb starts again), and y(−1) as near such a prime as possible (the run's step taken backwards).
 * Dealt: k = 1, 3, 7, 9.
 */
const ENDS_STAIRCASE: Ends[] = PRIME_ENDINGS.map(ends => ({ ends }));
const staircase: Shape<Ends> = {
  main: withEnds(more<Ends>("run", "a run of different dealt primes from y(0)", "", "seq"),
    p => `The pattern y(0), y(1), y(2), … should start with as long a run as possible of different primes ending in ${p.ends}; the term that breaks the run counts a little for being near such a prime.`),
  tieBreakers: [
    more<Ends>("shared-factor", "the factor the run's last prime minus 1 shares with its first prime minus 1",
      "The run's last prime minus 1 and its first prime minus 1 should share as big a factor as possible.", "seq"),
    withEnds(distance<Ends>("step-back", "y(−1) close to such a prime", "", "seq"),
      p => `The term before the start, y(−1), should be as close as possible to ${primeEnding(p)}.`),
  ],
};
export const primeStaircase = family<Ends>("prime-staircase", "Prime Staircase", ["seq", "si"], staircase, ENDS_STAIRCASE, (ctx, pr) => {
  const first = ref("seq", "term", { n: 0 });
  const v0 = ctx.read(first);
  if (num(v0) === null) return allUndefined(ctx, staircase, v0, first);
  const seen: bigint[] = [];
  // The run stops at the first term that is not a new prime ending in k (a repeat stops it: y = 7 repeats forever).
  // With a whole step m ≠ 0, y(|c|) is a multiple of c, so a run ends; 256 terms bound it all the same.
  let n = 0, brk: { ref: ElementRef; v: Q } | null = null;
  for (; n < 256; n++) {
    const r = ref("seq", "term", { n });
    const v = num(ctx.read(r))!;
    if (v.d === 1n && isPrimeEnding(v.n, pr.ends) && !seen.includes(v.n)) { seen.push(v.n); ctx.mark({ kind: "focus", ref: r }); continue; }
    brk = { ref: r, v };
    break;
  }
  const run = seen.length;
  const d = brk ? distanceToPrimeEnding(Qn.abs(brk.v), pr.ends) : Qn.ZERO;
  const terms = Array.from({ length: run }, (_, i) => ref("seq", "term", { n: i }));
  ctx.term("run", `${run} different primes ending in ${pr.ends} from y(0), then a term ${Qn.toWire(d)} from such a prime`,
    Qn.add(q(run), Qn.div(Qn.ONE, Qn.add(q(2), d))), [...terms, ...(brk ? [brk.ref] : [])]);
  const [p0, pl] = [seen[0], seen[run - 1]];
  ctx.term("shared-factor", run >= 2 ? `the factor ${pl! - 1n} shares with ${p0! - 1n}` : "a run of fewer than two primes shares nothing (counted as 0)",
    q(run >= 2 ? gcd(pl! - 1n, p0! - 1n) : 0n), terms.length ? terms : [first]);
  const back = ref("seq", "term", { n: -1 });
  const vb = num(ctx.read(back))!;
  ctx.term("step-back", `distance from y(−1) to ${primeEnding(pr)}`, distanceToPrimeEnding(Qn.abs(vb), pr.ends), [back]);
  if (brk) ctx.mark({ kind: "note", ref: brk.ref, text: "the run stops here" });
});

// ---------------------------------------------------------------- 2. Square Area (the owner's example 2)

const squareShape: Shape<object> = {
  main: distance("square", "area close to a square number", "The triangle the line cuts off the axes should have an area as close as possible to a square number.", "tri"),
  tieBreakers: [
    prime(more("spf", "that square's root's smallest prime factor", "The smallest prime factor of that square's root should be as big as possible.", "tri")),
    prime(more("lpf", "that square's root's largest prime factor", "The largest prime factor of that square's root should be as big as possible.", "tri")),
    more("omega", "prime factors of that square's root", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three).", "tri"),
  ],
};
export const squareArea = family("square-area", "Square Area", ["tri", "cart"], squareShape, [{}], ctx => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, squareShape, av, area);
  const sq = squareGap(a);
  ctx.term("square", `distance from the area to ${sq.root * sq.root}`, sq.d, [area]);
  ctx.term("spf", factorLabel("smallest", "the root", q(sq.root)), q(smallestPrimeFactor(sq.root)), [area]);
  ctx.term("lpf", factorLabel("largest", "the root", q(sq.root)), q(largestPrimeFactor(sq.root)), [area]);
  ctx.term("omega", `prime factors of ${sq.root}`, q(primeFactorCount(sq.root)), [area]);
  ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, nearest square ${sq.root * sq.root} = ${sq.root}²` });
  // The nearest square itself, as a shape the plane draws beside the triangle (marks only: no term changes).
  const sqRef = ref("tri", "square", { s: sq.root });
  ctx.read(sqRef);
  ctx.mark({ kind: "candidate", ref: sqRef, term: "square" });
});

// ---------------------------------------------------------------- 3. Treasure

type KT = { k: number; T: number };
/**
 * T = ±11 and ±13 are dealt, so parameter drift (the coordinator's trial call 18) has peers to redraw within reach:
 * at ±37 a starter needed longer than the 120 s interval to cross the 74 units between a target and its mirror and
 * parked midway (agents' pool-dynamics, #739). An exact main is worth 7.6–7.7 bits at ±11 and 7.9–8.0 at ±13, within
 * v1's 0.5 bits (±17 is 8.2–8.3, so it is not dealt). A target and its mirror are exact peers: the reflection y → −y keeps the law (its codes are even in a and c) and sends y(k) to −y(k), and
 * on the mirror every tie-breaker reads the reflected numbers (minus primes, a gradient near minus a prime, a y-intercept
 * near minus a square); lib/v2-linear test beginner.test.ts holds score(−T, reflected) = score(T, line).
 */
const TREASURES: KT[] = [11, 13].flatMap(T => [{ k: 2, T }, { k: 2, T: -T }]);
/** x, or −x on the mirror (T below zero). */
const flipT = (p: KT, x: Q): Q => (p.T < 0 ? Qn.neg(x) : x);
const treasureShape: Shape<KT> = {
  main: { ...distance<KT>("treasure", "y(k) close to T", "", "table"),
    sentence: p => `When x is ${p.k}, y should be as close as possible to ${p.T}.` },
  tieBreakers: [
    { ...more<KT>("prime-terms", "different primes among y(1) … y(8)", "", "table"),
      sentence: p => (p.T < 0 ? "As many as possible of y(1) … y(8) should be minus different primes." : "As many as possible of y(1) … y(8) should be different primes.") },
    { ...distance<KT>("prime-gradient", "the gradient close to a prime", "", "si"),
      sentence: p => `The gradient should be as close as possible to ${p.T < 0 ? "minus " : ""}a prime.` },
    { ...distance<KT>("square-start", "the y-intercept close to a square", "", "si"),
      sentence: p => `The y-intercept should be as close as possible to ${p.T < 0 ? "minus " : ""}a square number.` },
    ...factorTies<KT>("m", "the gradient"),
  ],
};
export const treasure = family<KT>("treasure", "Treasure", ["table", "si", "cart", "gen"], treasureShape, TREASURES, (ctx, p) => {
  // A vertical line x = k passes the height T somewhere: how far across from the treasure (k, T) it does.
  const vx = verticalAt(ctx);
  if (vx) return verticalMain(ctx, treasureShape, `a vertical line: how far across from (${p.k}, ${p.T}) it passes`, gap(vx.x, q(p.k)), vx.from);
  const at = ref("table", "y", { x: p.k });
  const v = ctx.read(at);
  const y = num(v);
  if (y === null) return allUndefined(ctx, treasureShape, v, at);
  const m = num(ctx.read(ref("si", "m")))!, c = num(ctx.read(ref("si", "c")))!;
  const primes = new Set<bigint>();
  const cols: ElementRef[] = [];
  for (let x = 1; x <= 8; x++) {
    const r = ref("table", "y", { x });
    const t = flipT(p, num(ctx.read(r))!);
    cols.push(r);
    if (t.d === 1n && isPrime(t.n) && !primes.has(t.n)) { primes.add(t.n); ctx.mark({ kind: "focus", ref: r }); }
  }
  ctx.term("treasure", `distance from y(${p.k}) to ${p.T}`, gap(y, q(p.T)), [at]);
  ctx.term("prime-terms", "different primes among y(1) … y(8)", q(primes.size), cols);
  ctx.term("prime-gradient", `distance from the gradient to ${p.T < 0 ? "minus " : ""}a prime`, distanceToPrime(flipT(p, m)), [ref("si", "m")]);
  ctx.term("square-start", `distance from the y-intercept to ${p.T < 0 ? "minus " : ""}a square`, squareGap(flipT(p, c)).d, [ref("si", "c")]);
  ctx.term("m-spf", factorLabel("smallest", "the gradient", m), spfQ(m), [ref("si", "m")]);
  ctx.term("m-gpf", factorLabel("largest", "the gradient", m), gpfQ(m), [ref("si", "m")]);
  ctx.mark({ kind: "focus", ref: at });
  // The target T on the y-axis, so the plane can draw where y(k) should land (marks only).
  const tm = ref("cart", "yAxisMark", { y: p.T });
  ctx.read(tm);
  ctx.mark({ kind: "candidate", ref: tm, term: "treasure" });
});

// ---------------------------------------------------------------- 6. Prime Landing (the owner's example 1, regraded)

/**
 * Prime Landing as a ladder (design-principles.md, owner decisions 26, 29, 30; the owner, 15 Nov: "long ladders that are
 * hard to climb ... secondary rules that are entangled with the primary rule so that ... moving to a higher primary
 * energy requires starting over to climb higher on the secondary dimension").
 *
 * Main part, unbounded: where the line lands on the x-axis, X = −c/m, should round to a prime ending in k, the bigger
 * the better (u = p); any other line scores below every rung, graded by how far it is from rounding to one. Spec
 * lead's trial (15 Nov, declared to the coordinator): it read the y-intercept until the play measurements of row 2
 * (design-principles.md) showed the ladder was not climbed, because the next prime was a shift of c by 10 or more and
 * every rule reading c lost its bits. On the x-axis the next rung is a small tilt, Δm = c/p − c/p′, that leaves
 * c alone (and a shift keeps working too: c = −pm). A vertical line lands at x = k, a flat one never lands.
 * Tie-breaker, read from that prime p: the factor p − 1 shares with the y-intercept's whole part (the best intercept
 * depends on p, so a new rung restarts the climb). Dealt: k = 1 and 9, each on both sides (the mirror lands on minus
 * such a prime: the reflection x → −x keeps the law, so mirrors are exact peers). Endings 3 and 7 are not dealt: at equal
 * size their rungs are 1.4 and 0.5 bits cheaper under the law than 1 and 9 (fitted bits ≈ α + log2 p, 15 Nov).
 */
const LANDING_ENDS: Ends[] = [1, 9].flatMap(ends => [{ ends }, { ends, side: -1 as const }]);
const landingShape: Shape<Ends> = {
  main: withEnds(more<Ends>("landing", "where the line lands on the x-axis, on as big a dealt prime as possible", "", "crossing"),
    p => `Where the line crosses the x-axis should round to ${minus(p)}a prime ending in ${p.ends}, the bigger the better; any other line scores below them all, the closer to one the better.`),
  tieBreakers: [
    more<Ends>("shared-factor", "the factor that prime minus 1 shares with the y-intercept's whole part",
      "Take the number just before that prime. The biggest number that divides both it and the y-intercept's whole part should be as big as possible (a whole part of 0 shares nothing).", "si"),
  ],
};
/**
 * The ladder's value: the prime p ending in k that x rounds to (|x − p| ≤ ½, ties up), else minus how far x is from
 * rounding to the nearest one (|x − p| − ½). A rung is a window, not a point: under C3 an exact prime p costs the code
 * about p/2 bits, so exact rungs gave a ladder whose next rung cost about 5 bits of φ for under a bit of value
 * (80 games: 2 rungs climbed); a window costs about log p.
 */
const rung = (x: Q, k: number): { p: bigint; u: Q } => {
  const n = nearestInteger(x);
  if (n > 0n && isPrimeEnding(n, k)) return { p: n, u: q(n) };
  const p = nearestPrimeEnding(x, k);
  return { p, u: Qn.neg(Qn.sub(Qn.abs(Qn.sub(x, q(p))), q(1, 2))) };
};
export const primeLanding = family<Ends>("prime-landing", "Prime Landing", ["crossing", "si", "cart"], landingShape, LANDING_ENDS, (ctx, pr) => {
  const xRef = ref("crossing", "x0"), cRef = ref("si", "c");
  const xv = ctx.read(xRef);
  const x = num(xv);
  if (x === null) return allUndefined(ctx, landingShape, xv, xRef);   // a flat line never lands (or lies along the axis)
  const { p, u } = rung(sided(pr, x), pr.ends);   // on the mirror, −x climbs the ladder
  const mark = ref("cart", "xAxisMark", { x: sided(pr, q(p)) });
  ctx.read(mark);
  ctx.term("landing", Qn.sign(u) > 0 ? `lands at ${Qn.toWire(x)}, which rounds to ${minus(pr)}the prime ${p}` : `lands ${Qn.toWire(Qn.abs(Qn.sub(sided(pr, x), q(p))))} from ${minus(pr)}the prime ${p}`, u, [xRef]);
  // A vertical line has no y-intercept: its tie-breaker is undefined (it ranks last), not its landing.
  const cv = ctx.read(cRef), c = num(cv);
  const w = c === null ? 0n : Qn.floor(c), aw = w < 0n ? -w : w;
  ctx.term("shared-factor", c === null ? "the y-intercept's whole part" : `the factor ${p - 1n} shares with the y-intercept's whole part ${w}`,
    c === null ? undef(cv) : q(aw === 0n ? 0n : gcd(p - 1n, aw)), [xRef, cRef]);
  ctx.mark({ kind: "focus", ref: xRef });
  ctx.mark({ kind: "candidate", ref: mark, term: "landing" });
});

// ---------------------------------------------------------------- 7. Same on Both Rulers

type T = { T: number };
/**
 * T and −T are dealt, so parameter drift (the coordinator's trial call 18) has a peer to redraw. They are exact peers:
 * the reflection through the origin, (m, c) → (m, −c), keeps the law (its codes are even in c), sends the unchanged
 * number to minus itself, and leaves every tie-breaker's reading as it was (|c|, the gradient, the lamp, how many
 * different whole values); lib/v2-linear test beginner.test.ts holds score(−T, reflected) = score(T, line).
 */
const RULERS_T: T[] = [{ T: 6 }, { T: -6 }];
const rulersShape: Shape<T> = {
  main: { ...distance<T>("fixed", "the unchanged number close to T", "", "mach"),
    sentence: p => `The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to ${p.T}.` },
  tieBreakers: [
    more("steep", "the gradient far from 1", "The gradient should be as far from 1 as possible.", "si"),
    distance("prime-start", "|c| close to a prime", "The y-intercept should be as close as possible to a prime (ignoring sign).", "si"),
    more("whole-values", "different whole numbers among y(−5) … y(5)", "As many of y(−5) … y(5) as possible should be different whole numbers.", "table"),
    distance("whole-lamp", "the lamp's height close to whole", "The lamp's height m/(m − 1) should be as close as possible to a whole number.", "mach"),
    ...factorTies<T>("m", "the gradient"),
  ],
};
export const sameOnBothRulers = family<T>("same-on-both-rulers", "Same on Both Rulers", ["mach", "si", "table", "gen"], rulersShape, RULERS_T, (ctx, p) => {
  // A vertical line x = k meets y = x at (k, k): k is the number it leaves unchanged.
  const vx = verticalAt(ctx);
  if (vx) return verticalMain(ctx, rulersShape, `a vertical line meets y = x at ${Qn.toWire(vx.x)}: distance to ${p.T}`, gap(vx.x, q(p.T)), vx.from);
  const fRef = ref("mach", "fixed");
  const fv = ctx.read(fRef);
  const f = num(fv);
  if (f === null) return allUndefined(ctx, rulersShape, fv, fRef);
  const mRef = ref("si", "m");
  const m = num(ctx.read(mRef))!, c = num(ctx.read(ref("si", "c")))!;
  const lamp = ref("mach", "lamp");
  const lv = num(ctx.read(lamp))!;
  const wholes = new Set<bigint>();
  const cols: ElementRef[] = [];
  for (let x = -5; x <= 5; x++) {
    const r = ref("table", "y", { x });
    const t = num(ctx.read(r))!;
    cols.push(r);
    if (t.d === 1n) wholes.add(t.n);
  }
  ctx.term("fixed", `distance from the unchanged number to ${p.T}`, gap(f, q(p.T)), [fRef]);
  ctx.term("prime-start", "distance from |c| to a prime", distanceToPrime(Qn.abs(c)), [ref("si", "c")]);
  ctx.term("whole-values", "different whole values among y(−5) … y(5)", q(wholes.size), cols);
  ctx.term("whole-lamp", "distance from the lamp's height to whole", distanceToWhole(lv), [lamp]);
  ctx.term("m-spf", factorLabel("smallest", "the gradient", m), spfQ(m), [mRef]);
  ctx.term("m-gpf", factorLabel("largest", "the gradient", m), gpfQ(m), [mRef]);
  ctx.term("steep", "|m − 1|", gap(m, Qn.ONE), [mRef]);
  ctx.mark({ kind: "focus", ref: fRef });
});

// ---------------------------------------------------------------- 8. Whole Crossing (the curator's §10.5)

/**
 * The dealt residue (owner decision 41): the crossing should be close to a whole number that leaves r when divided by
 * q. q = 5 and r = 1, 2, 3, 4 are dealt, so parameter drift has peers a few units apart. r and q − r are exact peers
 * (the reflection x → −x keeps the law, sends the crossing to minus itself and r to q − r, and leaves every tie-breaker
 * as it was); r = 1 and 2 are measured peers (docs/engine-v2/owner-decisions.md, call 18).
 */
type QR = { q: number; r: number };   // nearestResidue (numbers.ts) finds the target
const CROSSINGS: QR[] = [1, 2, 3, 4].map(r => ({ q: 5, r }));
const leaves = (p: QR) => `a whole number that leaves ${p.r} when divided by ${p.q}`;
const crossingShape: Shape<QR> = {
  main: { ...distance<QR>("crossing", "the x-axis crossing close to the dealt whole numbers", "", "crossing"),
    sentence: p => `The line should cross the x-axis as close as possible to ${leaves(p)}.` },
  tieBreakers: [
    prime(more("k-spf", "that whole number's smallest prime factor", "That whole number's smallest prime factor should be as big as possible.", "crossing")),
    prime(more("k-gpf", "that whole number's largest prime factor", "That whole number's largest prime factor should be as big as possible.", "crossing")),
    factorTies<object>("m", "the gradient")[0]!,
    // §A2 (line-rules-v3-proposals.md): the anchor tied to another aspect of the line. Whole Crossing is in the beginner
    // pool, so these two are undealt until they pass the collapse check (§A5).
    undealt(more("gcd-c", "common factor of that whole number and the y-intercept's nearest whole number",
      "That whole number and the whole number nearest the y-intercept should have as big a common factor as possible.", "crossing")),
    undealt(more("gcd-num-m", "common factor of that whole number and the gradient's top",
      "That whole number and the gradient's top number (in lowest terms) should have as big a common factor as possible.", "crossing")),
  ],
};
export const wholeCrossing = family<QR>("whole-crossing", "Whole Crossing", ["crossing", "si", "cart"], crossingShape, CROSSINGS, (ctx, p) => {
  const xRef = ref("crossing", "x0"), mRef = ref("si", "m");
  const xv = ctx.read(xRef);
  const x = num(xv);
  if (x === null) return allUndefined(ctx, crossingShape, xv, xRef);   // a flat line never crosses (or lies along the axis)
  const k = q(nearestResidue(x, p));   // the dealt whole number nearest the crossing
  const kRef = ref("crossing", "dealt", { q: q(p.q), r: q(p.r) });
  ctx.read(kRef);
  ctx.term("crossing", `distance from the crossing ${Qn.toWire(x)} to ${Qn.toWire(k)}`, gap(x, k), [xRef, kRef]);
  ctx.term("k-spf", factorLabel("smallest", "that whole number", k), spfQ(k), [kRef]);
  ctx.term("k-gpf", factorLabel("largest", "that whole number", k), gpfQ(k), [kRef]);
  // A vertical line crosses at x0 but has no gradient: its m-spf is undefined (it ranks last), not its crossing.
  const mv = ctx.read(mRef), m = num(mv);
  ctx.term("m-spf", m === null ? "the gradient's smallest prime factor" : factorLabel("smallest", "the gradient", m), m === null ? undef(mv) : spfQ(m), [mRef]);
  // A vertical line has no y-intercept or gradient either: both undefined. With a 0 on either side, undefined (gcdTerm).
  const cRef = ref("si", "c"), cv = ctx.read(cRef), c = num(cv);
  const gc = c === null ? null : gcdTerm(k.n, nearestInteger(c), `common factor of ${k.n} and ${nearestInteger(c)} (nearest the y-intercept)`);
  ctx.term("gcd-c", gc ? gc.label : "the y-intercept's nearest whole number", gc ? gc.value : undef(cv), [kRef, cRef]);
  const gm = m === null ? null : gcdTerm(k.n, m.n, `common factor of ${k.n} and the gradient's top ${m.n}`);
  ctx.term("gcd-num-m", gm ? gm.label : "the gradient's top", gm ? gm.value : undef(mv), [kRef, mRef]);
  ctx.mark({ kind: "focus", ref: xRef });
  ctx.mark({ kind: "candidate", ref: kRef, term: "crossing" });   // the target on the x-axis, for the plane to draw
});

// ---------------------------------------------------------------- 9. Divisibility Ladder (the curator's §10.5; D §11)

const ladderShape: Shape<object> = {
  main: more("ladder", "a run of y-values each divisible by its position: y(1) by 1, y(2) by 2, …", "y(1) should be a multiple of 1, y(2) a multiple of 2, y(3) of 3, and so on (the line not through (0, 0)): the run should be as long as possible.", "table"),
  tieBreakers: [
    ...factorTies<object>("m", "the gradient"),
    more("steep", "how steep the line is", "The gradient should be as steep as possible.", "si"),
    distance("m-prime", "the gradient close to a prime", "The gradient should be as close as possible to a prime.", "si"),
  ],
};
export const divisibilityLadder = family("divisibility-ladder", "Divisibility Ladder", ["table", "si"], ladderShape, [{}], ctx => {
  const mRef = ref("si", "m"), cRef = ref("si", "c");
  const cv = ctx.read(cRef), c = num(cv);
  if (c === null) return allUndefined(ctx, ladderShape, cv, cRef);   // a vertical line has no y(n)
  if (Qn.isZero(c)) return allUndefined(ctx, ladderShape, { kind: "undefined", reason: "the line goes through (0, 0), where every n divides y(n): the rule wants a line that does not" }, cRef);
  const m = num(ctx.read(mRef))!;
  let run = 0;
  const cols: ElementRef[] = [];
  for (let n = 1; n <= 12; n++) {
    const r = ref("table", "q", { x: n }); // y(n) ÷ n
    const yn = num(ctx.read(r))!;
    if (yn.d !== 1n) { ctx.mark({ kind: "note", ref: r, text: `${n} does not divide y(${n}): the run stops here` }); break; }
    run++;
    cols.push(r);
    ctx.mark({ kind: "focus", ref: r });
  }
  ctx.term("ladder", "the run of n dividing y(n)", q(run), cols.length ? cols : [cRef]);
  ctx.term("m-spf", factorLabel("smallest", "the gradient", m), spfQ(m), [mRef]);
  ctx.term("m-gpf", factorLabel("largest", "the gradient", m), gpfQ(m), [mRef]);
  ctx.term("steep", "|m|", Qn.abs(m), [mRef]);
  ctx.term("m-prime", "distance from the gradient to a prime", distanceToPrime(m), [mRef]);
});

// ---------------------------------------------------------------- Ruler, Exact Change, Pythagorean Area (restored, decision 22)
// Deleted on 14 November because no exact sum valued them; owner decision 22 keeps rules whose values are sampled.

/** Not dealt on whole-number lines, where it cannot decide anything (Ruler's distance is never whole there; b is always 1). */
const notOnWhole = <P,>(l: L<P>): L<P> => ({ ...l, dealtOn: v => lineParams(v).domain !== "Z" });

const rulerShape: Shape<object> = {
  main: distance("ruler", "distance² from (0, 0) close to a square", "The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number.", "norm"),
  tieBreakers: [
    notOnWhole(more("far", "that whole distance", "That distance should be as big as possible.", "norm")),
    distance("prime-gradient", "the gradient close to a prime", "The gradient should be as close as possible to a prime.", "si"),
    distance("square-area", "the triangle's area close to a square", "The triangle cut off the axes should have an area as close as possible to a square number.", "tri"),
  ],
};
export const ruler = family("ruler", "Ruler", ["norm", "si", "tri", "gen"], rulerShape, [{}], ctx => {
  const mRef = ref("si", "m"), d2Ref = ref("norm", "dist2"), area = ref("tri", "area");
  // A vertical line x = k is |k| from (0, 0): its distance² reads honestly; the gradient and the triangle do not exist.
  const vx = verticalAt(ctx);
  if (vx) {
    const d2 = num(ctx.read(d2Ref))!;
    let kv = nearestSquareRoot(d2);
    if (kv === 0n) kv = 1n;
    ctx.term("ruler", `distance from distance² to ${kv * kv}`, gap(d2, q(kv * kv)), [d2Ref]);
    ctx.term("far", "the whole distance nearest", q(kv), [d2Ref]);
    for (const id of ["prime-gradient", "square-area"]) ctx.term(id, id, { undefined: VERTICAL_NO }, vx.from);
    ctx.mark({ kind: "note", ref: d2Ref, text: `a vertical line: distance² ${Qn.toWire(d2)}, nearest square ${kv * kv}` });
    return;
  }
  const mv = ctx.read(mRef);
  const m = num(mv);
  if (m === null || Qn.isZero(m)) return allUndefined(ctx, rulerShape, m === null ? mv : { kind: "undefined", reason: "a flat line's distance is its height: the rule wants a sloping line" }, mRef);
  const d2 = num(ctx.read(d2Ref))!;
  ctx.read(ref("norm", "foot"));
  // The nearest square k² with k ≥ 1.
  let k = nearestSquareRoot(d2);
  if (k === 0n) k = 1n;
  const av = ctx.read(area);
  ctx.term("ruler", `distance from distance² to ${k * k}`, gap(d2, q(k * k)), [d2Ref]);
  ctx.term("far", "the whole distance nearest", q(k), [d2Ref]);
  ctx.term("prime-gradient", "distance from the gradient to a prime", distanceToPrime(m), [mRef]);
  ctx.term("square-area", "distance from the area to a square", num(av) === null ? undef(av) : squareGap(num(av)!).d, [area]);
  ctx.mark({ kind: "focus", ref: ref("norm", "foot") });
  ctx.mark({ kind: "note", ref: d2Ref, text: `distance² ${Qn.toWire(d2)}, nearest square ${k * k}` });
});

type W = { ways: number };
const changeShape: Shape<W> = {
  main: { ...distance<W>("change", "ways to pay close to the target", "", "coins"),
    sentence: p => `Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to ${p.ways}.` },
  tieBreakers: [
    notOnWhole(more("big-piles", "the smaller pile in every way", "In every way to pay, the smaller pile should be as big as possible.", "coins")),
    more("big-bill", "the bill", "The bill N should be as big as possible.", "gen"),
    distance("prime-coins", "both coins close to primes", "Both coin values should be as close as possible to primes (distances added).", "gen"),
  ],
};
export const exactChange = family<W>("exact-change", "Exact Change", ["coins", "gen"], changeShape, [{ ways: 6 }], (ctx, p) => {
  const ways = ref("coins", "ways"), bill = ref("coins", "bill"), pile = ref("coins", "smallestPile");
  const wv = ctx.read(ways);
  const w = num(wv);
  if (w === null) return allUndefined(ctx, changeShape, wv, ways);
  const N = num(ctx.read(bill))!, pv = ctx.read(pile);
  const a = num(ctx.read(ref("gen", "a")))!, b = num(ctx.read(ref("gen", "b")))!;
  ctx.term("change", `distance from the ways to pay to ${p.ways}`, gap(w, q(p.ways)), [ways]);
  ctx.term("big-piles", "the smaller pile, at its smallest", num(pv) ?? undef(pv), [pile]);
  ctx.term("big-bill", "the bill", N, [bill]);
  ctx.term("prime-coins", "distance of the coins from primes", Qn.add(distanceToPrime(a), distanceToPrime(b)), [ref("gen", "a"), ref("gen", "b")]);
  ctx.mark({ kind: "focus", ref: ways });
  ctx.mark({ kind: "note", ref: bill, text: `pay ${Qn.toWire(N)} with coins of ${Qn.toWire(a)} and ${Qn.toWire(b)}: ${Qn.toWire(w)} ways` });
});

type A = { A: number };
const pythShape: Shape<A> = {
  main: { ...distance<A>("area", "the area close to A", "", "tri"),
    sentence: p => `The triangle the line cuts off the axes should have an area as close as possible to ${p.A}.` },
  tieBreakers: [
    distance("slanted-square", "the slanted side squared close to a square", "The slanted side, squared, should be as close as possible to a square number.", "tri"),
    distance("prime-height", "|c| close to a prime", "The y-intercept should be as close as possible to a prime (ignoring sign).", "si"),
    distance("whole-legs", "both legs close to whole numbers", "Both legs should be as close as possible to whole numbers (distances added).", "tri"),
  ],
};
export const pythagoreanArea = family<A>("pythagorean-area", "Pythagorean Area", ["tri", "si"], pythShape, [{ A: 6 }], (ctx, p) => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, pythShape, av, area);
  const hyp = ref("tri", "hyp2"), lx = ref("tri", "legX"), ly = ref("tri", "legY"), cRef = ref("si", "c");
  const h = num(ctx.read(hyp))!, x = num(ctx.read(lx))!, y = num(ctx.read(ly))!, c = num(ctx.read(cRef))!;
  ctx.term("area", `distance from the area to ${p.A}`, gap(a, q(p.A)), [area]);
  ctx.term("slanted-square", "distance from side² to a square", squareGap(h).d, [hyp]);
  ctx.term("prime-height", "distance from |c| to a prime", distanceToPrime(Qn.abs(c)), [cRef]);
  ctx.term("whole-legs", "distance of the legs from whole numbers", Qn.add(distanceToWhole(x), distanceToWhole(y)), [lx, ly]);
  ctx.mark({ kind: "focus", ref: lx });
  ctx.mark({ kind: "focus", ref: ly });
});

/** The beginner families of this file; the dealt pool (presets.ts) adds Prime Gradient from families.ts. */
export const beginnerFamilies = [primeStaircase, squareArea, wholeCrossing, divisibilityLadder, treasure, primeLanding, sameOnBothRulers, ruler, exactChange, pythagoreanArea] as const;
