/**
 * The beginner families (docs/engine-v2/layered-line-rules.md §10.5, the curator's exact-only pool; Prime Gradient is
 * in families.ts): each a main layer a 12-year-old on a standard linear-equations course can read, and the curator's
 * dealable tie-breakers, every one valued by an exact sum (sums.ts). Every layer is graded (owner decision 13). A dealt
 * rule is the main layer plus one tie-breaker (decision 14 and its clarification).
 */
import { gcd, Qn, q, ref, type ElementRef, type Q } from "@workspace/v2-core";
import { lineParams } from "./line.ts";
import { allUndefined, distance, factorLabel, family, gap, more, notOnWhole, num, prime, undef, undealt, type Ctx, type L, type Shape, ladder } from "./layers.ts";
import { pythagoreanArea, ruler, squareArea } from "./beginner-areas.ts";
import { crossingWitness, divisibilityWitness, landingWitness, staircaseWitness } from "./witnesses.ts";
import { sameOnBothRulers, treasure } from "./beginner-rulers.ts";

export { factorLabel } from "./layers.ts";
export { pythagoreanArea, ruler, squareArea } from "./beginner-areas.ts";
export { sameOnBothRulers, treasure, rulersWitness, treasureWitness } from "./beginner-rulers.ts";
import { gcdTerm } from "./rational.ts";
import { digitLevel, digitNote, stepNote, triangularLevel, ladderLevel, nearestOnLadder, nearestResidue, distanceToPrime, distanceToPrimeEnding, isPrimeEnding, nearestPrimeEnding, PRIME_ENDINGS, largestPrimeFactor, nearbyPrimes, nearestInteger, nearestSquareRoot, primeFactorCount, smallestPrimeFactor } from "./numbers.ts";

/** The smallest and largest prime factor of a whole number (|n|); 1 for 0, ±1 and fractions. */
const spfQ = (x: Q): Q => q(x.d === 1n ? smallestPrimeFactor(x.n) : 1n);
const gpfQ = (x: Q): Q => q(x.d === 1n ? largestPrimeFactor(x.n) : 1n);
/** Tie-breakers on the prime factors of a coefficient (the curator's §10.5: graded, an exact Euler-type sum). */
const factorTies = <P,>(of: "m" | "c", what: string): L<P>[] => [
  prime(more(`${of}-spf`, `${what}'s smallest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s smallest prime factor should be as big as possible.`, "si")),
  prime(more(`${of}-gpf`, `${what}'s largest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s largest prime factor should be as big as possible.`, "si")),
];


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
    p => `The values y(0), y(1), y(2), … should begin with as many different primes ending in ${p.ends} as possible. The first one that isn't counts a little if near one.`),
  tieBreakers: [
    more<Ends>("shared-factor", "the factor the run's last prime minus 1 shares with its first prime minus 1",
      "The run's last prime minus 1 and its first prime minus 1 should share as big a factor as possible.", "seq"),
    withEnds(distance<Ends>("step-back", "y(−1) close to such a prime", "", "seq"),
      p => `The term before the start, y(−1), should be as close as possible to ${primeEnding(p)}.`),
  ],
};
export const primeStaircase = ladder(family<Ends>("prime-staircase", "Prime Staircase", ["seq", "si"], staircase, ENDS_STAIRCASE, (ctx, pr) => {
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
}), staircaseWitness);

// ---------------------------------------------------------------- 6. Prime Landing (the owner's example 1, regraded)

