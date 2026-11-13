/** The texts that explain change cost take their numbers from the type's own cost table, under either cost model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCalls, instantiate, objectType } from "@workspace/game-types";
import { COST_MODELS } from "@workspace/game-types";
import {
  changeCostKid, changeCostRule, changeCostExplained, changeCostHint, changePriceList, changePrices, rowFactor,
} from "../src/change-cost.ts";

const MONO = { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "mono" } };
const RGB = { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "rgb" } };
const CARDS = { objectType: "Grid", typeArgs: { size: 6, symbols: "cards", colours: "rainbow6" } };

test("the beginner board's prices: one flat price under set-v1, the distance table under distance-v1", () => {
  assert.deepEqual(changePrices(MONO, "set-v1").map(p => p.energy.toFixed(1)), ["16.3"]);
  assert.deepEqual(changePrices(MONO, "distance-v1").map(p => p.energy.toFixed(1)), ["7.1", "9.7", "12.6", "15.7", "19.0", "22.6", "26.5", "30.6", "34.9"]);
  assert.equal(changePriceList(MONO, "distance-v1"), "move a cell's number by 1, 2, 3, 4, 5, 6, 7, 8, 9: 7.1, 9.7, 12.6, 15.7, 19.0, 22.6, 26.5, 30.6, 34.9 bits");
  assert.equal(changePriceList(RGB, "set-v1"), "change a cell's symbol: 18.4 bits; change a cell's colour: 11.5 bits");
});

test("the listed price is what the engine charges an act that makes that one change", () => {
  const inst = instantiate("Grid", MONO.typeArgs), type = objectType("Grid");
  const value = type.codec(inst).encode({ size: 4, sym: new Uint8Array(16).fill(5), col: new Uint8Array(16) });
  for (const model of ["set-v1", "distance-v1"] as const) {
    const out = applyCalls(type, inst, value, [["add", { kind: "cell", region: [1, 2], k: 2 }]], model);
    assert.ok(out.ok, JSON.stringify(out));
    const listed = model === "set-v1" ? changePrices(MONO, model)[0] : changePrices(MONO, model)[1];
    assert.ok(Math.abs(out.cost.total - listed.energy) < 1e-9, `${model}: ${out.cost.total} vs ${listed.energy}`);
  }
});

test("the room's explanation names its model, lists its prices and says the rule that is true of both", () => {
  for (const model of ["set-v1", "distance-v1"] as const) {
    const text = changeCostExplained(RGB, model);
    assert.ok(text.includes("cell by cell") && text.includes(`cost model ${model}`) && text.includes(changePriceList(RGB, model)), text);
  }
  assert.match(changeCostExplained(RGB, "distance-v1"), /write\(cell, 7\) on a 5 costs what add\(cell, 2\) costs/);
  assert.doesNotMatch(changeCostExplained(RGB, "set-v1"), /how far it moved:/);
  assert.match(changeCostExplained(CARDS, "distance-v1"), /change a cell's suit: 11\.8 bits/);
  assert.ok(Math.abs(rowFactor(RGB, "set-v1")! - 7.5) < 0.05);
  // A type without a price list (Int) still gets the rule and its steps in words.
  assert.match(changeCostExplained({ objectType: "Int", typeArgs: { min: 0, max: 99 } }, "set-v1"), /one digit added/);
});

test("the kid texts: short, concrete, and every model has one", () => {
  assert.equal(changeCostKid("distance-v1"), "A move costs the changes it makes, cell by cell. Adding 1 to a number is the cheapest change; the further a number moves, the more it costs. Writing a 7 over a 5 costs the same as adding 2.");
  assert.match(changeCostHint(MONO, "distance-v1"), /moving a number by 1 costs 7\.1 bits, by 2 9\.7, by 9 34\.9\./);
  assert.match(changeCostHint(MONO, "set-v1"), /changing a cell's symbol costs 16\.3 bits/);
  assert.equal(changeCostHint({ objectType: "Int", typeArgs: { min: 0, max: 99 } }, "set-v1"), "");
  // Every model the engine knows has its words, and a price list on a Grid.
  for (const model of COST_MODELS) {
    assert.ok(changeCostKid(model).startsWith("A move costs the changes it makes, cell by cell") && changeCostRule(model).length > 40, model);
    assert.ok(changePrices(MONO, model).length > 0 && changeCostHint(MONO, model).includes("bits"), model);
    assert.match(changeCostExplained(MONO, model), model === "set-v1" ? /prices every changed cell alike/ : /prices by distance/);
  }
});
