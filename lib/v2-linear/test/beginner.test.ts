import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, rng, walkStep, type Evaluation, type RuleFamily } from "@workspace/v2-core";
import { beginnerFamilies, exactChange, lineQ, lineType, lineZ, primeLanding, primeStaircase, pythagoreanArea, ruler, sameOnBothRulers, squareArea, treasure, type LineState } from "../src/index.ts";
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

test("the beginner pool: eight families, each a textbook main layer and three or four graded tie-breakers", () => {
  assert.equal(beginnerFamilies.length, 8);
  for (const f of beginnerFamilies) {
    assert.ok(f.tieBreakers.length >= 3 && f.tieBreakers.length <= 4, f.id);
    for (const l of [f.main, ...f.tieBreakers]) assert.ok(l.thresholds(f.dealable(lineZ)[0] as never, lineZ).length >= 4, `${f.id}.${l.id}`);
  }
});

test("worked examples, one line per family", () => {
  assert.deepEqual(terms(primeStaircase, {}, mc(30, 7)),
    { run: "6", "first-prime": "7", "last-prime": "157", "near-miss": "4", "step-back": "0" });   // 7, 37, 67, 97, 127, 157, then 187 = 11·17
  assert.deepEqual(terms(squareArea, {}, mc(-2, 6)),
    { square: "0", "spf": "3", "lpf": "3", "omega": "1" });   // legs 3 and 6: area 9
  // legs 12 and 24 (y = −2x + 24): area 144 = 12², 12 = 2·2·3
  const t12 = terms(squareArea, {}, mc(-2, 24));
  assert.deepEqual([t12.square, t12["spf"], t12["lpf"], t12["omega"]], ["0", "2", "3", "3"]);
  assert.deepEqual(terms(treasure, { k: 2, T: 37 }, mc(30, -23)),
    { treasure: "0", "prime-terms": "6", "prime-gradient": "1", "square-start": "23" });
  assert.deepEqual(terms(ruler, {}, mc(2, 5)),
    { ruler: "1", far: "2", "prime-gradient": "0", "square-area": "9/4" });   // distance² 25/5 = 5; area 25/4, nearest square 4
  assert.deepEqual(terms(exactChange, { ways: 6 }, mc(-2, 6)),
    { change: "2", "big-piles": "0", "big-bill": "6", "prime-coins": "1" });   // 2x + y = 6: four ways
  assert.deepEqual(terms(primeLanding, {}, mc(2, 13)),
    { landing: "0", "big-prime": "13", "prime-gradient": "0", "next-prime": "2" });
  assert.deepEqual(terms(sameOnBothRulers, { T: 6 }, mc(3, -12)),
    { fixed: "0", steep: "2", "prime-start": "1", "whole-values": "11", "whole-lamp": "1/2" });
  assert.deepEqual(terms(pythagoreanArea, { A: 6 }, mc(Qn.q(-4, 3), 4), lineQ),
    { area: "0", "slanted-square": "0", "prime-height": "1", "whole-legs": "0" });   // the 3-4-5 triangle
});

test("each family's main layer is undefined only where its lens is (and then the score is WORST)", () => {
  assert.equal(evaluateSite(lineType, exactChange, { ways: 6 }, mc(2, 6), lineZ).score, null);   // a rising line pays nothing
  assert.equal(evaluateSite(lineType, sameOnBothRulers, { T: 6 }, mc(1, 3), lineZ).score, null); // parallel to y = x
  assert.equal(evaluateSite(lineType, ruler, {}, mc(0, 3), lineZ).score, null);                 // flat
  assert.equal(evaluateSite(lineType, pythagoreanArea, { A: 6 }, mc(2, 0), lineZ).score, null);  // through the origin
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

test("Prime Staircase: a repeated prime stops the run but is no near miss; no run, no first prime", () => {
  // y = 7: 7, 7, 7, … a run of one, and no term that is not prime.
  assert.deepEqual(terms(primeStaircase, {}, mc(0, 7)), { run: "1", "first-prime": "7", "last-prime": "7", "near-miss": "—", "step-back": "0" });
  // y = x + 1000: 1000 is not prime, so there is no run and no first prime to grow.
  const t = terms(primeStaircase, {}, mc(1, 1000));
  assert.deepEqual([t.run, t["first-prime"], t["last-prime"]], ["0", "0", "0"]);
});

test("whole-number lines get whole-number distance rungs where the distance is always whole", () => {
  const ts = (f: typeof treasure | typeof primeLanding, id: string, v: typeof lineZ) =>
    [f.main, ...f.tieBreakers].find(l => l.id === id)!.thresholds(f.dealable(v)[0] as never, v).map(x => (x.d === 1n ? String(x.n) : `${x.n}/${x.d}`));
  assert.deepEqual(ts(primeLanding, "landing", lineZ), ["4", "2", "1", "0"]);
  assert.deepEqual(ts(primeLanding, "landing", lineQ), ["4", "2", "1", "1/2", "1/4", "1/8", "0"]);
  assert.deepEqual(ts(treasure, "treasure", lineZ), ["32", "16", "8", "4", "2", "1", "0"]);
});

test("tie-breakers that cannot decide anything on whole-number lines are not dealt there (Ruler's far, Exact Change's big piles)", async () => {
  const { preset } = await import("../src/index.ts");
  const tbs = (id: string, family: string) => preset(id).rules.find(r => r.family === family)!.tieBreakers;
  for (const id of ["lines-beginner", "lines-four"]) {
    assert.ok(!tbs(id, "ruler").includes("far") && !tbs(id, "exact-change").includes("big-piles"), id);
    assert.ok(tbs(id, "ruler").includes("prime-gradient"), id);
  }
  assert.ok(tbs("lines-rational", "ruler").includes("far") && tbs("lines-rational", "exact-change").includes("big-piles"));
});
