/**
 * The server plays every object type through its variant (convex/v2/world.ts): what would break is a grid game read,
 * born or valued as lines, or two types' families sharing an id (the deal and the reads look families up by id).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { objectTypes } from "@workspace/v2-valuation";
import { valueRecord } from "../../convex/v2/values.ts";
import { familyOf } from "../../convex/v2/deal.ts";
import { decode, encode, typeOf, valuesOf } from "../../convex/v2/world.ts";
import { mutatorsOf } from "../../convex/v2/reads.ts";
import { ruleKey } from "@workspace/v2-valuation";

test("family ids are unique across object types", () => {
  const ids = objectTypes.flatMap(t => t.families.map(f => f.id));
  assert.deepEqual(ids.length, new Set(ids).size);
});

test("a grid variant is read and written as a grid; it is valued only once it has value functions (decision 23)", () => {
  assert.equal(typeOf("grid-4-d10").id, "grid");
  assert.equal(typeOf("line-z").id, "line");
  const wire = "9090/0909/4545/3366";
  assert.equal(encode(decode(wire, "grid-4-d10"), "grid-4-d10"), wire);
  const type = typeOf("grid-4-d10"), variant = type.variants[0]!;
  const f = familyOf("magic-eighteen");
  const key = ruleKey(type, variant, f.id, { T: 18 }, "first-column");
  const seat = [{ memberId: "m1", rule: { family: f.id, params: { T: 18 }, tieBreaker: "first-column", ruleKey: key, contentHash: "" } }];
  // Values come from value functions (convex/v2/values.gen.ts); grids have none yet, so the server refuses to value
  // (and the deal to deal) a grid rule, by name. When grid value functions land, this asserts the rows-add-up line's
  // worth instead (it was > 16 bits under the artefacts).
  if (valueRecord(key)) {
    const [v] = valuesOf(decode(wire, "grid-4-d10"), "grid-4-d10", seat);
    assert.ok(v!.rarityBits > 16, `every row adds up to 18: ${v!.rarityBits} bits`);
  } else {
    assert.throws(() => valuesOf(decode(wire, "grid-4-d10"), "grid-4-d10", seat), new RegExp(`No value function for ${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("a grid representation's mutators name their arguments, with choices for cells and lines", () => {
  const ms = mutatorsOf("cells", "grid-4-d10");
  assert.deepEqual(ms.map(m => m.id), ["cells.add", "cells.swap"]);
  assert.deepEqual(ms[0]!.args, [{ name: "cell", code: "choice" }, { name: "k", code: "integer" }]);
});
