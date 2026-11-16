/** The cabal-splitting tree families (tree-split.ts). Every expected value was worked by hand. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, rng, scoreToWire, spaceHas, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { agreeingDigits, isqrt, lineQ, lineType, nearOrigin, rootTilt, surdIntercept, treeSplitFamilies, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const f = Qn.q;
const tuple = <P,>(fam: RuleFamily<LineState, P>, p: P, s: LineState, tb: TieBreaker) => scoreToWire(evaluateSite(lineType, fam, p, s, lineQ, 0, tb).score);
const head = (x: string[] | null) => x?.[0];

test("leading digits shared with a surd: the whole part counts, leading zeros after the point do not start the count", () => {
  const t = isqrt(7n * 10n ** 160n);   // ⌊√7 × 10^80⌋
  assert.equal(agreeingDigits(f(8, 3), t), 2);       // 2.666… against 2.645…
  assert.equal(agreeingDigits(f(37, 14), t), 3);     // 2.6428…
  assert.equal(agreeingDigits(f(13229, 5000), t), 4); // 2.6458
  assert.equal(agreeingDigits(f(1, 2), t), 0);       // 0.5: the whole parts differ
});

test("Root Tilt pulls the gradient to √D; Surd Intercept the y-intercept to (a + √D)/b", () => {
  assert.equal(head(tuple(rootTilt, { D: 7 }, mc(f(37, 14), 7), "closeness>intercept-D")), "3");
  assert.equal(tuple(rootTilt, { D: 7 }, mc(f(37, 14), 7), "closeness>intercept-D")![2], "0");   // the y-intercept on 7
  assert.equal(head(tuple(rootTilt, { D: 7 }, mc(f(-37, 14), 7), "closeness")), "3");            // the sign is free
  // The golden ratio 1.6180339…: 89/55 = 1.61818… shares 4 digits; the next is 0, and the gradient 1/2 has whole part 0.
  const g = { a: 1, D: 5, b: 2 };
  assert.equal(head(tuple(surdIntercept, g, mc(f(1, 2), f(89, 55)), "closeness")), "4");
  assert.equal(tuple(surdIntercept, g, mc(f(1, 2), f(89, 55)), "closeness>next-digit")![2], "0");
  assert.equal(head(tuple(surdIntercept, g, mc(1, f(34, 21)), "closeness")), "3");   // 1.6190…
});

test("Near Origin: one over the crossing's distance, against the numbers leaving r on division by q", () => {
  const p = { q: 7, r: 3 };   // 3, 10, 17, …
  // y = 10x + 1 crosses at −1/10: 10, on the target; gradient 10 on it; y-intercept 1 whole; on the left.
  assert.deepEqual(tuple(nearOrigin, p, mc(10, 1), "closeness>west"), ["10", "0", "0"]);
  assert.deepEqual(tuple(nearOrigin, p, mc(-10, 1), "closeness>west"), ["10", "0", "-1"]);   // on the right at 1/10: 1/10 × 10
  assert.deepEqual(tuple(nearOrigin, p, mc(10, 1), "closeness>steep"), ["10", "0", "0"]);
  assert.equal(tuple(nearOrigin, p, mc(3, 0), "closeness"), null);   // through (0, 0): no score
});

test("each is on the line type, undealt, with a large space whose labels parse back", () => {
  for (const fam of treeSplitFamilies) {
    assert.ok(lineType.families.some(x => x.id === fam.id), fam.id);
    assert.ok(fam.space.size >= 200, `${fam.id}: ${fam.space.size}`);
    const r = rng(`split:${fam.id}`);
    for (let i = 0; i < 40; i++) assert.ok(spaceHas(fam.space as never, fam.space.draw(r)), fam.id);
  }
});
