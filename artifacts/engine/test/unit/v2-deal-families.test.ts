/**
 * The dealer picks a family uniformly, then one of its entries, and never seats one family twice at a table (the
 * coordinator's rule; two-line-systems.md §8.3: weighting families by their number of (parameters, tie-breaker)
 * entries, now that families have parameter grids, made big grids dominate and could seat a family twice).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dealablePool, freshDeal, practiceDeal } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";

for (const preset of PRESETS) {
  test(`${preset.id}: no family twice at a table${preset.variant.startsWith("grid") ? "" : "; each family equally likely"}`, () => {
    const pool = dealablePool(preset);
    const families = [...new Set(pool.map(r => r.family))];
    const seats = Math.min(3, families.length), count = new Map<string, number>();
    for (let s = 0; s < 1500; s++) {
      const deal = freshDeal(pool, seats, `seed-${s}`, preset.variant);
      assert.equal(new Set(deal.map(r => r.family)).size, seats, `seed-${s}: ${deal.map(r => r.family)}`);
      for (const r of deal) count.set(r.family, (count.get(r.family) ?? 0) + 1);
      const practice = practiceDeal(pool, ["human", "practice", "practice"].slice(0, seats) as never, `seed-${s}`, preset.variant);
      assert.equal(new Set(practice.map(r => r.family)).size, seats, "a practice deal too");
    }
    // Uniform over families (the grids' seating rule constrains which families sit together, by design).
    if (!preset.variant.startsWith("grid")) {
      const mean = (1500 * seats) / families.length;
      for (const f of families) assert.ok(Math.abs((count.get(f) ?? 0) / mean - 1) < 0.3, `${f}: ${count.get(f)} against ${mean.toFixed(0)}`);
    }
  });
}
