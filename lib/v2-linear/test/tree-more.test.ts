/** The seven tree families of tree-index.ts. Every expected tuple below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, rng, scoreToWire, spaceHas, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { borrowedBottom, drawnStep, legRatio, lineQ, lineType, partWay, presets, quadrantSquare, smoothMixed, tower, treeMoreFamilies, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const f = Qn.q;
const tuple = <P,>(fam: RuleFamily<LineState, P>, p: P, s: LineState, tb: TieBreaker) => scoreToWire(evaluateSite(lineType, fam, p, s, lineQ, 0, tb).score);

test("Drawn Step: the multiple of 3/7 nearest the y-intercept, whole multiples left out", () => {
  const p = { u: 3, v: 7 };
  assert.deepEqual(tuple(drawnStep, p, mc(-1, f(9, 7)), "closeness>crossing"), ["3", "0", "-12/7"]);   // 9/7 = 3 × 3/7; crossing 9/7 is 12/7 from 3
  // 3 = 7 × 3/7 is whole and left out: 18/7 and 24/7 are both 3/7 away; a tie goes to the bigger.
  assert.deepEqual(tuple(drawnStep, p, mc(1, 3), "closeness"), ["8", "-3/7"]);
});

test("Leg Ratio and Quadrant Square on the triangle with the axes", () => {
  // y = −(2/3)x + 4: base 6, height 4; 10 = 5 × 2, so the 3 : 2 triangle of size 2 (sizes in halves); base 6 = 3 × 2; area 12 = 3 × 2 × 4 ÷ 2.
  assert.deepEqual(tuple(legRatio, { p: 3, q: 2, d: 2 }, mc(f(-2, 3), 4), "closeness>base"), ["2", "0", "0"]);
  assert.deepEqual(tuple(legRatio, { p: 3, q: 2, d: 2 }, mc(f(-2, 3), 4), "closeness>area"), ["2", "0", "0"]);
  // y = −3x + 12: X = 4, Y = 12, area 24 = 3/2 × 4².
  assert.deepEqual(tuple(quadrantSquare, { p: 3, q: 2 }, mc(-3, 12), "closeness>east"), ["4", "0", "0"]);
  assert.deepEqual(tuple(quadrantSquare, { p: 3, q: 2 }, mc(-3, 12), "closeness>west"), ["4", "0", "-8"]);
  // The mirror in the y-axis keeps the primary (the area's size); only the quarter third changes.
  assert.deepEqual(tuple(quadrantSquare, { p: 3, q: 2 }, mc(3, 12), "closeness>west"), ["4", "0", "0"]);
});

test("Tower and Smooth Mixed", () => {
  // y = 17/2 meets y = 2x at x = 17/4 = 4 + 1/4: n = 4. Its top as one fraction is 17; the gradient 0 has fraction part 0 (1/4 away) and bottom 1 (3 from 4).
  const t = { g: "2", u: 1, v: 0 };
  assert.deepEqual(tuple(tower, t, mc(0, f(17, 2)), "closeness>top"), ["4", "0", "-17/2"]);
  assert.deepEqual(tuple(tower, t, mc(0, f(17, 2)), "closeness>part"), ["4", "0", "-1/4"]);
  assert.deepEqual(tuple(tower, t, mc(0, f(17, 2)), "closeness>bottom"), ["4", "0", "-3"]);
  // y = x + 17/4: at x = 2 the height is 25/4 = 6 + 1/4, and 6 = 2 × 3. Two prime factors (gradient 1 is 1 away); the
  // largest is 3 (17/4 is 5/4 from 3); the crossing 17/4 is 5/4 from the divisor 3.
  const s = { k: 2, primes: [2, 3], top: 1, bottom: 4 };
  assert.deepEqual(tuple(smoothMixed, s, mc(1, f(17, 4)), "closeness>count"), ["6", "0", "-1"]);
  assert.deepEqual(tuple(smoothMixed, s, mc(1, f(17, 4)), "closeness>multiple"), ["6", "0", "-5/4"]);
  assert.deepEqual(tuple(smoothMixed, s, mc(1, f(17, 4)), "closeness>divisor"), ["6", "0", "-5/4"]);
});

test("Borrowed Bottom: the primary is the target's size, so a fine tilt moves it by about its own size (the repair)", () => {
  const p = { ends: "37", reads: "c" as const };
  // y = (3/4)x + 137/4: B = 4, the target 137/4 itself; the gradient's top 3 is 134 from 137.
  assert.deepEqual(tuple(borrowedBottom, p, mc(f(3, 4), f(137, 4)), "closeness>echo"), ["137/4", "0", "-134"]);
  // Tilt to 13/12: B = 12; 137/4 = 411/12; tops ending in 37 sharing nothing with 12: 337 (6 1/6 away), 437 (2 1/6 away).
  assert.deepEqual(tuple(borrowedBottom, p, mc(f(13, 12), f(137, 4)), "closeness"), ["437/12", "-13/6"]);
});

test("Part Way: 2/5 of the way between neighbouring squares, whole points left out", () => {
  // 59/5 = 9 + 2/5 × 7: gap 3 (9 to 16). 4 + 2/5 × 5 = 6 is whole and left out.
  assert.deepEqual(tuple(partWay, { reads: "c", ladder: "square", u: 2, v: 5 }, mc(1, f(59, 5)), "closeness"), ["3", "0"]);
  // 6 is whole and left out: 2 1/5 is 3 4/5 away, 11 4/5 is 5 4/5 away.
  assert.deepEqual(tuple(partWay, { reads: "c", ladder: "square", u: 2, v: 5 }, mc(1, 6), "closeness"), ["1", "-19/5"]);
  assert.ok("invalid" in (partWay.space.parse("reads = c, ladder = pow2, u = 1, v = 2") as object));   // every far point is whole
});

test("each is on the line type, tree-valued, in no preset, with a space whose labels parse back and chains of alternatives", () => {
  for (const fam of treeMoreFamilies) {
    assert.ok(lineType.families.some(x => x.id === fam.id), fam.id);
    assert.ok(!presets.some(p => p.rules.some(r => r.family === fam.id)), fam.id);
    assert.equal(fam.valuation, "tree");
    assert.ok(fam.space.size > 300, `${fam.id}: ${fam.space.size}`);
    assert.ok(fam.chains.length >= 4);
    const r = rng(`tree-more:${fam.id}`);
    for (let i = 0; i < 50; i++) assert.ok(spaceHas(fam.space as never, fam.space.draw(r)), fam.id);
    for (const p of fam.dealable(lineQ)) assert.ok(fam.card(p as never, fam.chains.at(-1)!).includes("Third: "), fam.id);
  }
});
