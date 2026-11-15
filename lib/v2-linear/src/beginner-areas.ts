/**
 * Ruler, Square Area and Pythagorean Area: the beginner families that read the line's distances and areas (moved out of
 * beginner.ts unchanged, 15 Nov, so their redesign against design-principles.md does not collide with the others').
 */
import { gcd, Qn, q, ref, type Q } from "@workspace/v2-core";
import { fromMC, LINE_Q_CODES, normalise, type LineState } from "./line.ts";
import { allUndefined, distance, factorLabel, family, gap, ladder, more, num, prime, squareGap, undealt, verticalAt, VERTICAL_NO, type Shape } from "./layers.ts";
import { digitLevel, digitNote, distanceToPrime, isPrime, isPrimeEnding, isSameLengthEnding, largestPrimeFactor, nearestInteger, nearestPrimeEnding, nearestSameLengthEnding, nearestSquareRoot, PRIME_ENDINGS, primeFactorCount, sameLengthPrimes, SEMIPRIME_EXACT_DIGITS, smallestFactor, smallestPrimeFactor } from "./numbers.ts";

// ---------------------------------------------------------------- Square Area (the owner's example 2)

const squareShape: Shape<object> = {
  main: distance("square", "area close to a square number", "The triangle the line cuts off the axes should have an area as close as possible to a square number.", "tri"),
  tieBreakers: [
    prime(more("spf", "that square's root's smallest prime factor", "The smallest prime factor of that square's root should be as big as possible.", "tri")),
    prime(more("lpf", "that square's root's largest prime factor", "The largest prime factor of that square's root should be as big as possible.", "tri")),
    // Undealt (the coordinator's no-straight-hill check, 15 Nov): a stretch by 2, 3 or 5 adds a prime factor to the root
    // at every size, the same bits per fee all the way (artifacts/engine test v2-no-straight-hill). For the grids session.
    undealt(more("omega", "prime factors of that square's root", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three).", "tri")),
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

// ---------------------------------------------------------------- Ruler (restored, decision 22; a ladder since 15 Nov; two primes since 16 Nov)

/**
 * Ruler as a ladder of two-prime products (design-principles.md; the coordinator's declared trial of 16 Nov, replacing
 * "distance² rounded down is a prime ending in k"). Main part, unbounded: the distance from (0, 0) to the line, squared
 * (c²/(a² + b²), so a vertical or level line reads honestly too), rounded down, should be N = p·q, two different primes
 * p < q with the same number of digits (143 = 11 × 13), ending in k, the bigger the better, in levels of digits
 * (u = digitLevel(N)); any other line scores below every rung, minus how far its distance² is from the nearest window
 * [N, N + 1). A rung is a window, as before: the next one is a small shift or tilt away.
 * Why the change (the spec lead): the prime form was aligned with Pythagorean Area (on a 45° line distance² and the
 * triangle's area are both c²/2) and shared the pool's commonest goal (a reading rounding to a prime ending in k). Now a
 * Ruler rung is never a prime, so on a 45° line the two exclude each other; and with whole c, ⌊c²/2⌋ is (c − 1)(c + 1)/2,
 * a multiple of 4, or 2·(c/2)², never such a product.
 * Different primes (p < q, not p ≤ q): with p = q allowed, endings 1 and 9 alone would have the primes' squares (every
 * level line y = P at a prime height is one), and the closeness tie-breaker's target q/p = 1 would be hit exactly at
 * gradient ±1, a top.
 * Tie-breakers, each read from the rung's p and q, so a new rung restarts its climb (row 3), each of a different form
 * (row 3a): closeness (dealt), p·m² as close as possible to q: √(q/p) is irrational for p ≠ q, so it is never hit (no
 * top); measured in p·m², not m² against q/p, so a twin-prime product p(p + 2) on a 45° line scores |p − q| = 2 at
 * every size rather than 2/p, better with every rung for free; near-miss (undealt), Prime Staircase's form tied to p:
 * p, p + w, p + 2w, … with w the y-intercept's whole part, the first that is not prime as nearly prime as possible;
 * reading-at-index (undealt), the line's height at x = p, rounded down, divisible by q as many times as possible. A turn
 * about (0, 0) keeps the distance (the ruler's own shortcut) and moves the gradient and the y-intercept, so each climbs
 * on a rung.
 * Dealt: k = 1, 3, 7, 9 (two primes ending in 1, 3, 7 or 9 multiply to each ending equally often).
 */
const RULER_ENDS: Ends[] = PRIME_ENDINGS.map(ends => ({ ends }));
const RULER_EXAMPLE: Record<number, string> = { 1: "221 = 13 × 17", 3: "143 = 11 × 13", 7: "187 = 11 × 17", 9: "209 = 11 × 19" };
const rulerShape: Shape<Ends> = {
  main: { ...more<Ends>("ruler", "distance² from (0, 0) on as big a product of two same-length primes as possible", "", "norm"),
    // Plain sentences, the main one under 30 words with an example (the coordinator's ask): whose distance, what is done to it.
    sentence: p => `Square the line's closest distance to (0, 0), round down: two different same-length primes multiplied, ending in ${p.ends}, like ${RULER_EXAMPLE[p.ends]}. Bigger is better.` },
  tieBreakers: [
    distance<Ends>("closeness", "the smaller prime times the gradient squared close to the bigger prime",
      "The smaller prime times the gradient squared should be as close as possible to the bigger prime.", "si"),
    undealt(prime(more<Ends>("near-miss", "the first non-prime stepping from the smaller prime by the y-intercept's whole part, as nearly prime as possible",
      "From the smaller prime, keep adding the y-intercept's whole part. The first non-prime should have a big smallest factor.", "si"))),
    undealt(more<Ends>("reading-at-index", "the height at x = the smaller prime, rounded down, divisible by the bigger prime many times",
      "The height at x = the smaller prime, rounded down: as many factors of the bigger prime as possible.", "si")),
  ],
};
/**
 * The ladder's value: on a rung, digitLevel(N) of the product N of two different same-length primes ending in k that
 * d2 rounds down to; else minus how far d2 is from the nearest such window [N, N + 1) (on a tie the lower one), below
 * every rung, with that N's primes for the tie-breakers. Past SEMIPRIME_SEARCH_DIGITS digits a miss is graded by the
 * nearest other number ending in k instead (no search: each candidate there may need thousands of factoring steps, and
 * the law's tilted draws reach such lines often; no climb within a game's income gets near), whose primes are then
 * unknown (null): its tie-breakers are undefined. A rung is still exact up to SEMIPRIME_EXACT_DIGITS digits.
 */
export const SEMIPRIME_SEARCH_DIGITS = 14;
export function semiRung(d2: Q, k: number): { n: bigint; pq: { p: bigint; q: bigint } | null; u: Q } {
  const x = Qn.sub(d2, q(1, 2));
  const n0 = nearestInteger(x);   // ⌊d2⌋
  const at = n0 > 0n && isSameLengthEnding(n0, k) ? sameLengthPrimes(n0) : null;
  if (at) return { n: n0, pq: at, u: digitLevel(n0) };
  const n = n0.toString().length > SEMIPRIME_SEARCH_DIGITS ? nearestOtherEnding(x, k, n0) : nearestSameLengthEnding(x, k);
  return { n, pq: sameLengthPrimes(n), u: Qn.neg(Qn.sub(Qn.abs(Qn.sub(x, q(n))), q(1, 2))) };
}
/** The whole number ending in k nearest x other than n0 (x > 0; on a tie the lower one). */
function nearestOtherEnding(x: Q, k: number, n0: bigint): bigint {
  const K = BigInt(k), f = Qn.floor(x);
  let lo = f - ((((f - K) % 10n) + 10n) % 10n), hi = lo + 10n;
  if (lo === n0) lo -= 10n;
  if (hi === n0) hi += 10n;
  return Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x)) <= 0 ? lo : hi;
}
/**
 * Witnesses for the tail cap (as Pythagorean Area's areaWitness): for n digits, the three cheapest of the first dozen lines
 * a·x + b·y + c = 0 found whose distance², c²/(a² + b²), rounds down to an n-digit product of two different same-length
 * primes ending in k, with c = 2^i·3^j·5^l (cheap under the code), a ≤ 24 and b ≤ 12. Empty for a number of digits no
 * such line reaches, and past SEMIPRIME_EXACT_DIGITS digits (the budgeted factor search finds few there, slowly: the cap
 * stops and the ladder's tail runs on).
 */
const RULER_SMOOTH: bigint[] = (() => {
  const out: bigint[] = [];
  for (let t = 1n; t < 10n ** 13n; t *= 2n) for (let u = t; u < 10n ** 13n; u *= 3n) for (let v = u; v < 10n ** 13n; v *= 5n) out.push(v);
  return out.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
})();
export function rulerWitness(p: Ends, n: number): LineState[] {
  if (n > SEMIPRIME_EXACT_DIGITS) return [];
  const lo = 10n ** BigInt(n - 1), hi = 10n ** BigInt(n), found: { s: LineState; phi: number }[] = [];
  for (let b = 0n; b <= 12n && found.length < 12; b++) for (let a = 0n; a <= 24n && found.length < 12; a++) {
    if (a === 0n && b === 0n) continue;
    const D = a * a + b * b;
    for (const c of RULER_SMOOTH) {
      const d2 = (c * c) / D;
      if (d2 >= hi) break;
      if (d2 < lo || !isSameLengthEnding(d2, p.ends)) continue;
      const l = normalise(a, b, c);
      if ("invalid" in l) continue;
      const s = { lines: [l] };
      found.push({ s, phi: LINE_Q_CODES.a.bits(l.a) + LINE_Q_CODES.b.bits(l.b) + LINE_Q_CODES.c.bits(l.c) });   // its length on line-q
      break;
    }
  }
  return found.sort((x, y) => x.phi - y.phi).slice(0, 3).map(f => f.s);
}
export const ruler = ladder(family<Ends>("ruler", "Ruler", ["norm", "si", "gen"], rulerShape, RULER_ENDS, (ctx, pr) => {
  const d2Ref = ref("norm", "dist2"), mRef = ref("si", "m"), cRef = ref("si", "c");
  const d2 = num(ctx.read(d2Ref))!;
  ctx.read(ref("norm", "foot"));
  const { n, pq, u } = semiRung(d2, pr.ends);
  const says = pq ? `${n} = ${pq.p} × ${pq.q}` : `${n}`;
  ctx.term("ruler", Qn.sign(u) > 0 ? `distance² ${Qn.toWire(d2)}, which rounds down to ${says}: ${digitNote(n)}` : `distance² ${Qn.toWire(d2)}, ${Qn.toWire(Qn.neg(u))} from the window of ${says}`, u, [d2Ref]);
  // A vertical line has no gradient or y-intercept: its tie-breakers are undefined (they rank last), not its distance.
  const vx = verticalAt(ctx);
  if (vx || !pq) {
    const why = vx ? VERTICAL_NO : `${n} is too big to split into its primes`;
    for (const t of rulerShape.tieBreakers) ctx.term(t.id, t.title, { undefined: why }, vx ? vx.from : [d2Ref]);
    ctx.mark({ kind: "focus", ref: ref("norm", "foot") });
    return;
  }
  const { p, q: qq } = pq;
  const m = num(ctx.read(mRef))!, c = num(ctx.read(cRef))!;
  // closeness: |p·m² − q|, never 0 (q/p is no square of a fraction).
  const close = Qn.abs(Qn.sub(Qn.mul(q(p), Qn.mul(m, m)), q(qq)));
  ctx.term("closeness", `${p} × gradient² is ${Qn.toWire(Qn.mul(q(p), Qn.mul(m, m)))}, ${Qn.toWire(close)} from ${qq}`, close, [d2Ref, mRef]);
  // near-miss: p, p + w, p + 2w, … (w the y-intercept's whole part, ignoring its sign); the first that is not prime, its
  // smallest prime factor. w = 0 never leaves p: nothing breaks (0), as a run of 256 primes would.
  const w = Qn.floor(Qn.abs(c));
  let brk: bigint | null = null;
  if (w > 0n) for (let j = 1n; j <= 256n; j++) if (!isPrime(p + j * w)) { brk = p + j * w; break; }
  const bw = brk === null ? 0n : smallestFactor(brk);
  ctx.term("near-miss", brk === null ? (w === 0n ? "a y-intercept under 1 never steps away from the smaller prime" : "no number breaks the run") : `${p} stepping by ${w}: the first non-prime is ${brk}, whose smallest prime factor is ${bw}`, q(bw), [d2Ref, cRef]);
  // reading-at-index: the height at x = p, rounded down, ignoring its sign; how many times q divides it (0 for 0).
  const h = Qn.floor(Qn.abs(Qn.add(Qn.mul(m, q(p)), c)));
  let j = 0;
  for (let v = h; v > 0n && v % qq === 0n; v /= qq) j++;
  ctx.term("reading-at-index", `the height at x = ${p}, rounded down, is ${h}: ${qq} divides it ${j} time${j === 1 ? "" : "s"}`, q(j), [d2Ref, mRef, cRef]);
  ctx.mark({ kind: "focus", ref: ref("norm", "foot") });
}), rulerWitness);

/**
 * Pythagorean Area as a ladder (design-principles.md; the redesign of beginner-line-redesign.md §4.6). Main part,
 * unbounded: the area of the triangle the line cuts off the axes, rounded down, should be a prime ending in k, the bigger
 * the better, in levels of digits (u = digitLevel(p): level ℓ needs ℓ(ℓ + 1)/2 digits; with u = p, thirty stretches by
 * 7 landed a 25-digit prime worth 38 bits, a straight hill); any other line scores below every rung, minus how far its
 * area is from the nearest window [p, p + 1).
 * A rung is a window, as on Prime Landing: the next rung is a small tilt or shift away, and no repeated shortcut keeps the
 * area on a prime. The §4.6 draft (how many times q divides the area) was climbed by a formula: zooming y = −x/2 + 9 by 3
 * forty times paid 48 bits for 469 energy, a bit a zoom with no search and no end. Rounded down, not to the nearest:
 * rounding to the nearest put the plainest triangles on the ladder (y = −x + c: c²/2 = k + ½ rounds up to (c² + 1)/2,
 * which ends in 1, 3 or 5 and never in 7 or 9), so ending 3 paid about a bit and a half less than 7 and 9 at equal area;
 * rounded down, (c² − 1)/2 is even and none of them is a rung.
 * Tie-breaker, read from that prime p: the factor p − 1 shares with the slanted side squared, rounded down (Pythagoras:
 * base² + height²). A new rung changes p − 1, so the side that shared most no longer does, and the climb starts again.
 * Dealt: k = 1, 3, 7, 9. In play (72 games, 18 an ending, no drift, 15 Nov) their mean gains were 287, 338, 284 and 353
 * (balance 1.25; a 6-game mean's standard error is 35–110); the area rounded up instead, as four more instances, gained
 * 270–320 and matched no closer. Ending 9's rungs are rarer at equal area (about a bit and a half), and dearer to reach by as
 * much: the median over rungs of a rung's bits less the code cost of the cheapest line found on it is −10.1 to −10.5
 * bits for all four endings (15 Nov), so the params-equal audit compares them as a ladder by bits less that cost.
 * Square Area is its named adversary on the same number: a square is never a prime, so an area near a square is off
 * this ladder (the tension matrix, 15 Nov: all 12 pairs of their tie-breakers in tension; climbing either lowers the other
 * 50–65% of the time). Prime Landing shares a climb only on lines whose y-intercept is 2 (area = crossing), whose
 * gradient −2/p has a bottom number p: priced out by the code (y = −(2/1009)x + 2 has φ 1020 bits).
 */
type Ends = { ends: number };
const AREA_ENDS: Ends[] = PRIME_ENDINGS.map(ends => ({ ends }));
const pythShape: Shape<Ends> = {
  main: { ...more<Ends>("area", "the triangle's area on as big a dealt prime as possible", "", "tri"),
    // The card stays under 30 words (the coordinator's ask): "the triangle" is the one the line cuts off the axes.
    sentence: p => `Triangle area, rounded down: a prime ending in ${p.ends}. Bigger is better, each extra digit counts for less.` },
  tieBreakers: [
    more<Ends>("shared-factor", "the factor that prime minus 1 shares with the slanted side squared",
      "Prime minus 1 and slanted side² share a big factor.", "tri"),
    // A candidate (the coordinator's row 7, 15 Nov): a digit pattern, not a shared factor. Undealt until measured.
    undealt(more<Ends>("same-ending", "the height ending in that prime's last digits",
      "The height's whole part should end in the same digits as that prime: the more digits, the better.", "tri")),
  ],
};
/**
 * The ladder's value: on a rung, digitLevel(p) of the prime p ending in k that the area rounds down to (each extra digit
 * counting for less, as on Prime Landing); else minus how far the area is from the nearest window [p, p + 1) (on a tie the
 * lower one), below every rung. The windows of x = area − ½ rounded to the nearest (ties up) are exactly these, so the
 * rung reads as Prime Landing's does.
 * Past SEARCH_DIGITS digits a miss is graded by the nearest number ending in k instead of the nearest such prime: the
 * search for a prime among 400-digit numbers took about a second (no-box.test.ts, 15 Nov), and no climb within a game's
 * income gets near (the energy gate's best lines are under 30 digits). A rung is still exact at any size.
 */
const SEARCH_DIGITS = 60;
export function areaRung(area: Q, k: number): { p: bigint; u: Q } {
  const x = Qn.sub(area, q(1, 2));
  const n = nearestInteger(x);
  if (n > 0n && isPrimeEnding(n, k)) return { p: n, u: digitLevel(n) };
  const p = n.toString().length > SEARCH_DIGITS ? nearestEnding(x, k) : nearestPrimeEnding(x, k);
  return { p, u: Qn.neg(Qn.sub(Qn.abs(Qn.sub(x, q(p))), q(1, 2))) };
}
/** The whole number ending in k nearest x (x > 0; on a tie the lower one). */
function nearestEnding(x: Q, k: number): bigint {
  const lo = Qn.floor(Qn.div(Qn.sub(x, q(k)), q(10))) * 10n + BigInt(k), hi = lo + 10n;
  return Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x)) <= 0 ? lo : hi;
}
/**
 * Witnesses for the tail cap (lib/v2-linear witnesses.ts; CLAUDE.md: a value tail never grows faster than the φ of the
 * cheapest state that reaches it): for n digits, up to three lines y = −(a/b)x + c/b whose area c²/(2ab) rounds down to
 * an n-digit prime ending in k, with c = 2^i·3^j (cheap under the code: ½ a bit a unit of its prime factors), a ≤ 30 and
 * b ≤ 8: φ grows by about 2.5 bits a digit. Empty for a number of digits no such line reaches.
 */
