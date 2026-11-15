/** Paid observation's words (src/panes/seen.ts; W3 #643, v1's paid looks). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPaid, seenWords } from "../src/panes/seen.ts";

test("a free game says nothing about when an object was seen", () => {
  assert.equal(seenWords({}), null);
  assert.equal(isPaid({}), false);
});

test("a paid game says when the object was last seen and how often it changed since", () => {
  assert.equal(isPaid({ knownAt: 40, changesSince: 3 }), true);
  assert.equal(seenWords({ knownAt: 40, changesSince: 3 }), "As you saw it at 0:40 · changed 3 times since");
  assert.equal(seenWords({ knownAt: 40, changesSince: 1 }), "As you saw it at 0:40 · changed once since");
  assert.equal(seenWords({ knownAt: 75, changesSince: 0 }), "As you saw it at 1:15 · up to date");
  assert.equal(seenWords({ knownAt: null, changesSince: 2 }), "Not seen yet · changed twice since it was born");
});

test("a row says it short", async () => {
  const { seenShort } = await import("../src/panes/seen.ts");
  assert.equal(seenShort({}), null);
  assert.equal(seenShort({ knownAt: 40, changesSince: 3 }), "seen 0:40 · changed 3×");
  assert.equal(seenShort({ knownAt: 40, changesSince: 0 }), "seen 0:40 · up to date");
});

test("a clear mark: up to date, or changed since you looked (owner decision 33: every game)", async () => {
  const { freshness } = await import("../src/panes/seen.ts");
  assert.equal(freshness({}), null);
  assert.equal(freshness({ knownAt: 40, changesSince: 0 }), "fresh");
  assert.equal(freshness({ knownAt: 40, changesSince: 2 }), "stale");
  assert.equal(freshness({ knownAt: null, changesSince: 0 }), "stale");
});

test("a look shows its price; looking at all of them is the sum of the rows (W3 #685: the header stays cold)", async () => {
  const { lookLabel, lookAllPrice } = await import("../src/panes/seen.ts");
  assert.equal(lookLabel(1.104), "Look now (1.10 energy)");
  assert.equal(lookLabel(undefined), null, "nothing to pay: no button (planning, the end, a spectator)");
  assert.equal(lookAllPrice([{ lookPrice: 1.1 }, { lookPrice: 1.3 }, {}, undefined]), 2.4);
  assert.equal(lookAllPrice([{}, undefined]), null);
});

test("keeping lines fresh is a Watcher with a small share (W2 #674: about 15 s fresh, most turns left to the climber)", async () => {
  const { watcherTypeOf, KEEP_FRESH_SHARE } = await import("../src/panes/seen.ts");
  assert.equal(watcherTypeOf("line-q"), "lines");
  assert.equal(watcherTypeOf("grid-4-d10"), "grids");
  assert.equal(KEEP_FRESH_SHARE, 0.2);
});
