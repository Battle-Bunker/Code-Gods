/** The hold-rarity mutation noise (src/noise.ts; docs/energy-model.md §8): one mutation ∝ 2^(−C). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, INT, STRING, changeCost, gridElementaryCosts, noise, noiseStep, seededRng } from "../src/index.ts";

test("grid noise changes exactly one cell's colour or symbol, colours far more often (cheaper)", () => {
  const inst = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" }), rng = seededRng("noise-grid");
  const g = GRID.spawn(inst, rng), step = noiseStep(inst);
  let colour = 0;
  const n = 4000;
  for (let k = 0; k < n; k++) {
    const h = step(g, rng) as typeof g;
    let dc = 0, ds = 0;
    for (let i = 0; i < 16; i++) { if (g.col[i] !== h.col[i]) dc++; if (g.sym[i] !== h.sym[i]) ds++; }
    assert.equal(dc + ds, 1);
    colour += dc;
  }
  const w = gridElementaryCosts(inst);
  const ratio = (2 * 2 ** -changeCost(w.colour)) / (9 * 2 ** -changeCost(w.symbol));
  assert.ok(Math.abs(colour / n - ratio / (1 + ratio)) < 0.03, `${colour / n} vs ${ratio / (1 + ratio)}`);
});

test("int noise: digit adds and multiplications, always in range; small primes are common", () => {
  const inst = INT.instantiate({ min: -2147483648, max: 2147483647 }), rng = seededRng("noise-int");
  let doubled = 0;
  for (let k = 0; k < 3000; k++) {
    const y = noise(inst, 1000, 1, rng) as number;
    assert.ok(Number.isSafeInteger(y) && y >= -2147483648 && y <= 2147483647);
    if (y === 2000) doubled++;
  }
  assert.ok(doubled > 150, `×2 is one of the cheapest mutations: ${doubled}`);
});

test("string noise sets, inserts or deletes one character; m steps compose", () => {
  const inst = STRING.instantiate({ maxLength: 16 }), rng = seededRng("noise-string");
  for (let k = 0; k < 500; k++) {
    const y = noise(inst, "hello", 1, rng) as string;
    assert.ok(Math.abs(y.length - 5) <= 1 && STRING.codec(inst).isValid(y));
  }
  assert.equal(noise(inst, "hello", 0, rng), "hello");
});
