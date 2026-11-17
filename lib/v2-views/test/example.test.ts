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
import { dynamicFamilies, lineQ, lineType, lineZ, corner, type LineState } from "@workspace/v2-linear";
import { grid4, gridType } from "@workspace/v2-grid";
import { contributors, legibility, workedExample, type RuleRef } from "../src/index.ts";

/** No rule has a value table since decision 50. */
const valueOf = (_variant: string, _r: RuleRef<any, unknown>): ((u: Score) => number) | undefined => undefined;

test("Square Area's example has whole legs and a real square, and its tie-breaker counts", () => {
  for (const tb of corner.tieBreakers) {
    const rule: RuleRef<LineState, unknown> = { type: lineType, family: corner as never, params: corner.dealable(lineZ)[0], variant: lineZ, tieBreaker: tb.id };
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
    ...dynamicFamilies.flatMap(f => f.tieBreakers.map(tb => {
      const variant = f.dealable(lineZ).length ? lineZ : lineQ;   // Smooth Intercept is dealt on the rationals only
      return { type: lineType, family: f as never, params: f.dealable(variant)[0], variant, tieBreaker: tb.id };
    })),
    ...gridType.families.filter(f => !f.dynamic).map(f => ({ type: gridType, family: f, params: f.dealable(grid4)[0], variant: grid4, tieBreaker: f.tieBreakers[0]?.id })),
  ];
  for (const r of rules) {
    const ex = workedExample(r, valueOf(r.variant.id, r));
    const c = contributors(r, ex);
    assert.notEqual(c.utility, null, `${r.family.id}/${r.tieBreaker}: the example scores`);
    assert.doesNotMatch(c.parts[0]!.sentence, /≈/, `${r.family.id}/${r.tieBreaker}: ${c.parts[0]!.sentence}`);
  }
});

test("the card's ladder: each dealt line rule's rungs rise from the worked example, each with its real energy", async () => {
  const { withPhysics } = await import("@workspace/v2-core");
  const { LINES_BEGINNER_PHYSICS } = await import("@workspace/v2-economy");
  const { ladderRow, ladderRungs } = await import("../src/index.ts");
  const variant = withPhysics(lineQ, LINES_BEGINNER_PHYSICS);
  const short: string[] = [];
  for (const f of dynamicFamilies) {
    const rule: RuleRef<LineState, unknown> = { type: lineType, family: f as never, params: f.dealable(variant)[0], variant, tieBreaker: f.tieBreakers[0]?.id };
    const rungs = ladderRungs(rule, workedExample(rule));
    if (rungs.length < 3) short.push(`${f.id}: ${rungs.length}`);
    for (let i = 1; i < rungs.length; i++) assert.ok(rungs[i]!.u > rungs[i - 1]!.u, `${f.id}: utility rises along the ladder`);
    for (const r of rungs.slice(0, 2)) {
      const row = ladderRow(rule, r);
      assert.ok(Number.isFinite(row.bits) && row.bits >= 0, `${f.id}: a real energy`);
      assert.match(row.text, /^−?[\d,]+\.\d\d: y = .+ is worth [\d,]+\.\d\d bits?$/, `${f.id}: ${row.text}`);
      assert.doesNotMatch(row.text, /rare|chance/, "energy, never rarity");
    }
  }
  assert.deepEqual(short, [], "every dealt rule has a ladder of at least three rungs");
});
