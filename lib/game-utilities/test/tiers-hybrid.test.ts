/**
 * The hybrid law (src/tiers/hybrid.ts) against brute force: a small alphabet where every board can be enumerated, with
 * a global tier (lines that add up to x) on a pair base, and a tier that lives inside one unit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseLaw, conditionalTier, degenerateBoards, drawGiven, hybridLaw, liveness, mulberry32, type DisjointBase } from "../src/tiers/hybrid.ts";

const N = 4, S = 2;
/** Half-turn pairs that add up to S − 1, deducting the distance: Opposite Nines on a 3-symbol alphabet. */
const pairs: DisjointBase = {
  id: "test-pairs@1", symbols: S, cells: N * N, arity: 2,
  units: Array.from({ length: 8 }, (_, i) => [i, 15 - i]),
  score: ([a, b]) => [a + b === S - 1 ? 1 : 0, -Math.abs(a + b - (S - 1))],
};
const lineSum = (x: number) => (b: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < N; i++) {
    let row = 0, col = 0;
    for (let j = 0; j < N; j++) { row += b[i * N + j]; col += b[j * N + i]; }
    if (row === x) n++;
    if (col === x) n++;
  }
  let d1 = 0, d2 = 0;
  for (let i = 0; i < N; i++) { d1 += b[i * N + i]; d2 += b[i * N + N - 1 - i]; }
  return n + (d1 === x ? 1 : 0) + (d2 === x ? 1 : 0);
};
const baseOf = (base: DisjointBase, b: Uint8Array) =>
  base.units.map(u => base.score(u.map(i => b[i]))).reduce((a, s) => a.map((v, i) => v + s[i]));

/** Exact log2 G of every ordinal [...base, gated tier] by enumerating all S^16 boards. */
function exact(base: DisjointBase, tier: (b: Uint8Array) => number, gate: number): Map<string, number> {
  const counts = new Map<string, { o: number[]; n: number }>(), b = new Uint8Array(N * N), total = S ** (N * N);
  for (let x = 0; x < total; x++) {
    let y = x;
    for (let i = 0; i < N * N; i++) { b[i] = y % S; y = Math.floor(y / S); }
    const bo = baseOf(base, b), o = [...bo, bo[0] >= gate ? tier(b) : 0], k = o.join(","), e = counts.get(k);
    if (e) e.n++; else counts.set(k, { o, n: 1 });
  }
  const sorted = [...counts.values()].sort((p, q) => { for (let i = 0; i < p.o.length; i++) if (p.o[i] !== q.o[i]) return p.o[i] - q.o[i]; return 0; });
  const out = new Map<string, number>();
  let above = 0;
  for (let i = sorted.length - 1; i >= 0; i--) { above += sorted[i].n; out.set(sorted[i].o.join(","), Math.log2(above / total)); }
  return out;
}

test("the base law is exact and sums to 1", () => {
  const law = baseLaw(pairs);
  assert.ok(Math.abs(law.reduce((a, l) => a + l.p, 0) - 1) < 1e-12);
  assert.deepEqual(law[law.length - 1].ordinal, [8, 0]);
  assert.ok(Math.abs(law[law.length - 1].p - (1 / 2) ** 8) < 1e-15);
});

test("draws given the base have that base", () => {
  const rand = mulberry32(1);
  for (const l of baseLaw(pairs).filter((_, i) => i % 5 === 0)) for (let i = 0; i < 20; i++) assert.deepEqual(baseOf(pairs, drawGiven(pairs, l.ordinal, rand)), l.ordinal);
});

for (const [x, gate] of [[2, 6], [1, 6], [2, 0]] as const) {
  test(`hybrid law within 1 bit of brute force: lines add up to ${x}, gate ${gate}`, () => {
    const truth = exact(pairs, lineSum(x), gate);
    const law = hybridLaw(pairs, { gate, tier: lineSum(x), tierArity: 1, seed: 7, particles: 512, topParticles: 2048, topSweeps: 2 });
    let worst = 0, belowGate = 0;
    for (const [o, l] of law.levels) {
      const t = truth.get(o.join(","));
      assert.ok(t !== undefined, `level ${o.join(",")} is not attainable`);
      worst = Math.max(worst, Math.abs(l - t));
      if (o[0] < gate) { belowGate++; assert.ok(Math.abs(l - t) < 1e-9, `below the gate the level is exact: ${o.join(",")}`); }
    }
    assert.ok(worst < 1, `worst error ${worst.toFixed(2)} bits`);
    if (gate > 0) assert.ok(belowGate > 0);
    // The exact top is found.
    const top = [...truth.keys()].map(k => k.split(",").map(Number)).sort((p, q) => { for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0; }).pop()!;
    assert.deepEqual(law.levels[law.levels.length - 1][0], top);
  });
}

test("liveness: a tier that every top board maxes, and one that a uniform board maxes, are refused", () => {
  const constant = hybridLaw(pairs, { gate: 6, tier: () => 1, tierArity: 1, seed: 1 });
  const full = (b: Uint8Array) => [...baseOf(pairs, b), 1];
  assert.ok(liveness(constant, N, S, full).problems.length > 0);
  // "Zeros in the top half": the two-digit board with 0s above and 1s below maxes base and tier.
  const ones = (b: Uint8Array) => b.slice(0, 8).reduce((a, v) => a + (v === 0 ? 1 : 0), 0);
  const law = hybridLaw(pairs, { gate: 6, tier: ones, tierArity: 1, seed: 1 });
  const live = liveness(law, N, S, b => [...baseOf(pairs, b), ones(b)], { min: 0, max: 99 });
  assert.equal(live.tierTop, 8);
  assert.ok(live.problems.some(p => /uniform or two-digit/.test(p)), live.problems.join("; "));
  assert.ok(degenerateBoards(4, 2).length > 10);
});

test("conditional law at the top matches an exact count", () => {
  // At the base's top every pair adds up to 1: 2^8 boards. Count lines adding up to 2 exactly.
  const tier = lineSum(2), counts = new Map<number, number>(), b = new Uint8Array(16);
  for (let x = 0; x < 2 ** 8; x++) {
    let y = x;
    for (let i = 0; i < 8; i++) { b[i] = y % 2; b[15 - i] = 1 - b[i]; y = Math.floor(y / 2); }
    counts.set(tier(b), (counts.get(tier(b)) ?? 0) + 1);
  }
  const c = conditionalTier(pairs, [8, 0], tier, { particles: 4096, sweeps: 2, rand: mulberry32(3) });
  for (const [v, p] of c.survival) {
    let n = 0;
    for (const [k, m] of counts) if (k >= v[0]) n += m;
    assert.ok(Math.abs(Math.log2(p) - Math.log2(n / 2 ** 8)) < 0.5, `P(tier ≥ ${v[0]}) = ${p}, exact ${n / 2 ** 8}`);
  }
  assert.equal(c.survival[c.survival.length - 1][0][0], Math.max(...counts.keys()));
});
