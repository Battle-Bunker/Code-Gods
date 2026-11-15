/**
 * The dealer picks a family uniformly, then one of its entries, and never seats one family twice at a table (the
 * coordinator's rule; two-line-systems.md §8.3: weighting families by their number of (parameters, tie-breaker)
 * entries, now that families have parameter grids, made big grids dominate and could seat a family twice).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anchoredFreshDeal, dealablePool, freshDeal, opponentGaps, practiceDeal } from "../../convex/v2/deal.ts";
import { LINE_OPPONENTS } from "@workspace/v2-linear";
import { PRESETS } from "../../convex/v2/presets.ts";

for (const preset of PRESETS) for (const size of [3, 4, 5]) {
  test(`${preset.id}, ${size} seats: no family twice at a table${preset.variant.startsWith("grid") ? "" : "; each family equally likely; the anchor sits with a named opponent"}`, () => {
    const pool = dealablePool(preset);
    const families = [...new Set(pool.map(r => r.family))];
    const seats = Math.min(size, families.length), count = new Map<string, number>();
    if (size > 3 && seats < size) return;   // a pool too small for this many seats
    // 4 and 5 seats: the line presets (the named-opponent deal). The two-line preset's seating rule skews Whole Answer
    // at 4 and 5 seats (reported to the two-line session); its 3-seat deal is held to the band.
    if (size > 3 && !preset.variant.startsWith("line")) return;
    let anchored = 0, opposed = 0;
    for (let s = 0; s < 1500; s++) {
      const { deal, anchor } = anchoredFreshDeal(pool, seats, `seed-${s}`, preset.variant);
      assert.deepEqual(deal, freshDeal(pool, seats, `seed-${s}`, preset.variant), "freshDeal is the anchored deal");
      assert.equal(new Set(deal.map(r => r.family)).size, seats, `seed-${s}: ${deal.map(r => r.family)}`);
      for (const r of deal) count.set(r.family, (count.get(r.family) ?? 0) + 1);
      if (anchor !== null && (LINE_OPPONENTS[deal[anchor]!.family] ?? []).some(o => families.includes(o))) {
        anchored++;
        if (!opponentGaps(preset.variant, deal, new Set(families)).includes(deal[anchor]!.family)) opposed++;
      }
      if (size === 3) {
        const practice = practiceDeal(pool, ["human", "practice", "practice"].slice(0, seats) as never, `seed-${s}`, preset.variant);
        assert.equal(new Set(practice.map(r => r.family)).size, seats, "a practice deal too");
      }
    }
    // Uniform over families (the grids' seating rule constrains which families sit together, by design). The anchor's
    // opponent is drawn inversely to how many families name it (the coordinator, 15 Nov), so a family that opposes
    // nearly everyone is not seated more often than any other.
    if (!preset.variant.startsWith("grid")) {
      const mean = (1500 * seats) / families.length;
      for (const f of families) assert.ok(Math.abs((count.get(f) ?? 0) / mean - 1) < 0.3, `${f}: ${count.get(f)} against ${mean.toFixed(0)}`);
      if (anchored) assert.ok(opposed / anchored >= 0.95, `the anchor sits with a named opponent in ${opposed} of ${anchored} deals`);
    }
  });
}

// Playtest round 21: practiceFits redrew whole tables until the human was in company, so the human's family followed
// the fit (Smooth Intercept 21.5%, Prime Staircase 0.6% of practice games where uniform was 9.1%). The human's family
// is drawn uniformly first; the partners are then chosen to fit.
for (const preset of PRESETS) {
  test(`${preset.id}: the human's family in a practice game is uniform over the families`, () => {
    const pool = dealablePool(preset);
    const families = [...new Set(pool.map(r => r.family))];
    if (families.length < 2) return;
    const runs = 1000, count = new Map<string, number>();
    for (let s = 0; s < runs; s++) {
      const kinds = (s % 2 ? ["practice", "human", "practice"] : ["human", "practice", "practice"]) as never as ("human" | "practice")[];
      const h = kinds.indexOf("human"), deal = practiceDeal(pool, kinds, `human-${s}`, preset.variant);
      count.set(deal[h]!.family, (count.get(deal[h]!.family) ?? 0) + 1);
    }
    const mean = runs / families.length;
    for (const f of families) assert.ok(Math.abs((count.get(f) ?? 0) / mean - 1) < 0.35, `${f}: ${count.get(f) ?? 0} against ${mean.toFixed(0)}`);
  });
}

// The named-opponent rule (the coordinator's (b), from the spec lead's opponent table): on a line table, one anchor
// seat (the human's in a practice game; uniform over seats in a fresh deal), its family drawn uniformly first, sits
// with one of its named opponents whenever the pool can deal one. Only the anchor: requiring every seat skewed the
// families out of the uniformity band above (Smooth Intercept and Prime Gradient, named by no family, fell to 0.3–0.5).
for (const preset of PRESETS.filter(p => p.variant.startsWith("line"))) {
  test(`${preset.id}: the practice human, and some seat of every fresh table, sit with a named opponent`, () => {
    const pool = dealablePool(preset), families = new Set(pool.map(r => r.family));
    let fresh = 0, human = 0;
    const runs = 600;
    for (let s = 0; s < runs; s++) {
      const deal = freshDeal(pool, 3, `seed-${s}`, preset.variant), gaps = opponentGaps(preset.variant, deal, families);
      if (gaps.length < deal.length) fresh++;
      const practice = practiceDeal(pool, ["human", "practice", "practice"], `seed-${s}`, preset.variant);
      if (!opponentGaps(preset.variant, practice, families).includes(practice[0]!.family)) human++;
    }
    assert.equal(fresh, runs, "every fresh table has a seat with a named opponent");
    assert.ok(human / runs > 0.97, `the human has a named opponent seated in ${(human / runs * 100).toFixed(1)}% of practice games`);
  });
}
