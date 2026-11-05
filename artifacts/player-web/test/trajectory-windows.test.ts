// The bits-over-time history as fixed windows plus a live tail (src/sdk/trajectory-windows.ts).
// What would break: a closed window that reaches past the latest batch (it would re-run on every tick), a tail that
// reads more than one slice, a gap or overlap between windows (lost or doubled points), a reader holding a
// subscription per slice of a long game, or a merge that repeats a point, drops one, or changes the history's arrays.
import test from "node:test";
import assert from "node:assert/strict";
import { KEEP, MAX_POINTS, SLICE, extendWith, lastPoints, loadedRun, planWindows, type TrajectoryPage } from "../src/sdk/trajectory-windows.ts";

const closed = (from: number) => ({ afterSeq: from - 1, upTo: from + SLICE - 1, limit: SLICE });

test("plan: the closed windows of whole slices already written after the folded history, at most KEEP, then the tail", () => {
  assert.deepEqual([SLICE, KEEP], [10, 10]);
  assert.deepEqual(planWindows(-1), { closed: [], tail: { afterSeq: -1, limit: 10 }, complete: true }, "nothing known: the tail from the start");
  assert.deepEqual(planWindows(8), { closed: [], tail: { afterSeq: -1, limit: 10 }, complete: true }, "batches 0..8: not a whole slice yet");
  assert.deepEqual(planWindows(9), { closed: [], tail: { afterSeq: -1, limit: 10 }, complete: true }, "0..9: the latest batch may still grow (a replay's playhead)");
  assert.deepEqual(planWindows(10), { closed: [closed(0)], tail: { afterSeq: 9, limit: 10 }, complete: true }, "a later batch: 0..9 closed");
  assert.deepEqual(planWindows(25, 9), { closed: [closed(10)], tail: { afterSeq: 19, limit: 10 }, complete: true }, "0..9 folded");
  assert.deepEqual(planWindows(30, 29), { closed: [], tail: { afterSeq: 29, limit: 10 }, complete: true });
  const long = planWindows(1234, 99);
  assert.equal(long.closed.length, KEEP, "a long history loads KEEP windows at a time");
  assert.deepEqual([long.closed[0], long.closed.at(-1), long.complete], [closed(100), closed(190), false]);
  assert.deepEqual(long.tail, { afterSeq: 1229, limit: 10 });
  for (const [latest, folded] of [[0, -1], [9, -1], [10, -1], [99, 39], [123, 109], [55, -1], [120, 109]]) {
    const { closed: windows, tail, complete } = planWindows(latest, folded, 100);
    // Contiguous from the folded history; every closed window ends before `latest`; the tail continues them.
    windows.forEach((w, i) => assert.equal(w.afterSeq, i ? windows[i - 1].upTo : folded));
    assert.ok(windows.every(w => w.upTo !== undefined && w.upTo < latest && w.upTo - w.afterSeq === SLICE));
    assert.equal(tail.afterSeq, windows.at(-1)?.upTo ?? folded);
    assert.ok(complete && latest - tail.afterSeq <= SLICE, "the tail has at most one slice to read");
  }
});

const pt = (seq: number) => ({ seq });
const page = (objects: Record<string, number[]>): TrajectoryPage =>
  ({ gameId: "g", objects: Object.entries(objects).map(([objectId, seqs]) => ({ objectId, points: seqs.map(pt) })), nextCursor: 0, latestCursor: 0 });
const seqs = (series: ReadonlyMap<string, readonly { seq: number }[]>) => [...series].map(([id, ps]) => [id, ps.map(p => p.seq)]);

test("extend: pages in log order, each object's points once, a missing page skipped; the base's arrays untouched", () => {
  const base = extendWith(new Map(), [page({ a: [0, 5], b: [2] })]);
  const a = base.get("a")!, b = base.get("b")!;
  const out = extendWith(base, [page({ a: [5, 11] }), undefined, page({ a: [11, 12], c: [15] })]);
  assert.deepEqual(seqs(out), [["a", [0, 5, 11, 12]], ["b", [2]], ["c", [15]]]);
  assert.deepEqual(a.map(p => p.seq), [0, 5], "base unchanged");
  assert.equal(out.get("b"), b, "an object the pages leave alone keeps its array");
  assert.deepEqual(extendWith(base, []), base);
});

test("the newest MAX_POINTS of each series; the closed pages that fold together", () => {
  const long = Array.from({ length: MAX_POINTS + 5 }, (_, i) => pt(i));
  const out = lastPoints(new Map([["a", long], ["b", [pt(1)]]]));
  assert.equal(out.get("a")!.length, MAX_POINTS);
  assert.equal(out.get("a")![0].seq, 5);
  assert.equal(long.length, MAX_POINTS + 5, "input unchanged");
  const p = page({});
  assert.deepEqual([loadedRun([]), loadedRun([p, p]), loadedRun([p, undefined, p]), loadedRun([undefined, p])], [0, 2, 1, 0]);
});
