// R8 for engine v2: every public live query under convex/v2 (outside ops/, whose functions are affordances) has a row
// in test/v2-query-budgets.ts, and every row names a query that exists. What would break: a new v2 page query that the
// gate never measures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { V2_BUDGETS } from "../v2-query-budgets.ts";

const V2 = join(import.meta.dirname, "..", "..", "convex", "v2");

test("every public v2 query has a budget row, and every row is a public v2 query", () => {
  const found = new Set<string>();
  for (const name of readdirSync(V2)) {
    if (!name.endsWith(".ts")) continue;
    const text = readFileSync(join(V2, name), "utf8");
    for (const m of text.matchAll(/^export const (\w+) = query\(/gm)) found.add(`v2/${name.replace(/\.ts$/, "")}:${m[1]}`);
  }
  const budgeted = new Set(V2_BUDGETS.map(b => b.query));
  assert.deepEqual([...found].filter(q => !budgeted.has(q)).sort(), [], "public v2 queries without a budget row");
  assert.deepEqual([...budgeted].filter(q => !found.has(q)).sort(), [], "budget rows naming no public v2 query");
  assert.equal(budgeted.size, V2_BUDGETS.length, "one row per query");
});
