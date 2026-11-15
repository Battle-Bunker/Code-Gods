/** The second batch of rational-native families (rational2.ts). Every expected value below was worked out by hand. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import {
  beginnerPool, lineQ, lineType, lineZ, nearestLatticePoint, nearestSmooth, nearPoint, presets, rational2Families, smoothCrossing, smoothGradient, smoothIntercept, smoothSquare, steepAndTall, sunkenIntercept, targetGradient,
  smoothLevel, wholeArea, wholeAtT, type LineState,
} from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const score = (e: Evaluation) => (e.score === null ? "WORST" : e.score.map(x => (x === null ? "_" : Qn.toWire(x))).join(","));
const ev = <P,>(f: RuleFamily<LineState, P>, p: P, s: LineState, tb?: TieBreaker) => evaluateSite(lineType, f, p, s, lineQ, 0, tb);
const f = Qn.q;

test("on the line type, undealt (but the adversaries redesigned as ladders and dealt), dealable only on rational lines, with the dealt parameters of the §A2 run", () => {
  const dealt = new Set(["smooth-intercept"]);   // design-principles.md row 6: Prime Landing's opponent
  for (const fam of rational2Families) {
    assert.ok(lineType.families.some(x => x.id === fam.id), fam.id);
    assert.equal(beginnerPool.some(x => x.id === fam.id), dealt.has(fam.id), fam.id);
    if (!dealt.has(fam.id)) assert.ok(!presets.some(p => p.rules.some(r => r.family === fam.id)), fam.id);
    assert.equal(fam.dealable(lineZ).length, 0, fam.id);
  }
  assert.deepEqual(wholeAtT.dealable(lineQ), [{ T: "3/2" }]);
  assert.deepEqual(targetGradient.dealable(lineQ), [{ T: "5/3" }]);
  assert.deepEqual(nearPoint.dealable(lineQ), [{ u: "2", v: "7/3" }]);
  assert.equal(new Set(lineType.families.map(x => x.id)).size, lineType.families.length, "family ids are unique");
});

test("every new family: a vertical line is WORST, except Smooth Crossing (it crosses; its tie-breaker is undefined)", () => {
  for (const fam of rational2Families) {
    const s = score(ev(fam as RuleFamily<LineState, unknown>, fam.dealable(lineQ)[0], abc(1, 0, -3)));
    assert.equal(s, fam.id === "smooth-crossing" ? "0,_" : "WORST", fam.id);
  }
});

test("Whole Area: the area's distance from whole K; gcd(K, the crossing's whole number) or gcd(K, m's bottom)", () => {
  assert.equal(score(ev(wholeArea, {}, mc(1, 4), "gcd-x")), "0,4");                 // legs 4 and 4, area 8; crosses at −4
  assert.equal(score(ev(wholeArea, {}, mc(1, 4), "gcd-den-m")), "0,1");
  assert.equal(score(ev(wholeArea, {}, mc(f(1, 12), 2), "gcd-x")), "0,24");         // legs 24 and 2, area 24; crosses at −24
  assert.equal(score(ev(wholeArea, {}, mc(f(1, 12), 2), "gcd-den-m")), "0,12");
  assert.equal(score(ev(wholeArea, {}, mc(3, 2), "gcd-x")), "-1/3,1");              // legs 2/3 and 2, area 2/3 → 1; crossing −2/3 → −1
  assert.equal(score(ev(wholeArea, {}, mc(2, 1), "gcd-x")), "-1/4,_");              // area 1/4 → 0, which shares every factor
  assert.equal(score(ev(wholeArea, {}, mc(2, 0), "gcd-x")), "WORST");               // through the origin: no triangle
});

test("Whole at x = 3/2: y(3/2)'s distance from whole Y; gcd(Y, c's whole number) or gcd(Y, m's bottom)", () => {
  const p = { T: "3/2" };
  assert.equal(score(ev(wholeAtT, p, mc(f(2, 3), 5), "gcd-c")), "0,1");             // y = 1 + 5 = 6; gcd(6, 5)
  assert.equal(score(ev(wholeAtT, p, mc(f(2, 3), 5), "gcd-den-m")), "0,3");         // gcd(6, 3)
  assert.equal(score(ev(wholeAtT, p, mc(f(4, 3), 4), "gcd-c")), "0,2");             // y = 2 + 4 = 6; gcd(6, 4)
  assert.equal(score(ev(wholeAtT, p, mc(f(1, 2), 9), "gcd-den-m")), "-1/4,2");      // y = 39/4 → 10; gcd(10, 2)
  assert.equal(score(ev(wholeAtT, p, mc(1, 0), "gcd-c")), "-1/2,_");                // y = 3/2 → 2; c = 0
  assert.match(wholeAtT.card(p, "gcd-c"), /^When x is 3\/2, y should be as close as possible to a whole number\. Secondary:/);
});

test("Target Gradient (T = 5/3): |m − T|; gcd of the tops or of the bottoms", () => {
  const p = { T: "5/3" };
  assert.equal(score(ev(targetGradient, p, mc(f(5, 3), f(5, 3)), "gcd-tops")), "0,5");
  assert.equal(score(ev(targetGradient, p, mc(f(5, 3), f(5, 3)), "same-den")), "0,3");
  assert.equal(score(ev(targetGradient, p, mc(f(5, 3), f(10, 7)), "same-den")), "0,1");
  assert.equal(score(ev(targetGradient, p, mc(2, 4), "gcd-tops")), "-1/3,2");
  assert.equal(score(ev(targetGradient, p, mc(f(5, 3), 0), "gcd-tops")), "0,_");    // c's top is 0
  assert.equal(score(ev(targetGradient, p, mc(f(5, 3), 0), "same-den")), "0,1");    // 0 = 0/1
});

test("Near the Point (2, 7/3): |y(2) − 7/3|; the nearest whole-number point's distance²; gcd of the crossing's and y(2)'s whole numbers", () => {
  const p = { u: "2", v: "7/3" };
  // y = x/3 + 5/3 (−x + 3y − 5 = 0) passes through (2, 7/3); its whole points … (−2, 1), (1, 2), (4, 3) …: (1, 2) is 1 + 1/9 away (squared).
  assert.equal(score(ev(nearPoint, p, mc(f(1, 3), f(5, 3)), "lattice")), "0,-10/9");
  assert.equal(score(ev(nearPoint, p, mc(f(1, 3), f(5, 3)), "gcd-x")), "0,1");     // crosses at −5; y(2) = 7/3 → 2
  assert.equal(score(ev(nearPoint, p, mc(2, -2), "lattice")), "-1/3,-1/9");          // (2, 2)
  assert.equal(score(ev(nearPoint, p, mc(-1, f(13, 3)), "gcd-x")), "0,2");          // crosses at 13/3 → 4; 7/3 → 2
  assert.equal(score(ev(nearPoint, p, mc(-1, f(13, 3)), "lattice")), "0,_");        // 3x + 3y − 13 = 0: 3 does not divide 13
  assert.equal(score(ev(nearPoint, p, mc(0, f(7, 3)), "gcd-x")), "0,_");            // flat: never crosses
  assert.deepEqual(nearestLatticePoint(-1n, 3n, -5n, f(2), f(7, 3)), { x: 1n, y: 2n, d2: f(10, 9) });
  assert.equal(nearestLatticePoint(0n, 3n, -7n, f(2), f(7, 3)), null);
});

test("Smooth Crossing: the crossing's distance to the nearest 7-smooth number s; Ω(gcd(s, c's whole number))", () => {
  for (let k = 3n; k <= 10n; k++)   // y = −2x + 2·2^k crosses at 2^k; gcd(2^k, 2^(k+1)) = 2^k has k prime factors
    assert.equal(score(ev(smoothCrossing, {}, mc(-2, f(2n * 2n ** k)))), `0,${k}`);
  assert.equal(score(ev(smoothCrossing, {}, mc(-2, 22))), "-1,1");     // 11: 10 and 12 both 1 away, the smaller (10); gcd(10, 22) = 2
  assert.equal(score(ev(smoothCrossing, {}, mc(-2, 26))), "-1,1");     // 13: 12 and 14 → 12; gcd(12, 26) = 2
  assert.equal(score(ev(smoothCrossing, {}, mc(-2, 46))), "-1,1");     // 23: 24 is 1 away, 21 is 2; gcd(24, 46) = 2
  assert.equal(score(ev(smoothCrossing, {}, mc(2, 18))), "0,2");       // −9, smooth, sign kept; gcd(−9, 18) = 9 = 3·3
  assert.equal(score(ev(smoothCrossing, {}, mc(3, 0))), "-1,0");       // crosses at 0 → 1; c = 0 shares nothing
  assert.equal(score(ev(smoothCrossing, {}, mc(3, -1))), "-2/3,0");    // 1/3 → 1; gcd(1, −1) = 1, no prime factor
  assert.equal(score(ev(smoothCrossing, {}, mc(0, 5))), "WORST");      // flat: never crosses
  assert.equal(nearestSmooth(f(-17, 2)), -8n);                          // 8½: 8 is ½ away, 9 is ½: the smaller
  assert.equal(nearestSmooth(f(1000)), 1000n);
  assert.equal(nearestSmooth(f(1021)), 1024n);                          // 1020 = 4·3·5·17 is not smooth
});

test("Smooth Intercept is a ladder in triangular levels of the dealt primes multiplied; its tie-breaker is the factor that number plus 1 shares with the gradient's whole part", () => {
  const p = { primes: [2, 3] };
  // 16 = 2⁴: 4 primes, level 2 (3 ≤ 4 < 6): u = 2 + (4 − 3 + 1/18)/3 = 127/54; 17 and 2 share 1, 17 and 17 share 17.
  assert.equal(score(ev(smoothIntercept, p, mc(-2, 16))), "127/54,1");
  assert.equal(score(ev(smoothIntercept, p, mc(17, 16))), "127/54,17");
  // One more prime (32 = 2⁵): u = 2 + (2 + 1/34)/3 = 91/34, higher; 33 and 17 share 1 (the climb starts again).
  assert.equal(score(ev(smoothIntercept, p, mc(17, 32))), "91/34,1");
  // 18 = 2·3² holds 3 primes, fewer than 16: lower, though bigger (lots of prime factors, not size).
  assert.equal(score(ev(smoothIntercept, p, mc(17, 18))), "121/60,1");
  assert.equal(score(ev(smoothIntercept, p, mc(-1, 367))), "-17,1");        // 367 is prime: 384 = 2⁷·3 is 17 away (324 is 43); 385 and −1 share 1
  assert.equal(score(ev(smoothIntercept, p, mc(f(1, 2), 5))), "-1,0");      // 5: 4 and 6 are 1 away, the smaller; a whole part of 0 shares nothing
  assert.equal(score(ev(smoothIntercept, { primes: [3, 5] }, mc(19, 75))), "463/231,19");   // 75 = 3·5·5, level 2; 76 = 4·19 and 19 share 19
  // Each level needs one more prime than the last (1, 3, 6, 10, 15, …), and of two with as many, the smaller counts more.
  const levels = [1, 2, 3, 4, 5, 6, 10, 15, 21].map(k => smoothLevel(3n ** BigInt(k), [3, 7]).level);
  assert.deepEqual(levels, [1, 1, 2, 2, 2, 3, 4, 5, 6]);
  assert.ok(Qn.cmp(smoothLevel(21n, [3, 7]).u, smoothLevel(49n, [3, 7]).u) > 0, "21 and 49 both hold 2; the smaller counts more");
  assert.deepEqual(smoothIntercept.dealable(lineQ), [[3, 7], [3, 11], [3, 13], [3, 17]].map(primes => ({ primes })));
  assert.match(smoothIntercept.card(p, "shared-factor"), /made only by multiplying 2s and 3s\. More of them is better, though each extra one counts for less/);
});

test("Steep and Tall: min(m, c); Ω(gcd(⌊m⌋, ⌊c⌋)), 0 when either is 0", () => {
  assert.equal(score(ev(steepAndTall, {}, mc(8, 8))), "8,3");
  assert.equal(score(ev(steepAndTall, {}, mc(12, 18))), "12,2");            // gcd 6 = 2·3
  assert.equal(score(ev(steepAndTall, {}, mc(-2, 2048))), "-2,1");          // gcd(−2, 2048) = 2
  assert.equal(score(ev(steepAndTall, {}, mc(f(7, 2), 10))), "7/2,0");      // ⌊7/2⌋ = 3; gcd(3, 10) = 1
  assert.equal(score(ev(steepAndTall, {}, mc(5, 0))), "0,0");
});

test("Smooth Gradient: m's distance to the nearest 7-smooth s; Ω(gcd(s, c's whole number))", () => {
  assert.equal(score(ev(smoothGradient, {}, mc(8, 8))), "0,3");
  assert.equal(score(ev(smoothGradient, {}, mc(11, 22))), "-1,1");          // 11: 10 and 12 tie, the smaller; gcd(10, 22) = 2
  assert.equal(score(ev(smoothGradient, {}, mc(f(7, 2), 9))), "-1/2,1");    // 3½: 3 and 4 tie → 3; gcd(3, 9) = 3
  assert.equal(score(ev(smoothGradient, {}, mc(-2, 2048))), "0,1");         // −2, sign kept; gcd 2
  assert.equal(score(ev(smoothGradient, {}, mc(0, 5))), "-1,0");            // 0 → 1; gcd(1, 5) = 1
});

test("Smooth Square: the area's distance to the nearest square r²; Ω(gcd(r, the crossing's whole number))", () => {
  assert.equal(score(ev(smoothSquare, {}, mc(1, 4))), "-1,0");              // area 8 → 9 = 3²; crosses at −4
  assert.equal(score(ev(smoothSquare, {}, mc(-2, 16))), "0,3");             // legs 8 and 16, area 64 = 8²; crosses at 8
  assert.equal(score(ev(smoothSquare, {}, mc(-1, 6))), "-2,1");             // area 18 → 16 = 4²; gcd(4, 6) = 2
  assert.equal(score(ev(smoothSquare, {}, mc(2, 1))), "-1/4,0");            // area ¼ → 0 = 0²: nothing shared
  assert.equal(score(ev(smoothSquare, {}, mc(2, 0))), "WORST");             // no triangle
});

test("Sunken Intercept: −c; Ω(gcd(c's whole number, m's top))", () => {
  assert.equal(score(ev(sunkenIntercept, {}, mc(3, -12))), "12,1");
  assert.equal(score(ev(sunkenIntercept, {}, mc(8, -16))), "16,3");         // gcd 8
  assert.equal(score(ev(sunkenIntercept, {}, mc(f(1, 2), 5))), "-5,0");
  assert.equal(score(ev(sunkenIntercept, {}, mc(2, f(-1, 3)))), "1/3,0");   // −⅓ → 0
  assert.equal(score(ev(sunkenIntercept, {}, mc(0, -6))), "6,0");           // a flat gradient's top is 0
});
