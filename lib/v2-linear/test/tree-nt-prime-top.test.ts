/** Prime Top (tree-nt-prime-top.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, rng, scoreToWire, type TieBreaker } from "@workspace/v2-core";
import { lineQ, lineType, lineZ, presets, primeTop, primeTopNear, suffixPrimesNear, type PrimeTop } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const tuple = (p: PrimeTop, s: Parameters<typeof evaluateSite>[3], tb: TieBreaker) =>
  scoreToWire(evaluateSite(lineType, primeTop, p, s as never, lineQ, 0, tb).score);

test("primes by their final digits: the nearest, the next up and the next down; a leading 0 counts as a digit", () => {
  // Ending in 13: 13, 113, 313, 613 (213 = 3 × 71, 413 = 7 × 59 and 513 = 27 × 19 are not prime).
  assert.deepEqual(suffixPrimesNear(f(112), "13"), { at: 113n, up: 313n, down: 13n });
  assert.deepEqual(suffixPrimesNear(f(0), "13"), { at: 13n, up: 113n, down: null });
  assert.deepEqual(suffixPrimesNear(f(63), "13"), { at: 13n, up: 113n, down: null });   // a tie: the smaller
  assert.deepEqual(suffixPrimesNear(f(400), "13"), { at: 313n, up: 613n, down: 113n });
  // Ending in 07: 7 itself does not end in the two digits 07; 107 is the first.
  assert.equal(suffixPrimesNear(f(1), "07").at, 107n);
});

test("on the line type, tree-valued, in no preset; a large parameter set with a short sample to list", () => {
  assert.ok(lineType.families.some(x => x.id === "tree-nt-prime-top"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "tree-nt-prime-top")));
  assert.equal(primeTop.valuation, "tree");
  assert.equal(primeTop.dealable(lineZ).length, 0);
  assert.equal(primeTop.dealable(lineQ).length, 8);
  assert.equal(primeTop.space.size, 444 * 11);
  const r = rng("test");
  for (let i = 0; i < 200; i++) {
    const p = primeTop.space.draw(r);
    assert.deepEqual(primeTop.space.parse(primeTop.space.show(p)), p);
    assert.ok(primeTopNear(f(i, 3), p).p > 0n);   // a target exists for every drawable parameter set
  }
  assert.ok("invalid" in primeTop.space.parse({ ends: "5", over: "7" }));
  assert.ok("invalid" in primeTop.space.parse({ ends: "13", over: "1" }));
  assert.deepEqual(primeTop.space.parse({ ends: "013", over: "9" }), { ends: "013", over: 9 });
});

test("main part and closeness: the top of the nearest fraction p/d, and how far the crossing is from it", () => {
  const p = { ends: "3", over: 2 };   // targets 3/2, 13/2, 23/2, 43/2, …
  // y = −2x + 13 crosses at 13/2: on the target 13/2.
  assert.deepEqual(tuple(p, mc(-2, 13), "closeness"), ["13", "0"]);
  // y = −x + 9 crosses at 9: 13/2 is 2½ away, 23/2 is 2½ away: a tie goes to the smaller.
  assert.deepEqual(tuple(p, mc(-1, 9), "closeness"), ["13", "-5/2"]);
  // y = −x + 10 crosses at 10: 23/2 is 1½ away.
  assert.deepEqual(tuple(p, mc(-1, 10), "closeness"), ["23", "-3/2"]);
  // Ending in 13 over 7: y = x − 16 crosses at 16; 113/7 = 16 1/7 is 1/7 away.
  assert.deepEqual(tuple({ ends: "13", over: 7 }, mc(1, -16), "closeness"), ["113", "-1/7"]);
});

test("a top that divides the bottom is no target: the fraction would not be in lowest terms", () => {
  // Ending in 7 over 7: 7/7 = 1 is skipped, so the nearest target to a crossing at 1 is 17/7.
  assert.deepEqual(tuple({ ends: "7", over: 7 }, mc(1, -1), "closeness"), ["17", "-10/7"]);
  // Ending in 3 over 12: 3/12 is skipped; the first target is 13/12.
  assert.deepEqual(tuple({ ends: "3", over: 12 }, mc(4, -1), "closeness"), ["13", "-5/6"]);
});

test("the three third layers, each read from the target's mixed-number form", () => {
  const p = { ends: "13", over: 7 };
  // y = x − 16: target 113/7 = 16 1/7, leftover 1, fraction part 1/7.
  const s = mc(1, -16);
  assert.deepEqual(tuple(p, s, "closeness>leftover"), ["113", "-1/7", "-15"]);      // |16 − 1|
  assert.deepEqual(tuple(p, s, "closeness>part"), ["113", "-1/7", "-1/7"]);          // gradient 1 against 1 1/7
  assert.deepEqual(tuple(p, s, "closeness>point"), ["113", "-1/7", "-104"]);         // y(7) = −9: |9 − 113|
  assert.deepEqual(tuple(p, s, "closeness>part>leftover"), ["113", "-1/7", "-1/7", "-15"]);
  // Full marks on leftover: y = −(7/113)x + 1 crosses at 113/7 with y-intercept 1.
  assert.deepEqual(tuple(p, mc(f(-7, 113), 1), "closeness>leftover"), ["113", "0", "0"]);
  // Full marks on part: gradient 8/7 = 1 1/7, y-intercept −(8/7)(113/7) = −904/49.
  assert.deepEqual(tuple(p, mc(f(8, 7), f(-904, 49)), "closeness>part"), ["113", "0", "0"]);
  // A gradient below the fraction part is measured to the fraction part itself: 1/14 against 1/7.
  assert.deepEqual(tuple(p, mc(f(1, 14), f(-113, 98)), "closeness>part"), ["113", "0", "-1/14"]);
  // Full marks on point: through (113/7, 0) and (7, 113): gradient 113 ÷ (7 − 113/7) = −791/64.
  assert.deepEqual(tuple(p, mc(f(-791, 64), f(791 * 113, 64 * 7)), "closeness>point"), ["113", "0", "0"]);
});

test("stepping up the main part restarts each third layer: the leftover and the fraction part change with the target", () => {
  const p = { ends: "3", over: 5 };   // 3/5, 13/5 = 2 3/5, 23/5 = 4 3/5, 43/5 = 8 3/5, 53/5 = 10 3/5, 73/5, 83/5 = 16 3/5, 103/5
  assert.equal(primeTopNear(f(13, 5), p).left, 3n);
  const q7 = { ends: "7", over: 5 };  // 7/5 = 1 2/5, 17/5 = 3 2/5, 37/5 = 7 2/5
  assert.equal(primeTopNear(f(7, 5), q7).left, 2n);
  const r = { ends: "1", over: 12 };  // 11/12, 31/12 = 2 7/12, 41/12 = 3 5/12, 61/12 = 5 1/12, 71/12 = 5 11/12
  assert.deepEqual([f(11, 12), f(31, 12), f(41, 12), f(61, 12), f(71, 12)].map(x => primeTopNear(x, r).left), [11n, 7n, 5n, 1n, 11n]);
});

test("reflections keep the score; a flat line reads its height; a vertical line scores its crossing only", () => {
  const p = { ends: "13", over: 7 }, tb = "closeness>point";
  const base = tuple(p, mc(f(2, 3), -11), tb);
  assert.deepEqual(tuple(p, mc(f(-2, 3), 11), tb), base);    // y → −y
  assert.deepEqual(tuple(p, mc(f(-2, 3), -11), tb), base);   // x → −x
  assert.deepEqual(tuple(p, mc(0, 16), "closeness"), ["113", "-1/7"]);
  assert.equal(tuple(p, mc(0, 0), "closeness"), null);
  assert.deepEqual(tuple(p, abc(1, 0, -16), "closeness>leftover"), ["113", "-1/7", null]);
});

test("the card says every part; the marks draw every layer (targets on the x-axis, the point (d, p) on the plane)", () => {
  const p = { ends: "13", over: 7 };
  const card = primeTop.card(p, "closeness>leftover");
  assert.match(card, /bottom 7 whose top is a prime number ending in 13 \(13\/7, 113\/7, 313\/7, …\)/);
  assert.match(card, /Secondary: .*Third: .*113\/7 = 16 1\/7: 16 whole ones and 1 left over/);
  for (const chain of primeTop.chains) assert.ok(primeTop.card(p, chain).length > card.length / 3, chain);
  assert.equal(primeTop.chains.length, 1 + 3 + 6);
  const e = evaluateSite(lineType, primeTop, p, mc(1, -16), lineQ, 0, null);
  assert.ok(e.reads.every(r => r.rep !== "cart"), "the plane is drawn on, not read");
  const cands = e.marks.filter(m => m.kind === "candidate" && m.term === "target").map(m => (m as { ref: { args?: Record<string, string> } }).ref.args?.x);
  assert.deepEqual(cands, ["113/7", "313/7", "13/7"]);
  assert.ok(e.marks.some(m => m.kind === "measure" && m.term === "closeness" && m.from.name === "xInt"));
  for (const id of ["leftover", "part", "point"]) assert.ok(e.marks.some(m => m.kind === "focus" && m.term === id), id);
  assert.ok(e.marks.some(m => m.kind === "candidate" && m.ref.name === "heightAt" && m.ref.args?.y === "-113"));
});

test("a bump keeps some value: a unit shift or tilt from a good line moves the primary by at most one target", () => {
  const p = { ends: "3", over: 2 };
  // From y = −2x/13 + 1 (on 13/2): shift up 1 → crossing 13; tilt by 1 → gradient 11/13, crossing −13/11.
  assert.deepEqual(tuple(p, mc(f(-2, 13), 1), "closeness>leftover"), ["13", "0", "0"]);
  assert.equal(tuple(p, mc(f(-2, 13), 2), "closeness")![0], "23");    // 13 is 1½ from 23/2
  assert.equal(tuple(p, mc(f(11, 13), 1), "closeness")![0], "3");     // 13/11 is nearest 3/2
});
