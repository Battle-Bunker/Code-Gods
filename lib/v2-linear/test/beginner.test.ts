import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, rng, walkStep, type Evaluation, type RuleFamily } from "@workspace/v2-core";
import { LINE_Q_CODES, primeGradient, beginnerFamilies, beginnerPool, presets, divisibilityLadder, exactChange, lineQ, lineType, lineZ, primeLanding, primeStaircase, pythagoreanArea, ruler, sameOnBothRulers, squareArea, treasure, wholeCrossing, type LineState } from "../src/index.ts";
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

test("the beginner pool: the curator's eight families and two restored ones (Exact Change undealt), each a textbook main layer and graded tie-breakers", () => {
  assert.deepEqual(beginnerPool.map(f => f.id), ["prime-landing", "smooth-intercept", "square-area", "whole-crossing", "divisibility-ladder", "treasure", "same-on-both-rulers", "prime-gradient", "prime-staircase", "ruler", "pythagorean-area"]);
  for (const f of beginnerPool) {
    // Prime Staircase has one secondary (its run of six leaves the others almost nothing to order); the rest three or four.
    assert.ok(f.tieBreakers.length >= (f.id === "prime-staircase" || f.id === "smooth-intercept" ? 1 : 2) && f.tieBreakers.length <= 6, f.id);
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
  assert.deepEqual(terms(primeStaircase, { ends: 7 }, mc(30, 7)), { run: "73/12", "shared-factor": "6", "step-back": "6" });   // 7, 37, …, 157 (run 6), then 187 = 11·17, 10 from 197: 6 + 1/12; gcd(156, 6) = 6; |y(−1)| = 23, 6 from 17
  assert.deepEqual(terms(squareArea, {}, mc(-2, 6)),
    { square: "0", "spf": "3", "lpf": "3", "omega": "1" });   // legs 3 and 6: area 9
  // legs 12 and 24 (y = −2x + 24): area 144 = 12², 12 = 2·2·3
  const t12 = terms(squareArea, {}, mc(-2, 24));
  assert.deepEqual([t12.square, t12["spf"], t12["lpf"], t12["omega"]], ["0", "2", "3", "3"]);
  assert.deepEqual(terms(treasure, { k: 2, T: 37 }, mc(30, -23)),
    { treasure: "0", "prime-terms": "6", "prime-gradient": "1", "square-start": "23", "m-spf": "2", "m-gpf": "5" });   // y(2) = 37; 30 = 2·3·5, 1 from 29 and 31
  assert.deepEqual(terms(primeLanding, { ends: 3 }, mc(2, 13)), { landing: "13", "shared-factor": "2", "climb-on": "0" });   // on 13; 12 and 2 share 2; y(1) = 15 is no prime
  assert.deepEqual(terms(primeLanding, { ends: 7 }, mc(10, 7)), { landing: "7", "shared-factor": "2", "climb-on": "1" });   // on 7; 6 and 10 share 2; y(1) = 17, then 27
  assert.deepEqual(terms(primeLanding, { ends: 7 }, mc(3, 20)), { landing: "-3", "shared-factor": "1", "climb-on": "0" });   // 20 is no such prime: 3 from 17 (37 is 17 away)
  assert.deepEqual(terms(sameOnBothRulers, { T: 6 }, mc(3, -12)), { fixed: "0", steep: "2", "prime-start": "1", "whole-values": "11", "whole-lamp": "1/2", "m-spf": "3", "m-gpf": "3" });   // 3x − 12 = x at x = 6; lamp 3/2
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 1 }, mc(4, -24)), { crossing: "0", "k-spf": "2", "k-gpf": "3", "m-spf": "2", "gcd-c": "6", "gcd-num-m": "2" });       // crosses at 6 (leaves 1 divided by 5); gcd(6, −24), gcd(6, 4)
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 1 }, mc(3, 1)), { crossing: "4/3", "k-spf": "1", "k-gpf": "1", "m-spf": "3", "gcd-c": "1", "gcd-num-m": "1" });       // at −⅓: of −4 and 1, 1 is nearer
  assert.deepEqual(terms(divisibilityLadder, {}, mc(5, 60)), { ladder: "6", "m-spf": "5", "m-gpf": "5", steep: "5", "m-prime": "0" });   // 1 … 6 divide 60, 7 does not
});

test("each family's main layer is undefined only where its lens is (and then the score is WORST)", () => {
  assert.equal(evaluateSite(lineType, sameOnBothRulers, { T: 6 }, mc(1, 3), lineZ).score, null); // parallel to y = x
  assert.equal(evaluateSite(lineType, wholeCrossing, { q: 5, r: 1 }, mc(0, 3), lineZ).score, null);          // flat: never crosses
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
  assert.deepEqual(terms(primeStaircase, { ends: 7 }, mc(0, 7)), { run: "3/2", "shared-factor": "0", "step-back": "0" });   // 7, then 7 again: a run of one, broken on a prime (1 + 1/2); one prime shares nothing
  assert.deepEqual(terms(primeStaircase, { ends: 7 }, mc(1, 1000)), { run: "1/5", "shared-factor": "0", "step-back": "2" });  // 1000 is not prime, 3 from 997 (0 + 1/5); 999 is 2 from 997
});


