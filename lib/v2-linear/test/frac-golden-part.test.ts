/** Golden Part (frac-golden-part.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, goldenPart, ladderTargets, lineQ, lineType, lineZ, nearestStep, presets, toWhole, type GoldenParams } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const ev = (s: Parameters<typeof evaluateSite>[3], p: GoldenParams = { ladder: "golden", at: 1 }, tb: TieBreaker = "close>gradient-bottom") =>
  evaluateSite(lineType, goldenPart, p, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return "n" in (v as object) ? Qn.toWire(v as never) : v; };

test("on the line type, in no pool or preset, rational lines only, four versions, three thirds", () => {
  assert.ok(lineType.families.some(x => x.id === "golden-part"));
  assert.ok(!beginnerPool.some(x => x.id === "golden-part"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "golden-part")));
  assert.equal(goldenPart.dealable(lineZ).length, 0);
  assert.deepEqual(goldenPart.dealable(lineQ).map(p => `${p.ladder} ${p.at}`), ["golden 1", "golden -1", "golden 2", "golden -2"]);
  assert.deepEqual(goldenPart.tieBreakers.map(t => t.id), ["close", "gradient-bottom", "at-bottom", "twin"]);
});

test("the ladders and the nearest step", () => {
  assert.deepEqual(ladderTargets("golden").slice(0, 6).map(Qn.toWire), ["1/2", "1/3", "2/5", "3/8", "5/13", "8/21"]);
  assert.deepEqual(ladderTargets("pell").slice(0, 4).map(Qn.toWire), ["1/2", "2/5", "5/12", "12/29"]);
  assert.equal(Qn.toWire(toWhole(f(7, 3))), "1/3");
  assert.equal(Qn.toWire(toWhole(f(-5, 4))), "1/4");
  assert.equal(nearestStep(f(3, 8), "golden").step, 4);
  assert.equal(nearestStep(f(0), "golden").step, 2);     // 1/3 is nearest 0
  assert.equal(nearestStep(f(1, 4), "golden").step, 2);
});

test("main part, closeness in steps of 1/B, and the thirds", () => {
  // y = (1/4)x + 9/8: y at 1 is 11/8, 3/8 from 1: step 4 (3/8), 0 eighths away; gradient bottom 4, 4 from 8.
  const s = mc(f(1, 4), f(9, 8));
  const e = ev(s);
  assert.equal(term(e, "step"), "4");
  assert.equal(term(e, "close"), "0");
  assert.equal(term(e, "gradient-bottom"), "4");
  // y at x = 8: 2 + 9/8 = 25/8, 1/8 from 3.
  assert.equal(term(ev(s, { ladder: "golden", at: 1 }, "close>at-bottom"), "at-bottom"), "1/8");
  // the y-intercept 9/8 is 1/8 from 1: 1/4 from 3/8.
  assert.equal(term(ev(s, { ladder: "golden", at: 1 }, "close>twin"), "twin"), "1/4");
  // y at 1 = 7/4 (1/4 from 2): nearest 1/3, one twelfth away, one third of a step of 1/3.
  const g = ev(mc(f(1, 2), f(5, 4)));
  assert.equal(term(g, "step"), "2");
  assert.equal(term(g, "close"), "1/4");
});

test("whole moves and the mirror in the x-axis keep the main part and the closeness", () => {
  const base = ev(mc(f(1, 4), f(9, 8)));
  for (const s of [mc(f(1, 4), f(17, 8)), mc(f(5, 4), f(9, 8)), mc(f(-1, 4), f(-9, 8))])
    for (const id of ["step", "close"]) assert.equal(term(ev(s), id), term(base, id));
});

test("a vertical line is worst", () => assert.equal(ev(abc(1, 0, -3)).score, null));
