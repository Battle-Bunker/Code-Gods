import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, Qn, scoreToWire, tieBreakersOn } from "@workspace/v2-core";
import { LADDERS, pairFamilies, pairPresets, pairQ, pairType, residueAnchor, residueLadder, valuationLadder, type PairParams, type PairState } from "../src/index.ts";
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
const familyOf = (id: string) => pairFamilies.find(f => f.id === id)!;
/** A rule's score, with the given dealt numbers or the family's first dealable ones. */
const score = (id: string, tb: string | null, s: PairState, p?: PairParams) =>
  scoreToWire(evaluateObject(pairType, familyOf(id), p ?? familyOf(id).dealable(pairQ)[0]!, s, pairQ, tb).score);

test("every family scores every kind of system (parallel, vertical, horizontal) with every tie-breaker", () => {
  for (const f of pairFamilies) for (const p of f.dealable(pairQ)) for (const s of odd) for (const t of [null, ...f.tieBreakers.map(x => x.id)]) {
    const e = evaluateObject(pairType, f, p, s, pairQ, t);
    assert.ok(e.score === null || e.score.length === (t === null ? 1 : 2), `${f.id}/${t}`);
  }
});

test("Whole Answer on 2x + 3y = 12, x − y = 1: the answer (3, 2), y on the valuation ladder; |X| + |Y| = 5 shares 5 with D", () => {
  // q 5, r 2: y = 2 = 5⁰ × 2 is level 0; level 1 wants 10 when divided by 25 (5 × a number leaving 2), nearest 10, 8 away.
  // The score is 5⁰ × (1 + 1/(1 + 8)) = 10/9.
  const p = { q: 5, r: 2 };
  assert.deepEqual(score("whole-answer", "peg-divisor", school, p), ["10/9", "5"]);
  assert.deepEqual(score("whole-answer", "south-west", school, p), ["10/9", "-5"]);
  // q 3, r 1: 2 leaves 2, off the ladder; level 0's nearest is 1, one away: (1/3) × (1 + 1/2); |3| + |1| = 4 shares 1 with D.
  assert.deepEqual(score("whole-answer", "peg-divisor", school, { q: 3, r: 1 }), ["1/2", "1"]);
});

test("the valuation ladder: a stretch by q climbs one level, levels are disjoint, 0 is on none, off the ladder is below all", () => {
  const at = (v: number, p: PairParams) => { const l = valuationLadder(Qn.q(v), p); return [l.level, Qn.toWire(l.u)]; };
  // 2, 10, 50, 250 (q 5, r 2) are levels 0, 1, 2, 3: each ×5.
  assert.deepEqual([2, 10, 50, 250].map(v => at(v, { q: 5, r: 2 })[0]), [0, 1, 2, 3]);
  // 0 and 7 (7 = 5⁰ × 7 leaves 2, so level 0 too) and 3 (leaves 3: off the ladder).
  assert.equal(at(0, { q: 5, r: 2 })[0], -1);
  assert.equal(at(3, { q: 5, r: 2 })[0], -1);
  // Every level beats every lower one: 10 (level 1) beats 2 (level 0) beats 3 (off).
  const u = (v: number) => valuationLadder(Qn.q(v), { q: 5, r: 2 }).u;
  assert.ok(Qn.cmp(u(10), u(2)) > 0 && Qn.cmp(u(2), u(3)) > 0 && Qn.cmp(u(250), u(50)) > 0);
  // A level's score is at most 2 q^L, below the next level's least (q^(L+1)), so the score doubles at most once a level.
  assert.ok(Qn.cmp(u(50), Qn.q(50)) <= 0 && Qn.cmp(u(50), Qn.q(25)) > 0);
});

test("the residue ladder has no top: each level is q times rarer, every met level beats every state below it", () => {
  const at = (v: number, p: PairParams) => { const l = residueLadder(Qn.q(v), p); return [l.level, Qn.toWire(l.u), l.n]; };
  // 18 leaves 3 when divided by 5 and 18 when divided by 25 (level 2); level 3 wants 93 when divided by 125, nearest −32, 50 away.
  assert.deepEqual(at(18, { q: 5, r: 3 }), [2, "1300/51", 18n]);
  assert.deepEqual(at(93, { q: 5, r: 3 }), [3, Qn.toWire(Qn.mul(Qn.q(125), Qn.add(Qn.q(1), Qn.inv(Qn.q(1 + Math.min(Math.abs(93 - 468), Math.abs(93 + 157))))))), 93n]);
  // A level met beats the nearest miss of the level above: 3 (level 1) against 17.9 (level 0... of 25's 18).
  const met = residueLadder(Qn.q(3), { q: 5, r: 3 }).u, near = residueLadder(Qn.q(179, 10), { q: 5, r: 3 }).u;
  assert.ok(Qn.cmp(met, near) > 0, `${Qn.toWire(met)} > ${Qn.toWire(near)}`);
  // No dealt remainder is 0 or q − 1, the two that one number (0 or −1) meets at every level.
  for (const p of LADDERS) assert.ok(p.r! >= 1 && p.r! <= p.q! - 2, JSON.stringify(p));
  assert.ok(residueLadder(Qn.q(-1), { q: 5, r: 3 }).level < 2);
});

test("the dealt remainder's whole number: nearest, negatives counted (−2 leaves 1 when divided by 3), at least 2 when asked", () => {
  const at = (n: number, d: number, p: PairParams, min?: bigint) => { const a = residueAnchor(Qn.q(n, d), p, min); return [a.n, Qn.toWire(a.off)]; };
  assert.deepEqual(at(-2, 1, { q: 3, r: 1 }), [-2n, "0"]);
  assert.deepEqual(at(5, 2, { q: 3, r: 1 }), [1n, "3/2"]);       // 2.5: 1 and 4 are 1.5 away, the smaller wins
  assert.deepEqual(at(1, 1, { q: 3, r: 1 }, 2n), [-2n, "3"]);    // 1 is too small for a ratio: −2 and 4 are 3 away
  assert.deepEqual(at(13, 2, { q: 7, r: 6 }), [6n, "1/2"]);
});

