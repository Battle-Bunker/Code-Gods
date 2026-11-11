import assert from "node:assert/strict";
import { test } from "node:test";
import { summonNeeds } from "../src/core/panels/summon-needs.ts";

test("a disabled Summon says what is missing", () => {
  assert.equal(summonNeeds(false, false, true), "To summon: validate this code and give the agent a name.");
  assert.equal(summonNeeds(false, true, true), "To summon: validate this code first.");
  assert.equal(summonNeeds(true, false, true), "To summon: give the agent a name.");
  assert.equal(summonNeeds(true, true, false), "Not enough energy to summon this agent yet.");
  assert.equal(summonNeeds(true, true, true), null, "nothing to say when the rest of the gate is not the player's to fix here");
});
