import { test } from "node:test";
import assert from "node:assert/strict";
import { compareScores, evaluateObject, evaluateSite, refKey, rng, ruleLayers, walkStep, Qn, type Evaluation, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { crossingCheck, families, ownerFamilies, lineType, lineQ, lineZ, lineZ4, mMeetsC, primeGradient, triangleArea, wholeIntercept, type LineState } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const score = (e: Evaluation) => (e.score === null ? "WORST" : e.score.map(x => (x === null ? "_" : Qn.toWire(x))).join(","));
const ev = <P,>(f: RuleFamily<LineState, P>, p: P, s: LineState, v = lineZ, tb?: TieBreaker) => evaluateSite(lineType, f, p, s, v, 0, tb);

// Row 3a (at least three secondaries per dealt family) is checked on the dealt pools: artifacts/engine test/unit/v2-rule-check.test.ts.
test("every owner family: a textbook main layer and its secondaries on the card", () => {
  for (const f of ownerFamilies) {
    assert.ok(f.tieBreakers.length >= 1, f.id);
    assert.ok(f.depends.includes(f.main.rep), f.id);
    const p = f.dealable(lineQ)[0]!;
    for (const tb of f.tieBreakers) assert.match(f.card(p as never, tb.id), /Secondary: /);
  }
});

test("Prime Gradient: the gradient rounding to a prime ending in the dealt digit, in levels of digits; then the factor that prime plus 1 shares with the y-intercept", () => {
  const e3 = { ends: 3 }, e7 = { ends: 7 };
  assert.equal(score(ev(primeGradient, e3, mc(4, -3))), "-1/2,1");     // 3 is 1 away: ½ beyond rounding to it; 4 and 3 share 1
  assert.equal(score(ev(primeGradient, e7, mc(4, -3))), "-5/2,1");     // 7 is 3 away (5 does not count)
  assert.equal(score(ev(primeGradient, e7, mc(7, -3))), "27/20,1");    // on 7: level 1 + 0.7/2; 8 and 3 share 1
  assert.equal(score(ev(primeGradient, e7, mc(7, -12))), "27/20,4");   // 8 and 12 share 4
  assert.equal(score(ev(primeGradient, e3, mc(-2, 1))), "-9/2,1");     // the nearest prime ending in 3 to −2 is 3
  assert.equal(score(ev(primeGradient, e3, mc(Qn.q(5, 2), 0), lineQ)), "23/20,0");   // 2½ rounds to 3 (ties up); a whole part of 0 shares nothing
  assert.equal(score(ev(primeGradient, e3, abc(1, 0, -3), lineQ)), "WORST");
  assert.equal(score(ev(primeGradient, e7, mc(7, -3), lineZ, null)), "27/20");     // the main layer alone
  const cands = ev(primeGradient, e3, mc(4, -3)).marks.filter(m => m.kind === "candidate").map(m => refKey((m as { ref: never }).ref));
  assert.deepEqual(cands.sort(), ["cart.ghost(g=3)"]);
  // Every card names its digit.
  for (const ends of [1, 3, 7, 9]) assert.match(primeGradient.card({ ends }, null), new RegExp(`a prime ending in ${ends}`));
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
  // Square Area's worked lines: test/square-area.test.ts.
});

/** A test family: primary |m| (bigger is better), secondary: c, undefined when c is 0. */
const toy: RuleFamily<LineState, object> = {
  id: "toy", title: "toy", card: () => "", params: [], dealable: () => [{}], depends: ["si"],
  main: { id: "big", title: "", sentence: () => "", rep: "si", sense: "max" },
  tieBreakers: [
    { id: "c", title: "", sentence: () => "", rep: "si", sense: "max" },
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
  assert.equal(compareScores(strong.score, weak.score), 1);
});

test("no saturation (owner decision 23): a better primary outranks whatever the tie-breaker", () => {
  const over = ev(toy, {}, mc(7, -9));
  assert.equal(score(over), "7,-9");
  assert.equal(compareScores(over.score, ev(toy, {}, mc(3, 1)).score), 1);
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

test("a k-line object: every line evaluated; no object score yet (per-line bits summed comes next)", () => {
  const four: LineState = { lines: [mc(3, 3).lines[0]!, mc(1, 5).lines[0]!, mc(0, 0).lines[0]!, mc(0, 40).lines[0]!] };
  const e = evaluateObject(lineType, mMeetsC, {}, four, lineZ4, null);
  assert.deepEqual(e.sites.map(x => score(x)), ["0", "-4", "0", "-40"]);
  assert.equal(e.score, null);
  const one = evaluateObject(lineType, mMeetsC, {}, mc(1, 5), lineZ);
  assert.equal(score(one.sites[0]!), "-4,5");
  assert.deepEqual(one.score, one.sites[0]!.score);
});
