import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, evaluateSite, levelOf, refKey, rng, walkStep, Qn, type Evaluation, type RuleFamily } from "@workspace/v2-core";
import { crossingCheck, lineType, lineQ, lineZ, lineZ4, mMeetsC, primeGradient, triangleArea, type LineState } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const score = (e: Evaluation) => (e.score === null ? "WORST" : e.score.map(Qn.toWire).join(","));
const ev = <P,>(f: RuleFamily<LineState, P>, p: P, s: LineState, v = lineZ) => evaluateSite(lineType, f, p, s, v);

test("Prime Gradient: worked examples and its candidates", () => {
  assert.equal(score(ev(primeGradient, {}, mc(4, -3))), "-1");
  assert.equal(score(ev(primeGradient, {}, mc(5, -3))), "0");
  assert.equal(score(ev(primeGradient, {}, mc(-2, 1))), "-4");     // nearest prime 2
  assert.equal(score(ev(primeGradient, {}, mc(Qn.q(5, 2), 0), lineQ)), "-1/2");
  assert.equal(score(ev(primeGradient, {}, abc(1, 0, -3), lineQ)), "WORST");   // vertical
  const e = ev(primeGradient, {}, mc(4, -3));
  const cands = e.marks.filter(m => m.kind === "candidate").map(m => refKey((m as { ref: never }).ref));
  assert.deepEqual(cands.sort(), ["cart.ghost(g=3)", "cart.ghost(g=5)"]);
});

test("Triangle Area, m Meets c, Crossing Check: worked examples", () => {
  assert.equal(score(ev(triangleArea, { A: 8 }, mc(-1, 4))), "0");        // legs 4 and 4
  assert.equal(score(ev(triangleArea, { A: 6 }, mc(2, 1))), "-23/4");     // area 1/4
  assert.equal(score(ev(triangleArea, { A: 6 }, mc(3, 0))), "WORST");     // through the origin
  assert.equal(score(ev(mMeetsC, {}, mc(1, 5))), "-4");
  assert.equal(score(ev(mMeetsC, {}, mc(3, 3))), "0");
  assert.equal(score(ev(crossingCheck, { k: 1, q: 5 }, mc(2, 1))), "-1");  // y(1) = 3, x(5) = 2
  assert.equal(score(ev(crossingCheck, { k: 1, q: 5 }, mc(0, 1))), "WORST");
});

test("score and annotation come from the same terms: every score component is a term, every mark cites a read", () => {
  const r = rng("terms");
  let s = mc(1, 1);
  for (let i = 0; i < 300; i++) {
    s = walkStep(lineType, lineQ, s, r);
    for (const [f, p] of [[primeGradient, {}], [triangleArea, { A: 6 }], [mMeetsC, {}], [crossingCheck, { k: 2, q: 4 }]] as const) {
      const e = evaluateSite(lineType, f as RuleFamily<LineState, unknown>, p, s, lineQ);
      const gap = e.terms.find(t => t.id === "gap")!;
      if (e.score === null) assert.ok("undefined" in gap.value);
      else assert.equal(Qn.toWire(e.score[0]!), Qn.toWire(Qn.neg(gap.value as never)));
      const reads = new Set(e.reads.map(x => refKey(x, true)));
      for (const m of e.marks) for (const x of m.kind === "measure" ? [m.from, m.to] : [m.ref]) assert.ok(reads.has(refKey(x, true)));
    }
  }
});

test("the evaluation context refuses reads outside depends and marks of unread elements", () => {
  const rogue: RuleFamily<LineState, object> = {
    ...mMeetsC, id: "rogue",
    evaluate(ctx) { ctx.read({ rep: "gen", name: "a" }); ctx.term("gap", "", Qn.ZERO, []); ctx.score([{ term: "gap", sense: "min" }]); },
  };
  assert.throws(() => ev(rogue, {}, mc(1, 1)), /not in its depends/);
  const sloppy: RuleFamily<LineState, object> = {
    ...mMeetsC, id: "sloppy",
    evaluate(ctx) { ctx.term("gap", "", Qn.ZERO, []); ctx.score([{ term: "gap", sense: "min" }]); ctx.mark({ kind: "focus", ref: { rep: "si", name: "m" } }); },
  };
  assert.throws(() => ev(sloppy, {}, mc(1, 1)), /without reading/);
});

test("ladders and levels; several lines sum their levels", () => {
  const ladder = mMeetsC.ladder({}, lineZ);
  assert.equal(levelOf(ev(mMeetsC, {}, mc(1, 5)).score, ladder), 3);   // gap 4: within 5
  assert.equal(levelOf(ev(mMeetsC, {}, mc(3, 3)).score, ladder), ladder.length - 1);
  assert.equal(levelOf(null, ladder), 0);
  const four: LineState = { lines: [mc(3, 3).lines[0]!, mc(1, 5).lines[0]!, mc(0, 0).lines[0]!, mc(0, 40).lines[0]!] };
  const e = evaluateObject(lineType, mMeetsC, {}, four, lineZ4);
  assert.equal(e.score!.map(Qn.toWire).join(","), `${7 + 3 + 7 + 0},0,0,-4,-40`);
});

test("a k-line object is calibrated on the totals of its lines' levels", async () => {
  const { objectLadder } = await import("@workspace/v2-core");
  const ladder = objectLadder(lineType, mMeetsC, {}, lineZ4);
  assert.equal(ladder.length, 1 + 4 * 7);
  const four: LineState = { lines: [mc(3, 3).lines[0]!, mc(1, 5).lines[0]!, mc(0, 0).lines[0]!, mc(0, 40).lines[0]!] };
  assert.equal(levelOf(evaluateObject(lineType, mMeetsC, {}, four, lineZ4).score, ladder), 17);
  assert.equal(objectLadder(lineType, mMeetsC, {}, lineZ).length, 8);
});
