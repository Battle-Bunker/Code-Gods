import assert from "node:assert/strict";
import test from "node:test";
import { HINGE_BITS, softHinge, netBits, payoff, personalView, salience, leaderboard } from "../src/scoring.ts";

const close = (actual: number, expected: number, eps = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≠ ${expected}`);
const net = (entries: Record<string, number>) => new Map(Object.entries(entries));

test("softHinge matches defence.py hinge", () => {
  // Values from lib/grid-lab/gridlab/defence.py: hinge(s) = log2(1 + 2^(s-1)) - log2(1.5).
  const reference: [number, number][] = [
    [0, 0], [1, 0.4150374992788438], [2, 0.9999999999999999], [4, 2.584962500721156],
    [10, 8.417852514885897], [-1, -0.26303440583379384],
  ];
  for (const [s, h] of reference) close(softHinge(s), h);
  assert.equal(HINGE_BITS, 1);
  close(softHinge(1000), 1000 - 1 - Math.log2(1.5), 1e-9); // no overflow, slope 1 far above the median
  let previous = -Infinity;
  for (let s = 0; s <= 20; s += 0.25) { // strictly increasing: no flat zone
    const h = softHinge(s);
    assert.ok(h > previous);
    previous = h;
  }
  assert.throws(() => softHinge(NaN));
  assert.throws(() => softHinge(Infinity));
});

test("netBits: s⁺ without a defence goal, s⁺ − w(h − E_μh) with one", () => {
  assert.equal(netBits({ rewardBits: 3.5 }, 1), 3.5);
  assert.equal(netBits({ rewardBits: 3.5 }, 0), 3.5);
  close(netBits({ rewardBits: 3, penaltyBits: softHinge(4), penaltyMeanBits: 0.6 }, 1), 1.015037499278844);
  close(netBits({ rewardBits: 3, penaltyBits: softHinge(4), penaltyMeanBits: 0.6 }, 0.5), 3 - 0.5 * (softHinge(4) - 0.6));
  assert.equal(netBits({ rewardBits: 3, penaltyBits: 2, penaltyMeanBits: 0.5 }, 0), 3); // unscored defence goal
  assert.ok(netBits({ rewardBits: 0, penaltyBits: 0, penaltyMeanBits: 0.6 }, 1) > 0); // cleaner than typical
  for (const bad of [
    { rewardBits: -1 }, { rewardBits: NaN }, { rewardBits: 1, penaltyBits: 1 },
    { rewardBits: 1, penaltyMeanBits: 1 }, { rewardBits: 1, penaltyBits: -1, penaltyMeanBits: 0 },
    { rewardBits: 1, penaltyBits: Infinity, penaltyMeanBits: 0 },
  ]) assert.throws(() => netBits(bad, 1));
  assert.throws(() => netBits({ rewardBits: 1 }, -1));
  assert.throws(() => netBits({ rewardBits: 1 }, NaN));
});

test("floored payoff matches defence.py payoff_matrix on hand-computed cases", () => {
  // S = [3, 1.5, 0.5]; gods a and c hold defence goals (h = hinge(4), hinge(0.5); E_μh = 0.6, 0.3); w = 1.
  const n = net({
    a: netBits({ rewardBits: 3, penaltyBits: softHinge(4), penaltyMeanBits: 0.6 }, 1),
    b: netBits({ rewardBits: 1.5 }, 1),
    c: netBits({ rewardBits: 0.5, penaltyBits: softHinge(0.5), penaltyMeanBits: 0.3 }, 1),
  });
  close(n.get("c")!, 0.6134091975575442);
  close(payoff(n, "a"), 2.1451895868417177);
  close(payoff(n, "b"), 2.442670045254582);
  close(payoff(n, "c"), 1.542747134259768);
  // A wrecked object for c: peers' care is floored, so nobody profits from c's negative bits.
  const wrecked = net({
    a: netBits({ rewardBits: 2, penaltyBits: 0, penaltyMeanBits: 0.6 }, 1),
    b: netBits({ rewardBits: 0.2 }, 1),
    c: netBits({ rewardBits: 0.1, penaltyBits: softHinge(9), penaltyMeanBits: 0.3 }, 1),
  });
  close(wrecked.get("c")!, -7.020662048472723);
  assert.equal(payoff(wrecked, "a"), 0);
  assert.equal(payoff(wrecked, "b"), 0);
  close(payoff(wrecked, "c"), -19.657853735723624, 1e-11);
});

test("without defence goals the payoff is exactly s_i · Σ_{j≠i} s_j", () => {
  const s = { a: 0.25, b: 1.5, c: 4, d: 0 };
  const n = net(Object.fromEntries(Object.entries(s).map(([g, bits]) => [g, netBits({ rewardBits: bits }, 1)])));
  for (const [god, own] of Object.entries(s)) {
    const others = Object.entries(s).filter(([g]) => g !== god).reduce((t, [, v]) => t + v, 0);
    assert.equal(payoff(n, god), own * others);
  }
  // Two gods always share the same payoff, whatever their bits.
  const two = net({ a: 7, b: 0.5 });
  assert.equal(payoff(two, "a"), payoff(two, "b"));
  assert.equal(payoff(net({ a: 5 }), "a"), 0); // alone: nobody else cares
});

test("negative own bits times positive peer care is a loss; negative peers never pay", () => {
  const n = net({ a: -2, b: 3, c: 1 });
  assert.equal(payoff(n, "a"), -8);
  assert.equal(payoff(n, "b"), 3 * 0);   // peers sum to −1, floored to 0
  assert.equal(payoff(n, "c"), 1 * 1);
  const allNegative = net({ a: -2, b: -3 });
  assert.equal(payoff(allNegative, "a"), 0); // no farming of mutual negatives
  assert.equal(payoff(allNegative, "b"), 0);
});

test("personalView exposes only own bits and peer aggregates", () => {
  const n = net({ a: 2, b: -1, c: 4 });
  const view = personalView(n, "a");
  assert.deepEqual(view, { netBits: 2, peerNetBits: 3, peerCare: 3, payoff: 6 });
  assert.deepEqual(Object.keys(view).sort(), ["netBits", "payoff", "peerCare", "peerNetBits"]);
  assert.deepEqual(personalView(n, "c"), { netBits: 4, peerNetBits: 1, peerCare: 1, payoff: 4 });
  assert.deepEqual(personalView(net({ a: 1, b: -3 }), "a"), { netBits: 1, peerNetBits: -3, peerCare: 0, payoff: 0 });
  // Two different peer splits with the same sum are indistinguishable to god a.
  assert.deepEqual(personalView(net({ a: 2, b: 0, c: 3 }), "a"), view);
  assert.throws(() => personalView(n, "missing"));
  assert.throws(() => personalView(net({ a: 1, b: NaN }), "a"));
});

test("salience is the public sum of net bits", () => {
  assert.equal(salience(net({ a: 2, b: -1, c: 4 })), 5);
  assert.equal(salience(new Map()), 0);
  assert.throws(() => salience(net({ a: Infinity })));
});

test("leaderboard sums payoffs over objects and preserves tied ranks", () => {
  const first = net({ a: 0.25, b: 0.5, c: 1 });
  const second = net({ a: 1, b: 0, c: 0.5 });
  const rows = leaderboard(["a", "b", "c"], [first, second]);
  assert.equal(rows.find(r => r.godId === "a")!.totalPayoff, 0.25 * 1.5 + 1 * 0.5);
  assert.deepEqual(rows.map(r => r.godId), ["c", "a", "b"]);
  const tied = leaderboard(["b", "a"], [net({ a: 0.5, b: 0.5 }), net({ a: 0.5, b: 0.5 })]);
  assert.deepEqual(tied, [
    { godId: "a", totalPayoff: 0.5, rank: 1 },
    { godId: "b", totalPayoff: 0.5, rank: 1 },
  ]);
  const three = leaderboard(["a", "b", "c"], [net({ a: 1, b: 1, c: 0 })]);
  assert.deepEqual(three.map(r => r.rank), [1, 1, 3]);
  assert.deepEqual(leaderboard(["a"], []), [{ godId: "a", totalPayoff: 0, rank: 1 }]);
  assert.throws(() => leaderboard(["a", "a"], []));
  assert.throws(() => leaderboard(["a", "z"], [first]));
});
