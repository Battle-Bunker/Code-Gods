import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, touchingPairs, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "number-bonds")!;
const terms = (s: GridState) =>
  Object.fromEntries(evaluateSite(gridType, fam, {}, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Number Bonds (v1 number_bonds): one instance, the 24 touching pairs, three tie-breakers", () => {
  assert.deepEqual(fam.dealable(grid4), [{}]);
  assert.equal(touchingPairs(4).length, 24);
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["far-split", "bond-run", "prime-bonds"]);
});

test("Number Bonds: touching pairs adding up to 10, and what the bonds are made of", () => {
  // Row 0: 1 9 1 9 (three bonds, a run of 4); column 3: 9 above 1 (a bond); 3 7 in row 2 (a prime bond); 5 5 down column 0.
  const s = board("1919", "5001", "5370", "0000");
  // Bonds: (1,9) (9,1) (1,9) across row 0; (9,1) down column 3; (5,5) down column 0; (3,7) across row 2.
  assert.deepEqual(terms(s), { "number-bonds": 6, "far-split": 8 + 8 + 8 + 8 + 0 + 4, "bond-run": 4, "prime-bonds": 2 });
  assert.deepEqual(terms(board("5555", "5555", "5555", "5555")), { "number-bonds": 24, "far-split": 0, "bond-run": 4, "prime-bonds": 24 });
  assert.deepEqual(terms(board("0000", "0000", "0000", "0000")), { "number-bonds": 0, "far-split": 0, "bond-run": 0, "prime-bonds": 0 });
});

test("Number Bonds: the card explains a bond", () => {
  assert.match(fam.card({}, null), /^Two touching cells \(side by side, or one above the other\) are a bond when their numbers add up to 10, like 3 and 7\./);
  assert.match(fam.card({}, "far-split"), /Secondary: The two numbers in each bond should be as far apart as possible: 1 and 9 are 8 apart/);
});
