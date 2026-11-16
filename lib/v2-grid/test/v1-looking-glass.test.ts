import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = () => gridType.families.find(f => f.id === "looking-glass")!;
const terms = (s: GridState, params: unknown) =>
  Object.fromEntries(evaluateSite(gridType, fam(), params, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Looking-Glass is registered with v1's two folds and one tie-breaker", () => {
  assert.deepEqual(fam().dealable(grid4), [{ axis: "H" }, { axis: "V" }]);
  assert.deepEqual(fam().tieBreakers.map(t => t.id), ["twin-total"]);
});

test("Looking-Glass counts the pairs of mirror twins holding the same number", () => {
  // Left onto right: row 1 "1221" matches both pairs, row 2 "3453" its ends, row 3 "0000" both, row 4 "9870" none.
  const s = board("1221", "3453", "0000", "9870");
  assert.deepEqual(terms(s, { axis: "V" }), { twins: 5, "twin-total": 1 + 2 + 3 + 0 + 0 });
  // Top onto bottom: row 1 onto row 4 (1234 / 1239) matches 1, 2 and 3; row 2 onto row 3 (5678 / 5670) 5, 6 and 7.
  assert.deepEqual(terms(board("1234", "5678", "5670", "1239"), { axis: "H" }), { twins: 3 + 3, "twin-total": 1 + 2 + 3 + 5 + 6 + 7 });
  assert.equal(terms(board("0000", "0000", "0000", "0000"), { axis: "V" }).twins, 8, "a blank board is its own mirror image");
  assert.equal(terms(board("0123", "4567", "8901", "2345"), { axis: "V" }).twins, 0);
});

test("Looking-Glass card: v1's words, the fold named, the tie-breaker on the matching pairs", () => {
  assert.match(fam().card({ axis: "V" }, null), /left onto right/);
  assert.match(fam().card({ axis: "H" }, null), /top onto bottom/);
  assert.match(fam().card({ axis: "V" }, "twin-total"), /Secondary: .*matching pairs/);
});
