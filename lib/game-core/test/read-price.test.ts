/**
 * The rule that sets the read price (docs/energy-model.md §2.1): on every shipped setup, a complete look at the board
 * (readBound × READ_PRICE) costs less than the smallest change to it (the cheapest elementary mutator's C = w + β·w²).
 * Retuning CHANGE_READ_RATIO or adding a setup on a bigger board makes this fail first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { READ_PRICE, changeCost, digitAddCost, gridElementaryCosts, multiplyCost, objectType, readBound, stringElementaryCosts, type CostModel } from "@workspace/game-types";
import { SEED_SETUPS, costModelOf, instantiationOf, supportedCostModels } from "../src/index.ts";

/** The cheapest change an act can make to an object of this instantiation (one elementary mutator) under a cost model. */
function cheapestChange(settings: Parameters<typeof instantiationOf>[0], model: CostModel = "set-v1"): number {
  const inst = instantiationOf(settings);
  if (model !== "set-v1") {
    // Another model's elementary moves are the rows of the type's cost table (game-types structure/index.ts).
    const rows = objectType(inst.objectType).costTable?.(inst, model) ?? [];
    assert.ok(rows.length, `${inst.key} has a ${model} cost table`);
    return Math.min(...rows.map(r => changeCost(r.work)));
  }
  if (inst.objectType === "Grid") { const w = gridElementaryCosts(inst); return Math.min(changeCost(w.colour), changeCost(w.symbol)); }
  if (inst.objectType === "Int") return Math.min(changeCost(digitAddCost(inst)), changeCost(multiplyCost(-1)));
  if (inst.objectType === "string") { const w = stringElementaryCosts(inst); return changeCost(Math.min(w.set, w.insert, w.delete)); }
  throw new Error(`no cheapest change for ${inst.objectType}: add it here`);
}

test("a complete look at the board costs less than the smallest change to it, on every seed setup", () => {
  assert.ok(SEED_SETUPS.length >= 6);
  for (const s of SEED_SETUPS) {
    const look = readBound(instantiationOf(s.settings)) * READ_PRICE, change = cheapestChange(s.settings, costModelOf(s.settings));
    assert.ok(look < change, `${s.seedId} (${costModelOf(s.settings)}): a full read costs ${look.toFixed(2)} bits, the cheapest change ${change.toFixed(2)}`);
  }
});

test("Int and string under distance-v1: a full look against the cheapest change (no seed uses it; string(128) fails the rule under both models)", () => {
  // No seed uses distance-v1 on an Int or a string; these are the numbers a room that chooses it gets (κ = 32).
  //   Int 32-bit: a full look is 32 bits / 32 = 1.00. The cheapest change is ×2: W = 1 + 2.1853 = 3.19, C = 3.69
  //     (the cheapest add, one step at one place, is W = 5.91, C = 7.65). Under set-v1 the cheapest is ×2 at W = 4, C = 4.80.
  //   Int 0..9999: a full look is 14 bits / 32 = 0.44; ×2 is 3.69 again, one step at one of 4 places W = 4.58, C = 5.64.
  //   string(128): a full look is 896.0 bits / 32 = 28.00, and the cheapest change is a substitution: W = log2 3 + 7 +
  //     log2 127 = 15.57, C = 27.70. The look costs MORE than the change, as it already does under set-v1 (an insert:
  //     W = 15.60, C = 27.76): the rule is about seed setups, and no seed is a string of 128.
  //   string(16): a full look is 3.50; a substitution is W = 12.57, C = 20.48 (set-v1: an insert, C = 20.70).
  const numbers = (objectType: string, typeArgs: Record<string, number>, model: CostModel) => {
    const s = { objectType, typeArgs };
    return [readBound(instantiationOf(s)) * READ_PRICE, cheapestChange(s, model)].map(x => +x.toFixed(2));
  };
  assert.deepEqual(numbers("Int", { min: -2147483648, max: 2147483647 }, "distance-v1"), [1, 3.69]);
  assert.deepEqual(numbers("Int", { min: 0, max: 9999 }, "distance-v1"), [0.44, 3.69]);
  assert.deepEqual(numbers("string", { maxLength: 128 }, "distance-v1"), [28, 27.7]);
  assert.deepEqual(numbers("string", { maxLength: 128 }, "set-v1"), [28, 27.76]);
  assert.deepEqual(numbers("string", { maxLength: 16 }, "distance-v1"), [3.5, 20.48]);
  for (const s of SEED_SETUPS) if (s.settings.objectType !== "Grid") assert.equal(costModelOf(s.settings), "set-v1", `${s.seedId}: no seed changed`);
});

test("the beginner board under distance-v1: adding 1 to a digit, the cheapest change, still costs more than a full look", () => {
  const beginner = SEED_SETUPS.find(s => costModelOf(s.settings) === "distance-v1")!;
  assert.equal(instantiationOf(beginner.settings).key, "Grid(4,base10,mono)");
  // Adding 1 to one of 16 digits: W = 4 + log2 3 = 5.585 bits, C = W + 0.05·W² = 7.14; the full look is 53.2 bits / 32.
  assert.ok(Math.abs(cheapestChange(beginner.settings, "distance-v1") - 7.1445) < 1e-3);
  assert.ok(Math.abs(readBound(instantiationOf(beginner.settings)) * READ_PRICE - 1.661) < 1e-3);
  // Not every board keeps the rule under distance-v1 (a seed that adopts it is checked by the test above): on the 7×7
  // card board a full look (12.69) costs a little more than a one-step nudge (12.64), so that seed stays on set-v1.
  const master = SEED_SETUPS.find(s => s.seedId === "grid-master")!;
  assert.ok(supportedCostModels(master.settings).includes("distance-v1") && costModelOf(master.settings) === "set-v1");
  assert.ok(readBound(instantiationOf(master.settings)) * READ_PRICE > cheapestChange(master.settings, "distance-v1"));
});
