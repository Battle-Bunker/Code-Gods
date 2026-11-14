/**
 * The gate a dealt grid family must pass (the metastable-ecosystem instruction, CLAUDE.md; docs/engine-v2/grids.md §6.1):
 * a unit climber (±1 on one cell, or a swap of two cells; steepest ascent on the main part) started from boards drawn
 * from π reaches the main part's top from only a minority of starts, yet climbs from the start. What would break: a
 * separable family (a sum of independent 1-D wells) passing, or a frustrated one failing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { beginnerGridFamilies, grid4 } from "@workspace/v2-grid";
import { gridGate, GATE } from "../src/grid-gate.ts";

const fam = (id: string) => beginnerGridFamilies(4).find(f => f.id === id)!;

test("the gate fails a separable family (Opposite Nines: every start reaches its top) and passes a frustrated one (Strangers)", () => {
  const sep = gridGate(fam("opposite-nines"), fam("opposite-nines").dealable(grid4)[0], grid4, { starts: 20, seed: "t" });
  assert.equal(sep.top, 0, "a distance's top is 0");
  assert.ok(sep.exactShare > 0.9, `Opposite Nines reaches its top from ${sep.exactShare} of starts`);
  assert.equal(sep.pass, false);
  const fr = gridGate(fam("strangers"), fam("strangers").dealable(grid4)[0], grid4, { starts: 20, seed: "t", top: 16 });
  assert.ok(fr.exactShare <= GATE.maxExactShare, `Strangers reaches its top from ${fr.exactShare}`);
  assert.ok(fr.medianGain > 0, "but it climbs from the start");
  assert.equal(fr.pass, true);
});
