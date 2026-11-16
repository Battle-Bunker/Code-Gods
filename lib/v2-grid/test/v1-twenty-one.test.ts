import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "twenty-one")!;
const terms = (s: GridState, T: number) =>
  Object.fromEntries(evaluateSite(gridType, fam, { T }, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Twenty-One: v1's targets 15–20; each row and column a hand, exactly T doubles, bust scores nothing", () => {
  assert.deepEqual(fam.dealable(grid4), [15, 16, 17, 18, 19, 20].map(T => ({ T })));
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["bust-by-little", "crossing-blackjacks", "low-cards"]);
  // Rows 18, 18, 10, 26; columns 5+5+0+9 = 19, 9+4+3+9 = 25, 2+0+7+8 = 17, 2+9+0+0 = 11.
  const s = board("5922", "5409", "0370", "9980");
  const t = terms(s, 18);
  assert.equal(t.hands, 36 + 36 + 10 + 0 + 0 + 0 + 17 + 11);
  assert.equal(t["bust-by-little"], 8 + 1 + 7);
  assert.equal(t["crossing-blackjacks"], 2 * 0, "two rows of 18, no column of 18");
  assert.equal(t["low-cards"], 9 + 9, "the rows of 18: 5922 (9) and 5409 (9)");
  const u = terms(s, 17);
  assert.equal(u.hands, 0 + 0 + 10 + 0 + 0 + 0 + 34 + 11);
  assert.equal(u["low-cards"], 8, "column 2 (2, 0, 7, 8)");
  assert.equal(terms(board("4554", "5445", "4554", "5445"), 18)["crossing-blackjacks"], 16, "four rows of 18 and four columns");
});

test("Twenty-One: the card says v1's words with the target", () => {
  assert.equal(fam.card({ T: 16 }, null),
    "Get close to 16 without going bust. Each row and each column is a blackjack hand: add it up. A hand of 16 or less scores its total in points, and exactly 16 scores 16 more. A hand over 16 is bust and scores nothing. More points is better.");
  assert.match(fam.card({ T: 16 }, "bust-by-little"), /Secondary: The bust hands should be as little over 16 as possible/);
});
