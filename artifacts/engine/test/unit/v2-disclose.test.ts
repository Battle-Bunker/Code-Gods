/**
 * The disclosure noise as measurement error (convex/v2/disclose.ts; owner decision 32): every reading of the others' sum
 * is an independent Gaussian draw of variance `peerNoiseVariance` bits², never shared across players; 0 is exact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { disclosed, freshNoise, measured, newNoiseKey, objectReading, peerNoiseSigmaOf, peerNoiseVarianceOf, readingNoise, shownAt } from "../../convex/v2/disclose.ts";

const game = { noiseKey: newNoiseKey(), settings: { peerNoiseVariance: 64 } };
const stats = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, sd: Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) };
};

test("a player's reading of an object at a version is their own: stable for that version, another player's is independent", () => {
  const at = objectReading("o1", 3);
  assert.equal(readingNoise(game, "ada", at), readingNoise(game, "ada", at), "a query stays deterministic");
  assert.notEqual(readingNoise(game, "ada", at), readingNoise(game, "bo", at), "never shared across players");
  assert.notEqual(readingNoise(game, "ada", at), readingNoise(game, "ada", objectReading("o1", 4)), "a new version is a new reading");
  assert.notEqual(readingNoise(game, "ada", at), readingNoise({ ...game, noiseKey: newNoiseKey() }, "ada", at));
  // Across players at the same object version the readings are uncorrelated (the old shared draw had correlation 1).
  const pairs = Array.from({ length: 5_000 }, (_, i) => [readingNoise(game, "ada", objectReading(`o${i}`, 1)), readingNoise(game, "bo", objectReading(`o${i}`, 1))] as const);
  const r = pairs.reduce((t, [a, b]) => t + a * b, 0) / pairs.length / 64;
  assert.ok(Math.abs(r) < 0.05, `uncorrelated across players: ${r}`);
});

test("a reading has variance peerNoiseVariance (σ its root); a fresh draw differs on every call", () => {
  const { mean, sd } = stats(Array.from({ length: 20_000 }, (_, i) => readingNoise(game, "ada", `s${i}`)));
  assert.ok(Math.abs(mean) < 0.2 && Math.abs(sd - 8) < 0.2, `mean ${mean}, σ ${sd}`);
  const fresh = Array.from({ length: 20_000 }, () => freshNoise({ ...game, settings: { peerNoiseVariance: 4 } }));
  assert.ok(Math.abs(stats(fresh).sd - 2) < 0.05, `σ ${stats(fresh).sd}`);
  assert.notEqual(freshNoise(game), freshNoise(game), "asking again measures again");
  assert.deepEqual([peerNoiseVarianceOf(game), peerNoiseSigmaOf(game)], [64, 8]);
});

test("variance 0, or no key, is exact; points follow the reading, floored at 0; ended games read exact", () => {
  for (const g of [{ settings: { peerNoiseVariance: 64 } }, { ...game, settings: { peerNoiseVariance: 0 } }, { ...game, settings: {} }]) {
    assert.equal(readingNoise(g, "ada", "x"), 0);
    assert.equal(freshNoise(g), 0);
    assert.equal(peerNoiseVarianceOf(g), 0);
  }
  assert.deepEqual(measured({ ...game, settings: { peerNoiseVariance: 0 } }, { rarityBits: 3, want: 5 }), { want: 5, points: 15 });
  assert.deepEqual(shownAt({ rarityBits: 3, want: 5 }, -7), { shownWant: -2, shownPoints: 0 });
  assert.deepEqual(shownAt({ rarityBits: 3, want: 5 }, 1), { shownWant: 6, shownPoints: 18 });
  const row = { want: 5, points: 15, shownWant: 6, shownPoints: 18 };
  assert.deepEqual(disclosed({ phase: "live" }, row), { want: 6, points: 18 });
  assert.deepEqual(disclosed({ phase: "ended" }, row), { want: 5, points: 15 });
  assert.deepEqual(disclosed({ phase: "live" }, { want: 5, points: 15 }), { want: 5, points: 15 }, "a row from before the noise");
});