test("Whole Crossing's §A2 tie-breakers: tied to the crossing's whole number, undealt (in no pool's deal)", () => {
  // Worked by hand. y = 2x − 14 crosses at 7 (leaves 2 divided by 5): gcd(7, −14) = 7, gcd(7, 2) = 1.
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 2 }, mc(2, -14), lineQ), { crossing: "0", "k-spf": "7", "k-gpf": "7", "m-spf": "2", "gcd-c": "7", "gcd-num-m": "1" });
  // y = (3/2)x − 12 crosses at 8 (leaves 3): gcd(8, −12) = 4, gcd(8, 3) = 1 (the gradient's top).
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 3 }, mc(q(3, 2), -12), lineQ), { crossing: "0", "k-spf": "2", "k-gpf": "2", "m-spf": "1", "gcd-c": "4", "gcd-num-m": "1" });
  // y = (2/5)x − 13/5 crosses at 13/2: of 2 and 7 (leaving 2), 7 is ½ away; c = −2.6, nearest −3: gcd 1; gcd(7, 2) = 1.
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 2 }, mc(q(2, 5), q(-13, 5)), lineQ), { crossing: "1/2", "k-spf": "7", "k-gpf": "7", "m-spf": "1", "gcd-c": "1", "gcd-num-m": "1" });
  // x = 17/2, leaving 4: of 4 and 9, 9 is ½ away; no y-intercept or gradient.
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 4 }, { lines: [{ a: 2n, b: 0n, c: -17n }] }, lineQ)["k-gpf"], "3");
  const vert: LineState = { lines: [{ a: 1n, b: 0n, c: -3n }] };
  const t = terms(wholeCrossing, { q: 5, r: 3 }, vert, lineQ);
  assert.equal(t["gcd-c"], "—");
  assert.equal(t["gcd-num-m"], "—");
  for (const tb of ["gcd-c", "gcd-num-m"]) assert.ok(!presets.some(p => p.rules.some(r => r.family === "whole-crossing" && r.tieBreakers.includes(tb))), tb);
});

test("vertical lines score where the rule has an honest reading (the coordinator's call, 15 Nov)", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });   // a·x + c = 0: x = −c/a
  // x = 13/2: Treasure passes (13/2, 37), 9/2 across from (2, 37); Prime Landing lands on the x-axis ½ from 7; it meets
  // y = x at 13/2, ½ from T = 6; Ruler's distance² is 169/4, 25/4 from 36 (k = 6). Tie-breakers stay undefined.
  assert.deepEqual(terms(treasure, { k: 2, T: 37 }, x(-2n, 13n), lineQ), { treasure: "9/2", "prime-terms": "—", "prime-gradient": "—", "square-start": "—", "m-spf": "—", "m-gpf": "—" });
  assert.equal(terms(primeLanding, { ends: 7 }, x(-2n, 13n), lineQ).landing, "-1/2");   // x = 6½: ½ from 7
  assert.equal(terms(sameOnBothRulers, { T: 6 }, x(-2n, 13n), lineQ).fixed, "1/2");
  assert.deepEqual(terms(ruler, {}, x(-2n, 13n), lineQ), { ruler: "25/4", far: "6", "prime-gradient": "—", "square-area": "—" });
  // x = 3: on the prime 3, distance² 9 exactly.
  assert.equal(terms(primeLanding, { ends: 3 }, x(-1n, 3n), lineQ).landing, "3");
  assert.equal(terms(ruler, {}, x(-1n, 3n), lineQ).ruler, "0");
  assert.notEqual(evaluateSite(lineType, ruler, {}, x(-1n, 3n), lineQ, 0, null).score, null, "a vertical line scores");
});

test("Prime Landing is a ladder: every rung has a higher one, and its tie-breakers restart on a new rung (design-principles.md rows 1 and 3)", () => {
  // Row 1: no attained top. Along c = 7, 17, 37, 47, … (primes ending in 7) the main part keeps rising.
  const along = [7, 17, 37, 47, 67, 97, 107, 127, 137, 157, 167, 197].map(c => Number(terms(primeLanding, { ends: 7 }, mc(1, c), lineQ).landing));
  for (let i = 1; i < along.length; i++) assert.ok(along[i]! > along[i - 1]!, `${along}`);
  // Row 3: on the rung 17 the best whole gradient part shares 16; on the rung 37 it shares 36: gradient 16 is best on 17,
  // and stepping up to 37 drops it to 4 (the climb starts again).
  assert.equal(terms(primeLanding, { ends: 7 }, mc(16, 17), lineQ)["shared-factor"], "16");
  assert.equal(terms(primeLanding, { ends: 7 }, mc(16, 37), lineQ)["shared-factor"], "4");
  assert.equal(terms(primeLanding, { ends: 7 }, mc(36, 37), lineQ)["shared-factor"], "36");
  assert.equal(terms(primeLanding, { ends: 7 }, mc(q(1, 2), 37), lineQ)["shared-factor"], "0");   // a whole part of 0 shares nothing
  assert.deepEqual(primeLanding.dealable(lineQ), [1, 3, 7, 9].map(ends => ({ ends })));
});

