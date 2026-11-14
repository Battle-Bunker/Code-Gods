import { test } from "node:test";
import assert from "node:assert/strict";
import { compareScores, evaluateObject, evaluateSite, layerLadders, levelOf, objectLadder, refKey, rng, ruleLadder, ruleLayers, walkStep, Qn, type Evaluation, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { crossingCheck, families, ownerFamilies, lineType, lineQ, lineZ, lineZ4, mMeetsC, primeGradient, squareArea, triangleArea, wholeIntercept, type LineState } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const score = (e: Evaluation) => (e.score === null ? "WORST" : e.score.map(x => (x === null ? "_" : Qn.toWire(x))).join(","));
const ev = <P,>(f: RuleFamily<LineState, P>, p: P, s: LineState, v = lineZ, tb?: TieBreaker) => evaluateSite(lineType, f, p, s, v, 0, tb);

test("every owner family: a textbook main layer and at least two alternative tie-breakers, all graded", () => {
  for (const f of ownerFamilies) {
    assert.ok(f.tieBreakers.length >= 2, f.id);
    assert.ok(f.depends.includes(f.main.rep), f.id);
    const p = f.dealable(lineQ)[0]!;
    for (const l of [f.main, ...f.tieBreakers]) assert.ok(l.thresholds(p as never, lineQ).length >= 6, `${f.id}.${l.id}: at least six rungs`);
    for (const tb of f.tieBreakers) assert.match(f.card(p as never, tb.id), /Tie-breaker/);
  }
});

test("Prime Gradient: distance to the nearest prime, then its size", () => {
  assert.equal(score(ev(primeGradient, {}, mc(4, -3))), "-1,3");      // 3 and 5 tie at 1; the nearer-first order picks 3
  assert.equal(score(ev(primeGradient, {}, mc(7, -3))), "0,7");
  assert.equal(score(ev(primeGradient, {}, mc(-2, 1))), "-4,2");
  assert.equal(score(ev(primeGradient, {}, mc(Qn.q(5, 2), 0), lineQ)), "-1/2,2");
  assert.equal(score(ev(primeGradient, {}, abc(1, 0, -3), lineQ)), "WORST");
  assert.equal(score(ev(primeGradient, {}, mc(7, -3), lineZ, null)), "0");     // the main layer alone
  assert.equal(score(ev(primeGradient, {}, mc(7, -3), lineZ, "cPrime")), "0,-5"); // the other tie-breaker: c = −3, nearest prime 2
  const cands = ev(primeGradient, {}, mc(4, -3)).marks.filter(m => m.kind === "candidate").map(m => refKey((m as { ref: never }).ref));
  assert.deepEqual(cands.sort(), ["cart.ghost(g=3)", "cart.ghost(g=5)"]);
});

test("the owner's other three, and the two layered examples of decision 12", () => {
  assert.equal(score(ev(triangleArea, { A: 8 }, mc(-1, 4))), "0,0");       // legs 4 and 4: whole
  assert.equal(score(ev(triangleArea, { A: 4 }, mc(-8, 8))), "0,0");       // legs 1 and 8
  assert.equal(score(ev(triangleArea, { A: 4 }, mc(18, 12), lineZ)), "0,-2"); // legs 2/3 and 12
  assert.equal(score(ev(triangleArea, { A: 6 }, mc(3, 0))), "WORST");
  assert.equal(score(ev(mMeetsC, {}, mc(1, 5))), "-4,5");
  assert.equal(score(ev(crossingCheck, { k: 1, q: 5 }, mc(2, 1))), "-1,2");  // y(1) = 3, x(5) = 2
  assert.equal(score(ev(crossingCheck, { k: 1, q: 4 }, mc(2, 1))), "-3/2,3/2"); // x(4) = 3/2
  assert.equal(score(ev(crossingCheck, { k: 1, q: 4 }, mc(2, 1), lineZ, "whole")), "-3/2,-1");
  assert.equal(score(ev(wholeIntercept, {}, mc(1, Qn.q(29, 2)), lineQ)), "-1/2,3");  // 14.5 → 15, smallest prime factor 3
  assert.equal(score(ev(wholeIntercept, {}, mc(1, 49), lineQ)), "0,7");
  assert.equal(score(ev(wholeIntercept, {}, mc(1, 48), lineQ, "omega")), "0,5");
  assert.equal(score(ev(squareArea, {}, mc(-1, 6))), "-2,2");                // legs 6, 6: area 18, nearest square 16 = 4², Ω(4) = 2
  assert.equal(score(ev(squareArea, {}, mc(-2, 12))), "0,2");                // legs 6, 12: area 36 = 6², Ω(6) = 2
  assert.equal(score(ev(squareArea, {}, mc(-1, 12))), "-8,3");               // legs 12, 12: area 72, nearest square 64 = 8², Ω(8) = 3
});

/** A test family: primary |m| (bigger is better, top 3), secondary: c, undefined when c is 0. */
const toy: RuleFamily<LineState, object> = {
  id: "toy", title: "toy", card: () => "", params: [], dealable: () => [{}], depends: ["si"],
  main: { id: "big", title: "", sentence: () => "", rep: "si", sense: "max", measure: "size", thresholds: () => [Qn.q(1), Qn.q(2), Qn.q(3)], rungLabel: t => `|m| ≥ ${Qn.toWire(t)}` },
  tieBreakers: [
    { id: "c", title: "", sentence: () => "", rep: "si", sense: "max", measure: "size", thresholds: () => [Qn.q(1), Qn.q(5)], rungLabel: t => `c ≥ ${Qn.toWire(t)}` },
  ],
  evaluate(ctx) {
    const m = ctx.read({ rep: "si", name: "m" }), c = ctx.read({ rep: "si", name: "c" });
    ctx.term("big", "", m.kind === "number" ? Qn.abs(m.q) : { undefined: "vertical" }, []);
    ctx.term("c", "", c.kind === "number" && !Qn.isZero(c.q) ? c.q : { undefined: "c is 0" }, []);
  },
};

test("an undefined secondary ranks last in its own component; an undefined primary is WORST", () => {
  assert.equal(score(ev(mMeetsC, {}, abc(1, 0, -3), lineQ)), "WORST");
  const noSecondary = ev(toy, {}, mc(3, 0)), weak = ev(toy, {}, mc(3, -9)), strong = ev(toy, {}, mc(3, 5));
  assert.equal(score(noSecondary), "3,_");
  assert.equal(compareScores(noSecondary.score, weak.score), -1);
  assert.equal(compareScores(noSecondary.score, ev(toy, {}, mc(2, 5)).score), 1);   // the primary decides first
  const ladder = ruleLadder(toy, {}, lineZ);
  assert.equal(levelOf(noSecondary.score, ladder), 3);                               // primary top, no secondary rung
  assert.equal(levelOf(strong.score, ladder), 5);
});

test("an earlier layer saturates at its top: overshooting it does not meet later rungs", () => {
  const ladder = ruleLadder(toy, {}, lineZ);
  const over = ev(toy, {}, mc(7, -9));                                               // |m| = 7 > top 3, c bad
  assert.equal(score(over), "3,-9");
  assert.equal(levelOf(over.score, ladder), 3);
  assert.equal(compareScores(over.score, ev(toy, {}, mc(3, 1)).score), -1);
});

test("score and annotation come from the same terms; every mark cites a read", () => {
  const r = rng("terms");
  let s = mc(1, 1);
  for (let i = 0; i < 300; i++) {
    s = walkStep(lineType, lineQ, s, r);
    for (const f of families) {
      const p = f.dealable(lineQ)[0]!;
      const e = evaluateSite(lineType, f as RuleFamily<LineState, unknown>, p, s, lineQ);
      const t = e.terms.find(x => x.id === f.main.id)!;
      assert.deepEqual(e.components.map(c => c.term), ruleLayers(f, undefined).map(l => l.id));
      if (e.score === null) assert.ok("undefined" in t.value);
      else assert.equal(Qn.toWire(e.score[0]!), Qn.toWire(f.main.sense === "min" ? Qn.neg(t.value as never) : t.value as never));
      const reads = new Set(e.reads.map(x => refKey(x, true)));
      for (const m of e.marks) for (const x of m.kind === "measure" ? [m.from, m.to] : [m.ref]) assert.ok(reads.has(refKey(x, true)));
    }
  }
});

test("the evaluation context refuses reads outside depends and marks of unread elements", () => {
  const rogue: RuleFamily<LineState, object> = { ...mMeetsC, id: "rogue", evaluate(ctx) { ctx.read({ rep: "gen", name: "a" }); } };
  assert.throws(() => ev(rogue, {}, mc(1, 1)), /not in its depends/);
  const sloppy: RuleFamily<LineState, object> = {
    ...mMeetsC, id: "sloppy",
    evaluate(ctx) { ctx.term("gap", "", Qn.ZERO, []); ctx.term("size", "", Qn.ZERO, []); ctx.mark({ kind: "focus", ref: { rep: "si", name: "m" } }); },
  };
  assert.throws(() => ev(sloppy, {}, mc(1, 1)), /without reading/);
  const lazy: RuleFamily<LineState, object> = { ...mMeetsC, id: "lazy", evaluate(ctx) { ctx.term("gap", "", Qn.ZERO, []); } };
  assert.throws(() => ev(lazy, {}, mc(1, 1)), /did not record layer size/);
});

test("the ladder: primary rungs, then the secondary's rungs at the primary's top", () => {
  const ladder = ruleLadder(mMeetsC, {}, lineZ);
  assert.equal(ladder.length, 1 + 7 + 9);
  assert.deepEqual(ladder.map(r => r.layer), [-1, ...Array(7).fill(0), ...Array(9).fill(1)]);
  assert.equal(levelOf(ev(mMeetsC, {}, mc(1, 5)).score, ladder), 3);            // gap 4: within 5
  assert.equal(levelOf(ev(mMeetsC, {}, mc(3, 3)).score, ladder), 7 + 3);        // gap 0, |c| = 3
  assert.equal(levelOf(ev(mMeetsC, {}, mc(24, 24)).score, ladder), 7 + 9);      // the top
  assert.equal(levelOf(null, ladder), 0);
  assert.equal(ruleLadder(mMeetsC, {}, lineZ, null).length, 8);
  assert.equal(ruleLadder(mMeetsC, {}, lineZ, "meetPrime").length, 1 + 7 + 7);
  const parts = layerLadders(mMeetsC, {}, lineZ);
  assert.deepEqual(parts.map(l => l.length), [8, 10]);
});

test("a k-line object is calibrated on the totals of its lines' levels", () => {
  const ladder = objectLadder(lineType, mMeetsC, {}, lineZ4, null);
  assert.equal(ladder.length, 1 + 4 * 7);
  const four: LineState = { lines: [mc(3, 3).lines[0]!, mc(1, 5).lines[0]!, mc(0, 0).lines[0]!, mc(0, 40).lines[0]!] };
  const e = evaluateObject(lineType, mMeetsC, {}, four, lineZ4, null);
  assert.equal(e.score!.map(x => Qn.toWire(x!)).join(","), `${7 + 3 + 7 + 0},0,0,-4,-40`);
  assert.equal(levelOf(e.score, ladder), 17);
});
