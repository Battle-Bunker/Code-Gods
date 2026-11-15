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
import { areaRung } from "../src/beginner-areas.ts";

const terms = (ends: number, s: LineState): Record<string, string> => {
  const e: Evaluation = evaluateSite(lineType, pythagoreanArea, { ends }, s, lineQ, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, "undefined" in t.value ? "—" : Qn.toWire(t.value)]));
};

test("on a rung: the area rounds down to a prime ending in k, and the tie-breaker reads that prime minus 1", () => {
  // y = −3x + 15: area 225/6 = 37½, rounded down 37 (2 digits: level 1, then (2 − 1 + 37/100)/2); side² 15² + 5² = 250; 36 and 250 share 2.
  assert.deepEqual(terms(7, mc(-3, 15)), { area: "337/200", "shared-factor": "2", "same-ending": "0" });
  // y = −(41/2)x + 41: area 1681/41 = 41 exactly (the window [41, 42) holds its left end); side² 1681 + 4 = 1685; 40 and 1685 share 5.
  assert.deepEqual(terms(1, mc(q(-41, 2), 41)), { area: "341/200", "shared-factor": "5", "same-ending": "2" });
});

test("off the ladder: minus the distance to the nearest window [p, p + 1), and the tie-breaker reads that window's prime", () => {
  // Area 37½ for ending 1: 5½ above [31, 32), 3½ below [41, 42).
  assert.deepEqual(terms(1, mc(-3, 15)), { area: "-7/2", "shared-factor": "10", "same-ending": "0" });
  // y = −21x + 42: area 1764/42 = 42, the open end of [41, 42): distance 0, still off the ladder; side² 1764 + 4; 40 and 1768 share 8.
  assert.deepEqual(terms(1, mc(-21, 42)), { area: "0", "shared-factor": "8", "same-ending": "0" });
  // y = −x + 2: area 2, below the smallest prime ending in 9: 17 below [19, 20); side² 8; 18 and 8 share 2.
  assert.deepEqual(terms(9, mc(-1, 2)), { area: "-17", "shared-factor": "2", "same-ending": "0" });
});

test("no triangle, no score: a level line, a line through (0, 0), a vertical line", () => {
  for (const s of [mc(0, 5), mc(3, 0), { lines: [{ a: 1n, b: 0n, c: -4n }] } as LineState]) assert.deepEqual(terms(3, s), { area: "—", "shared-factor": "—", "same-ending": "—" });
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

test("the candidate same-ending (undealt): trailing digits the height's whole part shares with the area's prime", () => {
  // y = −(41/2)x + 41: area 41 on the rung 41, height 41: both digits match.
  assert.equal(terms(1, mc(q(-41, 2), 41))["same-ending"], "2");
  // y = −(41/2)x + 11 for ending 1: area 121/41 → 2, off the ladder, nearest prime 11; height 11: both digits match.
  assert.equal(terms(1, mc(q(-41, 2), 11))["same-ending"], "2");
  // y = −3x + 15 for ending 7: height 15, prime 37: the last digits 5 and 7 differ.
  assert.equal(terms(7, mc(-3, 15))["same-ending"], "0");
});

test("stepping up the ladder restarts the tie-breaker (design-principles.md row 3)", () => {
  // y = −11x + 53: area 2809/22 = 127.7 → 127 (3 digits: level 2, then 127/1000/3); side² 2809·122/121 = 2832.2 → 2832; 126 and 2832 share 6.
  assert.deepEqual(terms(7, mc(-11, 53)), { area: "6127/3000", "shared-factor": "6", "same-ending": "0" });
  // One shift up by 2: area 3025/22 = 137.5 → 137, a higher rung; side² 3025 + 25 = 3050; 136 and 3050 share only 2.
  assert.deepEqual(terms(7, mc(-11, 55)), { area: "6137/3000", "shared-factor": "2", "same-ending": "0" });
});

test("dealt: the four endings, each card a child can act on in under 30 words", () => {
  assert.deepEqual(pythagoreanArea.dealable(lineQ), [{ ends: 1 }, { ends: 3 }, { ends: 7 }, { ends: 9 }]);
  for (const p of pythagoreanArea.dealable(lineQ)) {
    const card = pythagoreanArea.card(p, "shared-factor");
    assert.ok(card.split(/\s+/).length < 30, `${card.split(/\s+/).length} words: ${card}`);
    assert.doesNotMatch(card, /level/i);
    assert.match(card, /Bigger is better, each extra digit counts for less/);
    assert.match(card, new RegExp(`prime ending in ${p.ends}`));
  }
});

test("rungs are exact primes for big areas: 243424875139476387348923089 has no factor below 10^5 and is no rung", async () => {
  const { areaRung } = await import("../src/beginner-areas.ts");
  assert.ok(Qn.sign(areaRung(q(243424875139476387348923089n), 9).u) <= 0);
  assert.deepEqual(areaRung(q(2003496914728200718921177n), 7).u, digitLevel(2003496914728200718921177n));   // a 25-digit prime: level 6
  assert.equal(Math.floor(Qn.toNumber(digitLevel(2003496914728200718921177n))), 6);
});

test("witnesses for the tail cap: lines whose area rounds down to an n-digit prime ending in k", async () => {
  const { areaWitness } = await import("../src/beginner-areas.ts");
  for (const ends of [1, 3, 7, 9]) for (const n of [2, 5, 12]) {
    const ws = areaWitness({ ends }, n);
    assert.ok(ws.length > 0, `ending ${ends}, ${n} digits`);
    for (const w of ws) {
      const area = terms(ends, w).area;   // on a rung: digitLevel of an n-digit prime
      const u = Qn.toNumber(Qn.parse(area));
      assert.ok(u > 0, `ending ${ends}, ${n} digits: ${area}`);
    }
  }
});

test("huge areas evaluate quickly: past 60 digits a miss is graded by the nearest number ending in k, and a rung is still exact", () => {
  const big = q((10n ** 200n + 1n) ** 2n, 4n);   // the area of y = 2x + (10^200 + 1): 401 digits
  for (const k of [1, 3, 7, 9]) {
    const t = performance.now();
    const { u } = areaRung(big, k);
    assert.ok(performance.now() - t < 300, `ending ${k}: ${(performance.now() - t).toFixed(0)} ms`);
    assert.ok(Qn.sign(u) <= 0, "a miss stays below every rung");
    assert.ok(Qn.cmp(u, q(-5)) >= 0, "graded by the nearest number ending in k: at most 5 away, less a half");
  }
  // A 61-digit prime ending in 7 is still a rung, at its level of digits.
  const p = 10n ** 60n + 7n;   // 10^60 + 7 is prime
  const r = areaRung(q(p), 7);
  assert.equal(r.p, p);
  assert.deepEqual(r.u, digitLevel(p));
});