test("Divide By and Gap Ratio climb the powers of the dealt k; their cards say so", () => {
  // D = ±5: with k 5 it is level 1 (next 25, 20 away): 5 × (1 + 1/21); with k 2, level 0, 3 away from 2: 1 + 1/4.
  assert.deepEqual(score("no-fractions", null, school, { k: 5 }), ["110/21"]);
  assert.deepEqual(score("no-fractions", null, school, { k: 2 }), ["5/4"]);
  // Its tie-breakers read the numerators x·D and y·D (15 and 10 up to sign): 25 has two prime factors; they share 5.
  assert.deepEqual(score("no-fractions", "numerator-smooth", school, { k: 5 }), ["110/21", "2"]);   // 25 = 5 × 5
  assert.deepEqual(score("no-fractions", "numerator-shared", school, { k: 5 }), ["110/21", "5"]);
  assert.match(familyOf("no-fractions").card({ k: 3 }, null), /should be 3 \(or −3\); better still 9, then 27, and so on/);
  assert.match(familyOf("double-gap").card({ k: 4 }, null), /4 times the gap between their x-intercepts; better still 16 times/);
  assert.match(familyOf("far-crossing").card({ q: 7, r: 2 }, "far-prime"), /leaves 2 when divided by 7; better still, leaves 16 when divided by 49, then 114 when divided by 343, and so on\..*Tie-breaker/);
  // y = x + 2 and y = −2x + 4: the y-intercepts' gap is 2, the x-intercepts' gap 4; 2 = ½ × 4, no power of k fits (level 0).
  for (const k of [2, 3]) assert.ok(Qn.cmp(Qn.parse(score("double-gap", null, sys(Y(1, 2), Y(-2, 4)), { k })![0]!), Qn.q(k)) < 0);
});

test("parallel lines have no answer: the crossing families score worst", () => {
  const par = sys(Y(2, 1), Y(2, -3));
  for (const id of ["whole-answer", "no-fractions", "right-angle", "forty-five", "on-the-diagonal"]) assert.equal(score(id, null, par), null, id);
});

test("the axes are the centre: a right angle at (0, 0), but 0 is on no dealt ladder, and the trivial corner earns nothing", () => {
  const axes = sys(L(0, 1, 0), L(1, 0, 0));
  // y = 0 is 1 from 1 (leaves 1 when divided by 5): level 0, 1 + 1/2; the corner pegs to (0, 1), spf(1) = 1.
  assert.deepEqual(score("right-angle", "corner-prime", axes, { q: 5, r: 1 }), ["3/2", "1"]);
  // 0 is on no ladder: y = 0 pegs to 1 (q 3, r 1), one away: (1/3) × (1 + 1/2); |0| + |1| shares 1 with D.
  assert.deepEqual(score("whole-answer", "peg-divisor", axes, { q: 3, r: 1 }), ["1/2", "1"]);
});

test("Steep Ratio reads the whole number of times on its ladder, at least 2 either way", () => {
  const s = sys(Y(6, 0), Y(2, 5));     // 3 times as steep
  assert.deepEqual(score("steep-ratio", "ratio-prime", s, { q: 5, r: 3 }), ["14/13", "3"]);   // 3 = 5⁰ × 3: level 0; level 1 (15 of 25) 12 away
  assert.deepEqual(score("steep-ratio", "ratio-prime", s, { q: 3, r: 1 }), ["24/7", "3"]);    // 3 = 3¹ × 1: level 1; level 2 (9 of 27) 6 away
});

test("a zoom of the picture (positions × n) cannot raise a capped hill past the number it is capped by", () => {
  // y = 2x + 3 and y = −x + 6 cross at (1, 4); zoom × 96 (a smooth number): c × 96.
  const base = sys(Y(2, 3), Y(-1, 6)), zoomed = sys(Y(2, 288), Y(-1, 576));
  for (const [id, tb] of [["whole-answer", "peg-divisor"], ["double-gap", "gap-divisor"], ["high-start", "start-factors"]] as const) {
    const before = score(id, tb, base), after = score(id, tb, zoomed);
    if (!before || !after) continue;
    // D is unchanged by a zoom, so a common factor with D stays at most |D| = 3.
    assert.ok(Qn.parse(after[1]!).n <= 3n || id === "high-start", `${id}/${tb}: ${after}`);
  }
});

test("the preset deals every family with both tie-breakers", () => {
  const p = pairPresets[0];
  assert.equal(p.id, "lines-pairs");
  assert.equal(p.rules.length, pairFamilies.filter(f => f.id !== "on-the-diagonal").reduce((t, f) => t + f.dealable(pairQ).length, 0));   // On the Diagonal is not dealt
  assert.ok(!p.rules.some(r => r.family === "on-the-diagonal"));
  for (const r of p.rules) assert.equal(r.tieBreakers.length, tieBreakersOn(pairFamilies.find(f => f.id === r.family)!, pairQ).length);
});

test("a primary is never met by one line alone: the diagonal itself, a line through the origin", () => {
  assert.equal(score("on-the-diagonal", null, sys(Y(1, 0), Y(2, 53))), null);   // y = x would meet every line on the diagonal
  assert.equal(score("double-gap", null, sys(Y(1, 0), Y(2, 53))), null);        // and double any line's gaps
  assert.deepEqual(score("on-the-diagonal", null, sys(Y(2, -3), Y(-1, 6))), ["0"]);   // (3, 3)
});
