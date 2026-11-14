import { test } from "node:test";
import assert from "node:assert/strict";
import { ownEnergy } from "../src/core/words.ts";

test("a full store says so and why it stopped rising; a filling one says how fast", () => {
  const full = ownEnergy({ energy: 576, capacity: 576, ownPerSecond: 19.2 });
  assert.equal(full.text, "576.00 ⚡ (full)");
  assert.equal(full.full, true);
  assert.match(full.title, /^Your store is full: it holds 30 seconds of your income \(19\.20 ⚡ a second\), so it stops rising\./);
  const filling = ownEnergy({ energy: 120.5, capacity: 576, ownPerSecond: 19.2 });
  assert.equal(filling.text, "120.50 ⚡");
  assert.equal(filling.full, false);
  assert.match(filling.title, /rises by 19\.20 ⚡ a second, up to 576\.00 ⚡/);
});

test("a store within a hundredth of full counts as full; no income never claims to fill", () => {
  assert.equal(ownEnergy({ energy: 575.996, capacity: 576, ownPerSecond: 19.2 }).full, true);
  assert.equal(ownEnergy({ energy: 0, capacity: 0, ownPerSecond: 0 }).full, false);
});

test("energy above the store's cap says so (grid games start at 900 ⚡ above a 576 ⚡ store)", () => {
  // Catches (playtest round 5): a player saw 900 at the start, then "576 (full)" forever, with no word why.
  const above = ownEnergy({ energy: 900, capacity: 576, ownPerSecond: 19.2 });
  assert.equal(above.text, "900.00 ⚡ (more than your store holds: 576.00 ⚡; it won't refill above that)");
  assert.equal(above.full, true);
});