/**
 * Prime Landing as a ladder (design-principles.md, owner decisions 26, 29, 30; the owner, 15 Nov: "long ladders that are
 * hard to climb ... secondary rules that are entangled with the primary rule so that ... moving to a higher primary
 * energy requires starting over to climb higher on the secondary dimension").
 *
 * Main part, unbounded: where the line lands on the x-axis, X = −c/m, should round to a prime ending in k, the bigger
 * the better (u = landingLevel(p): levels of digits, each dearer than the last); any other line scores below every rung, graded by how far it is from rounding to one. Spec
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
    p => `Where the line crosses the x-axis should round to ${minus(p)}a prime ending in ${p.ends}. Bigger primes are better, though each extra digit counts for less.`),
  tieBreakers: [
    more<Ends>("shared-factor", "the factor that prime minus 1 shares with the y-intercept's whole part",
      "That prime minus 1 and the y-intercept's whole part should share as big a factor as possible.", "si"),
  ],
};
/** A rung's place on Prime Landing's ladder: levels of digits (numbers.ts digitLevel). */
export const landingLevel = digitLevel;
/**
 * The ladder's value: the prime p ending in k that x rounds to (|x − p| ≤ ½, ties up), else minus how far x is from
 * rounding to the nearest one (|x − p| − ½). A rung is a window, not a point: under C3 an exact prime p costs the code
 * about p/2 bits, so exact rungs gave a ladder whose next rung cost about 5 bits of φ for under a bit of value
 * (80 games: 2 rungs climbed); a window costs about log p.
 */
const rung = (x: Q, k: number): { p: bigint; u: Q } => {
  const n = nearestInteger(x);
  if (n > 0n && isPrimeEnding(n, k)) return { p: n, u: landingLevel(n) };
  const p = nearestPrimeEnding(x, k);
  return { p, u: Qn.neg(Qn.sub(Qn.abs(Qn.sub(x, q(p))), q(1, 2))) };
};
export const primeLanding = ladder(family<Ends>("prime-landing", "Prime Landing", ["crossing", "si", "cart"], landingShape, LANDING_ENDS, (ctx, pr) => {
  const xRef = ref("crossing", "x0"), cRef = ref("si", "c");
  const xv = ctx.read(xRef);
  const x = num(xv);
  if (x === null) return allUndefined(ctx, landingShape, xv, xRef);   // a flat line never lands (or lies along the axis)
  const { p, u } = rung(sided(pr, x), pr.ends);   // on the mirror, −x climbs the ladder
  const mark = ref("cart", "xAxisMark", { x: sided(pr, q(p)) });
  ctx.read(mark);
  ctx.term("landing", Qn.sign(u) > 0 ? `lands at ${Qn.toWire(x)}, which rounds to ${minus(pr)}the prime ${p}: ${digitNote(p)}` : `lands ${Qn.toWire(Qn.abs(Qn.sub(sided(pr, x), q(p))))} from ${minus(pr)}the prime ${p}`, u, [xRef]);
  // A vertical line has no y-intercept: its tie-breaker is undefined (it ranks last), not its landing.
  const cv = ctx.read(cRef), c = num(cv);
  const w = c === null ? 0n : Qn.floor(c), aw = w < 0n ? -w : w;
  ctx.term("shared-factor", c === null ? "the y-intercept's whole part" : `${p - 1n} and the y-intercept's whole part ${w}: the biggest number dividing both is ${aw === 0n ? 0n : gcd(p - 1n, aw)}`,
    c === null ? undef(cv) : q(aw === 0n ? 0n : gcd(p - 1n, aw)), [xRef, cRef]);
  ctx.mark({ kind: "focus", ref: xRef });
  ctx.mark({ kind: "candidate", ref: mark, term: "landing" });
}), landingWitness);

// ---------------------------------------------------------------- 8. Whole Crossing (the curator's §10.5)

