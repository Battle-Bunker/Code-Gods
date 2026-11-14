/** One summary line per contested object (src/panes/summary-tugs.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTugs } from "../src/panes/summary-tugs.ts";

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
