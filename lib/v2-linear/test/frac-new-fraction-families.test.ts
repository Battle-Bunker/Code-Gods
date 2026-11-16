/** Fraction Gradient and Square Fraction Intercept (frac-fraction-gradient.ts, frac-square-intercept.ts). Every expected value was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, fractionGradient, GRADIENT_BOTTOMS, lineQ, lineType, lineZ, nearestSquareFraction, nearestWithBottom, presets, SQUARE_BOTTOMS, squareIntercept } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return v && typeof v === "object" && "n" in v ? Qn.toWire(v as never) : JSON.stringify(v); };
const fg = (s: unknown, tb: TieBreaker = "near", d = 7) => evaluateSite(lineType, fractionGradient, { d } as never, s as never, lineQ, 0, tb);
const sq = (s: unknown, tb: TieBreaker = "near", d = 3) => evaluateSite(lineType, squareIntercept, { d } as never, s as never, lineQ, 0, tb);

test("both are on the line type, in no pool or preset, dealable only on rational lines, four versions each", () => {
  for (const [fam, bottoms] of [[fractionGradient, GRADIENT_BOTTOMS], [squareIntercept, SQUARE_BOTTOMS]] as const) {
    assert.ok(lineType.families.some(x => x.id === fam.id));
    assert.ok(!beginnerPool.some(x => x.id === fam.id));
    assert.ok(!presets.some(p => p.rules.some(r => r.family === fam.id)));
    assert.equal(fam.dealable(lineZ).length, 0);
    assert.deepEqual(fam.dealable(lineQ).map(p => (p as { d: number }).d), [...bottoms]);
    assert.equal(fam.tieBreakers.length, 4);
  }
});

test("Fraction Gradient: the nearest seventh that is not whole; halfway goes to the bigger top", () => {
  assert.equal(nearestWithBottom(f(17, 7), 7).k, 17n);
  assert.equal(nearestWithBottom(f(5, 2), 7).k, 18n);     // 1/14 from 17/7 and from 18/7
  assert.equal(nearestWithBottom(f(3), 7).k, 22n);        // 21/7 is whole: 20/7 and 22/7 are 1/7 away
  assert.equal(nearestWithBottom(f(-17, 7), 7).k, -17n);
  assert.equal(nearestWithBottom(f(0), 2).k, 1n);         // −1/2 and 1/2: the positive one
});

test("Fraction Gradient: layers on y = (17/7)x + 5/14", () => {
  const s = mc(f(17, 7), f(5, 14));
  assert.equal(term(fg(s), "top"), "17");
  assert.equal(term(fg(s), "near"), "0");
  assert.equal(term(fg(s, "echo"), "echo"), "29/14");
  assert.equal(term(fg(s, "bottom-match"), "bottom-match"), "7");
  assert.equal(term(fg(s, "top-multiple"), "top-multiple"), "5");
  // A whole gradient is never on a target: 3 is 1/7 from 22/7.
  assert.equal(term(fg(mc(3, 0)), "near"), "1/7");
  // A unit shift, a reflection and the y-intercept's nudge keep main and secondary.
  const want = fg(s).score;
  for (const t of [mc(f(17, 7), f(19, 14)), mc(f(-17, 7), f(5, 14)), mc(f(-17, 7), f(-5, 14))]) assert.deepEqual(fg(t).score, want);
});

test("Square Fraction Intercept: the nearest square of a third that is not whole", () => {
  assert.equal(nearestSquareFraction(f(16, 9), 3).j, 4n);
  assert.equal(nearestSquareFraction(f(3), 3).j, 5n);     // 25/9 is 2/9 away; 36/9 is whole (6/3), 49/9 is 22/9 away
  assert.equal(nearestSquareFraction(f(0), 3).j, 1n);
});

test("Square Fraction Intercept: layers on y = (4/3)x + 16/9 and y = (7/2)x − 3", () => {
  const s = mc(f(4, 3), f(16, 9));
  for (const [id, v] of [["root-top", "4"], ["near", "0"], ["root-gradient", "0"], ["top-match", "0"], ["in-parts", "0"]] as const)
    assert.equal(term(sq(s, id === "root-top" ? "near" : id), id), v);
  const t = mc(f(7, 2), -3);
  assert.equal(term(sq(t), "root-top"), "5");
  assert.equal(term(sq(t), "near"), "2/9");
  assert.equal(term(sq(t, "root-gradient"), "root-gradient"), "11/6");   // |7/2 − 5/3|
  assert.equal(term(sq(t, "top-match"), "top-match"), "2");              // |7 − 5|
  assert.equal(term(sq(t, "in-parts"), "in-parts"), "1/2");              // 21/2
});

test("a vertical line is worst for both", () => {
  assert.equal(fg(abc(1, 0, -3)).score, null);
  assert.equal(sq(abc(1, 0, -3)).score, null);
});