const SMOOTH23: bigint[] = (() => {
  const out: bigint[] = [];
  for (let t = 1n; t < 10n ** 48n; t *= 2n) for (let u = t; u < 10n ** 48n; u *= 3n) out.push(u);
  return out.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
})();
export function areaWitness(p: Ends, n: number): LineState[] {
  const lo = 10n ** BigInt(n - 1), hi = 10n ** BigInt(n), K = BigInt(p.ends), out: LineState[] = [];
  for (let a = 1n; a <= 30n && out.length < 3; a++) for (let b = 1n; b <= 8n && out.length < 3; b++) {
    for (const c of SMOOTH23) {
      const area = (c * c) / (2n * a * b);
      if (area >= hi) break;
      if (area < lo || area % 10n !== K || !isPrime(area)) continue;
      out.push({ lines: [fromMC(q(-a, b), q(c, b))] });
      break;
    }
  }
  return out;
}
export const pythagoreanArea = ladder(family<Ends>("pythagorean-area", "Pythagorean Area", ["tri"], pythShape, AREA_ENDS, (ctx, pr) => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, pythShape, av, area);   // no triangle: a level or vertical line, or one through (0, 0)
  const hyp = ref("tri", "hyp2");
  const h = num(ctx.read(hyp))!;
  const { p, u } = areaRung(a, pr.ends);
  ctx.term("area", Qn.sign(u) > 0 ? `area ${Qn.toWire(a)}, which rounds down to the prime ${p}` : `area ${Qn.toWire(a)}, ${Qn.toWire(Qn.neg(u))} from the window of the prime ${p}`, u, [area]);
  const w = Qn.floor(h);   // 0 only on a tiny triangle (side² < 1): it shares nothing
  ctx.term("shared-factor", `the factor ${p - 1n} shares with the slanted side squared's whole part ${w}`, q(w === 0n ? 0n : gcd(p - 1n, w)), [area, hyp]);
  // How many trailing digits the height's whole part shares with p (0 for a height under 1).
  const legY = ref("tri", "legY"), hy = Qn.floor(num(ctx.read(legY))!);
  let same = 0;
  if (hy > 0n) for (let x = hy, y = p; x > 0n && y > 0n && x % 10n === y % 10n; x /= 10n, y /= 10n) same++;
  ctx.term("same-ending", hy > 0n ? `the height's whole part ${hy} ends in the same ${same} digit${same === 1 ? "" : "s"} as ${p}` : "a height under 1 ends in nothing", q(same), [area, legY]);
  ctx.mark({ kind: "focus", ref: area });
  ctx.mark({ kind: "focus", ref: hyp });
}), areaWitness);
