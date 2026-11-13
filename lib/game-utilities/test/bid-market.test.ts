/**
 * The pure helpers of scripts/bid-market.ts (docs/bid-phase.md). The breaks these catch: an equalising handicap that
 * leaves the holder above the target, or charges a family that is not ahead; a bidder type bidding below the minimum,
 * above the maximum, or (lowball) on more than its best family; a spread that ignores its weights.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bidsOf, equalisingByScore, equalisingByWins, spread, winThreshold } from "../scripts/bid-market.ts";

test("winThreshold: the handicap at which a win turns into a loss", () => {
  assert.equal(winThreshold(200, 150), 25);
  assert.equal(winThreshold(100, 100), -Infinity, "a tie is not a win");
  assert.equal(winThreshold(100, 180), -Infinity);
  assert.equal(winThreshold(0, 0), -Infinity);
});

test("equalisingByWins: the smallest handicap that brings the win share down to the target", () => {
  // Ten games: six won by margins worth 50, 40, 30, 20, 10 and 5 points of handicap; four lost.
  const t = [50, 40, 30, 20, 10, 5, -Infinity, -Infinity, -Infinity, -Infinity];
  const share = (h: number) => t.filter(x => x > h).length / t.length;
  assert.equal(equalisingByWins(t, 0.3), 20);
  assert.equal(share(20), 0.3);
  assert.ok(share(19.9) > 0.3, "a smaller handicap leaves the holder above the target");
  assert.equal(equalisingByWins(t, 0.6), 0, "already at the target");
  assert.equal(equalisingByWins(t, 0.9), 0, "below the target: nothing to pay");
  assert.equal(equalisingByWins(t, 0), 50);
  assert.equal(equalisingByWins([], 0.3), 0);
  assert.equal(equalisingByWins([...t].reverse(), 0.3), 20, "the order of the games does not matter");
});

test("equalisingByScore: the handicap that brings a mean score down to the reference", () => {
  assert.equal(equalisingByScore(2000, 1500), 25);
  assert.equal(equalisingByScore(1000, 1500), 0);
  assert.equal(equalisingByScore(0, 0), 0);
  assert.equal(equalisingByScore(100, -5), 100);
});

test("bidsOf: what each kind of bidder bids", () => {
  const values = { a: 24.4, b: 9, c: 1.2, d: 0.4, e: 0, f: 250 };
  assert.deepEqual(bidsOf("never", values, 0.5), {});
  assert.deepEqual(bidsOf("truthful", values, 0.5), { a: 24, b: 9, c: 1, f: 100 });
  assert.deepEqual(bidsOf("shading", values, 0.5), { a: 12, b: 5, c: 1, f: 100 });
  assert.deepEqual(bidsOf("shading", { c: 1.2 }, 0.25), {}, "a shaded bid below 1% is no bid");
  assert.deepEqual(bidsOf("lowball", { a: 24.4, b: 9 }, 0.5), { a: 1 });
  assert.deepEqual(bidsOf("lowball", { d: 0.4 }, 0.5), {}, "nothing worth a bid");
});

test("spread: range and standard deviation, weighted by holders when asked", () => {
  assert.deepEqual(spread([]), { range: 0, sd: 0 });
  const plain = spread([0.2, 0.4]);
  assert.ok(Math.abs(plain.range - 0.2) < 1e-12 && Math.abs(plain.sd - 0.1) < 1e-12);
  const weighted = spread([0.2, 0.4], [3, 1]);
  assert.ok(Math.abs(weighted.sd - Math.sqrt(0.75 * 0.05 ** 2 + 0.25 * 0.15 ** 2)) < 1e-12);
});
