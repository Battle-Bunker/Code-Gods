/** Dealing defence goals (v1, restored; owner-decisions call 1): one per seat, a uniform family then uniform params. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dealDefence, defencePool } from "../../convex/v2/deal.ts";

test("the grid deals v1's colour-free penalties, each with a value function and a card; lines deal none", () => {
  const pool = defencePool("grid-4-d10");
  assert.deepEqual(pool.map(g => g[0]!.family).sort(), ["hated-number", "number-crowd"]);
  assert.equal(pool.find(g => g[0]!.family === "hated-number")!.length, 10);
  for (const g of pool) for (const d of g) assert.ok(d.card.length > 0 && d.ruleKey.length > 0);
  assert.equal(dealDefence("line-q", 3, "s"), null);
  assert.deepEqual(defencePool("grid-4-d10", ["number-crowd"]).map(g => g[0]!.family), ["hated-number"]);
  assert.equal(dealDefence("grid-4-d10", 3, "s", ["hated-number", "number-crowd"]), null);
});

test("every seat gets one, the families uniformly (not weighted by how many parameter sets they have), replayably", () => {
  assert.deepEqual(dealDefence("grid-4-d10", 4, "seed-1"), dealDefence("grid-4-d10", 4, "seed-1"));
  assert.equal(dealDefence("grid-4-d10", 4, "seed-1")!.length, 4);
  let crowd = 0, n = 0;
  for (let s = 0; s < 2000; s++) for (const d of dealDefence("grid-4-d10", 3, `s${s}`)!) { n++; if (d.family === "number-crowd") crowd++; }
  assert.ok(Math.abs(crowd / n - 0.5) < 0.03, `Number crowd in ${(100 * crowd / n).toFixed(1)}% of seats`);
});
