import assert from "node:assert/strict";
import { test } from "node:test";
import { cardRotation, rotationText } from "../src/site/lib/rotation.ts";

test("a passed-on rule says which game of the round this is and who held it last game; an ordinary card says nothing", () => {
  const r = cardRotation({ name: "Leapfrog", rotation: { round: 2, of: 3, from: "Alice" } });
  assert.deepEqual(r, { round: 2, of: 3, from: "Alice" });
  assert.match(rotationText(r!), /^Game 2 of 3: Alice held this rule last game\./);
  assert.equal(cardRotation({ name: "Leapfrog" }), null);
  assert.equal(cardRotation(null), null);
});
