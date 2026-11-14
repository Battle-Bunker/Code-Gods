import { test } from "node:test";
import assert from "node:assert/strict";
import { productSign, sharedRanks } from "../src/core/words.ts";

test("equal shown totals share a rank; the next rank skips (1st, tied 2nd, 4th)", () => {
  const rows = [
    { memberId: "a", net: 3000, rank: 1 },
    { memberId: "b", net: 2552.71, rank: 2 },
    { memberId: "c", net: 2552.69, rank: 3 },
    { memberId: "d", net: 10, rank: 4 },
  ];
  assert.deepEqual(sharedRanks(rows).map(r => [r.memberId, r.rank]), [["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
});

test("a product shown with = only when the shown numbers multiply to the shown result", () => {
  assert.equal(productSign(3.4, 2.0, 6.8), "=");
  assert.equal(productSign(4.2, 12.0, 51.0), "≈");   // 4.2 × 12.0 = 50.4: the inputs were rounded
  assert.equal(productSign(4.24, 12.04, 51.05), "≈");
});
