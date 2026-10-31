/**
 * The generic annotation (src/sdk/annotate.ts): a sensitivity analysis that re-scores a value with each cell, digit or
 * character changed, with a fake scorer so the expected marks can be derived by hand; its bounds (at most 6
 * alternatives per position, about 300 scorings per object); the annotation cache; the idle-time runner; and the choice
 * between a family's own annotator and the generic one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import {
  AnnotationCache, MAX_ALTERNATIVES, MAX_SCORINGS, alternativesFor, annotateValue, annotationKey, runWhenIdle, sensitivity,
  type IdleScheduler,
} from "../src/sdk/annotate.ts";

const grid3 = instantiate("Grid", { size: 3, symbols: "base10", colours: "rgb" });
const grid7 = instantiate("Grid", { size: 7, symbols: "cards", colours: "rainbow6" });
const cell = (value: unknown, r: number, c: number) => String(value).split("/")[r].split(",")[c];
const red = (value: unknown, r: number, c: number) => cell(value, r, c).endsWith("R");

test("a cell whose change drops the score supports it, weighted by the largest drop; cells that change nothing are left out", () => {
  // Score: 2 for a red top-left cell, 1 for a red top-middle cell.
  const score = (v: unknown) => (red(v, 0, 0) ? 2 : 0) + (red(v, 0, 1) ? 1 : 0);
  const value = "0R,0R,0G/0G,0G,0G/0G,0G,0B";
  assert.deepEqual(sensitivity(value, score, alternativesFor(value, grid3)), [
    { kind: "cells", tone: "good", label: "supports your score", cells: [{ r: 0, c: 0, weight: 1 }, { r: 0, c: 1, weight: 0.5 }] },
  ]);
});

test("a cell that no change lowers but some change raises holds the score back, weighted by the largest rise", () => {
  // Score: the number of red cells in the top row. (0,2) is green: making it red would add a point.
  const score = (v: unknown) => [0, 1, 2].filter(c => red(v, 0, c)).length;
  const value = "0R,0R,0G/0G,0G,0G/0G,0G,0B";
  const marks = sensitivity(value, score, alternativesFor(value, grid3));
  assert.deepEqual(marks.find(a => a.kind === "cells" && a.tone === "bad"),
    { kind: "cells", tone: "bad", label: "holds your score back", cells: [{ r: 0, c: 2, weight: 1 }] });
  assert.deepEqual(marks.find(a => a.kind === "cells" && a.tone === "good"),
    { kind: "cells", tone: "good", label: "supports your score", cells: [{ r: 0, c: 0, weight: 1 }, { r: 0, c: 1, weight: 1 }] });
});

test("a flat score, an unreadable value or a throwing scorer gives no marks", () => {
  const value = "0R,0R,0G/0G,0G,0G/0G,0G,0B";
  assert.deepEqual(sensitivity(value, () => 3, alternativesFor(value, grid3)), []);
  assert.equal(alternativesFor("not a grid", grid3), null);
  assert.deepEqual(sensitivity("not a grid", () => 1, null), []);
  assert.deepEqual(sensitivity(value, () => { throw new Error("no"); }, alternativesFor(value, grid3)), []);
});

test("bounds: at most 6 alternatives per cell, so a 7×7 grid costs at most 294 scorings (plus the value itself)", () => {
  const value = Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => `${"A23456789TJQK"[(r + c) % 13]}${"SHDC"[c % 4]}${"ROYGBV"[(r * c) % 6]}`).join(",")).join("/");
  const alts = alternativesFor(value, grid7)!;
  assert.equal(alts.count, 49);
  for (let i = 0; i < 49; i++) {
    const variants = alts.variants(i);
    assert.ok(variants.length >= 1 && variants.length <= MAX_ALTERNATIVES);
    assert.equal(new Set(variants).size, variants.length, "no duplicates");
    assert.ok(!variants.includes(value), "every variant differs");
    for (const v of variants) {
      const changed = [...Array(49).keys()].filter(k => cell(v, Math.floor(k / 7), k % 7) !== cell(value, Math.floor(k / 7), k % 7));
      assert.deepEqual(changed, [i], "exactly the one cell changes");
    }
  }
  let scorings = 0;
  sensitivity(value, v => { scorings++; return String(v).length; }, alts);
  assert.ok(scorings <= 1 + 49 * MAX_ALTERNATIVES, `${scorings} scorings`);
  // A long string spreads the same budget thinner.
  const str = instantiate("string", { maxLength: 128 });
  scorings = 0;
  sensitivity("x".repeat(128), () => { scorings++; return 0; }, alternativesFor("x".repeat(128), str));
  assert.ok(scorings <= 1 + MAX_SCORINGS, `${scorings} scorings`);
});

test("Int: digit positions from the left, past the sign; variants stay in the instantiation's range", () => {
  const int = instantiate("Int", { min: -9999, max: 9999 });
  const sevens = (v: unknown) => [...String(v)].filter(ch => ch === "7").length;
  // The 7s support the score; the 1 and the 0 could each become a 7.
  assert.deepEqual(sensitivity(-1707, sevens, alternativesFor(-1707, int)), [
    { kind: "digits", tone: "good", label: "supports your score", positions: [1, 3], weights: [1, 1] },
    { kind: "digits", tone: "bad", label: "holds your score back", positions: [0, 2], weights: [1, 1] },
  ]);
  const small = instantiate("Int", { min: 0, max: 20 });
  const alts = alternativesFor(15, small)!;
  for (let i = 0; i < alts.count; i++) for (const v of alts.variants(i)) assert.ok(typeof v === "number" && v >= 0 && v <= 20, String(v));
});

test("string: character positions as spans", () => {
  const str = instantiate("string", { maxLength: 16 });
  const as = (v: unknown) => [...String(v)].filter(ch => ch === "a").length;
  // The "a" supports the score; each "b" could become an "a" (a character already in the string is tried first).
  assert.deepEqual(sensitivity("bab", as, alternativesFor("bab", str)), [
    { kind: "spans", tone: "good", label: "supports your score", spans: [{ start: 1, end: 2, weight: 1 }] },
    { kind: "spans", tone: "bad", label: "holds your score back", spans: [{ start: 0, end: 1, weight: 1 }, { start: 2, end: 3, weight: 1 }] },
  ]);
});

test("annotateValue prefers the family's own annotator, else the generic one, else nothing", () => {
  const value = "0R,0R,0G/0G,0G,0G/0G,0G,0B";
  const descriptor = { familyId: "kingdom", params: { C: 0 } };
  const bespoke = [{ kind: "badge" as const, tone: "neutral" as const, text: "mine" }];
  assert.deepEqual(annotateValue(value, { descriptor, inst: grid3, annotator: () => bespoke, score: () => { throw new Error("unused"); } }), bespoke);
  const score = (v: unknown) => (red(v, 0, 0) ? 1 : 0);
  assert.deepEqual(annotateValue(value, { descriptor, inst: grid3, score }), [{ kind: "cells", tone: "good", label: "supports your score", cells: [{ r: 0, c: 0, weight: 1 }] }]);
  assert.deepEqual(annotateValue(value, { descriptor, inst: grid3 }), []);
});

test("the cache keys by game and value, refreshes on read and evicts the least recently used", () => {
  assert.equal(annotationKey("g1", "0R,1G"), "g1:0R,1G");
  assert.equal(annotationKey("g1", 42), "g1:42");
  const cache = new AnnotationCache(2);
  cache.set("a", []);
  cache.set("b", []);
  assert.ok(cache.get("a"), "a read refreshes a");
  cache.set("c", []);
  assert.equal(cache.has("b"), false, "b was the least recently used");
  assert.ok(cache.has("a") && cache.has("c"));
  assert.equal(cache.size, 2);
});

test("runWhenIdle works through items in idle slices, at least one per slice, reports each batch, and stops when cancelled", () => {
  const queue: ((d: { timeRemaining(): number }) => void)[] = [];
  const schedule: IdleScheduler = run => { queue.push(run); return () => { queue.splice(queue.indexOf(run), 1); }; };
  const done: number[] = [];
  let batches = 0;
  runWhenIdle([1, 2, 3, 4, 5], n => done.push(n), { schedule, onBatch: () => batches++ });
  assert.deepEqual(done, [], "nothing runs during the call (never blocks a render)");
  let budget = 2;
  queue.shift()!({ timeRemaining: () => (budget-- > 0 ? 10 : 0) });
  assert.deepEqual(done, [1, 2, 3]);
  queue.shift()!({ timeRemaining: () => 0 });
  assert.deepEqual(done, [1, 2, 3, 4], "a slice with no time left still does one item");
  assert.equal(batches, 2);
  const cancel = runWhenIdle([9], n => done.push(n), { schedule });
  cancel();
  assert.equal(queue.length, 1, "the cancelled run left nothing scheduled; the first run still has item 5");
  queue.shift()!({ timeRemaining: () => 10 });
  assert.deepEqual(done, [1, 2, 3, 4, 5]);
  assert.equal(queue.length, 0);
});
