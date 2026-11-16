import { test } from "node:test";
import assert from "node:assert/strict";
import { lineType, lineZ, primeLanding, type LineState } from "@workspace/v2-linear";
import { rarityScale, type RuleRef } from "../src/index.ts";

const rule: RuleRef<LineState, unknown> = { type: lineType, family: primeLanding as never, params: { ends: 3 }, variant: lineZ, tieBreaker: "shared-factor" };
// A stand-in value curve: bigger main part, rarer.
const value = (u: readonly ({ n: bigint; d: bigint } | null)[] | null) => (u && u[0] ? Math.log2(2 + Math.abs(Number(u[0].n) / Number(u[0].d))) : 0);

test("v1's 'How rare is each rule score?': a few main-part values, each the lowest score with it, rarer going down", () => {
  const rows = rarityScale(rule, value as never, 5);
  assert.ok(rows.length >= 3 && rows.length <= 5, `rows: ${rows.length}`);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i]!.bits > rows[i - 1]!.bits, "rarer down the table");
  assert.equal(new Set(rows.map(r => r.main)).size, rows.length, "one row per main-part value");
  assert.match(rows[0]!.text, /^.+: 1 in [\d.,]+ by chance \([\d.]+ bits?\)$/);
});

test("no value curve, no table", () => {
  assert.deepEqual(rarityScale(rule, null, 5), []);
});
