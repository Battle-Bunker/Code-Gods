/** The harness: a fixed budget, utilities on every player's rule, energy split by view, bits from the value functions. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { lineType, lineZ } from "@workspace/v2-linear";
import { exampleFor, sandboxes } from "../src/index.ts";
import { findValues, formatReport, runHarness } from "../src/harness.ts";

const boxes = sandboxes();
after(() => boxes.close());
const player = (name: string, family: string, tieBreaker: string, params?: Record<string, unknown>) => {
  const a = exampleFor(family, tieBreaker, "typescript")!;
  return { name, rule: { family, params: params ?? lineType.families.find(f => f.id === family)!.dealable(lineZ)[0] as Record<string, unknown>, tieBreaker }, program: { language: a.language, source: a.source } };
};

test("two players on shared lines spend their budget, by view, and both rules are measured", async () => {
  const r = await runHarness(boxes, {
    type: lineType, variant: lineZ, lines: 3, seed: "t", budget: 60,
    players: [player("A", "m-meets-c", "meetPrime"), player("B", "treasure", "shared-factor", { k: 3 })]   // the coin-pile ladder, valued on line-z too
  });
  assert.equal(r.rules.length, 2);
  for (const s of r.spend) {
    const views = Object.values(s.reads).concat(Object.values(s.changes)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(views - s.spent) < 1e-6, `${s.player}: energy by view adds up to what was spent`);
    assert.ok(s.spent >= 60 || s.acts.committed + s.acts.skipped + s.acts.failed === 400, "a player stops when its budget is spent");
    assert.ok(s.acts.committed > 0);
  }
  const a = r.rules[0]!;
  assert.equal(a.utilities.start.length, 2, "main part and tie-breaker");
  assert.equal(a.utilities.end.length, 2);
  const vf = findValues("line-z", { family: "m-meets-c", params: {}, tieBreaker: "meetPrime" })!;
  assert.equal(a.bits!.measuredTo, vf.knots.at(-1)!.bits, "measured to: the furthest knot's bits");
  assert.ok(Math.abs(a.bitsGained! - 3 * (a.bits!.end - a.bits!.start)) < 1e-9, "bits gained is the sum over the lines");
  assert.match(formatReport(r), /\| A \| m-meets-c\/meetPrime \|/);
});
