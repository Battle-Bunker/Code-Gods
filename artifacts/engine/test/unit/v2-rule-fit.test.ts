/**
 * `rule.fit` (v1's fit_utility_mixture; owner-decisions call 36): offered on lines at noise σ ≥ 8 only, read from the
 * caller's view of the log (the newest distinct readings), and given enough readings it finds the others' rules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitGame, fitRefusal, observations } from "../../convex/v2/fit.ts";
import { dealablePool } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";
import { birthDraws, decode, valueOf } from "../../convex/v2/world.ts";

test("refused on grids, on pairs and below σ 8; offered on lines at σ 8", () => {
  assert.match(fitRefusal({ variant: "grid-4-d10", noiseVariance: 64 })!, /lines only/);
  assert.match(fitRefusal({ variant: "pair-q", noiseVariance: 64 })!, /lines only/);
  assert.match(fitRefusal({ variant: "line-q", noiseVariance: 0 })!, /±8/);
  assert.match(fitRefusal({ variant: "line-q", noiseVariance: 63 })!, /±8/);
  assert.equal(fitRefusal({ variant: "line-q-lenses", noiseVariance: 64 }), null);
});

test("observations: newest distinct (object, state) readings, skipping hidden ones, capped", () => {
  const rows = [
    { objectId: "a", state: "S2", others: 5 }, { objectId: "a", state: "S2", others: 7 }, { objectId: "b", state: "S2", others: 1 },
    { objectId: "a", state: null, others: 3 }, { objectId: "c", state: "S9", others: null }, { objectId: "a", state: "S1", others: 2 },
  ];
  assert.deepEqual(observations(rows), [{ state: "S2", others: 5 }, { state: "S2", others: 1 }, { state: "S1", others: 2 }]);
  assert.equal(observations(rows, 2).length, 2);
});

test("on a table-valued game (grids) at σ 8, many readings find the two others' families; the caller's own family is never proposed", () => {
  const preset = presetOf("grids-beginner"), pool = dealablePool(preset), variant = preset.variant, objects = 20;
  const fams = [...new Set(pool.map(r => r.family))];
  const own = fams[0]!, a = pool.find(r => r.family === fams[1])!, b = pool.find(r => r.family === fams[2])!;
  const states = birthDraws(variant, "fit-test", 300);
  const rows = states.map((state, i) => {
    const s = decode(state, variant);
    return { objectId: `o${i}`, state, others: valueOf(s, variant, a, objects).rarityBits + valueOf(s, variant, b, objects).rarityBits };
  });
  const fit = fitGame({ variant, preset: preset.id, noiseVariance: 64, others: 2, ownFamily: own, objects }, rows, { top: 5 });
  assert.equal(fit.sigma, 8);
  assert.ok(fit.observations > 100, `observations ${fit.observations}`);
  assert.deepEqual(fit.hypotheses[0]!.rules.map(r => r.family).sort(), [a.family, b.family].sort());
  assert.ok(fit.hypotheses.every(h => h.rules.every(r => r.family !== own) && typeof h.rules[0]!.card === "string"));
  assert.ok(fit.families.every(f => f.family !== own));
});
