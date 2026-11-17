/**
 * The live energy estimate against a much larger search (docs/engine-v2/estimator-accuracy.md): so a weak rule
 * heuristic cannot ship silently. The fixture holds, per state, the energy the larger search found
 * (scripts/estimator-accuracy.ts, 17 Nov: long climbs and a best-first search in all six lenses, an exhaustive
 * single-number sweep up to 10 bits); the larger search contains every live route, so the live estimate is at or above
 * it up to the starts' noise. Per rule and size, the mean of (live − larger) over the fixture's states must stay within
 * LIMIT bits. A rule whose utility changes must re-run the larger search for its rows (`estimator-accuracy.ts <rule>
 * 5,10,20`) and replace them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineQ } from "./config.ts";
import { dynamicFamilies, estimateLine, lineRule, type Line } from "../src/index.ts";

interface Row { readonly rule: string; readonly B: number; readonly p: unknown; readonly s: string; readonly big: number }
const rows: Row[] = JSON.parse(readFileSync(new URL("./fixtures/estimator-accuracy.json", import.meta.url), "utf8"));

/**
 * About 2 bits everywhere at 20 bits (3 allowed). At 5 and 10 bits, and where the time bound (17 Nov: each estimate's
 * work, rule searches included, within the work budget) cost accuracy, a rule is held where it was then plus a bit (a
 * ratchet), the rest at 2 (3 from 20 bits). Part of the small-line gap is the larger search summing more distinct cheap
 * targets; the rest is search the budget no longer pays for (Whole Stair, Corner at 20 bits).
 */
const KNOWN: Readonly<Record<string, number>> = {
  "bearing 10": 5.5, "golden-path 5": 4.5, "ring 5": 6.5, "ring 10": 5.5, "archimedes 5": 4.5, "hensel 5": 4,
  "hensel 10": 5, "whole-stair 5": 4, "whole-stair 10": 8.5, "whole-stair 20": 4, "corner 20": 5, "long-run 10": 3,
};
const LIMIT = (rule: string, B: number) => KNOWN[`${rule} ${B}`] ?? (B >= 20 ? 3 : 2);
/**
 * The time bound: a mean estimate per rule and size, in ms. The aim is about 50 ms in Node at any size (a commit
 * estimates every seat inside one mutation); this asserts three times that, so a slow CI machine does not fail it while a
 * search that escapes the budget (the old Whole Stair: 800 ms) still does.
 */
const MS = 150;
test("every dealt line rule's live energy stays within a few bits of a much larger search at 5, 10 and 20 bits, and within its time at every size", () => {
  const over: string[] = [];
  const slow: string[] = [];
  for (const F of dynamicFamilies) for (const B of [5, 10, 20, 40]) {
    const mine = rows.filter(r => r.rule === F.id && r.B === B);
    assert.ok(mine.length >= 4, `${F.id} at ${B} bits: the fixture has its states`);
    const t0 = performance.now();
    const gaps = mine.map(r => {
      const [a, b, c] = r.s.split(",").map(BigInt), s: Line = { a: a!, b: b!, c: c! };
      return estimateLine(s, lineRule(F.dynamic as never, r.p as never), lineQ, { seed: `acc:${r.s}` }).energy - r.big;
    });
    const ms = (performance.now() - t0) / mine.length, mean = gaps.reduce((t, g) => t + g, 0) / gaps.length;
    if (ms > MS) slow.push(`${F.id} at ${B} bits: ${ms.toFixed(0)} ms an estimate (limit ${MS})`);
    if (B <= 20 && mean > LIMIT(F.id, B)) over.push(`${F.id} at ${B} bits: ${mean.toFixed(1)} bits over (limit ${LIMIT(F.id, B)})`);
  }
  assert.deepEqual(over, []);
  assert.deepEqual(slow, []);
});
