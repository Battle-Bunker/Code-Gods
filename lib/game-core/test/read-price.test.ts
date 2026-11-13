/**
 * The rule that sets the read price (docs/energy-model.md §2.1): on every shipped setup, a complete look at the board
 * (readBound × READ_PRICE) costs less than the smallest change to it (the cheapest elementary mutator's C = w + β·w²).
 * Retuning CHANGE_READ_RATIO or adding a setup on a bigger board makes this fail first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { READ_PRICE, changeCost, digitAddCost, gridElementaryCosts, multiplyCost, objectType, readBound, stringElementaryCosts, type CostModel } from "@workspace/game-types";
import { COST_MODELS, SEED_SETUPS, costModelOf, defaultSettingsFor, instantiationOf, lookIsCheaperThanChange, supportedCostModels, validateSettings } from "../src/index.ts";

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

test("the beginner board under distance-v1: adding 1 to a digit, the cheapest change, still costs more than a full look", () => {
  const beginner = SEED_SETUPS.find(s => costModelOf(s.settings) === "distance-v1")!;
  assert.equal(instantiationOf(beginner.settings).key, "Grid(4,base10,mono)");
  // Adding 1 to one of 16 digits: W = 4 + log2 3 = 5.585 bits, C = W + 0.05·W² = 7.14; the full look is 53.2 bits / 32.
  assert.ok(Math.abs(cheapestChange(beginner.settings, "distance-v1") - 7.1445) < 1e-3);
  assert.ok(Math.abs(readBound(instantiationOf(beginner.settings)) * READ_PRICE - 1.661) < 1e-3);
  // Not every board keeps the rule under distance-v1: on the 7×7 card board in six colours a full look (12.69) would
  // cost a little more than the cheapest change (a colour, 12.64). The model is therefore not offered there
  // (supportedCostModels, validateSettings), so no room can make looking dearer than changing.
  const master = SEED_SETUPS.find(s => s.seedId === "grid-master")!;
  assert.ok(readBound(instantiationOf(master.settings)) * READ_PRICE > cheapestChange(master.settings, "distance-v1"));
  assert.ok(!lookIsCheaperThanChange(master.settings, "distance-v1") && lookIsCheaperThanChange(master.settings, "set-v1"));
  assert.ok(!supportedCostModels(master.settings).includes("distance-v1"));
  assert.throws(() => validateSettings({ ...master.settings, costModel: "distance-v1" }), /costModel distance-v1 is not offered for Grid\(7,cards,rainbow6\)/);
});

test("every cost model a board offers keeps the rule: a full look is cheaper than its cheapest change", () => {
  // Every playable Grid shape (game-types representatives) under every model: offered exactly where the rule holds.
  let offered = 0, refused: string[] = [];
  for (const typeArgs of objectType("Grid").representatives()) {
    const settings = defaultSettingsFor("Grid", ["python"], typeArgs), inst = instantiationOf(settings);
    const look = readBound(inst) * READ_PRICE;
    for (const model of COST_MODELS) {
      if (objectType("Grid").supportsCostModel?.(inst, model) !== true) continue;
      const holds = look < cheapestChange(settings, model);
      assert.equal(supportedCostModels(settings).includes(model), holds || model === "set-v1", `${inst.key} ${model}`);
      if (model === "set-v1") assert.ok(holds, `${inst.key}: the flat price always keeps the rule`);
      if (holds) offered++; else refused.push(`${inst.key} ${model}`);
    }
  }
  assert.ok(offered > 200);
  // The refused combinations are the biggest boards with the most to read; the beginner 4×4 boards offer every model.
  assert.ok(refused.length > 0 && refused.every(k => /^Grid\((6|7),/.test(k)), refused.join("; "));
});
