/** The forge's words about a price (src/core/panels/validation-text.ts). What would break: jargon in the main view, or an offer to wait for energy that can never come. */
import test from "node:test";
import assert from "node:assert/strict";
import { PRICE_GROWS, otherDiagnostics, priceParts, storeTooSmall } from "../src/core/panels/validation-text.ts";

const ENGINE = [
  "Summon price 565.0 bits (ast-bits-v1: structure 295.2, names 238.3, literals 29.6, literal moves 0.0).",
  "Each act: about 9.10 bits = reading 1.66 (53.2 bits of the object looked at, at 1/32 each) + changing 7.44.",
];

test("the price's parts in ⚡ with plain labels, from the engine's own line", () => {
  assert.equal(priceParts(ENGINE), "Of the price: the shape of the code 295.2 ⚡, the names it uses 238.3 ⚡, the numbers and text written in it 29.6 ⚡.");
  assert.equal(priceParts(["Summon price 20.0 bits (ts-ast-bits-v1: structure 10.0, names 6.0, literals 0.0, literal moves 2.0, commit clause 2.00)."]),
    "Of the price: the shape of the code 10 ⚡, the names it uses 6 ⚡, moves written out in full 2 ⚡, its commit clause 2 ⚡.");
  assert.equal(priceParts(["Each act: about 9 bits"]), null);
  assert.deepEqual(otherDiagnostics(ENGINE), [ENGINE[1]]);
  assert.ok(!/bits|ast/.test(priceParts(ENGINE)!));
  assert.equal(PRICE_GROWS, "The price grows with the amount of code (not with what it does): shorter is cheaper.");
});

test("a store that can never hold the price is said plainly, instead of an offer to wait", () => {
  assert.equal(storeTooSmall({ cost: 565, capacity: 480 }), "Your own store now holds at most 480 ⚡, less than this agent's price (565). Take some power back in My agents to summon again.");
  assert.equal(storeTooSmall({ cost: 564.2, capacity: 0 }), "All your power is with your agents, so your own store holds nothing and cannot pay this agent's price (565). Take some power back in My agents to summon again.");
  assert.equal(storeTooSmall({ cost: 400, capacity: 480 }), null);
  assert.equal(storeTooSmall({ cost: 400, capacity: undefined }), null, "a game with no capacity: waiting does help");
});
