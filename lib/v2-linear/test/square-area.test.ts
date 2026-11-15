/**
 * Square Area as a ladder (beginner-areas.ts): the triangle's area, rounded down, on a square number ending in d (bigger
 * is better, in levels of digits); the tie-breaker reads that square's root. Expectations worked by hand from the
 * card: area = c²/(2|m|) and the x-crossing −c/m for y = mx + c.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, type Evaluation } from "@workspace/v2-core";
import { digitLevel, lineQ, lineType, pythagoreanArea, squareArea, squareWitness, type LineState } from "../src/index.ts";
import { lineClash } from "../src/seating.ts";
import { mc } from "./helpers.ts";

const terms = (ends: number, s: LineState, near = false): Record<string, string> => {
  const e: Evaluation = evaluateSite(lineType, squareArea, near ? { ends, round: "nearest" } : { ends }, s, lineQ, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, "undefined" in t.value ? "—" : Qn.toWire(t.value)]));
};

test("on a rung: the area rounds down to a square ending in d, and the tie-breaker reads its root plus 1", () => {
  // y = −2x + 26: crosses at 13, area 26·13/2 = 169 = 13², ending in 9 (3 digits: level 2, then 169/1000/3); 14 and 13 share 1.
  assert.deepEqual(terms(9, mc(-2, 26)), { square: "6169/3000", "shared-factor": "1" });
  // y = −(169/98)x + 169/7: crosses at 14, area 169 exactly; 14 and 14 share 14.
  assert.deepEqual(terms(9, mc(q(-169, 98), q(169, 7))), { square: "6169/3000", "shared-factor": "14" });
  // y = −2x + 18: area 81 = 9², ending in 1 (2 digits: level 1, then (1 + 81/100)/2); 10 and 9 share 1.
  assert.deepEqual(terms(1, mc(-2, 18)), { square: "381/200", "shared-factor": "1" });
});

test("off the ladder: minus the distance to the nearest window [r², r² + 1), and the tie-breaker reads that window's root", () => {
  // y = −x + 13: area 84½; for ending 9 the windows [49, 50) and [169, 170): 34½ above the first, 84½ below the second.
  assert.deepEqual(terms(9, mc(-1, 13)), { square: "-69/2", "shared-factor": "1" });   // 8 and 13 share 1
  // y = −x/2 + 13: crosses at 26, area 169, on 13² for ending 9; for ending 1 the windows [121, 122) (47 below the area)
  // and [361, 362) (192 above): −47; 12 and 26 share 2.
  assert.deepEqual(terms(1, mc(q(-1, 2), 13)), { square: "-47", "shared-factor": "2" });
});

test("no triangle, no score: a level line, a line through (0, 0), a vertical line", () => {
  for (const s of [mc(0, 5), mc(3, 0), { lines: [{ a: 1n, b: 0n, c: -4n }] } as LineState]) assert.deepEqual(terms(9, s), { square: "—", "shared-factor": "—" });
});

test("no top: y = −2x + 2r has area r², so every square ending in d is a rung, a bigger one higher, in levels of digits", () => {
  let last = -Infinity;
  for (const r of [13n, 1003n, 1000003n, 10000000000003n]) {
    const u = terms(9, mc(-2, q(2n * r))).square;
    assert.equal(u, Qn.toWire(digitLevel(r * r)));
    assert.ok(Qn.toNumber(Qn.parse(u)) > last);
    last = Qn.toNumber(Qn.parse(u));
  }
});

test("rounded to the nearest: the window is [r² − ½, r² + ½), so an area just under a square is on it and one ½ over is not", () => {
  // y = −2x + 2603/100: area 13.015² = 169.39, which rounds to 169 = 13²; 14 and 13 share 1.
  assert.deepEqual(terms(9, mc(-2, q(2603, 100)), true), { square: "6169/3000", "shared-factor": "1" });
  // y = −2x + 2599/100: area 12.995² = 168.87, which rounds to 169 (and down to 168, no square); 14 and 12 share 2.
  assert.deepEqual(terms(9, mc(-2, q(2599, 100)), true), { square: "6169/3000", "shared-factor": "2" });
  assert.ok(Qn.sign(Qn.parse(terms(9, mc(-2, q(2599, 100))).square)) < 0);
  // The exact square is on both: y = −2x + 26.
  assert.equal(terms(9, mc(-2, 26), true).square, "6169/3000");
  // y = −x + 13 to the nearest: area 84½, 35 above the window [48½, 49½) and 84 below [168½, 169½).
  assert.equal(terms(9, mc(-1, 13), true).square, "-35");
});

test("the ladder starts above 1: a triangle of area 1 is no rung, and its nearest window is 9² = 81 (the coordinator's trial, 15 Nov)", () => {
  // y = −2x + 2: area 1 = 1². Births are small triangles: with 1² a rung, ending 1's seats sat on it and stopped.
  assert.equal(terms(1, mc(-2, 2)).square, "-80");
  assert.equal(terms(1, mc(-2, 2), true).square, "-159/2");
  assert.equal(terms(1, mc(-2, 18)).square, "381/200");   // 81 = 9² still is one
});

test("a window, not a point: the area may be up to 1 over the square", () => {
  // y = −2x + c with c = 26 + 1/20: area (c/2)² = 13.025² = 169.65…, still on 13².
  assert.equal(terms(9, mc(-2, q(521, 20))).square, "6169/3000");
  // c = 26 + 1/10: 13.05² = 170.30, past the window: 0.30… off.
  assert.ok(Qn.sign(Qn.parse(terms(9, mc(-2, q(261, 10))).square)) < 0);
});

test("stepping up the ladder restarts the tie-breaker (design-principles.md row 3)", () => {
  // On 13² the x-crossing 14 shares all of 14; keeping it at 14 on 23² (c = 529/7) shares only 2 with 24.
  assert.deepEqual(terms(9, mc(q(-169, 98), q(169, 7))), { square: "6169/3000", "shared-factor": "14" });
  assert.deepEqual(terms(9, mc(q(-529, 98), q(529, 7))), { square: "6529/3000", "shared-factor": "2" });
  // On 23² the best x-crossing is 24 (c = 529/12): 24 shares 24.
  assert.deepEqual(terms(9, mc(q(-529, 288), q(529, 12))), { square: "6529/3000", "shared-factor": "24" });
});

test("witnesses for the tail cap: cheap lines whose area rounds down to an n-digit square ending in d", () => {
  for (const ends of [1, 9]) for (const n of [1, 2, 3, 6, 12, 30]) {
    const ws = squareWitness({ ends }, n);
    // Below 4 digits a witness may be missing.
    if (n < 4 && !ws.length) continue;
    assert.ok(ws.length >= 1, `ending ${ends}, ${n} digits`);
    for (const w of ws) {
      const u = Qn.parse(terms(ends, w).square);
      assert.equal(Qn.floor(u), Qn.floor(digitLevel(10n ** BigInt(n - 1))), `ending ${ends}: a rung of ${n} digits`);
      assert.ok(lineType.readLength(w, lineQ) < 20 + 2 * n, `cheap: ${lineType.readLength(w, lineQ).toFixed(1)} bits for ${n} digits`);
    }
  }
});

test("dealt: the four instances, each card plain sentences a beginner can act on, the main one under 30 words", () => {
  assert.deepEqual(squareArea.dealable(lineQ), [{ ends: 1 }, { ends: 9 }, { ends: 1, round: "nearest" }, { ends: 9, round: "nearest" }]);
  for (const p of squareArea.dealable(lineQ)) {
    const main = squareArea.main.sentence(p), card = squareArea.card(p, "shared-factor");
    assert.ok(main.split(/\s+/).length < 30, `${main.split(/\s+/).length} words: ${main}`);
    assert.doesNotMatch(card, /level/i);
    assert.match(main, /^The area of the triangle the line cuts off the axes, rounded (down|off), should be a square above 1 ending in [19]\./);
    assert.match(main, /Bigger is better; extra digits count less/);
    assert.match(card, /Tie-breaker: That square's root plus 1 and the x-crossing's whole part should share as big a factor as possible\./);
  }
  assert.equal(squareArea.keepsParams, true);
});

test("Square Area and Pythagorean Area read one number and never share a rung: a square is never a prime", () => {
  for (let c = 1; c <= 80; c++) for (const m of [-1, -2, -3, q(-1, 2), q(-2, 3)]) {
    const s = mc(m, c);
    const sq = Qn.toNumber(Qn.parse(terms(9, s).square)) > 0;
    const py = evaluateSite(lineType, pythagoreanArea, { ends: 3 }, s, lineQ, 0, null).terms[0]!.value;
    assert.ok(!(sq && "n" in py && Qn.sign(py) > 0), `y = ${m}x + ${c}`);
  }
  assert.equal(lineClash({ family: "square-area", params: { ends: 9 } }, { family: "pythagorean-area", params: { ends: 9 } }), false);
});

test("seating: one ending rounded down and to the nearest is a forbidden pair (they share every exact square)", () => {
  assert.equal(lineClash({ family: "square-area", params: { ends: 9 } }, { family: "square-area", params: { ends: 9, round: "nearest" } }), true);
  assert.equal(lineClash({ family: "square-area", params: { ends: 1, round: "nearest" } }, { family: "square-area", params: { ends: 1 } }), true);
  assert.equal(lineClash({ family: "square-area", params: { ends: 1 } }, { family: "square-area", params: { ends: 9, round: "nearest" } }), false);
});
