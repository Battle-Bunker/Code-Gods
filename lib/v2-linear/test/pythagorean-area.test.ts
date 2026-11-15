/**
 * Pythagorean Area as a ladder (beginner-areas.ts): the triangle's area, rounded down, on a prime ending in k (bigger is
 * better); the tie-breaker reads that prime. Expectations worked by hand from the card: area = c²/(2|m|) and the slanted
 * side squared = c² + (c/m)² for y = mx + c.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, type Evaluation } from "@workspace/v2-core";
import { digitLevel, lineQ, lineType, pythagoreanArea, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const terms = (ends: number, s: LineState): Record<string, string> => {
  const e: Evaluation = evaluateSite(lineType, pythagoreanArea, { ends }, s, lineQ, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, "undefined" in t.value ? "—" : Qn.toWire(t.value)]));
};

test("on a rung: the area rounds down to a prime ending in k, and the tie-breaker reads that prime minus 1", () => {
  // y = −3x + 15: area 225/6 = 37½, rounded down 37 (2 digits: level 1, then (2 − 1 + 37/100)/2); side² 15² + 5² = 250; 36 and 250 share 2.
  assert.deepEqual(terms(7, mc(-3, 15)), { area: "337/200", "shared-factor": "2" });
  // y = −(41/2)x + 41: area 1681/41 = 41 exactly (the window [41, 42) holds its left end); side² 1681 + 4 = 1685; 40 and 1685 share 5.
  assert.deepEqual(terms(1, mc(q(-41, 2), 41)), { area: "341/200", "shared-factor": "5" });
});

test("off the ladder: minus the distance to the nearest window [p, p + 1), and the tie-breaker reads that window's prime", () => {
  // Area 37½ for ending 1: 5½ above [31, 32), 3½ below [41, 42).
  assert.deepEqual(terms(1, mc(-3, 15)), { area: "-7/2", "shared-factor": "10" });
  // y = −21x + 42: area 1764/42 = 42, the open end of [41, 42): distance 0, still off the ladder; side² 1764 + 4; 40 and 1768 share 8.
  assert.deepEqual(terms(1, mc(-21, 42)), { area: "0", "shared-factor": "8" });
  // y = −x + 2: area 2, below the smallest prime ending in 9: 17 below [19, 20); side² 8; 18 and 8 share 2.
  assert.deepEqual(terms(9, mc(-1, 2)), { area: "-17", "shared-factor": "2" });
});

test("no triangle, no score: a level line, a line through (0, 0), a vertical line", () => {
  for (const s of [mc(0, 5), mc(3, 0), { lines: [{ a: 1n, b: 0n, c: -4n }] } as LineState]) assert.deepEqual(terms(3, s), { area: "—", "shared-factor": "—" });
});

test("no top: y = −x/(2p + 1) + 1 has area p + ½, so every prime ending in k is a rung, a bigger one higher, in levels of digits", () => {
  let last = -Infinity;
  for (const p of [10007n, 1000003n, 1000000000039n]) {
    const area = terms(Number(p % 10n), mc(q(-1n, 2n * p + 1n), 1)).area;
    assert.equal(area, Qn.toWire(digitLevel(p)));
    assert.ok(Qn.toNumber(Qn.parse(area)) > last);
    last = Qn.toNumber(Qn.parse(area));
  }
  // 13 digits is level 4 (10 digits) and part of the way to level 5 (15 digits): (13 − 10 + p/10^13)/5.
  assert.equal(Math.floor(last), 4);
});

test("rounded down, the plainest triangles are no rungs: y = −x + c with c odd has area (c² − 1)/2 + ½, an even number and a half", () => {
  for (let c = 1; c <= 61; c += 2) for (const ends of [1, 3, 7, 9]) assert.ok(!(Number(terms(ends, mc(-1, c)).area) > 0), `y = −x + ${c}, ending ${ends}`);
});

test("stepping up the ladder restarts the tie-breaker (design-principles.md row 3)", () => {
  // y = −11x + 53: area 2809/22 = 127.7 → 127 (3 digits: level 2, then 127/1000/3); side² 2809·122/121 = 2832.2 → 2832; 126 and 2832 share 6.
  assert.deepEqual(terms(7, mc(-11, 53)), { area: "6127/3000", "shared-factor": "6" });
  // One shift up by 2: area 3025/22 = 137.5 → 137, a higher rung; side² 3025 + 25 = 3050; 136 and 3050 share only 2.
  assert.deepEqual(terms(7, mc(-11, 55)), { area: "6137/3000", "shared-factor": "2" });
});

test("dealt: the four endings, each card a child can act on within 30 words", () => {
  assert.deepEqual(pythagoreanArea.dealable(lineQ), [{ ends: 1 }, { ends: 3 }, { ends: 7 }, { ends: 9 }]);
  for (const p of pythagoreanArea.dealable(lineQ)) {
    const card = pythagoreanArea.card(p, "shared-factor");
    // Within 30 words without the sentence that spells out the levels' digits.
    const short = card.replace(/ Level 1 needs 1 digit, level 2 needs 3, level 3 needs 6, level 4 needs 10\./, "");
    assert.notEqual(short, card);
    assert.ok(short.split(/\s+/).length <= 30, `${short.split(/\s+/).length} words: ${short}`);
    assert.match(card, new RegExp(`prime ending in ${p.ends}`));
  }
});

test("rungs are exact primes for big areas: 243424875139476387348923089 has no factor below 10^5 and is no rung", async () => {
  const { areaRung } = await import("../src/beginner-areas.ts");
  assert.ok(Qn.sign(areaRung(q(243424875139476387348923089n), 9).u) <= 0);
  assert.deepEqual(areaRung(q(2003496914728200718921177n), 7).u, digitLevel(2003496914728200718921177n));   // a 25-digit prime: level 6
  assert.equal(Math.floor(Qn.toNumber(digitLevel(2003496914728200718921177n))), 6);
});
