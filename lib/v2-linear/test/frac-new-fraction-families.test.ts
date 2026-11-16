/** Fraction Gradient, Fraction Pair and Mixed Intercept (frac-fraction-gradient.ts, frac-fraction-pair.ts, frac-mixed-intercept.ts). Every expected value was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, fractionGradient, fractionPair, GRADIENT_BOTTOMS, lineQ, lineType, lineZ, MIXED_PARTS, mixedIntercept, nearestMixed, nearestWithBottom, PAIR_BOTTOMS, presets } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return v && typeof v === "object" && "n" in v ? Qn.toWire(v as never) : JSON.stringify(v); };
const fg = (s: unknown, tb: TieBreaker = "near", d = 7) => evaluateSite(lineType, fractionGradient, { d } as never, s as never, lineQ, 0, tb);
const fp = (s: unknown, tb: TieBreaker = "near", d = 7) => evaluateSite(lineType, fractionPair, { d } as never, s as never, lineQ, 0, tb);
const mi = (s: unknown, tb: TieBreaker = "near") => evaluateSite(lineType, mixedIntercept, { r: 1, d: 3 }, s as never, lineQ, 0, tb);

test("all three are on the line type, in no pool or preset, dealable only on rational lines, four versions each", () => {
  for (const [fam, versions] of [[fractionGradient, GRADIENT_BOTTOMS.map(d => ({ d }))], [fractionPair, PAIR_BOTTOMS.map(d => ({ d }))], [mixedIntercept, MIXED_PARTS]] as const) {
    assert.ok(lineType.families.some(x => x.id === fam.id));
    assert.ok(!beginnerPool.some(x => x.id === fam.id));
    assert.ok(!presets.some(p => p.rules.some(r => r.family === fam.id)));
    assert.equal(fam.dealable(lineZ).length, 0);
    assert.deepEqual(fam.dealable(lineQ), [...versions]);
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

test("Fraction Pair: the smaller top of the sevenths nearest the gradient and the y-intercept", () => {
  const s = mc(f(17, 7), f(17, 7));
  for (const [id, v] of [["smaller-top", "17"], ["near", "0"], ["top-gap", "0"], ["top-multiple", "0"], ["top-ratio", "1"]] as const)
    assert.equal(term(fp(s, id === "smaller-top" ? "near" : id), id), v);
  // y = 3x + 4: 3 is nearest 22/7 (tie with 20/7), 4 = 28/7 nearest 29/7 (tie with 27/7).
  const t = mc(3, 4);
  for (const [id, v] of [["smaller-top", "22"], ["near", "1/7"], ["top-gap", "7"], ["top-multiple", "7"], ["top-ratio", "29/22"]] as const)
    assert.equal(term(fp(t, id === "smaller-top" ? "near" : id), id), v);
});

test("Mixed Intercept: the nearest \"something and a third\" to the y-intercept's size", () => {
  assert.equal(nearestMixed(f(7, 3), { r: 1, d: 3 }).w, 2n);
  assert.equal(nearestMixed(f(5), { r: 1, d: 3 }).w, 5n);          // 1/3 from 5 1/3, 2/3 from 4 1/3
  assert.equal(nearestMixed(f(0), { r: 1, d: 2 }).w, 0n);          // 1/2
  assert.equal(nearestMixed(f(1), { r: 1, d: 2 }).w, 1n);          // halfway between 1/2 and 1 1/2: the bigger
  const s = mc(f(4, 3), f(7, 3));
  for (const [id, v] of [["whole", "2"], ["near", "0"], ["gradient-part", "0"], ["gradient-whole", "1"], ["gradient-ratio", "7/4"]] as const)
    assert.equal(term(mi(s, id === "whole" ? "near" : id), id), v);
  assert.equal(term(mi(mc(1, f(-10, 3))), "whole"), "3");
  // A shift by 1 lands on the next target: the closeness is kept and the whole part steps by 1.
  assert.equal(term(mi(mc(f(4, 3), f(10, 3))), "near"), "0");
  assert.equal(term(mi(mc(f(4, 3), f(10, 3))), "whole"), "3");
});

test("a vertical line is worst for all three", () => {
  assert.equal(fg(abc(1, 0, -3)).score, null);
  assert.equal(fp(abc(1, 0, -3)).score, null);
  assert.equal(mi(abc(1, 0, -3)).score, null);
});
