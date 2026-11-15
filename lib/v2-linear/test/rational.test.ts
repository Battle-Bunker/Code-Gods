/** The rational-native families (rational.ts). Every expected value below was worked out by hand. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import {
  beginnerPool, decimalPeriod, divisorCount, egyptianLine, euclid, euclidSteps, fareyNeighbours, lineQ, lineType, lineZ, lineZ4, longDivision, pellGradient,
  presets, primeSlope, rationalFamilies, steadyGradient, wholeIntercept, type LineState,
} from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const score = (e: Evaluation) => (e.score === null ? "WORST" : e.score.map(x => (x === null ? "_" : Qn.toWire(x))).join(","));
const ev = <P,>(f: RuleFamily<LineState, P>, p: P, s: LineState, tb?: TieBreaker) => evaluateSite(lineType, f, p, s, lineQ, 0, tb);
const f = Qn.q;

test("on the line type, undealt: in no pool; only Whole Intercept is dealable on whole-number lines", () => {
  for (const fam of rationalFamilies) {
    assert.ok(lineType.families.some(x => x.id === fam.id), fam.id);
    assert.ok(!beginnerPool.some(x => x.id === fam.id), fam.id);
    assert.ok(!presets.some(p => p.rules.some(r => r.family === fam.id)), fam.id);
    assert.ok(fam.tieBreakers.length >= 1, fam.id);
    assert.ok(fam.dealable(lineQ).length >= 1, fam.id);
    assert.equal(fam.dealable(lineZ).length > 0, fam.id === "whole-intercept", fam.id);
    assert.equal(fam.dealable(lineZ4).length > 0, fam.id === "whole-intercept", fam.id);
  }
  assert.equal(new Set(lineType.families.map(x => x.id)).size, lineType.families.length, "family ids are unique");
});

test("every rational family: a vertical line is WORST", () => {
  for (const fam of rationalFamilies) assert.equal(score(ev(fam as RuleFamily<LineState, unknown>, fam.dealable(lineQ)[0], abc(1, 0, -3))), "WORST", fam.id);
});

test("Whole Intercept: c's distance from whole, then that number's smallest prime factor (spf(0) = 2; halfway, the bigger)", () => {
  assert.equal(score(ev(wholeIntercept, {}, mc(1, f(29, 2)))), "-1/2,3");    // 14½: 14 (spf 2) or 15 (spf 3) → 15
  assert.equal(score(ev(wholeIntercept, {}, mc(1, f(27, 2)))), "-1/2,13");   // 13½: 13 (spf 13) or 14 (spf 2) → 13
  assert.equal(score(ev(wholeIntercept, {}, mc(1, f(1, 2)))), "-1/2,2");     // ½: 0 (spf 2) or 1 (no prime factor, 1) → 0
  assert.equal(score(ev(wholeIntercept, {}, mc(1, 0))), "0,2");               // 0 files with the even numbers
  assert.equal(score(ev(wholeIntercept, {}, mc(1, -1))), "0,1");
  assert.equal(score(ev(wholeIntercept, {}, mc(1, f(31, 3)))), "-1/3,2");    // 10⅓ → 10, spf 2
  assert.equal(score(ev(wholeIntercept, {}, mc(1, 49))), "0,7");
  // The two-element version: y = 7x + 13 scores 7 (the smaller), y = 97x + 97 scores 97 (layered-line-rules.md §2.1).
  assert.equal(score(ev(wholeIntercept, {}, mc(7, 13), "mc-spf")), "0,7");
  assert.equal(score(ev(wholeIntercept, {}, mc(97, 97), "mc-spf")), "0,97");
  assert.equal(score(ev(wholeIntercept, {}, mc(f(3, 2), 4), "mc-spf")), "0,-1/2");   // m not whole: minus its distance, below any whole m
  assert.equal(score(ev(wholeIntercept, {}, mc(f(7, 3), 4), "mc-spf")), "0,-1/3");
  assert.equal(score(ev(wholeIntercept, {}, mc(1, 48), "omega")), "0,5");     // 48 = 2·2·2·2·3
  // Owner decision 29's example: the common factor of that whole number and ⌊m⌋.
  assert.equal(score(ev(wholeIntercept, {}, mc(f(13, 2), 9), "gcd-floor-m")), "0,3");    // gcd(9, 6)
  assert.equal(score(ev(wholeIntercept, {}, mc(f(-1, 2), 10), "gcd-floor-m")), "0,1");   // ⌊−½⌋ = −1
  assert.equal(score(ev(wholeIntercept, {}, mc(4, 0), "gcd-floor-m")), "0,_");           // 0 shares every factor: undefined, ranks last
  assert.equal(score(ev(wholeIntercept, {}, mc(f(3, 10), 5), "gcd-floor-m")), "0,_");    // ⌊0.3⌋ = 0
  const labels = ev(wholeIntercept, {}, mc(1, 1)).terms.map(t => t.label).join(" | ");
  assert.match(labels, /1 has no prime factor \(counted as 1\)/);
});

test("Pell Gradient: |m² − D|, the convergents of √2 and the golden ratio", () => {
  const two = { D: 2, k: 0 }, golden = { D: 1, k: 1 };
  assert.deepEqual(pellGradient.dealable(lineQ), [2, 3, 5, 6, 7].map(D => ({ D, k: 0 })).concat([golden]));
  assert.equal(score(ev(pellGradient, two, mc(f(17, 12), 0))), "-1/144,-1");  // 289/144 − 2 = 1/144; 289 − 2·144 = 1
  assert.equal(score(ev(pellGradient, two, mc(f(-17, 12), 5))), "-1/144,-1"); // the sign of m does not matter
  assert.equal(score(ev(pellGradient, two, mc(f(7, 5), 0))), "-1/25,-1");     // 49/25 − 2 = −1/25; |49 − 50| = 1
  assert.equal(score(ev(pellGradient, two, mc(f(4, 3), 0))), "-2/9,-2");      // 16/9 − 2 = −2/9; |16 − 18| = 2
  assert.equal(score(ev(pellGradient, two, mc(1, 0))), "-1,-1");
  assert.equal(score(ev(pellGradient, { D: 3, k: 0 }, mc(f(7, 4), 0))), "-1/16,-1");   // 49/16 − 3 = 1/16; 49 − 48 = 1
  assert.equal(score(ev(pellGradient, golden, mc(f(8, 5), 0))), "-1/25,-1");  // 64/25 − 8/5 − 1 = −1/25; |64 − 40 − 25| = 1
  assert.match(pellGradient.card(two, null), /times itself should be as close as possible to 2\./);
  assert.match(pellGradient.card(golden, "difference"), /take away the gradient, should be as close as possible to 1\. Secondary:/);
});

test("Euclid's Long Way: the divisions of Euclid's algorithm, then the largest quotient (smaller is better)", () => {
  // 89 = 1·55 + 34, 55 = 1·34 + 21, 34 = 1·21 + 13, 21 = 1·13 + 8, 13 = 1·8 + 5, 8 = 1·5 + 3, 5 = 1·3 + 2, 3 = 1·2 + 1, 2 = 2·1.
  assert.deepEqual(euclid(f(89, 55)), { steps: 9, largest: 2n });
  assert.equal(score(ev(euclidSteps, {}, mc(f(89, 55), 0))), "9,-2");
  assert.equal(score(ev(euclidSteps, {}, mc(f(-144, 89), 0))), "10,-2");      // Lamé: 144/89 takes 10
  assert.equal(score(ev(euclidSteps, {}, mc(f(55, 89), 0))), "10,-2");        // top first: 55 = 0·89 + 55, then 89/55's nine
  assert.equal(score(ev(euclidSteps, {}, mc(5, 0))), "1,-5");                 // a whole gradient takes one step
  assert.equal(score(ev(euclidSteps, {}, mc(f(7, 2), 0))), "2,-3");           // 7 = 3·2 + 1, 2 = 2·1
  assert.equal(score(ev(euclidSteps, {}, mc(0, 0))), "1,0");                  // 0 = 0·1
});

test("Farey Neighbours: |p·s − q·r| close to 1, then the smaller bottom", () => {
  assert.equal(score(ev(fareyNeighbours, {}, mc(f(1, 2), f(2, 3)))), "0,2");  // 1·3 − 2·2 = −1
  assert.equal(score(ev(fareyNeighbours, {}, mc(f(1, 2), f(3, 4)))), "-1,2"); // 1·4 − 2·3 = −2
  assert.equal(score(ev(fareyNeighbours, {}, mc(2, 3))), "0,1");              // whole and one apart: neighbours for free
  assert.equal(score(ev(fareyNeighbours, {}, mc(f(3, 5), f(2, 3)))), "0,3");  // 3·3 − 5·2 = −1
  assert.equal(score(ev(fareyNeighbours, {}, mc(f(1, 2), f(1, 2)))), "-1,2"); // equal: 1·2 − 2·1 = 0
});

test("Egyptian Line: unit fractions among m, c and m + c, then (all three) the bigger bottom", () => {
  assert.equal(score(ev(egyptianLine, {}, mc(f(1, 3), f(1, 6)))), "3,6");     // ⅓ + ⅙ = ½
  assert.equal(score(ev(egyptianLine, {}, mc(f(1, 42), f(1, 7)))), "3,42");   // 1/42 + 1/7 = 7/42 = 1/6
  assert.equal(score(ev(egyptianLine, {}, mc(f(1, 2), f(1, 2)))), "2,0");     // ½ + ½ = 1, not one over a whole number ≥ 2
  assert.equal(score(ev(egyptianLine, {}, mc(f(1, 3), f(1, 4)))), "2,0");     // 7/12
  assert.equal(score(ev(egyptianLine, {}, mc(f(-1, 3), f(1, 2)))), "2,0");    // −⅓ is not a unit fraction; ½ and ⅙ are
  assert.equal(score(ev(egyptianLine, {}, mc(2, 3))), "0,0");
});

test("Long Division: the repeating block's length against six", () => {
  // 1/7 = 0.(142857), 1/11 = 0.(09), 1/27 = 0.(037), 1/37 = 0.(027), 1/101 = 0.(0099), 1/41 = 0.(02439), 1/17: 16, 1/49: 42.
  for (const [d, l] of [[7, 6], [13, 6], [11, 2], [27, 3], [37, 3], [101, 4], [41, 5], [17, 16], [49, 42], [3, 1], [21, 6], [63, 6]] as const)
    assert.equal(decimalPeriod(f(1, d)), BigInt(l), `1/${d}`);
  assert.equal(decimalPeriod(f(7, 10)), 0n);       // 0.7 stops
  assert.equal(decimalPeriod(f(1, 12)), 1n);       // 0.08(3)
  assert.equal(decimalPeriod(f(5, 28)), 6n);       // 0.17(857142)
  assert.equal(decimalPeriod(f(4)), 0n);           // a whole number
  // c-negotiation.md §3.8's example: y = x/7 + 2 scores (0, −1, 7, −1).
  assert.equal(score(ev(longDivision, {}, mc(f(1, 7), 2), "m-top")), "0,-1");
  assert.equal(score(ev(longDivision, {}, mc(f(1, 7), 2), "m-bottom-spf")), "0,7");
  assert.equal(score(ev(longDivision, {}, mc(f(1, 7), 2), "c-period")), "0,-6");    // 2's decimal stops: |0 − 6|
  assert.equal(score(ev(longDivision, {}, mc(f(1, 7), f(1, 13)), "c-period")), "0,0"); // both repeat every six
  assert.equal(score(ev(longDivision, {}, mc(f(-3, 13), f(1, 2)))), "0,-3");
  assert.equal(score(ev(longDivision, {}, mc(f(1, 3), 0))), "-5,-1");
  assert.equal(score(ev(longDivision, {}, mc(f(3, 4), 0))), "-6,-3");         // stops: period 0
});
test("Prime Slope: rise and run (lowest terms) close to primes, added", () => {
  assert.equal(score(ev(primeSlope, {}, mc(f(5, 3), 0))), "0,0");             // both prime; |5 − 3| − 2 = 0
  assert.equal(score(ev(primeSlope, {}, mc(f(6, 4), 0))), "0,-1");            // 3/2: both prime; |3 − 2| = 1, one off twins
  assert.equal(score(ev(primeSlope, {}, mc(f(-4, 9), f(1, 2)))), "-3,-3");    // 4 → 3 or 5 (1), 9 → 7 or 11 (2); | 5 − 2 | = 3
  assert.equal(score(ev(primeSlope, {}, mc(f(-4, 9), f(1, 2)), "square-sum")), "-3,-3");   // 13: 16 is 3 away
  assert.equal(score(ev(primeSlope, {}, mc(f(-4, 9), f(1, 2)), "matching-c")), "-3,-7");   // |2 − 9|
  assert.equal(score(ev(primeSlope, {}, mc(1, 0))), "-2,-2");                 // 1 over 1: each 1 from 2; ||1 − 1| − 2| = 2
});

test("Steady Gradient: m close to whole, then that number's divisors", () => {
  // c-negotiation.md §3.12's example: y = 6x − 12 scores (0, 4, −1, 0): step 6, four divisors, crosses at 2.
  assert.equal(score(ev(steadyGradient, {}, mc(6, -12))), "0,4");
  assert.equal(score(ev(steadyGradient, {}, mc(6, -12), "gcd-c")), "0,6");          // gcd(6, −12)
  assert.equal(score(ev(steadyGradient, {}, mc(f(13, 2), f(10, 3)), "gcd-c")), "-1/2,1");   // gcd(7, 3)
  assert.equal(score(ev(steadyGradient, {}, mc(0, f(1, 3)), "gcd-c")), "0,_");      // with a 0: undefined
  assert.equal(score(ev(steadyGradient, {}, mc(5, 0), "gcd-c")), "0,_");
  assert.equal(score(ev(steadyGradient, {}, mc(6, -12), "x-whole")), "0,0");
  assert.equal(score(ev(steadyGradient, {}, mc(f(13, 2), 1))), "-1/2,2");     // 6½ rounds up to 7: divisors 1, 7
  assert.equal(score(ev(steadyGradient, {}, mc(f(23, 2), 1))), "-1/2,6");     // 11½ → 12: six divisors
  assert.equal(score(ev(steadyGradient, {}, mc(0, f(1, 3)), "x-whole")), "0,-1");   // a step of 0: as bad as can be
  assert.equal(score(ev(steadyGradient, {}, mc(4, f(3, 2)), "x-whole")), "0,-3/8"); // 3/8 from 0
  assert.equal(divisorCount(0n), 0n);
  assert.equal(divisorCount(-12n), 6n);
  assert.equal(divisorCount(60n), 12n);
});

test("the §A2 tie-breakers on Whole Intercept, Pell Gradient and Farey Neighbours (worked by hand)", () => {
  // Whole Intercept, gcd-den-m: the whole number nearest c against the gradient's bottom.
  assert.equal(score(ev(wholeIntercept, {}, mc(f(5, 4), 12), "gcd-den-m")), "0,4");      // gcd(12, 4)
  assert.equal(score(ev(wholeIntercept, {}, mc(f(3, 7), 10), "gcd-den-m")), "0,1");
  assert.equal(score(ev(wholeIntercept, {}, mc(f(1, 6), f(31, 2)), "gcd-den-m")), "-1/2,3");   // 15½: 15 (spf 3) beats 16 (spf 2); gcd(15, 6)
  assert.equal(score(ev(wholeIntercept, {}, mc(f(1, 3), 0), "gcd-den-m")), "0,_");      // 0 shares every factor
  // Pell Gradient (D = 2), pell-c: |p² − 2q² − top(c)|; share-den: c·q's distance from whole.
  const two = { D: 2, k: 0 };
  assert.equal(score(ev(pellGradient, two, mc(f(7, 5), -1), "pell-c")), "-1/25,0");     // 49 − 50 = −1 = top of −1
  assert.equal(score(ev(pellGradient, two, mc(f(7, 5), 1), "pell-c")), "-1/25,-2");     // |−1 − 1|
  assert.equal(score(ev(pellGradient, two, mc(f(3, 2), f(1, 7)), "pell-c")), "-1/4,0");  // 9 − 8 = 1 = top of 1/7; 9/4 − 2 = 1/4
  assert.equal(score(ev(pellGradient, { D: 1, k: 1 }, mc(f(8, 5), f(-1, 3)), "pell-c")), "-1/25,0");   // 64 − 40 − 25 = −1
  assert.equal(score(ev(pellGradient, two, mc(f(7, 5), f(3, 5)), "share-den")), "-1/25,0");     // 3/5 × 5 = 3
  assert.equal(score(ev(pellGradient, two, mc(f(7, 5), f(1, 2)), "share-den")), "-1/25,-1/2"); // 5/2
  assert.equal(score(ev(pellGradient, two, mc(f(7, 5), f(2, 15)), "share-den")), "-1/25,-1/3"); // 2/3
  // Farey Neighbours, mediant-x: gcd(q + s, the x-intercept's bottom).
  assert.equal(score(ev(fareyNeighbours, {}, mc(2, 1), "mediant-x")), "0,2");           // 2·1 − 1·1 = 1; q + s = 2; x-intercept −1/2
  assert.equal(score(ev(fareyNeighbours, {}, mc(3, f(1, 2)), "mediant-x")), "-4,3");    // 3·2 − 1·1 = 5; q + s = 3; x-intercept −1/6
  assert.equal(score(ev(fareyNeighbours, {}, mc(f(1, 2), f(1, 3)), "mediant-x")), "0,1");   // q + s = 5; x-intercept −2/3
  assert.equal(score(ev(fareyNeighbours, {}, mc(0, f(1, 2)), "mediant-x")), "0,_");     // flat: never crosses
});
