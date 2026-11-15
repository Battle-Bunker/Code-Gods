/**
 * Ruler, Square Area and Pythagorean Area: the beginner families that read the line's distances and areas (moved out of
 * beginner.ts unchanged, 15 Nov, so their redesign against design-principles.md does not collide with the others').
 */
import { gcd, Qn, q, ref, type Q } from "@workspace/v2-core";
import { fromMC, normalise, type LineState } from "./line.ts";
import { allUndefined, distance, factorLabel, family, gap, ladder, more, num, prime, squareGap, undealt, verticalAt, VERTICAL_NO, type Shape } from "./layers.ts";
import { digitLevel, digitNote, distanceToPrime, isPrime, isPrimeEnding, largestPrimeFactor, nearestInteger, nearestPrimeEnding, nearestSquareRoot, PRIME_ENDINGS, primeFactorCount, smallestPrimeFactor } from "./numbers.ts";

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

// ---------------------------------------------------------------- Ruler (restored, decision 22; a ladder since 15 Nov)

/**
 * Ruler as a ladder (design-principles.md; the redesign of beginner-line-redesign.md §4.8, on Pythagorean Area's
 * pattern). Main part, unbounded: the distance from (0, 0) to the line, squared (c²/(a² + b²), so a vertical or level
 * line reads honestly too), rounded down, should be a prime ending in k, the bigger the better, in levels of digits
 * (u = digitLevel(p), as Prime Landing's); any other line scores below every rung, minus how far its distance² is from
 * the nearest window [p, p + 1). A rung is a window, not a point: the next one is a small shift or tilt away, and no
 * repeated stretch or turn keeps the distance² on a prime. The §4.8 draft (how many times q divides the distance²) was a
 * v_q ladder, which a repeated zoom or stretch by q climbs a bit a step with no end (Pythagorean Area's lesson); the old
 * main part (distance² close to a square) had a top.
 * Tie-breaker, read from that prime p: the factor p − 1 shares with the y-intercept's whole part (ignoring its sign). A new
 * rung changes p − 1, so the y-intercept that shared most no longer does and the climb starts again; a turn about (0, 0)
 * keeps the distance (the ruler's own shortcut) and moves the y-intercept, so the tie-breaker climbs on a rung.
 * Adversary, by construction: Pythagorean Area, on the same number on a 45° line (y = ±x + c: distance² and the
 * triangle's area are both c²/2), so another ending there excludes it and the same ending is a forbidden pair (seating.ts).
 * Measured (scripts/tension.ts, regenerated 15 Nov with the pool's ladders): Treasure (0.66) and Prime Landing (0.66) are
 * its named opponents, the share of their dealt rules that a Ruler climb lowers; Pythagorean Area 0.49. A Ruler that wants
 * the line close to (0, 0) (1 ÷ distance²) would fail the mechanical row 1 check, which searches whole y-intercepts
 * outward from 0.
 * Dealt: k = 1, 3, 7, 9.
 */
const RULER_ENDS: Ends[] = PRIME_ENDINGS.map(ends => ({ ends }));
const rulerShape: Shape<Ends> = {
  main: { ...more<Ends>("ruler", "distance² from (0, 0) on as big a dealt prime as possible", "", "norm"),
    // Plain sentences, the main one under 30 words (the coordinator's ask): whose distance, and what is done to it.
    sentence: p => `Square the line's closest distance to (0, 0) and round down: it should be a prime ending in ${p.ends}. Bigger primes are better, each extra digit counts for less.` },
  tieBreakers: [
    more<Ends>("shared-factor", "the factor that prime minus 1 shares with the y-intercept's whole part",
      "Prime minus 1 and the y-intercept's whole part should share as big a factor as possible.", "si"),
  ],
};
/**
 * Witnesses for the tail cap (as Pythagorean Area's areaWitness): for n digits, up to three lines a·x + b·y + c = 0 whose
 * distance², c²/(a² + b²), rounds down to an n-digit prime ending in k, with c = 2^i·3^j (cheap under the code), a ≤ 12
 * and b ≤ 8: φ grows by about 1.7 bits a digit. Empty for a number of digits no such line reaches.
 */
const RULER_SMOOTH23: bigint[] = (() => {
  const out: bigint[] = [];
  for (let t = 1n; t < 10n ** 48n; t *= 2n) for (let u = t; u < 10n ** 48n; u *= 3n) out.push(u);
  return out.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
})();
export function rulerWitness(p: Ends, n: number): LineState[] {
  const lo = 10n ** BigInt(n - 1), hi = 10n ** BigInt(n), out: LineState[] = [];
  for (let b = 0n; b <= 8n && out.length < 3; b++) for (let a = 0n; a <= 12n && out.length < 3; a++) {
    if (a === 0n && b === 0n) continue;
    const D = a * a + b * b;
    for (const c of RULER_SMOOTH23) {
      const d2 = (c * c) / D;
      if (d2 >= hi) break;
      if (d2 < lo || !isPrimeEnding(d2, p.ends)) continue;
      const l = normalise(a, b, c);
      if (!("invalid" in l)) out.push({ lines: [l] });
      break;
    }
  }
  return out;
}
export const ruler = ladder(family<Ends>("ruler", "Ruler", ["norm", "si", "gen"], rulerShape, RULER_ENDS, (ctx, pr) => {
  const d2Ref = ref("norm", "dist2"), cRef = ref("si", "c");
  const d2 = num(ctx.read(d2Ref))!;
  ctx.read(ref("norm", "foot"));
  const { p, u } = areaRung(d2, pr.ends);   // the same floor window as the area's
  ctx.term("ruler", Qn.sign(u) > 0 ? `distance² ${Qn.toWire(d2)}, which rounds down to the prime ${p}: ${digitNote(p)}` : `distance² ${Qn.toWire(d2)}, ${Qn.toWire(Qn.neg(u))} from the window of the prime ${p}`, u, [d2Ref]);
  // A vertical line has no y-intercept: its tie-breaker is undefined (it ranks last), not its distance.
  const vx = verticalAt(ctx);
  if (vx) ctx.term("shared-factor", "the y-intercept's whole part", { undefined: VERTICAL_NO }, vx.from);
  else {
    const c = num(ctx.read(cRef))!, w = Qn.floor(Qn.abs(c));
    ctx.term("shared-factor", `${p - 1n} and the y-intercept's whole part ${w}: the biggest number dividing both is ${w === 0n ? 0n : gcd(p - 1n, w)}`, q(w === 0n ? 0n : gcd(p - 1n, w)), [d2Ref, cRef]);
  }
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
  ctx.mark({ kind: "focus", ref: area });
  ctx.mark({ kind: "focus", ref: hyp });
}), areaWitness);
