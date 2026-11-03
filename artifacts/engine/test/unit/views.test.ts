// The per-god object read model's numbers (convex/lib/views.ts; read-architecture §4.1): each god's row of an object, its
// totals and its scatter digest, as disclosed. What would break: a row or total built on the exact others' sum while the
// game is live (a leak), a quadrant that disagrees with the panel's filters, totals that drift from the observation's
// self.score, or a god without a score on an object counted in its totals.
import test from "node:test";
import assert from "node:assert/strict";
import { digestsOf, godTotalsOf, quadrantOf, viewRowOf } from "../../convex/lib/views.ts";

const s = (god: string, netBits: number) => ({ god, ordinal: 1, rewardBits: netBits, netBits });
// a: own 3, others 2 + (-1) = 1; b: own -2, others 5 + 0 = 5; c: own 4, others -3 + -1 = -4.
const objects = [
  { value: 1, version: 0, scores: [s("ada", 3), s("bo", 2), s("cy", -1)], noise: 0.5 },
  { value: 2, version: 3, scores: [s("ada", -2), s("bo", 5), s("cy", 0)], noise: -1 },
  { value: 3, version: 1, scores: [s("ada", 4), s("bo", -3), s("cy", -1)] },
];

test("a god's row: own bits exact, the others' sum with the live noise, payoff on the disclosed sum; exact once ended", () => {
  // Hand: live, a's others = 1 + 0.5 = 1.5, payoff 3 × 1.5 = 4.5.
  assert.deepEqual(viewRowOf(objects[0], "ada", true), { ordinal: 1, rewardBits: 3, netBits: 3, peerNetBits: 1.5, peerCare: 1.5, payoff: 4.5, quadrant: "contested" });
  assert.deepEqual(viewRowOf(objects[0], "ada", false), { ordinal: 1, rewardBits: 3, netBits: 3, peerNetBits: 1, peerCare: 1, payoff: 3, quadrant: "contested" });
  // b: others 5 - 1 = 4 live, own -2 → payoff -8, a bargaining chip.
  assert.deepEqual(viewRowOf(objects[1], "ada", true), { ordinal: 1, rewardBits: -2, netBits: -2, peerNetBits: 4, peerCare: 4, payoff: -8, quadrant: "chips" });
  // c: nobody else cares (others -4): payoff 0, neither contested nor a chip.
  assert.equal(viewRowOf(objects[2], "ada", true)!.quadrant, "other");
  assert.equal(viewRowOf(objects[2], "ada", true)!.payoff, 0);
  assert.equal(viewRowOf(objects[0], "dee", true), null, "a god without a score has no row");
});

test("quadrants are the panel's filters: contested is exactly payoff > 0", () => {
  assert.equal(quadrantOf(1, 1), "contested");
  assert.equal(quadrantOf(0, 1), "chips");
  assert.equal(quadrantOf(-1, 1), "chips");
  assert.equal(quadrantOf(1, 0), "other");
  assert.equal(quadrantOf(-1, 0), "other");
});

test("totals and digests per roster god, in object order", () => {
  const [ada, bo] = godTotalsOf(["ada", "bo"], objects, true);
  // Hand, ada live: payoffs 4.5, -8, 0 → score -3.5; own 3 - 2 + 4 = 5; others 1.5 + 4 + (-4) = 1.5.
  assert.deepEqual(ada, { godId: "ada", objectCount: 3, score: -3.5, sumOwnNetBits: 5, sumPeerNetBits: 1.5, contested: 1, chips: 1 });
  // bo live: a others 3 - 1 + 0.5 = 2.5 → 2 × 2.5 = 5; b others -2 + 0 - 1 = -3 → 0; c others 4 - 1 = 3 → -3 × 3 = -9.
  assert.deepEqual(bo, { godId: "bo", objectCount: 3, score: -4, sumOwnNetBits: 4, sumPeerNetBits: 2.5, contested: 1, chips: 1 });
  const [d] = digestsOf(["ada"], objects, false);
  assert.deepEqual(d, { godId: "ada", own: [3, -2, 4], peer: [1, 5, -4] });
});
