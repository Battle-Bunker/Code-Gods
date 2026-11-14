import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, rng, walkStep, type Evaluation, type RuleFamily } from "@workspace/v2-core";
import { beginnerFamilies, beginnerPool, divisibilityLadder, lineQ, lineType, lineZ, primeLanding, primeStaircase, sameOnBothRulers, squareArea, treasure, wholeCrossing, type LineState } from "../src/index.ts";
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

test("the beginner pool: eight families (layered-line-rules.md §10.5), each a textbook main layer and graded tie-breakers", () => {
  assert.deepEqual(beginnerPool.map(f => f.id), ["prime-landing", "square-area", "whole-crossing", "divisibility-ladder", "treasure", "same-on-both-rulers", "prime-gradient", "prime-staircase"]);
  for (const f of beginnerPool) {
    // Prime Staircase has one secondary (its run of six leaves the others almost nothing to order); the rest three or four.
    assert.ok(f.tieBreakers.length >= (f.id === "prime-staircase" ? 1 : 2) && f.tieBreakers.length <= 4, f.id);
  }
});

test("worked examples, one line per family", () => {
  assert.deepEqual(terms(primeStaircase, {}, mc(30, 7)), { run: "6", "first-prime": "7" });   // 7, 37, 67, 97, 127, 157, then 187 = 11·17
  assert.deepEqual(terms(squareArea, {}, mc(-2, 6)),
    { square: "0", "spf": "3", "lpf": "3", "omega": "1" });   // legs 3 and 6: area 9
  // legs 12 and 24 (y = −2x + 24): area 144 = 12², 12 = 2·2·3
  const t12 = terms(squareArea, {}, mc(-2, 24));
  assert.deepEqual([t12.square, t12["spf"], t12["lpf"], t12["omega"]], ["0", "2", "3", "3"]);
  assert.deepEqual(terms(treasure, { k: 2, T: 37 }, mc(30, -23)),
    { treasure: "0", "m-spf": "2", "m-gpf": "5", "prime-terms": "6" });   // y(2) = 37; 30 = 2·3·5
  assert.deepEqual(terms(primeLanding, {}, mc(2, 13)), { landing: "0", "big-prime": "13", "m-spf": "2", "m-gpf": "2" });
  assert.deepEqual(terms(sameOnBothRulers, { T: 6 }, mc(3, -12)), { fixed: "0", "m-spf": "3", "m-gpf": "3", steep: "2" });   // 3x − 12 = x at x = 6
  assert.deepEqual(terms(wholeCrossing, {}, mc(4, -20)), { crossing: "0", "k-spf": "5", "k-gpf": "5", "m-spf": "2" });       // crosses at 5
  assert.deepEqual(terms(wholeCrossing, {}, mc(3, 1)), { crossing: "1/3", "k-spf": "1", "k-gpf": "1", "m-spf": "3" });       // at −⅓, nearest 0
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

test("presets: three pools over the beginner families, every named tie-breaker exists", async () => {
  const { presets, families, lineType: t } = await import("../src/index.ts");
  assert.deepEqual(presets.map(p => p.id), ["lines-beginner", "lines-rational", "lines-four"]);
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
  assert.deepEqual(terms(primeStaircase, {}, mc(0, 7)), { run: "1", "first-prime": "7" });   // 7, 7, …: a run of one
  assert.deepEqual(terms(primeStaircase, {}, mc(1, 1000)), { run: "0", "first-prime": "0" });  // 1000 is not prime
});

