// The bits-over-time history as fixed windows plus a live tail (src/sdk/trajectory-windows.ts).
// What would break: a closed window that reaches past the latest batch (it would re-run on every tick), a tail that
// reads more than one slice, a gap or overlap between windows (lost or doubled points), or a merge that repeats a
// point, drops one, or changes the closed windows' arrays when the tail moves.
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_POINTS, SLICE, extendWith, lastPoints, mergePages, trajectoryWindows, type TrajectoryPage, type TrajectoryPoint } from "../src/sdk/trajectory-windows.ts";

test("windows: a closed window per whole slice already written, then a tail of at most one slice", () => {
  assert.equal(SLICE, 10);
  assert.deepEqual(trajectoryWindows(-1), [{ afterSeq: -1, limit: 10 }], "nothing known: the tail from the start");
  assert.deepEqual(trajectoryWindows(8), [{ afterSeq: -1, limit: 10 }], "batches 0..8: not a whole slice yet");
  assert.deepEqual(trajectoryWindows(9), [{ afterSeq: -1, upTo: 9, limit: 10 }, { afterSeq: 9, limit: 10 }], "0..9 written: closed");
  assert.deepEqual(trajectoryWindows(25), [
    { afterSeq: -1, upTo: 9, limit: 10 }, { afterSeq: 9, upTo: 19, limit: 10 }, { afterSeq: 19, limit: 10 },
  ]);
  for (const latest of [0, 9, 10, 99, 123]) {
    const windows = trajectoryWindows(latest), tail = windows.at(-1)!;
    // Contiguous: each window starts right after the one before; every closed window ends at or before `latest`.
    windows.slice(1).forEach((w, i) => assert.equal(w.afterSeq, windows[i].upTo));
    assert.ok(windows.slice(0, -1).every(w => w.upTo !== undefined && w.upTo <= latest && w.upTo - w.afterSeq === SLICE));
    assert.equal(tail.upTo, undefined);
    assert.ok(latest - tail.afterSeq <= SLICE, "the tail has at most one slice to read");
  }
});

const pt = (seq: number, payoff = seq): TrajectoryPoint => ({ seq, worldSeconds: seq, value: seq, ownNetBits: 0, peerNetBits: 0, payoff });
const page = (objects: Record<string, number[]>, nextCursor = 0): TrajectoryPage =>
  ({ gameId: "g", objects: Object.entries(objects).map(([objectId, seqs]) => ({ objectId, points: seqs.map(s => pt(s)) })), nextCursor, latestCursor: nextCursor });

test("merge: pages in log order, each object's points once, a missing page skipped", () => {
  const merged = mergePages([page({ a: [0, 3], b: [1] }), undefined, page({ a: [3, 12], c: [15] })]);
  assert.deepEqual([...merged].map(([id, ps]) => [id, ps.map(p => p.seq)]), [["a", [0, 3, 12]], ["b", [1]], ["c", [15]]]);
});

test("extend: the tail's newer points on a copy; the closed windows' arrays are untouched and shared", () => {
  const base = mergePages([page({ a: [0, 5], b: [2] })]);
  const a = base.get("a")!, b = base.get("b")!;
  const out = extendWith(base, page({ a: [5, 11, 12] }));
  assert.deepEqual(out.get("a")!.map(p => p.seq), [0, 5, 11, 12]);
  assert.deepEqual(a.map(p => p.seq), [0, 5], "base unchanged");
  assert.equal(out.get("b"), b, "an object the tail leaves alone keeps its array");
  assert.deepEqual(extendWith(base, undefined), base);
});

test("the newest MAX_POINTS of each series", () => {
  const long = Array.from({ length: MAX_POINTS + 5 }, (_, i) => pt(i));
  const out = lastPoints(new Map([["a", long], ["b", [pt(1)]]]));
  assert.equal(out.get("a")!.length, MAX_POINTS);
  assert.equal(out.get("a")![0].seq, 5);
  assert.equal(long.length, MAX_POINTS + 5, "input unchanged");
});
