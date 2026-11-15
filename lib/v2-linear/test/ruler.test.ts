/**
 * Ruler as a ladder (beginner-areas.ts): the distance from (0, 0) to the line, squared, rounded down, on a prime ending in
 * k (bigger is better, in levels of digits); the tie-breaker reads that prime. Expectations worked by hand from the card:
 * distance² = c²/(m² + 1) for y = mx + c, and c²/(a² + b²) for a·x + b·y + c = 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, type Evaluation } from "@workspace/v2-core";
import { digitLevel, isqrt, lineQ, lineType, ruler, rulerWitness, type LineState } from "../src/index.ts";
import { lineClash } from "../src/seating.ts";
import { mc } from "./helpers.ts";

const terms = (ends: number, s: LineState): Record<string, string> => {
  const e: Evaluation = evaluateSite(lineType, ruler, { ends }, s, lineQ, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, "undefined" in t.value ? "—" : Qn.toWire(t.value)]));
};
const vertical = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });   // a·x + c = 0

test("on a rung: distance² rounds down to a prime ending in k, and the tie-breaker reads that prime minus 1", () => {
  // y = −4x + 15: distance² 225/17 = 13.2 → 13 (2 digits: level 1, then (2 − 1 + 13/100)/2); 12 and 15 share 3.
  assert.deepEqual(terms(3, mc(-4, 15)), { ruler: "313/200", closeness: "3", "near-miss": "2", "reading-at-index": "0", "shared-factor": "3" });
  // A level line y = 11/3 is 11/3 from (0, 0): distance² 121/9 = 13.4 → 13; 12 and its whole part 3 share 3.
  assert.deepEqual(terms(3, mc(0, q(11, 3))), { ruler: "313/200", closeness: "13", "near-miss": "2", "reading-at-index": "1", "shared-factor": "3" });
  // y = −4x − 15, its mirror in the x-axis: the same distance, and the y-intercept's whole part ignores the sign.
  assert.deepEqual(terms(3, mc(-4, -15)), terms(3, mc(-4, 15)));
});

test("off the ladder: minus the distance to the nearest window [p, p + 1), and the tie-breaker reads that window's prime", () => {
  // y = −x + 6: distance² 36/2 = 18; for ending 9, 1 below [19, 20); 18 and 6 share 6.
  assert.deepEqual(terms(9, mc(-1, 6)), { ruler: "-1", closeness: "18", "near-miss": "5", "reading-at-index": "0", "shared-factor": "6" });
  // y = 2x + 10: distance² 100/5 = 20, the open end of [19, 20): distance 0, still off the ladder; 18 and 10 share 2.
  assert.deepEqual(terms(9, mc(2, 10)), { ruler: "0", closeness: "15", "near-miss": "3", "reading-at-index": "0", "shared-factor": "2" });
  // Through (0, 0): distance² 0, 3 below [3, 4); its whole part 0 shares nothing.
  assert.deepEqual(terms(3, mc(2, 0)), { ruler: "-3", closeness: "1", "near-miss": "0", "reading-at-index": "0", "shared-factor": "0" });
});

test("a vertical line x = k is |k| from (0, 0): its distance scores, its tie-breaker (no y-intercept) is undefined", () => {
  assert.deepEqual(terms(3, vertical(-3n, 11n)), { ruler: "313/200", closeness: "—", "near-miss": "—", "reading-at-index": "—", "shared-factor": "—" });   // x = 11/3
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
  // y = −4x + 15: on 13. Closeness: 16 is 3 from 13. Near miss: 13, 28 = 2 × 14 (2). Shared factor: 12 and 15 share 3.
  assert.deepEqual(terms(3, mc(-4, 15)), { ruler: "313/200", closeness: "3", "near-miss": "2", "reading-at-index": "0", "shared-factor": "3" });
  // One shift up by 5: distance² 400/17 = 23.5 → 23, a higher rung. 16 is now 7 from 23 (a gradient near √23 ≈ 4.8 is
  // best); 23, 43, then 63 = 3 × 21 (3); 22 shares only 2 with 20.
  assert.deepEqual(terms(3, mc(-4, 20)), { ruler: "323/200", closeness: "7", "near-miss": "3", "reading-at-index": "0", "shared-factor": "2" });
  // Closeness climbs on the rung: y = −(24/5)x + 24 keeps 23 (distance² 14400/601 = 23.96); 576/25 is 1/25 from 23.
  assert.equal(terms(3, mc(q(-24, 5), q(24))).ruler, "323/200");
  assert.equal(terms(3, mc(q(-24, 5), q(24))).closeness, "1/25");
  // Reading at index: on 13, y = 8x + 59/2 (distance² 3481/260 = 13.4) is 133.5 high at x = 13: 133 ends in one 3 of …1313.
  assert.equal(terms(3, mc(8, q(59, 2))).ruler, "313/200");
  assert.equal(terms(3, mc(8, q(59, 2)))["reading-at-index"], "1");
});

test("a quarter turn about (0, 0) keeps the distance, so the tie-breaker can climb without leaving the rung", () => {
  // y = −4x + 15 turned a quarter about (0, 0) is y = x/4 + 15/4: distance² (225/16)/(17/16) = 225/17 again, on 13;
  // the y-intercept's whole part is now 3, which 12 shares in full.
  assert.deepEqual(terms(3, mc(q(1, 4), q(15, 4))), { ruler: "313/200", closeness: "207/16", "near-miss": "2", "reading-at-index": "0", "shared-factor": "3" });
});

test("rungs are exact primes for big distances: 243424875139476387348923089 has no factor below 10^5 and is no rung", () => {
  const big = 243424875139476387348923089n;
  const s = 2n * isqrt(big) + 2n, r = isqrt(s * s * big - 1n) + 1n;
  assert.ok(Qn.sign(Qn.parse(terms(9, mc(0, q(r, s))).ruler)) <= 0);
  const p = 2003496914728200718921177n, s2 = 2n * isqrt(p) + 2n, r2 = isqrt(s2 * s2 * p - 1n) + 1n;
  assert.equal(terms(7, mc(0, q(r2, s2))).ruler, Qn.toWire(digitLevel(p)));   // a 25-digit prime: level 6
});

test("dealt: the four endings, each card in plain sentences: the main one under 30 words, each tie-breaker's under 20", () => {
  assert.deepEqual(ruler.dealable(lineQ), [{ ends: 1 }, { ends: 3 }, { ends: 7 }, { ends: 9 }]);
  const words = (s: string) => s.trim().split(/\s+/).length;
  for (const p of ruler.dealable(lineQ)) {
    const main = ruler.card(p, null), card = ruler.card(p, "near-miss");
    assert.ok(words(main) < 30, `${words(main)} words: ${main}`);
    assert.doesNotMatch(card, /level|²/i);
    assert.match(main, /the line's closest distance to \(0, 0\)/);
    assert.match(main, new RegExp(`a prime ending in ${p.ends}\\. Bigger primes are better, each extra digit counts for less\\.$`));
    assert.match(card, /Tie-breaker: From that prime, keep adding the y-intercept's whole part\. The first non-prime should have a big smallest factor\./);
  }
  // A repertoire of four forms (row 3a): a near miss (dealt), a closeness, a reading at the rung's index and the old shared
  // factor (Pythagorean Area's form), each a sentence under 20 words a beginner reads.
  assert.deepEqual(ruler.tieBreakers.map(t => t.id), ["near-miss", "closeness", "reading-at-index", "shared-factor"]);
  assert.deepEqual(ruler.tieBreakers.map(t => t.dealtOn?.(lineQ) ?? true), [true, false, false, false]);
  for (const t of ruler.tieBreakers) {
    const s = t.sentence({ ends: 3 });
    assert.ok(words(s) < 20, `${t.id}: ${words(s)} words: ${s}`);
    assert.doesNotMatch(s, /level|²/i, t.id);
  }
});

test("closeness has no top: the gradient squared is never the prime, and Pell's equation gives ever closer, dearer gradients", () => {
  // r² − 13·s² = −1: (18, 5), (23382, 6485): the gradient r/s squared is 1/25, then 1/6485², from 13.
  for (const [r, s, d] of [[18n, 5n, "1/25"], [23382n, 6485n, `1/${6485n * 6485n}`]] as const) {
    const m = q(r, s), c = isqrt(13n * (r * r + s * s)) + 1n;   // (c/s)² ≥ 13(m² + 1): on 13's window while below 14's
    const t = terms(3, mc(m, q(c, s)));
    assert.equal(t.ruler, "313/200");
    assert.equal(t.closeness, d);
  }
});

test("seating: Ruler and Pythagorean Area with one ending are a forbidden pair (on a 45° line distance² is the area)", () => {
  // y = −x + c: distance² c²/2 and the triangle's area c²/2 are one number, so both rungs come and go together.
  assert.equal(lineClash({ family: "ruler", params: { ends: 3 } }, { family: "pythagorean-area", params: { ends: 3 } }), true);
  assert.equal(lineClash({ family: "pythagorean-area", params: { ends: 7 } }, { family: "ruler", params: { ends: 7 } }), true);
  // Other endings oppose each other there: a number rounds down to one prime only.
  assert.equal(lineClash({ family: "ruler", params: { ends: 3 } }, { family: "pythagorean-area", params: { ends: 7 } }), false);
});

test("witnesses for the ladder's tail cap: cheap lines whose distance² rounds down to an n-digit prime ending in k", () => {
  for (const ends of [1, 3, 7, 9]) for (const n of [1, 2, 5, 12, 30]) {
    const ws = rulerWitness({ ends }, n);
    if (n === 1 && (ends === 1 || ends === 9)) { assert.deepEqual(ws, []); continue; }   // no one-digit prime ends in 1 or 9
    assert.ok(ws.length >= 1, `ending ${ends}, ${n} digits`);
    for (const w of ws) {
      const u = Qn.parse(terms(ends, w).ruler);
      assert.equal(Qn.floor(u), Qn.floor(digitLevel(10n ** BigInt(n - 1))), `ending ${ends}: a rung of ${n} digits`);
      assert.ok(lineType.readLength(w, lineQ) < 20 + 2 * n, `cheap: ${lineType.readLength(w, lineQ).toFixed(1)} bits for ${n} digits`);
    }
  }
});