/**
 * Whole Crossing as a ladder (design-principles.md; redesigned 15 Nov, declared to the coordinator). The line should
 * cross the x-axis on a whole number q^j × t with t leaving r when divided by q (q = 5): the more 5s it holds (j), the
 * better, a ladder with no top, in triangular levels (u = triangularLevel(j): level ℓ needs ℓ(ℓ + 1)/2 fives, so a zoom
 * chain gains less at each level). Any other crossing scores below every level, graded by its distance to the
 * nearest such number (u = −d): the old rule (close to a whole number leaving r) is the ground floor. A stretch or zoom by
 * 5 takes level j to j + 1 in one priced choice (decision 25's shortcut); a prime is never on a level above 0, so Prime
 * Landing, which wants the crossing on a prime, is its adversary on the same number (the old tie-breakers, the whole
 * number's smallest and largest prime factors, rewarded exactly Prime Landing's rungs: PMI 2.4–3.6, 15 Nov).
 * Tie-breaker, read from the level: the biggest number dividing both |t| + 1 and the gradient's whole part (ignoring
 * signs): a stretch to the next level divides the gradient by 5, so the climb starts again. r and 5 − r are exact peers
 * (the reflection x → −x keeps the law and sends t to −t and the gradient to minus itself).
 */
type QR = { q: number; r: number };
const CROSSINGS: QR[] = [1, 2, 3, 4].map(r => ({ q: 5, r }));
const leaves = (p: QR) => `a whole number that leaves ${p.r} when divided by ${p.q}`;
const crossingShape: Shape<QR> = {
  main: { ...more<QR>("ladder", "the x-axis crossing on a ladder of 5s", "", "crossing"),
    sentence: p => `Cross the x-axis on a whole number leaving ${p.r} once its 5s are divided out (like ${p.r + 5}, ${5 * (p.r + 5)} or ${25 * (p.r + 5)}), with as many 5s as possible. Each extra counts less.` },
  tieBreakers: [
    more("shared-factor", "the biggest number dividing both that number after its 5s, plus 1, and the gradient's whole part",
      "The crossing without its 5s, plus 1, and the gradient's whole part should share as big a factor as possible.", "si"),
  ],
};
export const wholeCrossing = ladder(family<QR>("whole-crossing", "Whole Crossing", ["crossing", "si", "cart"], crossingShape, CROSSINGS, (ctx, p) => {
  const xRef = ref("crossing", "x0"), mRef = ref("si", "m");
  const xv = ctx.read(xRef);
  const x = num(xv);
  if (x === null) return allUndefined(ctx, crossingShape, xv, xRef);   // a flat line never crosses (or lies along the axis)
  const on = ladderLevel(x, p), near = on ? { ...on, at: x.n, d: Qn.ZERO } : nearestOnLadder(x, p);
  const kRef = ref("crossing", "dealt", { q: q(p.q), r: q(p.r) });
  ctx.read(kRef);
  ctx.term("ladder", on ? `crosses at ${x.n} = ${p.q}^${on.j} × ${on.t}: ${stepNote(on.j, "five", "fives")}` : `${Qn.toWire(near.d)} from ${near.at} (level ${near.j})`,
    on ? triangularLevel(on.j) : Qn.neg(near.d), [xRef, kRef]);
  // A vertical line has no gradient: its tie-breaker is undefined (it ranks last), not its crossing.
  const mv = ctx.read(mRef), m = num(mv);
  const t1 = (near.t < 0n ? -near.t : near.t) + 1n, w = m === null ? 0n : Qn.floor(Qn.abs(m));
  ctx.term("shared-factor", m === null ? "the gradient's whole part" : `${t1} and the gradient's whole part ${w}: the biggest number dividing both is ${w === 0n ? 0n : gcd(t1, w)}`,
    m === null ? undef(mv) : q(w === 0n ? 0n : gcd(t1, w)), [xRef, mRef]);
  ctx.mark({ kind: "focus", ref: xRef });
  ctx.mark({ kind: "candidate", ref: kRef, term: "ladder" });   // the target on the x-axis, for the plane to draw
}), crossingWitness);

// ---------------------------------------------------------------- 9. Divisibility Ladder (the curator's §10.5; D §11)

