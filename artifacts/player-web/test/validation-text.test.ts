/** The forge's words about a price (src/core/panels/validation-text.ts). What would break: jargon in the main view, or an offer to wait for energy that can never come. */
import test from "node:test";
import assert from "node:assert/strict";
import { PRICE_GROWS, otherDiagnostics, priceParts, storeTooSmall } from "../src/core/panels/validation-text.ts";

test("the price's parts in ⚡ with plain labels, from the receipt's own parts, adding up to the price in every language", () => {
  // Python: structure 295.2 + names 238.3 + literals 29.6 + move flags 1.9 = 565.0.
  assert.equal(priceParts({ structure: 295.2, names: 238.3, literals: 29.6, moveFlags: 1.9, literalMoves: 0 }, 565),
    "Of the price (565 ⚡): the shape of the code 295.2 ⚡, the names it uses 238.3 ⚡, the numbers and text written in it 29.6 ⚡, the kinds of move it can make 1.9 ⚡.");
  // TypeScript: the structure is weighted by the engine (the receipt carries the weighted figure): 180.25 + 120.4 + 20 + 0 + 12.35 + 2 = 335 (in tenths: 180.2 as the float falls, 12.4; they add up to 335.0).
  const ts = priceParts({ structure: 180.25, names: 120.4, literals: 20, moveFlags: 0, literalMoves: 12.35, commitClause: 2 }, 335)!;
  assert.equal(ts, "Of the price (335 ⚡): the shape of the code 180.2 ⚡, the names it uses 120.4 ⚡, the numbers and text written in it 20 ⚡, moves written out in full 12.4 ⚡, its commit clause 2 ⚡.");
  // Whatever the rounding, the figures shown add up to the price shown.
  const shown = [...ts.matchAll(/ (\d+(?:\.\d+)?) ⚡[,.]/g)].map(m => Number(m[1]));
  assert.equal(Math.round(shown.reduce((a, b) => a + b, 0) * 10) / 10, 335);
  // Parts that do not make up the whole price (a receipt from another engine version): the rest is named, never hidden.
  assert.equal(priceParts({ structure: 295.2, names: 238.3, literals: 29.6, moveFlags: 0, literalMoves: 0 }, 565),
    "Of the price (565 ⚡): the shape of the code 295.2 ⚡, the names it uses 238.3 ⚡, the numbers and text written in it 29.6 ⚡, the rest 1.9 ⚡.");
  assert.equal(priceParts(undefined, 565), null);
  assert.equal(priceParts({ structure: 0, names: 0, literals: 0, moveFlags: 0, literalMoves: 0 }, 0), null);
  assert.ok(!/bits|ast/.test(ts));
  assert.deepEqual(otherDiagnostics(["Summon price 565.0 bits (ast-bits-v1: structure 295.2).", "Each act: about 9.10 bits"]), ["Each act: about 9.10 bits"]);
  assert.equal(PRICE_GROWS, "The price grows with the amount of code (not with what it does): shorter is cheaper.");
});

test("a store that can never hold the price is said plainly, instead of an offer to wait", () => {
  assert.equal(storeTooSmall({ cost: 565, capacity: 480 }), "Your own store now holds at most 480 ⚡, less than this agent's price (565). Take some power back in My agents to summon again.");
  assert.equal(storeTooSmall({ cost: 564.2, capacity: 0 }), "All your power is with your agents, so your own store holds nothing and cannot pay this agent's price (565). Take some power back in My agents to summon again.");
  assert.equal(storeTooSmall({ cost: 400, capacity: 480 }), null);
  assert.equal(storeTooSmall({ cost: 400, capacity: undefined }), null, "a game with no capacity: waiting does help");
});
