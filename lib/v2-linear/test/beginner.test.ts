import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, rng, walkStep, type Evaluation, type RuleFamily } from "@workspace/v2-core";
import { beginnerFamilies, beginnerPool, presets, divisibilityLadder, exactChange, lineQ, lineType, lineZ, primeLanding, primeStaircase, pythagoreanArea, ruler, sameOnBothRulers, squareArea, treasure, wholeCrossing, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

/** Every layer's term, as wire strings, for one evaluation. */
function terms<P>(f: RuleFamily<LineState, P>, p: P, s: LineState, v = lineZ): Record<string, string> {
  const e: Evaluation = evaluateSite(lineType, f, p, s, v, 0, null);
  const out: Record<string, string> = {};
  for (const l of [f.main, ...f.tieBreakers]) {
    const t = e.terms.find(x => x.id === l.id)!.value;
    out[l.id] = "undefined" in t ? "—" : Qn.toWire(t);
  }
  return out;
}

test("the beginner pool: the curator's eight families and the three restored ones, each a textbook main layer and graded tie-breakers", () => {
  assert.deepEqual(beginnerPool.map(f => f.id), ["prime-landing", "square-area", "whole-crossing", "divisibility-ladder", "treasure", "same-on-both-rulers", "prime-gradient", "prime-staircase", "ruler", "exact-change", "pythagorean-area"]);
  for (const f of beginnerPool) {
    // Prime Staircase has one secondary (its run of six leaves the others almost nothing to order); the rest three or four.
    assert.ok(f.tieBreakers.length >= (f.id === "prime-staircase" ? 1 : 2) && f.tieBreakers.length <= 6, f.id);
  }
});

test("restored families (decision 22), worked by hand", () => {
  // y = 3x + 10: distance² 100/10 = 10, nearest square 9; gradient 3 is prime; area 100/6, nearest square 16.
  assert.deepEqual(terms(ruler, {}, mc(3, 10), lineQ), { ruler: "1", far: "3", "prime-gradient": "0", "square-area": "2/3" });
  // y = −2x + 5: distance² 5, nearest square 4; area 25/4, nearest square 4.
  assert.deepEqual(terms(ruler, {}, mc(-2, 5), lineQ), { ruler: "1", far: "2", "prime-gradient": "4", "square-area": "9/4" });
  // 2x + y = 12: coins 2 and 1 pay 12 in 7 ways (x = 0 … 6), the smallest pile 0; coin 1 is 1 from the prime 2.
  assert.deepEqual(terms(exactChange, { ways: 6 }, mc(-2, 12), lineQ), { change: "1", "big-piles": "0", "big-bill": "12", "prime-coins": "1" });
  // A rising line reads as a negative coin: not coins at all.
  assert.deepEqual(terms(exactChange, { ways: 6 }, mc(2, 12), lineQ), { change: "—", "big-piles": "—", "big-bill": "—", "prime-coins": "—" });
  // y = −4x + 4: legs 1 and 4, area 2; side² 17, nearest square 16; |c| = 4 is 1 from a prime.
  assert.deepEqual(terms(pythagoreanArea, { A: 6 }, mc(-4, 4), lineQ), { area: "4", "slanted-square": "1", "prime-height": "1", "whole-legs": "0" });
  // y = −3x + 6: legs 2 and 6, area 6 exactly; side² 40, nearest square 36.
  assert.deepEqual(terms(pythagoreanArea, { A: 6 }, mc(-3, 6), lineQ), { area: "0", "slanted-square": "4", "prime-height": "1", "whole-legs": "0" });
});

test("worked examples, one line per family", () => {
  assert.deepEqual(terms(primeStaircase, {}, mc(30, 7)), { run: "6", "first-prime": "7", "last-prime": "157", "near-miss": "4", "step-back": "0" });   // 7, 37, 67, 97, 127, 157, then 187 = 11·17 (4 from 191); y(−1) = −23
  assert.deepEqual(terms(squareArea, {}, mc(-2, 6)),
    { square: "0", "spf": "3", "lpf": "3", "omega": "1" });   // legs 3 and 6: area 9
  // legs 12 and 24 (y = −2x + 24): area 144 = 12², 12 = 2·2·3
  const t12 = terms(squareArea, {}, mc(-2, 24));
  assert.deepEqual([t12.square, t12["spf"], t12["lpf"], t12["omega"]], ["0", "2", "3", "3"]);
  assert.deepEqual(terms(treasure, { k: 2, T: 37 }, mc(30, -23)),
    { treasure: "0", "prime-terms": "6", "prime-gradient": "1", "square-start": "23", "m-spf": "2", "m-gpf": "5" });   // y(2) = 37; 30 = 2·3·5, 1 from 29 and 31
  assert.deepEqual(terms(primeLanding, {}, mc(2, 13)), { landing: "0", "big-prime": "13", "prime-gradient": "0", "next-prime": "2", "m-spf": "2", "m-gpf": "2" });   // y(1) = 15, 2 from 13 and 17
  assert.deepEqual(terms(sameOnBothRulers, { T: 6 }, mc(3, -12)), { fixed: "0", steep: "2", "prime-start": "1", "whole-values": "11", "whole-lamp": "1/2", "m-spf": "3", "m-gpf": "3" });   // 3x − 12 = x at x = 6; lamp 3/2
  assert.deepEqual(terms(wholeCrossing, {}, mc(4, -20)), { crossing: "0", "k-spf": "5", "k-gpf": "5", "m-spf": "2", "gcd-c": "5", "gcd-num-m": "1" });       // crosses at 5; gcd(5, −20), gcd(5, 4)
  assert.deepEqual(terms(wholeCrossing, {}, mc(3, 1)), { crossing: "1/3", "k-spf": "1", "k-gpf": "1", "m-spf": "3", "gcd-c": "—", "gcd-num-m": "—" });       // at −⅓, nearest 0 (shares every factor: undefined)
  assert.deepEqual(terms(divisibilityLadder, {}, mc(5, 60)), { ladder: "6", "m-spf": "5", "m-gpf": "5", steep: "5", "m-prime": "0" });   // 1 … 6 divide 60, 7 does not
});

test("each family's main layer is undefined only where its lens is (and then the score is WORST)", () => {
  assert.equal(evaluateSite(lineType, sameOnBothRulers, { T: 6 }, mc(1, 3), lineZ).score, null); // parallel to y = x
  assert.equal(evaluateSite(lineType, wholeCrossing, {}, mc(0, 3), lineZ).score, null);          // flat: never crosses
  assert.equal(evaluateSite(lineType, divisibilityLadder, {}, mc(2, 0), lineZ).score, null);     // through (0, 0)
});

test("every tie-breaker is dealable on a walk of lines: no throw, marks cite reads", () => {
  const r = rng("beginner-walk");
  let s = mc(1, 1);
  for (let i = 0; i < 300; i++) {
    s = walkStep(lineType, lineQ, s, r);
    for (const f of beginnerFamilies) {
      const p = f.dealable(lineQ)[0]!;
      for (const tb of f.tieBreakers) evaluateSite(lineType, f as RuleFamily<LineState, unknown>, p, s, lineQ, 0, tb.id);
    }
  }
  assert.ok(q(1));
});

test("presets: four pools over the beginner families, every named tie-breaker exists", async () => {
  const { presets, families, lineType: t } = await import("../src/index.ts");
  assert.deepEqual(presets.map(p => p.id), ["lines-beginner", "lines-whole", "lines-four", "lines-lenses"]);
  for (const p of presets) {
    assert.ok(t.variants.some(v => v.id === p.variant), p.id);
    for (const r of p.rules) {
      const f = families.find(x => x.id === r.family)!;
      assert.ok(f, r.family);
      for (const tb of r.tieBreakers) assert.ok(f.tieBreakers.some(x => x.id === tb), `${r.family}.${tb}`);
    }
  }
});

test("Prime Staircase: a repeated prime stops the run; no run, no first prime", () => {
  assert.deepEqual(terms(primeStaircase, {}, mc(0, 7)), { run: "1", "first-prime": "7", "last-prime": "7", "near-miss": "—", "step-back": "0" });   // 7, 7, …: a run of one, never a miss
  assert.deepEqual(terms(primeStaircase, {}, mc(1, 1000)), { run: "0", "first-prime": "0", "last-prime": "0", "near-miss": "3", "step-back": "2" });  // 1000 is not prime (3 from 997); 999 is 2 from 997
});


test("Whole Crossing's §A2 tie-breakers: tied to the crossing's whole number, undealt (in no pool's deal)", () => {
  // Worked by hand. y = 2x − 12 crosses at 6: gcd(6, −12) = 6, gcd(6, 2) = 2.
  assert.deepEqual(terms(wholeCrossing, {}, mc(2, -12), lineQ), { crossing: "0", "k-spf": "2", "k-gpf": "3", "m-spf": "2", "gcd-c": "6", "gcd-num-m": "2" });
  // y = (3/2)x − 9 crosses at 6: gcd(6, −9) = 3, gcd(6, 3) = 3 (the gradient's top).
  assert.deepEqual(terms(wholeCrossing, {}, mc(q(3, 2), -9), lineQ), { crossing: "0", "k-spf": "2", "k-gpf": "3", "m-spf": "1", "gcd-c": "3", "gcd-num-m": "3" });
  // y = (2/5)x − 13/5 crosses at 13/2, nearest 7 (a half rounds up); c = −2.6, nearest −3: gcd 1; gcd(7, 2) = 1.
  assert.deepEqual(terms(wholeCrossing, {}, mc(q(2, 5), q(-13, 5)), lineQ), { crossing: "1/2", "k-spf": "7", "k-gpf": "7", "m-spf": "1", "gcd-c": "1", "gcd-num-m": "1" });
  // x = 3: crosses at 3 but has no y-intercept or gradient.
  const vert: LineState = { lines: [{ a: 1n, b: 0n, c: -3n }] };
  const t = terms(wholeCrossing, {}, vert, lineQ);
  assert.equal(t["gcd-c"], "—");
  assert.equal(t["gcd-num-m"], "—");
  for (const tb of ["gcd-c", "gcd-num-m"]) assert.ok(!presets.some(p => p.rules.some(r => r.family === "whole-crossing" && r.tieBreakers.includes(tb))), tb);
});