test("Same on Both Rulers' −T is an exact peer of T: it scores the line reflected through the origin as T scores the line", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });
  for (const mm of [-7, -2, 0, 2, 3, 14]) for (const cc of [-40, -17, -3, 0, 5, 17, 23, 97]) {
    assert.deepEqual(terms(sameOnBothRulers, { T: -6 }, mc(mm, -cc), lineQ), terms(sameOnBothRulers, { T: 6 }, mc(mm, cc), lineQ), `y = ${mm}x + ${cc}`);
  }
  for (const [a, c] of [[2n, -25n], [1n, 13n], [3n, 7n]] as const) assert.deepEqual(terms(sameOnBothRulers, { T: -6 }, x(a, -c), lineQ), terms(sameOnBothRulers, { T: 6 }, x(a, c), lineQ));
  assert.deepEqual(sameOnBothRulers.dealable(lineQ), [{ T: 6 }, { T: -6 }]);
});

test("Treasure's mirror (T below zero) is an exact peer: it scores the reflected line y → −y as T scores the line", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });
  for (const mm of [-7, -2, 0, 1, 3, 14]) for (const cc of [-40, -17, -3, 0, 5, 17, 23, 97]) {
    assert.deepEqual(terms(treasure, { k: 2, T: -37 }, mc(-mm, -cc), lineQ), terms(treasure, { k: 2, T: 37 }, mc(mm, cc), lineQ), `y = ${mm}x + ${cc}`);
  }
  for (const [a, c] of [[1n, -2n], [2n, -5n], [3n, 7n]] as const) assert.deepEqual(terms(treasure, { k: 2, T: -37 }, x(a, c), lineQ), terms(treasure, { k: 2, T: 37 }, x(a, c), lineQ));
  assert.match(treasure.card({ k: 2, T: -37 }, "square-start"), /minus a square number/);
});

test("Prime Gradient's mirror (side −1) is an exact peer: it scores the reflected line y → −y as side 1 scores the line", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });
  for (const [f, p] of [[primeGradient, { ends: 1 }]] as const) {
    for (const mm of [-7, -2, 0, 1, 3, 10, 14]) for (const cc of [-40, -17, -3, 0, 3, 5, 13, 23, 97]) {
      assert.deepEqual(terms(f as never, { ...p, side: -1 }, mc(-mm, -cc), lineQ), terms(f as never, p, mc(mm, cc), lineQ), `${f.id}: y = ${mm}x + ${cc}`);
    }
    for (const [a, c] of [[2n, -25n], [1n, 13n]] as const) assert.deepEqual(terms(f as never, { ...p, side: -1 }, x(a, c), lineQ), terms(f as never, p, x(a, c), lineQ));
    assert.deepEqual(f.dealable(lineQ), [p, { ...p, side: -1 }]);
  }
  assert.match(primeGradient.card({ ends: 1, side: -1 }, "cPrime"), /as close as possible to minus a prime ending in 1\..*minus a prime ending in 1 too/);
});

test("Whole Crossing's residues r and 5 − r are exact peers: r scores the line reflected x → −x as 5 − r scores the line", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });
  for (const r of [1, 2]) for (const mm of [-7, -2, 1, 3, 14]) for (const cc of [-40, -17, -3, 0, 5, 23]) {
    assert.deepEqual(terms(wholeCrossing, { q: 5, r: 5 - r }, mc(-mm, cc), lineQ), terms(wholeCrossing, { q: 5, r }, mc(mm, cc), lineQ), `r = ${r}: y = ${mm}x + ${cc}`);
  }
  for (const [a, c] of [[2n, -17n], [1n, 13n]] as const) assert.deepEqual(terms(wholeCrossing, { q: 5, r: 4 }, x(a, -c), lineQ), terms(wholeCrossing, { q: 5, r: 1 }, x(a, c), lineQ));
  assert.deepEqual(wholeCrossing.dealable(lineQ), [1, 2, 3, 4].map(r => ({ q: 5, r })));
  assert.match(wholeCrossing.card({ q: 5, r: 3 }, null), /as close as possible to a whole number that leaves 3 when divided by 5/);
});

test("Prime Staircase is a ladder: a longer run always wins, and its shared factor starts again on a longer run (design-principles.md)", () => {
  // 7, 37, 67 (run 3, then 97 is a prime: the run goes on) … the step 30 from 7 runs six; from 37 (37, 67, 97, 127, 157) five.
  assert.equal(terms(primeStaircase, { ends: 7 }, mc(30, 37), lineQ).run, "61/12");   // run 5, then 187: 10 from 197
  assert.equal(terms(primeStaircase, { ends: 7 }, mc(30, 7), lineQ)["shared-factor"], "6");     // gcd(157 − 1, 7 − 1)
  assert.equal(terms(primeStaircase, { ends: 7 }, mc(30, 37), lineQ)["shared-factor"], "12");   // gcd(157 − 1, 37 − 1)
  assert.deepEqual(primeStaircase.dealable(lineQ), [1, 3, 7, 9].map(ends => ({ ends })));
});
