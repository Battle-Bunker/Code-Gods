/** Nearly Whole (frac-nearly-whole.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, lineQ, lineType, lineZ, NEARLY_PARAMS, nearestShortTarget, nearlyWhole, presets, type NearlyParams } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const ev = (s: Parameters<typeof evaluateSite>[3], tb: TieBreaker = null, p: NearlyParams = { of: "m", j: 1 }) =>
  evaluateSite(lineType, nearlyWhole, p, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return v && typeof v === "object" && "n" in v ? Qn.toWire(v as never) : JSON.stringify(v); };

test("on the line type, in no pool or preset, dealable only on rational lines, four versions", () => {
  assert.ok(lineType.families.some(x => x.id === "nearly-whole"));
  assert.ok(!beginnerPool.some(x => x.id === "nearly-whole"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "nearly-whole")));
  assert.equal(nearlyWhole.dealable(lineZ).length, 0);
  assert.deepEqual(nearlyWhole.dealable(lineQ), [...NEARLY_PARAMS]);
  assert.equal(nearlyWhole.tieBreakers.length, 4);
});

test("nearest target 1 − j/n: below the first goes to the first; halfway goes to the bigger bottom", () => {
  const n = (g: [number, number], j: number) => nearestShortTarget(f(...g), j).n;
  assert.equal(n([0, 1], 1), 2n);       // a whole number: nearest 1/2
  assert.equal(n([3, 10], 1), 2n);
  assert.equal(n([5, 6], 1), 6n);       // on the target
  assert.equal(n([7, 9], 1), 5n);       // 1/45 from 4/5, 1/36 from 3/4
  assert.equal(n([17, 24], 1), 4n);     // halfway between 2/3 and 3/4
  assert.equal(n([1, 10], 2), 3n);      // j = 2: targets 1/3, 3/5, 5/7, …
  assert.equal(n([7, 9], 2), 9n);
  assert.equal(n([2, 3], 2), 7n);       // 2/3 − 3/5 = 1/15, 5/7 − 2/3 = 1/21: 5/7 is nearer
});

test("main and secondary read the fraction part of the gradient's size", () => {
  const a = ev(mc(f(17, 6), f(47, 9)), "near");
  assert.equal(term(a, "bottom"), "6");
  assert.equal(term(a, "near"), "0");
  assert.equal(term(ev(mc(f(-17, 6), 0), "near"), "bottom"), "6");      // the size: the sign does not matter
  const b = ev(mc(f(7, 9), 0), "near");
  assert.equal(term(b, "bottom"), "5");
  assert.equal(term(b, "near"), "1/45");
  assert.equal(term(ev(mc(3, 1), "near"), "bottom"), "2");              // a whole gradient
  // The y-intercept version reads the y-intercept.
  assert.equal(term(ev(mc(3, f(-47, 8)), "near", { of: "c", j: 1 }), "bottom"), "8");
});

test("robust: whole moves and three reflections keep main and secondary", () => {
  const want = ev(mc(f(17, 6), f(47, 9)), "near").score;
  for (const s of [mc(f(23, 6), f(47, 9)), mc(f(17, 6), f(56, 9)), mc(f(-17, 6), f(47, 9)), mc(f(-17, 6), f(-47, 9)), mc(f(17, 6), f(-47, 9))])
    assert.deepEqual(ev(s, "near").score, want);
});

test("thirds read the other number against the target's bottom", () => {
  // y = (17/6)x + 47/9: target bottom 6; the y-intercept's whole part 5, top 47, bottom 9.
  const s = mc(f(17, 6), f(47, 9));
  assert.equal(term(ev(s, "whole-ratio"), "whole-ratio"), "6/5");
  assert.equal(term(ev(s, "top-near"), "top-near"), "41");
  assert.equal(term(ev(s, "bottom-near"), "bottom-near"), "3");
  assert.ok(term(ev(mc(f(17, 6), f(1, 2)), "whole-ratio"), "whole-ratio").includes("undefined"));
});

test("a vertical line is worst", () => {
  assert.equal(ev(abc(1, 0, -3)).score, null);
});
