/**
 * The points tree's parts (convex/v2/world.ts partsOf; treeLookup #985): a tree-valued rule's own bits as each dealt
 * layer's share, in rule order, with the uniqueness correction and a defence goal's net as parts of their own, so the
 * parts always sum to the bits shown. What would break: parts that do not add up to the bits, a layer named wrongly, a
 * lexicographic rule given parts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { partsOf } from "../../convex/v2/world.ts";

const sum = (ps: { bits: number }[]) => ps.reduce((t, p) => t + p.bits, 0);

test("a tree rule's parts are its layers in order, by their ids", () => {
  // level 4.6, closeness 5.1, third 0: 9.7 bits, no correction.
  assert.deepEqual(partsOf({ parts: [4.6, 5.1, 0] }, ["prime", "exact", "gradient"], 9.7, 9.7), [
    { layer: "prime", bits: 4.6 }, { layer: "exact", bits: 5.1 }, { layer: "gradient", bits: 0 },
  ]);
});

test("the uniqueness correction and a defence goal are parts of their own, so the parts sum to the bits", () => {
  // Raw 4 + 3 = 7 bits; uniqueness takes 0.5 (6.5); a defence goal nets it to 5.25.
  const ps = partsOf({ parts: [4, 3] }, ["level", "closeness"], 6.5, 5.25)!;
  assert.deepEqual(ps.map(p => p.layer), ["level", "closeness", "uniqueness", "defence"]);
  assert.ok(Math.abs(ps[2]!.bits + 0.5) < 1e-12 && Math.abs(ps[3]!.bits + 1.25) < 1e-12);
  assert.ok(Math.abs(sum(ps) - 5.25) < 1e-12);
});

test("a lexicographic rule has no parts", () => {
  assert.equal(partsOf({}, ["main"], 3, 3), null);
});
