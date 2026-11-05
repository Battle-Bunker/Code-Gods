/**
 * lib/views.ts: a god's row and totals as the observation discloses them. What would break: the others' sum without
 * its live noise (an exact peer value leaks), noise kept once ended, the filters' counts disagreeing with the panel's.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { godTotalsOf, quadrantOf, viewRowOf } from "../../convex/lib/views.ts";

const s = (god: string, netBits: number) => ({ god, ordinal: 1, rewardBits: netBits, netBits });
// Hand: a has 2 bits; the others 3 + (-1) = 2, with noise 0.5 live: 2.5, payoff 2 × 2.5 = 5; exact: 2 × 2 = 4.
const o1 = { scores: [s("a", 2), s("b", 3), s("c", -1)], noise: 0.5 };
// a has -1; the others 4: a chip, payoff -4 live (noise 0).
const o2 = { scores: [s("a", -1), s("b", 4), s("c", 0)] };
// a has 5; the others -2 - 1 = -3: nobody else cares, payoff 0.
const o3 = { scores: [s("a", 5), s("b", -2), s("c", -1)] };

test("a row: own bits, the others' sum with the live noise (exact once ended), care and payoff", () => {
  assert.deepEqual(viewRowOf(o1, "a", true), { ordinal: 1, rewardBits: 2, netBits: 2, peerNetBits: 2.5, peerCare: 2.5, payoff: 5 });
  assert.deepEqual(viewRowOf(o1, "a", false), { ordinal: 1, rewardBits: 2, netBits: 2, peerNetBits: 2, peerCare: 2, payoff: 4 });
  assert.equal(viewRowOf(o1, "z", true), null);
});

test("totals: count, score, sums, contested and chips, extremes", () => {
  const [a] = godTotalsOf(["a"], [o1, o2, o3], true);
  assert.deepEqual(a, { godId: "a", objectCount: 3, score: 5 - 4 + 0, sumOwnNetBits: 2 - 1 + 5, sumPeerNetBits: 2.5 + 4 - 3, contested: 1, chips: 1,
    maxOwn: 5, maxCare: 4, maxPayoff: 5, minPayoff: -4 });
  assert.equal(quadrantOf(0, 1), "chips");
  assert.equal(quadrantOf(1, 0), "other");
});
