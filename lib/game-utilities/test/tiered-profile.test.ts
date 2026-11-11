/**
 * The pure parts of the tiered profile (scripts/tiered-profile.ts): where the tier sits in each composition's ordinal,
 * the headroom share, the top-tier law read off a table, and the exact enumeration of Opposite Nines' top set against
 * numbers derived by hand and against the hybrid law.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import {
  EXACT_TOP, calibrationError, exactTopFromBoards, headroomShare, ninesExactTop, sentenceCount, tierFloor, tierLayout, tierOf, topTierOf,
} from "../scripts/tiered-profile.ts";
import { conditionalTier, mulberry32, type DisjointBase } from "../src/tiers/hybrid.ts";

test("tier layout: gated and plain append the tier, unlock puts it after the capped first component", () => {
  const gated = tierLayout(3, 2, [{ gate: 6 }]), plain = tierLayout(3, 2, [{ gate: 0 }]), unlock = tierLayout(4, 2, [{ gate: 6, compose: "unlock" }]);
  assert.deepEqual([gated.compose, gated.at, gated.arity], ["gated", 2, 1]);
  assert.deepEqual([plain.compose, plain.at, plain.arity], ["plain", 2, 1]);
  assert.deepEqual([unlock.compose, unlock.at, unlock.arity], ["unlock", 1, 1]);
  assert.deepEqual(tierFloor([8, 0, 4], gated), [8, 0, 0]);
  assert.deepEqual(tierFloor([6, 4, 8, 0], unlock), [6, 0, 8, 0]);
  assert.deepEqual(tierOf([6, 4, 8, 0], unlock), [4]);
  assert.throws(() => tierLayout(2, 2, [{ gate: 6 }]));
});

test("headroom share: a tiny synthetic rule", () => {
  // A rule whose base tops out at 10 bits and whose tier adds up to 8 more (top 18): bits = base + 2 per tier point.
  const top = 18, bits = (base: number, tier: number) => base + 2 * tier;
  assert.equal(headroomShare(bits(10, 0), bits(10, 0), top), 0);          // base at its top, no tier: nothing of the 8 bits
  assert.equal(headroomShare(bits(10, 2), bits(10, 0), top), 0.5);        // half the tier
  assert.equal(headroomShare(bits(10, 4), bits(10, 0), top), 1);
  // Below the base's top the headroom is measured from that board's own floor: 3 of the 12 bits to the top.
  assert.equal(headroomShare(bits(6, 1.5), bits(6, 0), top), 0.25);
  assert.equal(headroomShare(18, 18, top), 1);                            // no headroom left
  assert.equal(headroomShare(9, 10, top), 0);                             // never negative
});

test("top-tier law read off levels, and the error against an exact law", () => {
  // log2 G levels of [base, tier]: base tops at 3; there the tier is ≥ 0 always, ≥ 1 half the time, ≥ 2 an eighth.
  const levels: [number[], number][] = [[[0, 0], 0], [[3, 0], -10], [[3, 1], -11], [[3, 2], -13]];
  const t = topTierOf(levels, 1);
  assert.deepEqual(t, [[[0], 1], [[1], 0.5], [[2], 0.125]]);
  const exact = exactTopFromBoards([0, 0, 0, 0, 1, 1, 1, 2].map(x => Uint8Array.of(x)), b => b[0]);
  assert.deepEqual(exact.survival, [[0, 1], [1, 0.5], [2, 0.125]]);
  assert.ok(calibrationError(t, exact).every(r => r.error === 0));
  const off = calibrationError([[[0], 1], [[1], 0.25]], exact);
  assert.deepEqual(off.map(r => r.error), [0, 1, null]);
  assert.equal(sentenceCount("Make nines. Each pair scores 1 point. ★ To score even higher: first get 6."), 3);
});

test("Opposite Nines at its top, exactly: lines that add up to 18", () => {
  const e = ninesExactTop("lines", 18), at = (i: number) => e.survival.find(([t]) => t === i)?.[1];
  assert.equal(e.boards, 1e8);
  // Both long diagonals pair each cell with its half-turn partner, so they always add up to 18: the tier is never below 2.
  assert.equal(e.survival[0][0], 2);
  assert.equal(e.survival[0][1], 1);
  // All ten lines: both free rows add up to 18 (rows 2 and 3 then do too) and the columns pair up, a0 + b0 = a3 + b3 and
  // a1 + b1 = a2 + b2 (column c and column 3 − c add up to 36 together). Counted here from that derivation.
  const rows: number[][] = [];
  for (let i = 0; i < 10000; i++) { const r = [Math.floor(i / 1000), Math.floor(i / 100) % 10, Math.floor(i / 10) % 10, i % 10]; if (r[0] + r[1] + r[2] + r[3] === 18) rows.push(r); }
  assert.equal(rows.length, 670);
  let all = 0;
  for (const a of rows) for (const b of rows) if (a[0] + b[0] === a[3] + b[3] && a[1] + b[1] === a[2] + b[2]) all++;
  assert.equal(at(10), all / 1e8);
  // A row adds up to 18 on 670 of the 10⁴ fillings; rows 0 and 3 are tied together (18 and 36 − 18), as are 1 and 2.
  // Lines come in tied pairs too (a row and its image, a column and its image), so the tier is even; P(no row at 18) is
  // (1 − 0.067)², so P(tier ≥ 4) is at least 1 − that.
  assert.deepEqual(e.survival.map(([t]) => t), [2, 4, 6, 8, 10]);
  assert.ok(at(4)! >= 1 - (1 - 0.067) ** 2 - 1e-12);
});

// The conditional splitting the hybrid law is made of (src/tiers/hybrid.ts), with a native tier function, against the
// exact law. Measured (docs/layered-rules-measurements/opposite-nines.md): at the top base level 1,024 particles and 2
// sweeps are 1.5 bits off at all 10 lines; the budget below (the hybrid law's top budget) is within half a bit.
test("conditionalTier agrees with the exact top law of Opposite Nines within half a bit", () => {
  const base: DisjointBase = {
    id: "nines-test@1", symbols: 10, cells: 16, arity: 2, units: Array.from({ length: 8 }, (_, i) => [i, 15 - i]),
    score: ([a, b]) => [a + b === 9 ? 1 : 0, -Math.abs(a + b - 9)],
  };
  const lines = [0, 1, 2, 3].flatMap(r => [[0, 1, 2, 3].map(c => 4 * r + c), [0, 1, 2, 3].map(c => 4 * c + r)]).concat([[0, 5, 10, 15], [3, 6, 9, 12]]);
  const tier = (b: Uint8Array) => lines.filter(l => b[l[0]] + b[l[1]] + b[l[2]] + b[l[3]] === 18).length;
  const c = conditionalTier(base, [8, 0], tier, { particles: 8192, sweeps: 4, rand: mulberry32(7) });
  const rows = calibrationError(c.survival, ninesExactTop("lines", 18));
  assert.deepEqual(rows.map(r => r.tier), [2, 4, 6, 8, 10]);
  for (const r of rows) assert.ok(r.error !== null && r.error < 0.5, `tier ${r.tier}: splitting ${r.hybrid} vs exact ${r.exact}`);
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
  assert.ok(EXACT_TOP.opposite_nines({ tiers: [{ id: "lines", x: 18, gate: 6 }] }, inst));
  assert.equal(EXACT_TOP.opposite_nines({ tiers: [{ id: "lines", x: 18, gate: 6, compose: "unlock" }] }, inst), null);
});

