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
  assert.equal(seenWords({ knownAt: 75, changesSince: 0 }), "As you saw it at 1:15 · unchanged since");
  assert.equal(seenWords({ knownAt: null, changesSince: 2 }), "Not seen yet · changed twice since it was born");
});

test("a row says it short", async () => {
  const { seenShort } = await import("../src/panes/seen.ts");
  assert.equal(seenShort({}), null);
  assert.equal(seenShort({ knownAt: 40, changesSince: 3 }), "seen 0:40 · changed 3×");
  assert.equal(seenShort({ knownAt: 40, changesSince: 0 }), "seen 0:40");
});
