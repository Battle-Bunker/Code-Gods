/**
 * The rule that sets the read price (docs/energy-model.md §2.1): on every shipped setup, a complete look at the board
 * (readBound × READ_PRICE) costs less than the smallest change to it (the cheapest elementary mutator's C = w + β·w²).
 * Retuning CHANGE_READ_RATIO or adding a setup on a bigger board makes this fail first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { READ_PRICE, changeCost, digitAddCost, gridElementaryCosts, multiplyCost, readBound, stringElementaryCosts } from "@workspace/game-types";
import { SEED_SETUPS, instantiationOf } from "../src/index.ts";

/** The cheapest change an act can make to an object of this instantiation (one elementary mutator). */
function cheapestChange(settings: Parameters<typeof instantiationOf>[0]): number {
  const inst = instantiationOf(settings);
  if (inst.objectType === "Grid") { const w = gridElementaryCosts(inst); return Math.min(changeCost(w.colour), changeCost(w.symbol)); }
  if (inst.objectType === "Int") return Math.min(changeCost(digitAddCost(inst)), changeCost(multiplyCost(-1)));
  if (inst.objectType === "string") { const w = stringElementaryCosts(inst); return changeCost(Math.min(w.set, w.insert, w.delete)); }
  throw new Error(`no cheapest change for ${inst.objectType}: add it here`);
}

test("a complete look at the board costs less than the smallest change to it, on every seed setup", () => {
  assert.ok(SEED_SETUPS.length >= 6);
  for (const s of SEED_SETUPS) {
    const look = readBound(instantiationOf(s.settings)) * READ_PRICE, change = cheapestChange(s.settings);
    assert.ok(look < change, `${s.seedId}: a full read costs ${look.toFixed(2)} bits, the cheapest change ${change.toFixed(2)}`);
  }
});