/**
 * Divisibility Ladder as a ladder (design-principles.md rows 1 to 3; redesigned 15 Nov under the coordinator's
 * delegation, declared): the run of n dividing y(n) = m·n + c from n = 1, with no top (for a whole gradient, n divides
 * y(n) exactly when n divides c, so a run of k needs lcm(1, …, k) to divide c), in triangular levels (u =
 * triangularLevel(run): each extra n counts for less, so a stretch chain bends; the old run stopped at 12 and a greedy
 * stretch chain on "steep" reached 77.6 bits). Tie-breaker, tied to the run (decision 29): where the run stops, at n,
 * the factor y(n) shares with n (0 when y(n) is not whole): how near the next rung is, never more than n, so no stretch
 * inflates it (a first try, gcd(c / lcm(1, …, run) + 1, the gradient's whole part), grew with every stretch, which
 * multiplies both: 75 bits in 8 greedy stretches). The tie-breakers m-spf, m-gpf, steep and m-prime (wishes about the
 * gradient alone) leave it.
 */
const ladderShape: Shape<object> = {
  main: more("ladder", "a run of y-values each divisible by its position: y(1) by 1, y(2) by 2, …", "y(1), y(2), y(3), … should be multiples of 1, 2, 3, … for as long as possible, not through (0, 0). Longer is better, though each extra counts less.", "table"),
  tieBreakers: [
    more("next-rung", "the factor y(n) shares with n where the run stops",
      "Where the run stops, at n, y(n) and n should share as big a factor as possible.", "table"),
  ],
};
export const divisibilityLadder = ladder(family("divisibility-ladder", "Divisibility Ladder", ["table", "si"], ladderShape, [{}], ctx => {
  const mRef = ref("si", "m"), cRef = ref("si", "c");
  const cv = ctx.read(cRef), c = num(cv);
  if (c === null) return allUndefined(ctx, ladderShape, cv, cRef);   // a vertical line has no y(n)
  if (Qn.isZero(c)) return allUndefined(ctx, ladderShape, { kind: "undefined", reason: "the line goes through (0, 0), where every n divides y(n): the rule wants a line that does not" }, cRef);
  const m = num(ctx.read(mRef))!;
  let run = 0, stop = q(0), at = 1;
  const cols: ElementRef[] = [];
  // The table shows x = 0 … 12; beyond it the run is read from m and c (n divides y(n) = m·n + c). It ends by |c| at
  // the latest for a whole gradient, and at the first n where y(n) is not whole otherwise.
  for (let n = 1; ; n++) {
    const yn = n <= 12 ? num(ctx.read(ref("table", "q", { x: n })))! : Qn.div(Qn.add(Qn.mul(m, q(n)), c), q(n));
    if (yn.d !== 1n) { at = n; stop = Qn.add(Qn.mul(m, q(n)), c); if (n <= 12) ctx.mark({ kind: "note", ref: ref("table", "q", { x: n }), text: `${n} does not divide y(${n}): the run stops here` }); break; }
    run++;
    if (n <= 12) { const r = ref("table", "q", { x: n }); cols.push(r); ctx.mark({ kind: "focus", ref: r }); }
  }
  ctx.term("ladder", `the run of n dividing y(n): ${stepNote(run, "number", "numbers")}`, triangularLevel(run), cols.length ? cols : [cRef]);
  const share = stop.d === 1n ? gcd(stop.n < 0n ? -stop.n : stop.n, BigInt(at)) : 0n;
  ctx.term("next-rung", stop.d === 1n ? `the run stops at ${at}: y(${at}) = ${stop.n}, and the biggest number dividing both is ${share}` : `the run stops at ${at}: y(${at}) = ${Qn.toWire(stop)} is not whole`, q(share), at <= 12 ? [ref("table", "q", { x: at })] : [mRef, cRef]);
}), divisibilityWitness);

// ---------------------------------------------------------------- Exact Change (restored, decision 22)

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

/** The beginner families of this file; the dealt pool (presets.ts) adds Prime Gradient from families.ts. */
export const beginnerFamilies = [primeStaircase, squareArea, wholeCrossing, divisibilityLadder, treasure, primeLanding, sameOnBothRulers, ruler, exactChange, pythagoreanArea] as const;
