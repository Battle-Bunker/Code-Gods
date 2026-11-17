/** The harness: a fixed budget, utilities on every player's rule, energy split by view, bits from the value functions. */
import { lineZ } from "./config.ts";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { lineType } from "@workspace/v2-linear";
import { exampleFor, sandboxes, startersFor } from "../src/index.ts";
import { formatReport, runHarness } from "../src/harness.ts";

const boxes = sandboxes();
after(() => boxes.close());
const player = (name: string, family: string, tieBreaker: string | null, params?: Record<string, unknown>) => {
  const a = exampleFor(family, tieBreaker, "typescript") ?? { language: "typescript" as const, source: startersFor(family, "typescript").find(x => x.kind === "simple")!.source };
  return { name, rule: { family, params: params ?? lineType.families.find(f => f.id === family)!.dealable(lineZ)[0] as Record<string, unknown>, tieBreaker }, program: { language: a.language, source: a.source } };
};

test("two players on shared lines spend their budget, by view, and both rules are measured", async () => {
  const r = await runHarness(boxes, {
    type: lineType, variant: lineZ, lines: 3, seed: "t", budget: 200,
    players: [player("A", "power-hug", null, { k: 3 }), player("B", "multiples", null, { k: 3 })]
  });
  assert.equal(r.rules.length, 2);
  for (const s of r.spend) {
    const views = Object.values(s.reads).concat(Object.values(s.changes)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(views - s.spent) < 1e-6, `${s.player}: energy by view adds up to what was spent`);
    assert.ok(s.spent >= 200 || s.acts.committed + s.acts.skipped + s.acts.failed === 400, "a player stops when its budget is spent");
    assert.ok(s.acts.committed > 0);
  }
  const a = r.rules[0]!;
  assert.equal(a.utilities.start.length, 1, "one utility (owner decision 50)");
  assert.equal(a.utilities.end.length, 1);
  assert.match(formatReport(r), /\| A \| power-hug/);
});
