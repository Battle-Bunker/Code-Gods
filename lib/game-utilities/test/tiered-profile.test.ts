/**
 * The pure parts of the tiered profile (scripts/tiered-profile.ts): where the tier sits in each composition's ordinal,
 * the headroom share, the top-tier law read off a table, and the exact enumeration of Opposite Nines' top set against
 * numbers derived by hand and against the hybrid law.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import {
  EXACT_TOP, calibrationError, courtTopSample, exactTopFromBoards, headroomShare, mirrorExactTop, mirrorQualifying, ninesExactTop, sentenceCount, tierFloor,
  tierLayout, tierOf, topTierOf, threesCheckCard, threesTopCounts, twoPairExactTop, twoPairTopCounts, midLevelCheck,
} from "../scripts/tiered-profile.ts";
import { context, evaluator, family } from "../src/catalog.ts";
import { objectType } from "@workspace/game-types";
import { gridSpec } from "../src/families/grid/_util.ts";
import { withTiers } from "../src/families/grid/tiers.ts";
import { threesTiers } from "../src/families/grid/beginner/crosswise_threes.ts";
import { courtScore } from "../src/families/grid/layered/royal_court.ts";
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

test("Mirrormancer at its top, in closed form, against brute force and the family's own count", () => {
  // 3 lines, 6 mirrors, 2 of them qualifying: enumerate the 216 top boards.
  const counts = [0, 0, 0];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) counts[new Set([a, b, c].filter(m => m < 2)).size]++;
  const small = mirrorExactTop(2, 6, 3);
  assert.equal(small.boards, 216);
  assert.deepEqual(small.survival, [[0, 1], [1, (counts[1] + counts[2]) / 216], [2, counts[2] / 216]]);
  // 4×4 digits: 18 mirrors hold exactly two ys, and four different ones fill 18·17·16·15 of the 10⁸ top boards.
  assert.equal(mirrorQualifying("holding", { y: 7 }), 18);
  assert.deepEqual([7, 8, 9].map(x => mirrorQualifying("halves", { x })), [8, 8, 10]);
  assert.equal(mirrorQualifying("other", {}), null);
  const e = mirrorExactTop(18);
  assert.equal(e.boards, 1e8);
  assert.equal(e.survival.at(-1)![1], 18 * 17 * 16 * 15 / 1e8);
  assert.ok(Math.abs(e.survival[1][1] - (1 - 0.82 ** 4)) < 1e-12);
});

test("Kings and Subjects at its top: the sample draws four courts and tallies the tier", () => {
  const boxes = [[0, 1, 4, 5], [2, 3, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]];
  let k = 0;
  const s = courtTopSample(board => {
    for (const cells of boxes) assert.deepEqual([...courtScore(cells.map(c => board[c]), 20).score], [1, 0]);
    return k++ % 4 === 0 ? 1 : 0;
  }, 400);
  assert.equal(s.boards, 400);
  assert.deepEqual(s.survival, [[0, 1], [1, 0.25]]);
  assert.deepEqual(s.hits, [[0, 400], [1, 100]]);
});


test("Two Pair at its top, exactly: the ring of four links over the 45⁴ choices of number pairs", () => {
  const c = twoPairTopCounts();
  assert.equal(c.boards, 45 ** 4);
  // Every choice of four number pairs is counted once, for the links themselves and for linking through one number.
  assert.equal(c.links.reduce((a, b) => a + b, 0), c.boards);
  assert.equal(c.via.reduce((a, b) => a + b, 0), c.boards);
  // All four borders link when the four boxes are a b / b c / c d / d a, and 77,760 of the choices are (docs: 5.72 bits).
  assert.equal(c.links[4], 77_760);
  assert.equal(c.via[4], 4_104);
  assert.equal((-Math.log2(c.links[4] / c.boards)).toFixed(2), "5.72");
  // A sum tier's histogram is a subset of the links': a link with a total is a link.
  for (const x of [14, 28, 36]) {
    const h = c.sums.get(x)!;
    for (let k = 1; k <= 4; k++) assert.ok(h.slice(k).reduce((a, b) => a + b, 0) <= c.links.slice(k).reduce((a, b) => a + b, 0), `x=${x} k=${k}`);
  }
  // Odd totals are dead: a link's eight numbers are 4a + 2b + 2c.
  assert.deepEqual(c.sums.get(15), [c.boards, 0, 0, 0, 0]);
  const top = twoPairExactTop("linkSums", 14)!;
  assert.equal(top.survival[0][1], 1);
  assert.ok(top.survival.at(-1)![1] > 0 && top.survival.at(-1)![1] < 1e-4, "the top level is rare");
  assert.equal(twoPairExactTop("equalRoads", 3), null, "roads read arrangements the count cannot see");
});

test("Crosswise Threes at its top: the sample counts every total in one pass, and the card agrees with the count", () => {
  for (const n of [500, 2000]) {
    const c = threesTopCounts(n, 7);
    // Every board is counted exactly once at every total, for both kinds of unit.
    for (const counts of [c.lines, c.squares]) {
      for (let x = 0; x <= 36; x++) {
        const row = Array.from({ length: 11 }, (_, k) => counts[x * 11 + k]);
        assert.equal(row.reduce((a, b) => a + b, 0), n, `every board is counted at x=${x}`);
      }
    }
    // There are 10 lines and 9 squares on a board, so that is what the totals share out.
    const spread = (counts: Float64Array) => Array.from({ length: 37 }, (_, x) => Array.from({ length: 11 }, (_, k) => k * counts[x * 11 + k]).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
    assert.equal(spread(c.lines), 10 * n);
    assert.equal(spread(c.squares), 9 * n);
  }
  // The card reads the same tier the count does, on boards the sampler draws, for both kinds and several totals.
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
  const f = family("crosswise_threes"), ctx = context(inst), codec = objectType(inst.objectType).codec(inst), col = new Uint8Array(16);
  for (const v of [{ id: "lines", x: 12 }, { id: "lines", x: 17 }, { id: "squares", x: 18 }]) {
    const params = withTiers(threesTiers, {}, [v], gridSpec(ctx));
    const ev = evaluator({ familyId: f.id, params }, inst);
    const checked = threesCheckCard(v.id as "lines" | "squares", v.x, board => ev(codec.encode({ size: 4, sym: board, col } as never)), 150);
    assert.equal(checked, 150, `${v.id} x=${v.x}`);
  }
  // A draw whose tier the count cannot read is refused rather than silently compared.
  assert.throws(() => threesCheckCard("lines", 12, () => [6, 0, 99], 1), /the card reads 99/);
  assert.throws(() => threesCheckCard("lines", 12, () => [5, 0, 0], 1), /scores 5,0,0/);
});

test("a table at one base level between the gate and the top, against exact draws of that level", () => {
  // Three one-cell units over two symbols, each scoring its own symbol: B is the number of 1s, binomial(3, ½).
  const base: DisjointBase = {
    id: "mid@1", symbols: 2, cells: 3, arity: 1, units: [[0], [1], [2]], score: ([s]) => [s],
  };
  // The tier is "cell 0 shows a 1", so among the three boards with B = 1 exactly one scores it: P(I ≥ 1 | B = 1) = ⅓.
  const tier = (board: Uint8Array) => board[0];
  // A table that states that law exactly: G(b, i) = P(B > b) + P(B = b) · P(I ≥ i | B = b), stored as −log2 G.
  const bits = (g: number) => -Math.log2(g);
  const table = {
    levels: [[[1, 0], bits(0.5 + 0.375)], [[1, 1], bits(0.5 + 0.375 / 3)], [[2, 0], bits(0.125 + 0.375)], [[3, 0], bits(0.125)]],
  } as unknown as Parameters<typeof midLevelCheck>[1];
  const m = midLevelCheck(base, table, tier, 1, 60_000, 11, 0)!;
  assert.deepEqual([...m.base], [1], "the commonest level at or above the gate");
  assert.equal(m.index, 1);
  assert.equal(m.levels, 4);
  assert.ok(Math.abs(m.pBase - 0.375) < 1e-12);
  const one = m.rows.find(r => r.tier === 1)!;
  assert.ok(Math.abs(one.table! - -Math.log2(1 / 3)) < 1e-9, `the table's own conditional law: ${one.table}`);
  assert.ok(Math.abs(one.sample - -Math.log2(1 / 3)) < 0.05, `exact draws agree: ${one.sample}`);
  assert.ok(m.maxError < 0.05, `max error ${m.maxError}`);
  assert.equal(Math.abs(m.rows.find(r => r.tier === 0)!.sample), 0, "every board has tier ≥ 0");
  // A table that is wrong by a factor of 4 at that level reads as 2 bits out, which is what the check is for.
  const wrong = { levels: [[[1, 0], bits(0.875)], [[1, 1], bits(0.5 + 0.375 / 12)]] } as unknown as Parameters<typeof midLevelCheck>[1];
  const bad = midLevelCheck(base, wrong, tier, 1, 60_000, 11, 0)!;
  assert.ok(Math.abs(bad.rows.find(r => r.tier === 1)!.error! - 2) < 0.05, `off by two bits: ${bad.rows.find(r => r.tier === 1)!.error}`);
  // One attainable level at or above the gate is not a middle at all.
  assert.equal(midLevelCheck(base, table, tier, 3, 100, 11, 0), null);
});
