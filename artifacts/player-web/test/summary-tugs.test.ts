/** One summary line per contested object (src/panes/summary-tugs.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTugs, tugsFromServer } from "../src/panes/summary-tugs.ts";

test("episodes on one grid are one tug in the summary (round 8b: grid 24 three times)", () => {
  const out = mergeTugs([
    { number: 24, withNames: ["Ada"], flips: 5, mySpend: 10, practice: false, best: { state: "a", points: 3 } },
    { number: 7, withNames: ["Bo"], flips: 2, mySpend: 1, practice: true },
    { number: 24, withNames: ["Ada", "Cy"], flips: 4, mySpend: 2.5, practice: false, best: { state: "b", points: 9 } },
    { number: 24, withNames: [], flips: 1, mySpend: 0.5, practice: false },
  ]);
  assert.deepEqual(out, [
    { number: 24, withNames: ["Ada", "Cy"], flips: 10, mySpend: 13, practice: false, best: { state: "b", points: 9 } },
    { number: 7, withNames: ["Bo"], flips: 2, mySpend: 1, practice: true },
  ]);
});

test("the tick's tug rows read as the summary's, without paging the act log (round 8/04)", () => {
  const kinds: Record<string, string> = { p1: "practice", h1: "human" };
  const out = tugsFromServer([
    { number: 24, flips: 9, mySpend: 12.5, others: [{ memberId: "h1", name: "Ada" }], best: { state: "s", points: 4 } },
    { number: 3, flips: 2, mySpend: 1, others: [{ memberId: "p1", name: "Practice partner 1" }], best: null },
  ], id => kinds[id], st => `decoded ${st}`);
  assert.deepEqual(out, [
    { number: 24, withNames: ["Ada"], flips: 9, mySpend: 12.5, practice: false, best: { state: "decoded s", points: 4 } },
    { number: 3, withNames: ["Practice partner 1"], flips: 2, mySpend: 1, practice: true },
  ]);
});
