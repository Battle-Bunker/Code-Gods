/** Tree values (tree-value.ts; owner decision 45): the chain rule down level → closeness → third. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Score } from "@workspace/v2-core";
import { buildTree, MIN_CELL, treeLookup } from "../src/index.ts";

/** Synthetic draws: level j uniform on 1…4, closeness −d with d uniform on 0…9 (d = 0 one in ten), third e in 0…4. */
function draws(): { u: Score; w: number }[] {
  const out: { u: Score; w: number }[] = [];
  for (let j = 1; j <= 4; j++) for (let d = 0; d < 10; d++) for (let e = 0; e < 5; e++) for (let r = 0; r < 10; r++) out.push({ u: [q(j), q(-d), q(e)], w: 1 });
  return out;
}

test("each part is the rarity of 'at least this good' given the parts above it, and the sum never exceeds the state's own rarity", () => {
  const t = buildTree(draws()), look = treeLookup(t);
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
