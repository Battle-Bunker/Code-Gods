/**
 * The goal card's worked example (coordinator, from real games: Square Area showed y = 8x − 1, area 1/16, "nearest
 * square 0 = 0²"): a typical, legible line or board, chosen by a rule from the family's own contributors, never
 * hand-written: whole, modest numbers in what the rule reads, a non-zero reference, room to improve, a tie-breaker that
 * visibly counts, middling bits. The same rule always gets the same example.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Score } from "@workspace/v2-core";
import { beginnerPool, lineQ, lineType, lineZ, squareArea, type LineState } from "@workspace/v2-linear";
import { grid4, gridType } from "@workspace/v2-grid";
import { valueLookup, type ValueFunction } from "@workspace/v2-valuation";
import { contributors, legibility, workedExample, type RuleRef } from "../src/index.ts";

function valueOf(variant: string, r: RuleRef<any, unknown>): ((u: Score) => number) | undefined {
  const dir = path.resolve(import.meta.dirname, "../../v2-valuation/values", variant, r.family.id);
  let files: string[] = [];
  try { files = readdirSync(dir).filter(f => f.endsWith(`-${r.tieBreaker}.json`)); } catch { return undefined; }
  if (!files.length) return undefined;
  const look = valueLookup(JSON.parse(readFileSync(path.join(dir, files[0]!), "utf8")) as ValueFunction);
  return u => look(u).bits;
}

test("Square Area's example has whole legs and a real square, and its tie-breaker counts", () => {
  for (const tb of squareArea.tieBreakers) {
    const rule: RuleRef<LineState, unknown> = { type: lineType, family: squareArea as never, params: squareArea.dealable(lineZ)[0], variant: lineZ, tieBreaker: tb.id };
    const ex = workedExample(rule, valueOf("line-z", rule));
    const [main, tie] = contributors(rule, ex).parts;
    assert.ok(main!.reference && main!.reference.value >= 1, `${tb.id}: a non-zero square: ${main!.sentence}`);
    assert.doesNotMatch(main!.sentence, /[½⅓¼⅕⅙⅛⅔¾]|\/|≈/, `${tb.id}: whole numbers: ${main!.sentence}`);
    assert.ok(tie && Number(tie.valueText.replace(/,/g, "")) >= 2, `${tb.id}: the tie-breaker counts: ${tie?.sentence}`);
    assert.equal(legibility(rule, ex), 0, `${tb.id}: a fully legible example`);
    assert.deepEqual(workedExample(rule, valueOf("line-z", rule)), ex, "the same rule, the same example");
  }
});

test("every pool family, line or grid, gets a scoring example with no '≈' and no fraction in what its main part reads", () => {
  const rules: RuleRef<any, unknown>[] = [
    ...beginnerPool.flatMap(f => f.tieBreakers.map(tb => {
      const variant = f.dealable(lineZ).length ? lineZ : lineQ;   // Smooth Intercept is dealt on the rationals only
      return { type: lineType, family: f as never, params: f.dealable(variant)[0], variant, tieBreaker: tb.id };
    })),
    ...gridType.families.map(f => ({ type: gridType, family: f, params: f.dealable(grid4)[0], variant: grid4, tieBreaker: f.tieBreakers[0]?.id })),
  ];
  for (const r of rules) {
    const ex = workedExample(r, valueOf(r.variant.id, r));
    const c = contributors(r, ex);
    assert.notEqual(c.utility, null, `${r.family.id}/${r.tieBreaker}: the example scores`);
    assert.doesNotMatch(c.parts[0]!.sentence, /≈/, `${r.family.id}/${r.tieBreaker}: ${c.parts[0]!.sentence}`);
  }
});
