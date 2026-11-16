/**
 * The dealing trial's step 2 (convex/v2/deal.ts policyDeal; the spec lead's policy, logging only): of 32 seeded tables,
 * one with no strong unopposed shared direction and at most one weak, the fewest unopposed, ties to the higher
 * fair-aligned score; else the best by that order with a reason; with no W table, the lottery with that reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { unopposedDirections } from "@workspace/v2-agents/pure";
import { dealablePool, fairAlignedScore, policyDeal, type SeatKind } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";

const kinds: SeatKind[] = ["human", "human", "human", "human"];

test("the policy's table follows its order, replays from the seed, and never moves the real deal's stream", () => {
  for (const id of ["lines-beginner", "grids-beginner"]) {
    const preset = presetOf(id), pool = dealablePool(preset);
    for (const seed of ["a", "b", "c", "d"]) {
      const c = policyDeal(pool, kinds, seed, preset.variant);
      assert.deepEqual(policyDeal(pool, kinds, seed, preset.variant), c, "the seed replays it");
      assert.equal(c.wouldDeal.length, kinds.length);
      const ids = c.wouldDeal.map(k => { const r = pool.find(x => x.ruleKey === k)!; return `${r.family}/${r.tieBreaker}`; });
      assert.deepEqual(c.unopposed, unopposedDirections(preset.variant, ids), "the stored directions are the table's");
      if (!c.fallback) {
        const strong = c.unopposed.filter(u => u.strength === "strong").length;
        assert.ok(strong === 0 && c.unopposed.length - strong <= 1, `${id}/${seed}: a qualifying table`);
        assert.ok(Math.abs(c.score - fairAlignedScore(preset.variant, c.wouldDeal.map(k => pool.find(x => x.ruleKey === k)!))) < 1e-9);
      } else assert.match(c.fallback, /W table|none of|company/);
    }
  }
});

test("a variant without a W table (grids today: only line-q is measured) falls back to the lottery, saying so", () => {
  const preset = presetOf("grids-beginner"), pool = dealablePool(preset);
  const c = policyDeal(pool, kinds, "seed", preset.variant);
  assert.match(c.fallback ?? "", /no W table for grid-4-d10/);
  // The beginner lines deal the dynamic families (energy.md), which no W table measures: the lottery too.
  const lines = presetOf("lines-beginner");
  assert.match(policyDeal(dealablePool(lines), kinds, "seed", lines.variant).fallback ?? "", /W table/);
});
