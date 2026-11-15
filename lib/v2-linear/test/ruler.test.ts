/**
 * Ruler as a ladder (beginner-areas.ts): the distance from (0, 0) to the line, squared, rounded down, on a prime ending in
 * k (bigger is better, in levels of digits); the tie-breaker reads that prime. Expectations worked by hand from the card:
 * distance² = c²/(m² + 1) for y = mx + c, and c²/(a² + b²) for a·x + b·y + c = 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, type Evaluation } from "@workspace/v2-core";
import { digitLevel, isqrt, lineQ, lineType, ruler, type LineState } from "../src/index.ts";
import { lineClash } from "../src/seating.ts";
import { mc } from "./helpers.ts";

const terms = (ends: number, s: LineState): Record<string, string> => {
  const e: Evaluation = evaluateSite(lineType, ruler, { ends }, s, lineQ, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, "undefined" in t.value ? "—" : Qn.toWire(t.value)]));
};
const vertical = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });   // a·x + c = 0

test("on a rung: distance² rounds down to a prime ending in k, and the tie-breaker reads that prime minus 1", () => {
  // y = −4x + 15: distance² 225/17 = 13.2 → 13 (2 digits: level 1, then (2 − 1 + 13/100)/2); 12 and 15 share 3.
  assert.deepEqual(terms(3, mc(-4, 15)), { ruler: "313/200", "shared-factor": "3" });
  // A level line y = 11/3 is 11/3 from (0, 0): distance² 121/9 = 13.4 → 13; 12 and its whole part 3 share 3.
  assert.deepEqual(terms(3, mc(0, q(11, 3))), { ruler: "313/200", "shared-factor": "3" });
  // y = −4x − 15, its mirror in the x-axis: the same distance, and the y-intercept's whole part ignores the sign.
  assert.deepEqual(terms(3, mc(-4, -15)), { ruler: "313/200", "shared-factor": "3" });
});

test("off the ladder: minus the distance to the nearest window [p, p + 1), and the tie-breaker reads that window's prime", () => {
  // y = −x + 6: distance² 36/2 = 18; for ending 9, 1 below [19, 20); 18 and 6 share 6.
  assert.deepEqual(terms(9, mc(-1, 6)), { ruler: "-1", "shared-factor": "6" });
  // y = 2x + 10: distance² 100/5 = 20, the open end of [19, 20): distance 0, still off the ladder; 18 and 10 share 2.
  assert.deepEqual(terms(9, mc(2, 10)), { ruler: "0", "shared-factor": "2" });
  // Through (0, 0): distance² 0, 3 below [3, 4); its whole part 0 shares nothing.
  assert.deepEqual(terms(3, mc(2, 0)), { ruler: "-3", "shared-factor": "0" });
});

test("a vertical line x = k is |k| from (0, 0): its distance scores, its tie-breaker (no y-intercept) is undefined", () => {
  assert.deepEqual(terms(3, vertical(-3n, 11n)), { ruler: "313/200", "shared-factor": "—" });   // x = 11/3
  assert.notEqual(evaluateSite(lineType, ruler, { ends: 3 }, vertical(-3n, 11n), lineQ, 0, null).score, null);
});

test("no top: a level line at height ⌈s√p⌉/s has distance² in [p, p + 1), so every prime ending in k is a rung, a bigger one higher", () => {
  let last = -Infinity;
  for (const p of [10007n, 1000003n, 1000000000039n]) {
    const s = 2n * isqrt(p) + 2n, r = isqrt(s * s * p - 1n) + 1n;   // the least r with r² ≥ s²p
    const u = terms(Number(p % 10n), mc(0, q(r, s))).ruler;
    assert.equal(u, Qn.toWire(digitLevel(p)));
    assert.ok(Qn.toNumber(Qn.parse(u)) > last);
    last = Qn.toNumber(Qn.parse(u));
  }
  assert.equal(Math.floor(last), 4);   // 13 digits: level 4 (10 digits), part of the way to level 5 (15)
});

test("stepping up the ladder restarts the tie-breaker (design-principles.md row 3)", () => {
  // y = −4x + 15: on 13, and 12 shares 3 with 15.
  assert.deepEqual(terms(3, mc(-4, 15)), { ruler: "313/200", "shared-factor": "3" });
  // One shift up by 5: distance² 400/17 = 23.5 → 23, a higher rung; 22 shares only 2 with 20, and 15 would share 1.
  assert.deepEqual(terms(3, mc(-4, 20)), { ruler: "323/200", "shared-factor": "2" });
});

test("a quarter turn about (0, 0) keeps the distance, so the tie-breaker can climb without leaving the rung", () => {
  // y = −4x + 15 turned a quarter about (0, 0) is y = x/4 + 15/4: distance² (225/16)/(17/16) = 225/17 again, on 13;
  // the y-intercept's whole part is now 3, which 12 shares in full.
  assert.deepEqual(terms(3, mc(q(1, 4), q(15, 4))), { ruler: "313/200", "shared-factor": "3" });
});

test("rungs are exact primes for big distances: 243424875139476387348923089 has no factor below 10^5 and is no rung", () => {
  const big = 243424875139476387348923089n;
  const s = 2n * isqrt(big) + 2n, r = isqrt(s * s * big - 1n) + 1n;
  assert.ok(Qn.sign(Qn.parse(terms(9, mc(0, q(r, s))).ruler)) <= 0);
  const p = 2003496914728200718921177n, s2 = 2n * isqrt(p) + 2n, r2 = isqrt(s2 * s2 * p - 1n) + 1n;
  assert.equal(terms(7, mc(0, q(r2, s2))).ruler, Qn.toWire(digitLevel(p)));   // a 25-digit prime: level 6
});

test("dealt: the four endings, each card a child can act on in under 30 words", () => {
  assert.deepEqual(ruler.dealable(lineQ), [{ ends: 1 }, { ends: 3 }, { ends: 7 }, { ends: 9 }]);
  for (const p of ruler.dealable(lineQ)) {
    const card = ruler.card(p, "shared-factor");
    assert.ok(card.split(/\s+/).length < 30, `${card.split(/\s+/).length} words: ${card}`);
    assert.doesNotMatch(card, /level/i);
    assert.match(card, /Bigger is better, each extra digit counts for less/);
    assert.match(card, new RegExp(`prime ending in ${p.ends}`));
  }
});

test("seating: Ruler and Pythagorean Area with one ending are a forbidden pair (on a 45° line distance² is the area)", () => {
  // y = −x + c: distance² c²/2 and the triangle's area c²/2 are one number, so both rungs come and go together.
  assert.equal(lineClash({ family: "ruler", params: { ends: 3 } }, { family: "pythagorean-area", params: { ends: 3 } }), true);
  assert.equal(lineClash({ family: "pythagorean-area", params: { ends: 7 } }, { family: "ruler", params: { ends: 7 } }), true);
  // Other endings oppose each other there: a number rounds down to one prime only.
  assert.equal(lineClash({ family: "ruler", params: { ends: 3 } }, { family: "pythagorean-area", params: { ends: 7 } }), false);
});
