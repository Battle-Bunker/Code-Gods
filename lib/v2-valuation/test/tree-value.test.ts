/** Tree values (tree-value.ts; owner decision 45): the chain rule down level → closeness → third. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Score } from "@workspace/v2-core";
import { buildTree, MIN_CELL, TREE_INNER_BITS, treeLookup } from "../src/index.ts";

/** Synthetic draws: level j uniform on 1…4, closeness −d with d uniform on 0…9 (d = 0 one in ten), third e in 0…4. */
function draws(): { u: Score; w: number }[] {
  const out: { u: Score; w: number }[] = [];
  for (let j = 1; j <= 4; j++) for (let d = 0; d < 10; d++) for (let e = 0; e < 5; e++) for (let r = 0; r < 10; r++) out.push({ u: [q(j), q(-d), q(e)], w: 1 });
  return out;
}

test("each part is the rarity of 'at least this good' given the parts above it, and the sum never exceeds the state's own rarity", () => {
  const t = buildTree(draws(), Infinity), look = treeLookup(t);
  assert.ok(t.cells.every(c => c.n >= MIN_CELL));
  const best = look([q(4), q(0), q(4)]);
  // P(level ≥ 4) = 1/4; P(d ≤ 0 | level 4) = 1/10; P(e ≥ 4 | level 4, d ≤ 0) = 1/5.
  assert.deepEqual(best.parts.map(x => Math.round(x * 1000) / 1000), [2, 3.322, 2.322]);
  // The bound: the state's own cell {j = 4, d = 0, e = 4} has mass 1/200 = 7.64 bits.
  assert.ok(best.bits <= -Math.log2(1 / 200) + 1e-9);
  // Level first, then closeness within it: the worst line of a level scores only that level's rarity.
  assert.equal(Math.round(look([q(3), q(-9), q(0)]).bits * 1000) / 1000, Math.round(-Math.log2(2 / 4) * 1000) / 1000);
  // A worse closeness never scores more.
  assert.ok(look([q(4), q(-1), q(4)]).bits < best.bits);
});

test("each part below the level is bounded (TREE_INNER_BITS by default), so the level carries the score and the bound holds", () => {
  const look = treeLookup(buildTree(draws()));
  const best = look([q(4), q(0), q(4)]);
  assert.deepEqual(best.parts.map(x => Math.round(x * 1000) / 1000), [2, TREE_INNER_BITS, TREE_INNER_BITS]);
  assert.ok(best.bits <= -Math.log2(1 / 200));
  // A higher level beats a lower one even exactly on its target when the inner parts are bounded by the level step.
  assert.ok(look([q(3), q(0), q(4)]).bits <= look([q(4), q(-9), q(0)]).bits + 2 * TREE_INNER_BITS);
});

test("a tree-valued family's value function carries its tree, and valueLookup reads it, with the parts", async () => {
  const { evaluateSite, Qn } = await import("@workspace/v2-core");
  const { fromMC, lineQ, lineType, primeIntercept } = await import("@workspace/v2-linear");
  const { lineValueFunction, valueLookup } = await import("../src/index.ts");
  assert.equal(primeIntercept.valuation, "tree");
  const tb = "closeness>gradient-log";
  const vf = lineValueFunction(primeIntercept, { ends: 1 }, lineQ, { tieBreaker: tb, config: { drawsPerTilt: 4000 } });
  assert.ok(vf.tree && vf.tree.cells.length > 0);
  const s = { lines: [fromMC(Qn.parse("1/31"), Qn.parse("31"))] };
  const l = valueLookup(vf)(evaluateSite(lineType, primeIntercept, { ends: 1 }, s, lineQ, 0, tb).score);
  assert.equal(l.at, "tree");
  assert.equal(l.parts!.length, 3);
  assert.ok(Math.abs(l.parts!.reduce((a, b) => a + b, 0) - l.bits) < 1e-9);
});

test("tail masses are summed from the top: heavy importance weights below never cancel the top level into ~1,000 bits", () => {
  // One very heavy draw low down and a light one on top: W − (weight below) cancels to 0 in floating point.
  const ds: { u: Score; w: number }[] = [{ u: [q(1), q(0)], w: 1e20 }, { u: [q(2), q(0)], w: 1 }];
  const look = treeLookup(buildTree(ds));
  const top = look([q(2), q(0)]).parts[0]!;
  assert.ok(Math.abs(top - Math.log2(1e20 + 1)) < 1e-6, `top level ${top} bits`);
});

test("a tree family's value past its measured levels never exceeds the state's code length (bits ≤ φ)", async () => {
  const { evaluateSite, Qn } = await import("@workspace/v2-core");
  const { fromMC, lineQ, lineType, primeIntercept } = await import("@workspace/v2-linear");
  const { lineValueFunction, valueLookup } = await import("../src/index.ts");
  const tb = "closeness>gradient-log";
  const vf = lineValueFunction(primeIntercept, { ends: 1 }, lineQ, { tieBreaker: tb, config: { drawsPerTilt: 4000 } });
  const look = valueLookup(vf);
  for (const c of ["2^64", "10^30", "3^90", "2^200 + 1", "7^300", "10^1000"]) {
    const v = c.split(" + ").reduce((a, t) => { const [b, e] = t.split("^"); return a + (e ? BigInt(b!) ** BigInt(e) : BigInt(t)); }, 0n);
    for (const m of ["0", "1", "1/31"]) {
      const s = { lines: [fromMC(Qn.parse(m), Qn.parse(String(v)))] };
      const bits = look(evaluateSite(lineType, primeIntercept, { ends: 1 }, s, lineQ, 0, tb).score).bits, phi = lineType.readLength(s, lineQ);
      assert.ok(bits <= phi, `y = ${m}x + ${c}: ${bits.toFixed(1)} bits > φ ${phi.toFixed(1)}`);
    }
  }
});
