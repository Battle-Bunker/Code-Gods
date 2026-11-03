import test from "node:test";
import assert from "node:assert/strict";
import { judgeMemory } from "../../convex/runtime/memory.ts";

// Run 41594471296: a warm compiler process started at 290 MiB and ended at 415; the peak (415) is far from the 512 MiB limit.
test("a warm process that ends above 400 MiB but peaks within 460 passes, with a warning", () => {
  const { failures, warnings } = judgeMemory({ typescriptCompiler: { startMiB: 290, rssMiB: 415, peakMiB: 415 } });
  assert.deepEqual(failures, []);
  assert.equal(warnings.length, 1);
});

test("only a peak over 460 MiB fails", () => {
  assert.equal(judgeMemory({ a: { startMiB: 1, rssMiB: 300, peakMiB: 460 } }).failures.length, 0);
  assert.equal(judgeMemory({ a: { startMiB: 1, rssMiB: 300, peakMiB: 461 } }).failures.length, 1);
  assert.deepEqual(judgeMemory({ a: { startMiB: 1, rssMiB: 300, peakMiB: 300 } }), { failures: [], warnings: [] });
});
