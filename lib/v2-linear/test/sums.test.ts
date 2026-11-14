/**
 * The exact valuation trusts each family's summation plan (src/sums.ts): each band must hold every line whose main layer
 * reaches its level. Brute force over every line with |m|, |c| ≤ 60 checks it, for every family that declares one,
 * on its first dealable parameters. What would break: a band that misses lines, which would make a value too high.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, levelOf, objectLadder, q, type RuleFamily } from "@workspace/v2-core";
import { fromMC, lineSums, lineType, lineZ, type LineState } from "../src/index.ts";

for (const [id, plan] of Object.entries(lineSums)) for (const band of plan.bands ?? []) {
  test(`${id}: every line at main level ≥ ${band.fromMain({})} lies in its band`, () => {
    const f = lineType.families.find(x => x.id === id)! as RuleFamily<LineState, unknown>;
    const p = f.dealable(lineZ)[0]!;
    const tb = f.tieBreakers[0]?.id ?? null;
    const ladder = objectLadder(lineType, f, p, lineZ, tb);
    const from = band.fromMain(p);
    let reached = 0;
    for (let m = -60n; m <= 60n; m++) {
      const ranges = band.ranges(m, p);
      for (let c = -60n; c <= 60n; c++) {
        const level = levelOf(evaluateObject(lineType, f, p, { lines: [fromMC(q(m), q(c))] }, lineZ, tb).score, ladder);
        if ((ladder[level]!.main ?? 0) < from) continue;
        reached++;
        assert.ok(ranges.some(r => c >= r.lo && c <= r.hi && (!r.step || c % r.step === 0n)), `${id}: y = ${m}x + ${c} reaches main level ${ladder[level]!.main} but is outside its band`);
      }
    }
    assert.ok(reached > 0, `${id}: some line reaches the band's level`);
    // Point bands: the outside bound the valuation uses holds only if the points are what the band says they are.
    const key = (m: bigint) => band.ranges(m, p).map(r => `${r.lo}`).join(",");
    for (let m = -60n; m <= 60n; m++) {
      if (band.points) assert.ok(band.ranges(m, p).every(r => r.lo === r.hi && !r.step), `${id}: points are single values`);
      if (band.points === "same") assert.equal(key(m), key(0n), `${id}: the same points for every m`);
      if (band.points === "one-per-m") assert.ok(band.ranges(m, p).length <= 1, `${id}: at most one point for each m`);
    }
  });
}
