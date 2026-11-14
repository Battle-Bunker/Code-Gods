/**
 * The app draws whichever object type a game plays (sdk/object-types.ts): what would break is a grid game decoded as
 * lines, named "line", or its moves and try-outs looked up among the line's mutators.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridType, grid4 } from "@workspace/v2-grid";
import { lineZ } from "@workspace/v2-linear";
import { decodeState, familyOf, ruleRefOf } from "../src/sdk/rule.ts";
import { defaultRepOf, objectTypeOf, objectWord, variantOf } from "../src/sdk/object-types.ts";
import { callWords } from "../src/panes/move-line.ts";
import { mutatorChoices, whatIf } from "../src/panes/what-if-model.ts";

test("a grid variant is a grid everywhere: type, variant, noun, first representation, decoding", () => {
  assert.equal(objectTypeOf("grid-4-d10").id, "grid");
  assert.equal(objectTypeOf("line-z").id, "line");
  assert.equal(variantOf("grid-4-d10"), grid4);
  assert.equal(variantOf("line-z"), lineZ);
  assert.deepEqual(objectWord("grid-4-d10"), { one: "grid", One: "Grid", many: "grids", Many: "Grids" });
  assert.equal(objectWord("line-z").One, "Line");
  assert.equal(defaultRepOf("grid-4-d10"), "cells");
  assert.equal(defaultRepOf("line-z"), "si");
  assert.deepEqual(decodeState("0120/3001/0000/9000", "grid-4-d10").cells.slice(0, 4), [0, 1, 2, 0]);
  assert.deepEqual(decodeState("0120/3001/0000/9000").cells.length, 16, "the wire's shape decides without a variant");
});

test("a dealt grid rule resolves against the grid type, and its moves are described and tried out", () => {
  const f = gridType.families[0]!;
  assert.equal(familyOf(f.id), f);
  const rule = ruleRefOf({ family: f.id, params: f.dealable(grid4)[0], tieBreaker: f.tieBreakers[0]!.id } as never, "grid-4-d10")!;
  assert.equal(rule.type, gridType);
  assert.equal(callWords([{ mutator: "cells.add", site: 0, args: { cell: "r0c1", k: "2" } }], grid4), "+2 in row 1, column 2");
  const choices = mutatorChoices(grid4);
  assert.deepEqual(choices.map(c => c.id), grid4.mutators);
  const out = whatIf({ rule, state: decodeState("0120/3001/0000/9000", "grid-4-d10"), call: { mutator: "cells.add", args: { cell: "r0c0", k: "1" } }, value: null, want: null });
  assert.ok(out.ok, out.ok ? "" : out.reason);
  if (out.ok) assert.equal(gridType.encode(out.after as never), "1120/3001/0000/9000");
});
