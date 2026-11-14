/**
 * The exact valuation trusts each family's summation plan (src/sums.ts): a band must hold every line whose main layer
 * reaches its level. Brute force over every line with |m|, |c| ≤ 60 checks it, for every family that declares one,
 * on its first dealable parameters. What would break: a band that misses lines, which would make a value too high.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, levelOf, objectLadder, q, type RuleFamily } from "@workspace/v2-core";
import { fromMC, lineSums, lineType, lineZ, type LineState } from "../src/index.ts";

for (const [id, plan] of Object.entries(lineSums)) {
  if (!plan.band) continue;
  test(`${id}: every line at main level ≥ ${plan.band.fromMain({})} lies in its band`, () => {
    const f = lineType.families.find(x => x.id === id)! as RuleFamily<LineState, unknown>;
    const p = f.dealable(lineZ)[0]!;
    const tb = f.tieBreakers[0]?.id ?? null;
    const ladder = objectLadder(lineType, f, p, lineZ, tb);
    const from = plan.band!.fromMain(p);
    let reached = 0;
    for (let m = -60n; m <= 60n; m++) {
      const ranges = plan.band!.ranges(m, p);
      for (let c = -60n; c <= 60n; c++) {
        const level = levelOf(evaluateObject(lineType, f, p, { lines: [fromMC(q(m), q(c))] }, lineZ, tb).score, ladder);
        if ((ladder[level]!.main ?? 0) < from) continue;
        reached++;
        assert.ok(ranges.some(r => c >= r.lo && c <= r.hi && (!r.step || c % r.step === 0n)), `${id}: y = ${m}x + ${c} reaches main level ${ladder[level]!.main} but is outside its band`);
      }
    }
    assert.ok(reached > 0, `${id}: some line reaches the band's level`);
  });
}
