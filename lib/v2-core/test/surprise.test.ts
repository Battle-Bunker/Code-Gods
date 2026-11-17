import { test } from "node:test";
import assert from "node:assert/strict";
import { argBits, universalBits, infoSize, namingBits, turnCost, turnSurprise } from "../src/surprise.ts";

test("information size and codes", () => {
  assert.equal(infoSize(0), 0);
  assert.equal(infoSize(1), 1);
  assert.equal(infoSize(-3), 2);
  assert.ok(Math.abs(infoSize(10n ** 30n) - 30 * Math.log2(10)) < 1e-9);
  // Rissanen: log2 c + log2 n + log2 log2 n + … (positive terms), c = 2.865064
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  assert.ok([1, 2, 3, 4, 7, 8].map(universalBits).every((v, i) => near(v, [1.5186, 2.5186, 3.7680, 4.5186, 6.3897, 6.7680][i]!)));
  assert.ok(near(argBits(0, false), 1.5186));
  assert.ok(near(argBits(-3, true), 4.5186 + 1));
  assert.ok(universalBits(2n ** 100n) < 2 * 100, "grows like log2 n, not twice it");
  assert.equal(namingBits({ menuSize: 8, lensSize: 4, argBits: 3 }), 3 + 2 + 3 + 1);
});

test("holding costs nothing; up costs the stride plus λ·s/2, down the stride less λ·s/2, never below zero", () => {
  assert.equal(turnSurprise(1, [5], [5]), 0);
  const stride = 1 / (2 * Math.LN2);   // s = 1 bit (7 → 15)
  assert.ok(Math.abs(turnSurprise(1, [7], [15]) - (stride + 0.5)) < 1e-12);
  assert.ok(Math.abs(turnSurprise(1, [15], [7]) - (stride - 0.5)) < 1e-12);
  assert.equal(turnSurprise(4, [15], [7]), 0, "λ/2 past the stride: the fall is free, never paid out");
  assert.ok(Math.abs(turnSurprise(10, [7], [15]) - (stride + 5)) < 1e-12, "the toll grows with gravity");
  // A rise and a fall in one turn: the fall's credit offsets the rise's toll within the turn.
  assert.ok(Math.abs(turnSurprise(1, [7, 15], [15, 7]) - 2 * stride) < 1e-12);
});

test("a rise in one turn costs more than the same rise in several (big steps are super-linear)", () => {
  const one = turnSurprise(1, [1], [127]); // 1 → 7 bits
  let six = 0;
  for (let k = 1; k < 7; k++) six += turnSurprise(1, [2 ** k - 1], [2 ** (k + 1) - 1]);
  assert.ok(one > six * 2, `${one} vs ${six}`);
});

test("crossing zero pays the path down and up", () => {
  const plain = turnSurprise(1, [7], [-7]);
  const crossed = turnSurprise(1, [7], [-7], [true]);
  assert.ok(crossed > plain + 10);
});

test("cost is never negative over random turns", () => {
  let seed = 1;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 20000; i++) {
    const n = 1 + Math.floor(r() * 4);
    const b = Array.from({ length: n }, () => Math.round((r() - 0.5) * 2 ** (r() * 30)));
    const a = b.map((x) => (r() < 0.5 ? x : Math.round((r() - 0.5) * 2 ** (r() * 30))));
    const crossed = b.map((x, j) => Math.sign(x) * Math.sign(a[j]) < 0 && r() < 0.5);
    const c = turnCost(1, [namingBits({ menuSize: 6, lensSize: n, argBits: argBits(3, true) })], b, a, crossed);
    assert.ok(c.surprise >= 0 && c.total > 0);
  }
});

test("gravity is the game's setting: λ = 0 makes up and down cost the same; the engine has no default physics", async () => {
  assert.ok(Math.abs(turnSurprise(0, [7], [15]) - turnSurprise(0, [15], [7])) < 1e-12);
  assert.ok(turnSurprise(2, [7], [15]) - turnSurprise(2, [15], [7]) > turnSurprise(1, [7], [15]) - turnSurprise(1, [15], [7]));
  const { physicsOf, withPhysics, assertPhysics } = await import("../src/physics.ts");
  const v = { id: "x", objectType: "line", mutators: [], birthMixSteps: 1, params: {} };
  assert.throws(() => physicsOf(v), /physics settings are missing/);
  assert.throws(() => withPhysics(v, { gravity: -1, estimatorStarts: 12, sameSizeBand: 0.5, newbornBitRate: 1, largestNumber: 1000 }), /gravity/);
  assert.throws(() => assertPhysics({ gravity: 1, estimatorStarts: 1.5, sameSizeBand: 0.5, newbornBitRate: 1, largestNumber: 1000 }), /whole/);
  assert.equal(physicsOf(withPhysics(v, { gravity: 1, estimatorStarts: 12, sameSizeBand: 0.5, newbornBitRate: 1, largestNumber: 1000 })).estimatorStarts, 12);
});
