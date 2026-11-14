/** The disclosure noise (convex/v2/disclose.ts; v1's peerNoiseBits): a keyed function of the state, σ bits, off without a key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PEER_NOISE_BITS, disclosed, newNoiseKey, noiseAt, shownAt } from "../../convex/v2/disclose.ts";

const game = { noiseKey: newNoiseKey(), settings: {} };

test("the same state always shows the same noise; another key, another draw", () => {
  assert.equal(noiseAt(game, "1,2,3"), noiseAt(game, "1,2,3"));
  assert.notEqual(noiseAt(game, "1,2,3"), noiseAt({ ...game, noiseKey: newNoiseKey() }, "1,2,3"));
  assert.notEqual(noiseAt(game, "1,2,3"), noiseAt(game, "1,2,4"));
});

test("the noise is Gaussian with σ = peerNoiseBits (default 8)", () => {
  const xs = Array.from({ length: 20_000 }, (_, i) => noiseAt(game, `s${i}`));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.2, `mean ${mean}`);
  assert.ok(Math.abs(sd - DEFAULT_PEER_NOISE_BITS) < 0.2, `σ ${sd}`);
  const two = Array.from({ length: 5_000 }, (_, i) => noiseAt({ ...game, settings: { peerNoiseBits: 2 } }, `s${i}`));
  assert.ok(Math.abs(Math.sqrt(two.reduce((a, b) => a + b * b, 0) / two.length) - 2) < 0.1);
});

test("no noise without a key or at σ = 0; points follow the shown sum; ended games read exact", () => {
  assert.equal(noiseAt({ settings: {} }, "x"), 0);
  assert.equal(noiseAt({ ...game, settings: { peerNoiseBits: 0 } }, "x"), 0);
  assert.deepEqual(shownAt({ rarityBits: 3, want: 5 }, -7), { shownWant: -2, shownPoints: 0 });
  assert.deepEqual(shownAt({ rarityBits: 3, want: 5 }, 1), { shownWant: 6, shownPoints: 18 });
  const row = { want: 5, points: 15, shownWant: 6, shownPoints: 18 };
  assert.deepEqual(disclosed({ phase: "live" }, row), { want: 6, points: 18 });
  assert.deepEqual(disclosed({ phase: "ended" }, row), { want: 5, points: 15 });
  assert.deepEqual(disclosed({ phase: "live" }, { want: 5, points: 15 }), { want: 5, points: 15 }, "a row from before the noise");
});
