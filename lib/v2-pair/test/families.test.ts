import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, Qn, scoreToWire, tieBreakersOn } from "@workspace/v2-core";
import { LADDERS, pairFamilies, powerLadder, pairPresets, pairQ, pairType, residueAnchor, residueLadder, valuationLadder, type PairParams, type PairState } from "../src/index.ts";
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

test("the valuation ladder: level L needs L(L + 1)/2 stretches by q, each level dearer; 0 is on none; off the ladder is below all", () => {
  const at = (v: number, p: PairParams) => { const l = valuationLadder(Qn.q(v), p); return [l.level, Qn.toWire(l.u)]; };
  // 2 × 5^t (q 5, r 2) for t = 0 … 6: levels 0, 1, 1, 2, 2, 2, 3 (level L at t = 0, 1, 3, 6, …).
  assert.deepEqual([2, 10, 50, 250, 1250, 6250, 31250].map(v => at(v, { q: 5, r: 2 })[0]), [0, 1, 1, 2, 2, 2, 3]);
  // 0 and 7 (7 = 5⁰ × 7 leaves 2, so level 0 too) and 3 (leaves 3: off the ladder).
  assert.equal(at(0, { q: 5, r: 2 })[0], -1);
  assert.equal(at(3, { q: 5, r: 2 })[0], -1);
  // Every level beats every lower one: 10 (level 1) beats 2 (level 0) beats 3 (off).
  const u = (v: number) => valuationLadder(Qn.q(v), { q: 5, r: 2 }).u;
  assert.ok(Qn.cmp(u(10), u(2)) > 0 && Qn.cmp(u(2), u(3)) > 0 && Qn.cmp(u(250), u(50)) > 0);
  // Within a level a stretch brings the next level nearer: 50 (t = 2) is nearer 250's rung than 10 (t = 1) is.
  assert.ok(Qn.cmp(u(50), u(10)) > 0);
  // Level L scores in (5^L, 2 × 5^L]: the score grows one factor 5 per level, not per stretch.
  assert.ok(Qn.cmp(u(6250), Qn.q(50)) <= 0 && Qn.cmp(u(6250), Qn.q(25)) > 0);
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
  // D = ±5: with k 5 it is level 1 (next rung 125, 120 away): 5 × (1 + 1/121); with k 2 (rungs 2, 8, 64), level 0, 3 from 2 and 8: 1 + 1/4.
  assert.deepEqual(score("no-fractions", null, school, { k: 5 }), ["610/121"]);
  assert.deepEqual(score("no-fractions", null, school, { k: 2 }), ["5/4"]);
  // Triangular rungs (as the valuation ladders'): level L at k^T(L), T(L) = L(L + 1)/2, so 5, 125, 15,625, … — each
  // level one more multiplication by k than the last (a Divide By object climbed 40 levels in a game when every power
  // was a level). The rungs are not nested (125 is not 5): 125 is level 2, above 5 and above 124, 1 from 125 on none.
  const at = (n: number) => powerLadder(5, t => Qn.q(BigInt(Math.abs(n)) > t ? BigInt(Math.abs(n)) - t : t - BigInt(Math.abs(n))));
  assert.equal(at(125).level, 2);
  assert.equal(at(15625).level, 3);
  assert.equal(at(25).level, 0, "25 is no rung");
  assert.deepEqual([at(124).level, Qn.toWire(at(124).u)], [0, "3/2"]);
  assert.ok(Qn.cmp(at(125).u, at(5).u) > 0 && Qn.cmp(at(5).u, at(124).u) > 0);
  // Its tie-breakers read the numerators x·D and y·D (15 and 10 up to sign): 25 has two prime factors; they share 5.
  assert.deepEqual(score("no-fractions", "numerator-smooth", school, { k: 5 }), ["610/121", "2"]);   // 25 = 5 × 5
  assert.deepEqual(score("no-fractions", "numerator-shared", school, { k: 5 }), ["610/121", "5"]);
  assert.match(familyOf("no-fractions").card({ k: 3 }, null), /should be 3 or −3; better, 27; then 729/);
  assert.match(familyOf("double-gap").card({ k: 4 }, null), /4 times the x-intercepts' gap; better 64 times; then 4,096 times/);
  assert.match(familyOf("far-crossing").card({ q: 7, r: 2 }, "far-gap"), /leaving 2 when divided by 7; better if \(that number − 2\) ÷ 7 does too, and so on\..*Tie-breaker/);
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
  assert.deepEqual(score("steep-ratio", "ratio-prime", s, { q: 3, r: 1 }), ["78/25", "3"]);   // 3 = 3¹ × 1: level 1; level 2 (27 of 81) 24 away
});

test("Far Crossing's and High Start's tie-breakers aim at a multiple of q^(L+1), L the level the main part reached (row 3)", () => {
  // Far Crossing {7, 2}: the steeper line y = 3x − 6 meets the x-axis at 2 (level 1: 2 leaves 2 by 7, not 16 by 49), so
  // the target is 49. The gentler y = x − 51 meets it at 51: the gap 49 is on target; they cross at (−22.5, −73.5).
  const fc = { q: 7, r: 2 }, lo = sys(Y(3, -6), Y(1, -51));
  assert.equal(score("far-crossing", "far-gap", lo, fc)![1], "0");
  assert.equal(score("far-crossing", "far-height", lo, fc)![1], "-49/2");   // a distance: smaller is better, stored negated
  // One level up (16 leaves 16 by 49): the same gap of 49 is now 294 from 343, the nearest non-zero multiple, so the
  // climb restarts.
  assert.equal(score("far-crossing", "far-gap", sys(Y(3, -48), Y(1, -65)), fc)![1], "-294");
  // High Start {5, 4}: the gentler line's y-intercept 20 = 5 × 4 is level 1, target 25. The steeper y = 3x + 45 has
  // y-intercept 45: the gap between the intercepts is 25, on target; they cross at x = −12.5, 12.5 from −25 (0 is no
  // multiple).
  const hs = { q: 5, r: 4 }, up = sys(Y(3, 45), Y(1, 20));
  assert.equal(score("high-start", "start-echo", up, hs)![1], "0");
  assert.equal(score("high-start", "start-crossing", sys(Y(3, 50), Y(1, 20)), hs)![1], "-10");
  // Off the ladder (3 does not leave 4 by 5) the target is 1: whole numbers.
  assert.equal(score("high-start", "start-crossing", sys(Y(3, 50), Y(1, 3)), hs)![1], "-1/2");
  assert.match(familyOf("far-crossing").card(fc, "far-gap"), /multiple of 7.*49/);
  // 0 is no multiple (review): two lines through one point of the x-axis have gap 0 and cross at height 0, which would
  // be a top at every level. 0 is a whole step from the nearest non-zero multiple.
  const through = sys(Y(3, -6), Y(1, -2));   // both through (2, 0)
  assert.equal(score("far-crossing", "far-gap", through, fc)![1], "-49");
  assert.equal(score("far-crossing", "far-height", through, fc)![1], "-49");
  // High Start: lines sharing their y-intercept cross at x = 0 and have no gap between the intercepts.
  const shared = sys(Y(3, 20), Y(1, 20));
  assert.equal(score("high-start", "start-crossing", shared, hs)![1], "-25");
  assert.equal(score("high-start", "start-echo", shared, hs)![1], "-25");
  assert.match(familyOf("high-start").card(hs, "start-crossing"), /a whole number other than 0; on your pattern, a multiple of 5/);
});

test("a zoom of the picture (positions × n) cannot raise a capped hill past the number it is capped by", () => {
  // y = 2x + 3 and y = −x + 6 cross at (1, 4); zoom × 96 (a smooth number): c × 96.
  const base = sys(Y(2, 3), Y(-1, 6)), zoomed = sys(Y(2, 288), Y(-1, 576));
  for (const [id, tb] of [["whole-answer", "peg-divisor"], ["double-gap", "gap-divisor"], ["high-start", "start-echo"]] as const) {
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

test("seating: no two rules one move climbs together (the same r on the y readers, the same q on the valuation ladders, a shared prime for Gap Ratio and Divide By)", async () => {
  const { pairClash, pairClashes } = await import("../src/seating.ts");
  const rule = (family: string, params?: unknown) => ({ family, params });
  assert.ok(pairClash(rule("whole-answer", { q: 7, r: 3 }), rule("right-angle", { q: 7, r: 3 })), "PMI 3.3 bits");
  assert.ok(pairClash(rule("right-angle", { q: 11, r: 1 }), rule("high-start", { q: 7, r: 1 })), "the same r, another q");
  assert.ok(pairClash(rule("whole-answer", { q: 5, r: 1 }), rule("forty-five", { q: 5, r: 1 })));
  assert.ok(pairClash(rule("high-start", { q: 5, r: 1 }), rule("steep-ratio", { q: 5, r: 4 })), "a stretch by 5 climbs both");
  assert.ok(pairClash(rule("double-gap", { k: 3 }), rule("no-fractions", { k: 9 })), "a turn climbs both (tension matrix, +10.9 bits)");
  assert.ok(pairClash(rule("far-crossing", { q: 7, r: 4 }), rule("far-crossing", { q: 11, r: 2 })), "one family twice");
  // Classes that meet near zero: y = −2 leaves 9 by 11, 3 by 5 and 5 by 7 (PMI 2.0–2.3 bits); (0, −1) for Forty-Five.
  assert.ok(pairClash(rule("right-angle", { q: 11, r: 9 }), rule("whole-answer", { q: 7, r: 5 })));
  assert.ok(pairClash(rule("right-angle", { q: 5, r: 3 }), rule("whole-answer", { q: 7, r: 5 })));
  assert.ok(pairClash(rule("forty-five", { q: 5, r: 1 }), rule("whole-answer", { q: 5, r: 4 })));
  assert.ok(!pairClash(rule("whole-answer", { q: 5, r: 2 }), rule("right-angle", { q: 7, r: 1 })), "2 or −3 against 1: no small number in both");
  assert.ok(!pairClash(rule("high-start", { q: 5, r: 2 }), rule("steep-ratio", { q: 7, r: 2 })));
  // Sharing one prime is enough: a stretch by −3 eight times made D = −216 = 6³ and the gaps' ratio a power of 3
  // (Divide By k 6 +18.7 bits with Gap Ratio k 3 +12.5, the tension matrix of §10).
  assert.ok(pairClash(rule("double-gap", { k: 3 }), rule("no-fractions", { k: 6 })));
  assert.ok(!pairClash(rule("double-gap", { k: 3 }), rule("no-fractions", { k: 10 })));
  assert.ok(pairClash(rule("whole-answer", { q: 5, r: 1 }), rule("forty-five", { q: 7, r: 1 })), "both at (0, 1)");
  assert.ok(!pairClash(rule("whole-answer", { q: 5, r: 2 }), rule("forty-five", { q: 7, r: 4 })));
  assert.ok(!pairClash(rule("whole-answer"), rule("right-angle", { q: 5, r: 1 })), "unknown parameters clash only as one family");
  assert.deepEqual(pairClashes([rule("double-gap", { k: 2 }), rule("steep-ratio", { q: 5, r: 1 }), rule("no-fractions", { k: 4 })]), ['double-gap {"k":2} × no-fractions {"k":4}']);
});

test("pair cards: the main sentence at most 30 words, a tie-breaker at most 20, the target said in words, no \"level\" (playtest rounds 24 and 25)", () => {
  const words = (x: string) => x.split(/\s+/).length;
  for (const f of pairFamilies) for (const p of f.dealable(pairQ)) {
    const m = f.main.sentence(p as PairParams);
    assert.ok(words(m) <= 30, `${f.id}: ${words(m)} words: ${m}`);
    assert.doesNotMatch(m, /level|the closer, the better/i, f.id);
    for (const t of f.tieBreakers) {
      const x = t.sentence(p as PairParams);
      assert.ok(words(x) <= 20, `${f.id}/${t.id}: ${words(x)} words: ${x}`);
      assert.doesNotMatch(x, /level|the closer, the better/i, `${f.id}/${t.id}`);
    }
  }
});
