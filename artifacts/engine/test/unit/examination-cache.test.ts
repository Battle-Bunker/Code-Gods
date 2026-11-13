/** The examination cache's keeping rule (convex/lib/examinationCache.ts): pure, no backend. */
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_CACHED_CALLS, mergeRuns, type CachedRun } from "../../convex/lib/examinationCache.ts";

const run = (k: string, calls = "[]"): CachedRun => ({ k, calls, usedRandom: false });

test("an examination's own runs are kept first; older ones fill what is left, once each", () => {
  const used = [run("ref1"), run("ref2"), run("boardB")], stored = [run("ref1"), run("boardA1"), run("boardA2"), run("ref2")];
  assert.deepEqual(mergeRuns(used, stored, 10).map(r => r.k), ["ref1", "ref2", "boardB", "boardA1", "boardA2"]);
  // At the limit the runs just used survive (the reference objects, used by every examination); an old board's go.
  assert.deepEqual(mergeRuns(used, stored, 4).map(r => r.k), ["ref1", "ref2", "boardB", "boardA1"]);
  assert.deepEqual(mergeRuns(used, stored, 2).map(r => r.k), ["ref1", "ref2"]);
});

test("a run used twice is stored once, and an oversized answer is not stored", () => {
  assert.deepEqual(mergeRuns([run("a"), run("a"), run("b", "x".repeat(MAX_CACHED_CALLS + 1)), run("c", "x".repeat(MAX_CACHED_CALLS))], []).map(r => r.k), ["a", "c"]);
});

test("the answers kept stay within the character budget, the examination's own first", () => {
  const big = (k: string) => run(k, "x".repeat(1000));
  assert.deepEqual(mergeRuns([big("a"), big("b")], [big("c"), run("d", "y")], 600, 2001).map(r => r.k), ["a", "b", "d"]);
});
