/**
 * Ruler as a ladder of two-prime products (beginner-areas.ts; the coordinator's declared trial, 16 Nov): the distance from
 * (0, 0) to the line, squared, rounded down, should be p·q, two different primes with the same number of digits, ending in
 * k (bigger is better, in levels of digits); its tie-breakers read p and q. Expectations worked by hand from the card:
 * distance² = c²/(m² + 1) for y = mx + c, and c²/(a² + b²) for a·x + b·y + c = 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, type Evaluation } from "@workspace/v2-core";
import { digitLevel, isqrt, lineQ, lineType, pythagoreanArea, ruler, rulerWitness, isPrime, sameLengthPrimes, nearestSameLengthEnding, smallestFactor, RHO_BUDGET, rhoFactor, type LineState } from "../src/index.ts";
import { lineClash } from "../src/seating.ts";
import { mc } from "./helpers.ts";

const terms = (ends: number, s: LineState): Record<string, string> => {
  const e: Evaluation = evaluateSite(lineType, ruler, { ends }, s, lineQ, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, "undefined" in t.value ? "—" : Qn.toWire(t.value)]));
};
const vertical = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });   // a·x + c = 0
const pair = (n: bigint) => { const r = sameLengthPrimes(n); return r ? `${r.p}×${r.q}` : null; };

test("two different primes with the same number of digits: 15 = 3 × 5 and 143 = 11 × 13 are; 121, 9991 and 33 are not", () => {
  assert.equal(pair(15n), "3×5");
  assert.equal(pair(143n), "11×13");
  assert.equal(pair(209n), "11×19");
  assert.equal(pair(121n), null);    // 11 × 11: the same prime twice
  assert.equal(pair(9991n), null);   // 97 × 103: two digits and three
  assert.equal(pair(33n), null);     // 3 × 11
  assert.equal(pair(105n), null);    // 3 × 5 × 7: three primes
  assert.equal(pair(13n), null);     // a prime
  // Exact up to 20 digits: rho finds the two primes of a 20-digit product.
  assert.equal(pair(3000000019n * 7000000001n), "3000000019×7000000001");
  assert.equal(pair(3000000019n * 3000000019n), null);
  // A brute-force check of every number below 30,000.
  for (let n = 2n; n < 30_000n; n++) {
    let s = 2n;
    while (s * s <= n && n % s !== 0n) s++;
    const t = n % s === 0n && s * s <= n ? n / s : null;
    let tPrime = t !== null && t > 1n;
    for (let d = 2n; tPrime && d * d <= t!; d++) if (t! % d === 0n) tPrime = false;
    const want = t !== null && tPrime && t !== s && String(s).length === String(t).length ? `${s}×${t}` : null;
    assert.equal(pair(n), want, String(n));
  }
});

test("the nearest such product ending in k searches outward, the lower on a tie; the smallest prime factor is exact", () => {
  assert.equal(nearestSameLengthEnding(q(0), 3), 143n);
  assert.equal(nearestSameLengthEnding(q(1000), 1), 1081n);   // 23 × 47
  assert.equal(nearestSameLengthEnding(q(1000), 9), 989n);    // 23 × 43
  assert.equal(smallestFactor(1000003n * 1000033n), 1000003n);
  assert.equal(smallestFactor(2n * 1000003n), 2n);
  assert.equal(smallestFactor(1000003n), 1000003n);
  // Past 20 digits the search stops after RHO_BUDGET steps: a product of two 13-digit primes is not split.
  const next = (n: bigint) => { while (!isPrime(n)) n++; return n; };
  const [p, r] = [next(3n * 10n ** 12n), next(7n * 10n ** 12n)];
  assert.equal(rhoFactor(p * r, 1n, RHO_BUDGET), null);
  assert.equal(sameLengthPrimes(p * r), null);
});

test("on a rung: distance² rounds down to p·q ending in k, and the tie-breakers read p and q", () => {
  // y = 2x + 54: distance² 2916/5 = 583.2 → 583 = 11 × 53 (3 digits: level 2, then 0.583/3). 11 × 2² = 44, 9 from 53.
  // 11, 65 = 5 × 13 (stepping by 54): 5. The height at x = 11 is 76, which 53 does not divide.
  assert.deepEqual(terms(3, mc(2, 54)), { ruler: "6583/3000", closeness: "9", "near-miss": "5", "reading-at-index": "0" });
  // Its mirrors keep the distance, the gradient squared and the y-intercept's size.
  assert.deepEqual(terms(3, mc(-2, 54)), terms(3, mc(2, 54)));
  assert.deepEqual(terms(3, mc(2, -54)), terms(3, mc(2, 54)));
  // y = 6x + 88: 7744/37 = 209.3 → 209 = 11 × 19; 11 × 36 = 396 is 377 from 19.
  assert.equal(terms(9, mc(6, 88)).ruler, Qn.toWire(digitLevel(209n)));
  assert.equal(terms(9, mc(6, 88)).closeness, "377");
});

test("off the ladder: minus the distance to the nearest window [N, N + 1), and the tie-breakers read that N's primes", () => {
  // y = 10: distance² 100, 43 below the window [143, 144) of 11 × 13 (ending 3); 11 × 0 is 13 from 13.
  assert.deepEqual(terms(3, mc(0, 10)), { ruler: "-43", closeness: "13", "near-miss": "3", "reading-at-index": "0" });
  // Through (0, 0): distance² 0, 143 below; a y-intercept under 1 never steps away from 11.
  assert.deepEqual(terms(3, mc(2, 0)), { ruler: "-143", closeness: "31", "near-miss": "0", "reading-at-index": "0" });
});

test("a vertical line x = k is |k| from (0, 0): its distance scores, its tie-breakers (no gradient, no y-intercept) are undefined", () => {
  // x = 44/3: distance² 1936/9 = 215.1, 46/9 above [209, 210) (11 × 19, ending 9).
  assert.deepEqual(terms(9, vertical(-3n, 44n)), { ruler: "-46/9", closeness: "—", "near-miss": "—", "reading-at-index": "—" });
  assert.notEqual(evaluateSite(lineType, ruler, { ends: 9 }, vertical(-3n, 44n), lineQ, 0, null).score, null);
});

test("no top: a level line at height ⌈s√N⌉/s has distance² in [N, N + 1), so every product is a rung, a bigger one higher", () => {
  let last = -Infinity;
  for (const N of [101n * 103n, 1009n * 1013n, 100003n * 100019n, 3000000019n * 7000000001n]) {
    const s = 2n * isqrt(N) + 2n, r = isqrt(s * s * N - 1n) + 1n;   // the least r with r² ≥ s²N
    const u = terms(Number(N % 10n), mc(0, q(r, s))).ruler;
    assert.equal(u, Qn.toWire(digitLevel(N)));
    assert.ok(Qn.toNumber(Qn.parse(u)) > last);
    last = Qn.toNumber(Qn.parse(u));
  }
  assert.equal(Math.floor(last), 5);   // 20 digits: level 5 (15 digits), part of the way to level 6 (21)
});

test("stepping up the ladder restarts the closeness climb; on a rung it climbs (design-principles.md row 3)", () => {
  // On 583 = 11 × 53 the gradient 11/5 (with the y-intercept moved to keep the rung) brings 11·m² to 53.24: 6/25 from 53.
  assert.deepEqual(terms(3, mc(q(11, 5), q(1167, 20))), { ruler: "6583/3000", closeness: "6/25", "near-miss": "3", "reading-at-index": "0" });
  // A shift up by 33 keeps the gradient 2 and reaches a higher rung, 1513 = 17 × 89: 17 × 4 = 68 is 21 from 89 (it was 9).
  assert.deepEqual(terms(3, mc(2, 87)), { ruler: "71513/30000", closeness: "21", "near-miss": "2", "reading-at-index": "0" });
  // There 11/5 is no longer close: 17 × 121/25 = 82.28, 6.72 from 89.
  assert.equal(Qn.toWire(Qn.abs(Qn.sub(Qn.mul(q(17), q(121, 25)), q(89)))), "168/25");
});

test("a turn about (0, 0) keeps the distance, so a tie-breaker can climb without leaving the rung", () => {
  // y = 2x + 54 (2x − y + 54 = 0) turned by the angle whose tangent is 3/4: x − 2y + 54 = 0, y = x/2 + 27.
  assert.deepEqual(terms(3, mc(q(1, 2), 27)), { ruler: "6583/3000", closeness: "201/4", "near-miss": "2", "reading-at-index": "0" });
});

test("the spec lead's prediction: on a 45° line with a whole y-intercept, ⌊c²/2⌋ is never such a product, and no 45° line is a rung of both Ruler and Pythagorean Area", () => {
  for (let c = 1; c <= 3000; c++) for (const ends of [1, 3, 7, 9]) {
    assert.ok(Qn.sign(Qn.parse(terms(ends, mc(-1, c)).ruler)) <= 0, `y = −x + ${c}, ending ${ends}`);
  }
  // On a 45° line distance² and the triangle's area are one number c²/2: a product is no prime, so no line is a rung of both.
  for (let s = 1n; s <= 12n; s++) for (let r = 1n; r <= 4000n; r += 7n) for (const ends of [1, 3, 7, 9]) {
    const line = mc(-1, q(r, s));
    const a = Qn.sign(Qn.parse(terms(ends, line).ruler)) > 0;
    const e = evaluateSite(lineType, pythagoreanArea, { ends }, line, lineQ, 0, null);
    const b = Qn.sign(e.terms.find(t => t.id === "area")!.value as never) > 0;
    assert.ok(!(a && b), `y = −x + ${r}/${s}`);
  }
});

test("dealt: the four endings; the main sentence is under 30 words with an example, each tie-breaker's under 20, in plain words", () => {
  assert.deepEqual(ruler.dealable(lineQ), [{ ends: 1 }, { ends: 3 }, { ends: 7 }, { ends: 9 }]);
  const words = (s: string) => s.trim().split(/\s+/).length;
  for (const p of ruler.dealable(lineQ)) {
    const main = ruler.card(p, null);
    assert.ok(words(main) < 30, `${words(main)} words: ${main}`);
    assert.match(main, /the line's closest distance to \(0, 0\)/);
    assert.match(main, new RegExp(`ending in ${p.ends}, like (\\d+) = (\\d+) × (\\d+)\\. Bigger is better\\.$`));
    const [, n, a, b] = main.match(/like (\d+) = (\d+) × (\d+)/)!;
    assert.equal(pair(BigInt(n!)), `${a}×${b}`);
    assert.equal(Number(n) % 10, p.ends);
    assert.doesNotMatch(main, /level|²/i);
  }
  // Three candidates of three forms: a closeness (dealt), a near miss and a reading at the rung's index (undealt for now).
  assert.deepEqual(ruler.tieBreakers.map(t => t.id), ["closeness", "near-miss", "reading-at-index"]);
  assert.deepEqual(ruler.tieBreakers.map(t => t.dealtOn?.(lineQ) ?? true), [true, false, false]);
  for (const t of ruler.tieBreakers) {
    const s = t.sentence({ ends: 3 });
    assert.ok(words(s) < 20, `${t.id}: ${words(s)} words: ${s}`);
    assert.doesNotMatch(s, /level|²/i, t.id);
  }
});

test("seating: Ruler and Pythagorean Area are no longer a forbidden pair (a product is never a prime)", () => {
  for (const a of [1, 3, 7, 9]) for (const b of [1, 3, 7, 9]) {
    assert.equal(lineClash({ family: "ruler", params: { ends: a } }, { family: "pythagorean-area", params: { ends: b } }), false);
  }
});

test("witnesses for the ladder's tail cap: cheap lines whose distance² rounds down to an n-digit product ending in k", () => {
  for (const ends of [1, 3, 7, 9]) for (const n of [2, 3, 5, 12, 18]) {
    const ws = rulerWitness({ ends }, n);
    if (n === 2 && ends !== 1) { assert.deepEqual(ws, []); continue; }   // 21 = 3 × 7 is the only two-digit one ending in 1, 3, 7 or 9
    assert.ok(ws.length >= 1, `ending ${ends}, ${n} digits`);
    for (const w of ws) {
      const u = Qn.parse(terms(ends, w).ruler);
      assert.equal(Qn.floor(u), Qn.floor(digitLevel(10n ** BigInt(n - 1))), `ending ${ends}: a rung of ${n} digits`);
      assert.ok(lineType.readLength(w, lineQ) < 24 + 2 * n, `cheap: ${lineType.readLength(w, lineQ).toFixed(1)} bits for ${n} digits`);
    }
  }
});
