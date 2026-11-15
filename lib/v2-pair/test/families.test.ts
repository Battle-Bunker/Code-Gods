import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, Qn, scoreToWire, tieBreakersOn } from "@workspace/v2-core";
import { pairFamilies, pairPresets, pairQ, pairType, type PairState } from "../src/index.ts";
import { L, Y, sys } from "./helpers.ts";

const school = sys(L(2, 3, -12), L(1, -1, -1));   // 2x + 3y = 12, x − y = 1: the answer (3, 2), D = ±5
const odd: PairState[] = [
  school,
  sys(L(0, 1, 0), L(1, 0, 0)),     // the axes
  sys(Y(2, 1), Y(2, -3)),          // parallel
  sys(L(1, 0, -3), Y(3, 1)),       // a vertical line
  sys(L(0, 1, -4), Y(-1, 0)),      // a horizontal line
  sys(L(1, 0, -2), L(1, 0, 5)),    // two vertical lines
];
const score = (id: string, tb: string | null, s: PairState) =>
  scoreToWire(evaluateObject(pairType, pairFamilies.find(f => f.id === id)!, {}, s, pairQ, tb).score);

test("every family scores every kind of system (parallel, vertical, horizontal) with every tie-breaker", () => {
  for (const f of pairFamilies) for (const s of odd) for (const t of [null, ...f.tieBreakers.map(x => x.id)]) {
    const e = evaluateObject(pairType, f, {}, s, pairQ, t);
    assert.ok(e.score === null || e.score.length === (t === null ? 1 : 2), `${f.id}/${t}`);
  }
});

test("Whole Answer on 2x + 3y = 12, x − y = 1: whole answer, |X| + |Y| = 5 shares 5 with D, X + Y = 5", () => {
  assert.deepEqual(score("whole-answer", "peg-divisor", school), ["0", "5"]);
  assert.deepEqual(score("whole-answer", "south-west", school), ["0", "-5"]);
});

test("parallel lines have no answer: the crossing families score worst", () => {
  const par = sys(Y(2, 1), Y(2, -3));
  for (const id of ["whole-answer", "no-fractions", "right-angle", "on-the-diagonal"]) assert.equal(score(id, null, par), null, id);
});

test("the axes are the centre: Right Angle at its top, its tie-breakers at the bottom (the trivial anchor earns nothing)", () => {
  const axes = sys(L(0, 1, 0), L(1, 0, 0));
  assert.deepEqual(score("right-angle", "prime-divisor", axes), ["0", "1"]);
  assert.deepEqual(score("whole-answer", "peg-divisor", axes), ["0", "0"]);
});

test("Steep Ratio reads the whole number of times nearest the ratio, at least 2 either way", () => {
  const s = sys(Y(6, 0), Y(2, 5));     // 3 times as steep
  assert.deepEqual(score("steep-ratio", "ratio-prime", s), ["0", "3"]);
});

test("a zoom of the picture (positions × n) cannot raise a capped hill past the number it is capped by", () => {
  // y = 2x + 3 and y = −x + 6 cross at (1, 4); zoom × 96 (a smooth number): c × 96.
  const base = sys(Y(2, 3), Y(-1, 6)), zoomed = sys(Y(2, 288), Y(-1, 576));
  for (const [id, tb] of [["whole-answer", "peg-divisor"], ["double-gap", "gap-divisor"], ["forty-five", "divisor-gap"], ["high-start", "start-factors"]] as const) {
    const before = score(id, tb, base), after = score(id, tb, zoomed);
    if (!before || !after) continue;
    // D is unchanged by a zoom, so a common factor with D stays at most |D| = 3.
    assert.ok(Qn.parse(after[1]!).n <= 3n || id === "high-start", `${id}/${tb}: ${after}`);
  }
});

test("the preset deals every family with both tie-breakers", () => {
  const p = pairPresets[0];
  assert.equal(p.id, "lines-pairs");
  assert.equal(p.rules.length, pairFamilies.length - 1);   // On the Diagonal is not dealt
  assert.ok(!p.rules.some(r => r.family === "on-the-diagonal"));
  for (const r of p.rules) assert.equal(r.tieBreakers.length, tieBreakersOn(pairFamilies.find(f => f.id === r.family)!, pairQ).length);
});

test("a primary is never met by one line alone: the diagonal itself, a line through the origin", () => {
  assert.equal(score("on-the-diagonal", null, sys(Y(1, 0), Y(2, 53))), null);   // y = x would meet every line on the diagonal
  assert.equal(score("double-gap", null, sys(Y(1, 0), Y(2, 53))), null);        // and double any line's gaps
  assert.deepEqual(score("on-the-diagonal", null, sys(Y(2, -3), Y(-1, 6))), ["0"]);   // (3, 3)
});
