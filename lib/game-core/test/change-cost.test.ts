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
  // An Int under set-v1 keeps the words it had before it had a second model: the rule and its steps, no list.
  assert.match(changeCostExplained({ objectType: "Int", typeArgs: { min: 0, max: 99 } }, "set-v1"), /one digit added/);
});

const INT32 = { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 } }, TEXT32 = { objectType: "string", typeArgs: { maxLength: 32 } };

test("Int and string under set-v1 read as before they had a second model: the same explanation, no hint", () => {
  const before = "A change costs W + 0.05·W², where W adds up what the act's calls really changed, cell by cell (digit by digit on an Int, character by character on a string), whatever mutator made the change.\nOn an Int the steps are one digit added (d·10^p) or a multiplication by a prime; on a string one character set, inserted or deleted.\nThe square makes big acts dear. Small incremental acts are much cheaper than radical ones.";
  for (const shape of [INT32, TEXT32]) {
    assert.equal(changeCostExplained(shape), before, shape.objectType);
    assert.equal(changeCostExplained(shape, "set-v1"), before, shape.objectType);
    assert.equal(changeCostHint(shape, "set-v1"), "");
    assert.equal(changeCostKid("set-v1", shape.objectType), changeCostKid("set-v1"));
    assert.equal(changeCostRule("set-v1", shape.objectType), changeCostRule("set-v1"));
  }
});

test("an Int under distance-v1: digit places by the size of the digit, multipliers by their size, with the room's prices", () => {
  // game-types test/cost-models-int-string.test.ts derives these: W = 1 + log2 10 + 1.5849·d for a digit of d (7, 8, 9 as
  // the next place up less 3, 2, 1), W = 1 + 2.1853·log2 m for ×m; energy = W + 0.05·W².
  assert.equal(changePriceList(INT32, "distance-v1"),
    "move one digit place by 1, 2, 3, 4, 5, 6, 7, 8, 9: 7.7, 10.3, 13.2, 16.3, 19.7, 23.4, 26.2, 22.4, 18.8 bits; multiply by 2, 3, 5, 7, 10: 3.7, 5.5, 7.9, 9.7, 11.7 bits");
  assert.equal(changePriceList(INT32, "set-v1"), "change one digit place: 12.1 bits; multiply by 2, 3, 5, 7, 10: 4.8, 5.6, 6.7, 7.5, 10.0 bits");
  const text = changeCostExplained(INT32, "distance-v1");
  assert.ok(text.includes("This room prices by distance (cost model distance-v1)") && text.includes(changePriceList(INT32, "distance-v1")), text);
  assert.match(text, /one step at one place \(\+1, −10, \+100\) is the cheapest add/);
  assert.match(text, /\+999 costs what \+1000 − 1 costs/);
  assert.match(text, /×2 is the cheapest/);
  assert.doesNotMatch(text, /write\(cell|colour|changing 4 cells/);
  assert.equal(changeCostKid("distance-v1", "Int"), "A move costs the changes it makes, digit place by digit place. Adding or taking away 1 at one place is the cheapest add; more places, or a bigger digit, cost more (9 counts as 10 − 1). Multiplying by 2 is the cheapest multiplication; a bigger multiplier costs more.");
  assert.match(changeCostHint(INT32, "distance-v1"), /Here, adding 1 at one digit place costs 7\.7 bits, 5 costs 19\.7 and 9 costs 18\.8; multiplying by 2 costs 3\.7 bits and by 7 9\.7\./);
  // The listed price is what the engine charges: add(100) and multiply(7) on an Int room.
  const inst = instantiate("Int", INT32.typeArgs), type = objectType("Int"), prices = changePrices(INT32, "distance-v1");
  for (const [call, move] of [[["add", { k: 100 }], "move one digit place by 1"], [["multiply", { m: 7 }], "multiply by 7"]] as const) {
    const out = applyCalls(type, inst, 123456, [call], "distance-v1");
    assert.ok(out.ok && Math.abs(out.cost.total - prices.find(p => p.move === move)!.energy) < 1e-9, `${move}: ${JSON.stringify(out)}`);
  }
  // A Grid's words are not an Int's, and a model an Int does not offer falls back to the model's general words.
  assert.notEqual(changeCostKid("distance-v1", "Int"), changeCostKid("distance-v1"));
  assert.equal(changeCostKid("dial-v1", "Int"), changeCostKid("dial-v1"));
});

test("a string under distance-v1: a character changed, inserted or deleted costs about the same", () => {
  // W = log2 3 + log2 32 + log2 127 = 13.57, log2 3 + log2 33 + 7 = 13.63, log2 3 + log2 32 + 7 = 13.58.
  assert.equal(changePriceList(TEXT32, "distance-v1"), "change one character: 22.8 bits; insert one character: 22.9 bits; delete one character: 22.8 bits");
  assert.equal(changePriceList(TEXT32, "set-v1"), "change one character: 41.9 bits; insert one character: 22.9 bits; delete one character: 22.9 bits");
  const text = changeCostExplained(TEXT32, "distance-v1");
  assert.ok(text.includes("cost model distance-v1") && text.includes(changePriceList(TEXT32, "distance-v1")), text);
  assert.match(text, /no character is nearer than another/);
  assert.match(changeCostHint(TEXT32, "distance-v1"), /Here, changing one character costs 22\.8 bits, inserting one 22\.9 and deleting one 22\.8\./);
  assert.match(changeCostKid("distance-v1", "string"), /character by character/);
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
