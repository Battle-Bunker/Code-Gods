import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPriced, compareScores, evaluateObject, Qn, q, refKey, rng, variantMutators, walkStep, type ObjectType, type Q, type RuleFamily } from "@workspace/v2-core";
import { crossingCheck, families, fromMC, lineQ, lineType, lineZ, mMeetsC, primeGradient, triangleArea, type LineState } from "@workspace/v2-linear";
import { annotate, fmtQ, markTerm, moves, type RuleRef } from "../src/index.ts";
import { emptyTank } from "../src/demo.ts";

const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const rule = <P,>(family: RuleFamily<LineState, P>, params: P, variant = lineZ, tieBreaker?: string | null): RuleRef<LineState, P> =>
  ({ type: lineType, family, params, variant, tieBreaker });

test("format: true minus, vulgar fractions, mixed numbers", () => {
  assert.equal(fmtQ(q(-3)), "−3");
  assert.equal(fmtQ(q(1, 3)), "⅓");
  assert.equal(fmtQ(q(10, 3)), "3⅓");
  assert.equal(fmtQ(q(-7, 4)), "−1¾");
  assert.equal(fmtQ(q(22, 7)), "22/7");
});

test("Prime Gradient: main part and tie-breaker, their values the scored terms, the reference and the distance", () => {
  const a = annotate(rule(primeGradient, {}), mc(4, -3));
  const [p, tie] = a.sites[0]!.parts;
  assert.equal(a.sites[0]!.parts.length, 2);
  assert.equal(p!.name, "main part");
  assert.equal(p!.term, "near");
  assert.equal(Qn.toWire(p!.value as Q), "1");
  assert.equal(p!.aim, "the closer, the better");
  assert.equal(tie!.term, "prime");
  assert.equal(tie!.aim, "the bigger, the better");
  assert.equal(a.bits, null, "no value function: no bits");
  assert.deepEqual(annotate(rule(primeGradient, {}), mc(4, -3), { value: () => 3.5 }).bits, 3.5);
  assert.equal(annotate(rule(primeGradient, {}, lineZ, null), mc(4, -3)).sites[0]!.parts.length, 1);
  // The main part owns the picture: both nearby primes, drawn as ghosts with their distances.
  assert.deepEqual(p!.marks.filter(m => m.kind === "candidate").map(m => refKey((m as { ref: never }).ref)).sort(), ["cart.ghost(g=3)", "cart.ghost(g=5)"]);
  assert.ok(a.sites[0]!.working.includes("gradient = 4"));
  assert.ok(a.sites[0]!.working.includes("distance to 3 = 1"));
});

test("WORST: the undefined sentence is the reason", () => {
  const a = annotate(rule(triangleArea, { A: 6 }), mc(3, 0));
  assert.equal(a.score, null);
  assert.equal(a.utility, null);
  assert.match(a.worst!, /no triangle/);
  assert.match(a.sites[0]!.parts[0]!.sentence, /^The line and the axes make no triangle/);
});

test("two parts: main part and tie-breaker, marks split by term (storyboard §3.4)", () => {
  const r = rule(emptyTank, {}, lineQ);
  const a = annotate(r, mc(-3, 10));
  const [main, tie] = a.sites[0]!.parts;
  assert.equal(main!.name, "main part");
  assert.equal(fmtQ(main!.value as Q), "⅓");
  assert.equal(tie!.name, "tie-breaker");
  assert.ok(main!.marks.some(m => m.kind === "measure"));
  assert.ok(tie!.marks.length > 0 && tie!.marks.every(m => markTerm(m) === "pgap"));
  assert.ok(!main!.marks.some(m => markTerm(m) === "pgap"));
  assert.match(annotate(r, mc(2, -6)).worst!, /not draining/);
});

test("parts are the recorded terms on every family and a walk of states: no second computation", () => {
  const g = rng("annotate-corpus");
  let s = mc(1, 1);
  const all = [...families, emptyTank] as readonly RuleFamily<LineState, any>[];
  for (let i = 0; i < 200; i++) {
    s = walkStep(lineType, lineQ, s, g);
    for (const f of all) {
      const p = f.dealable(lineQ)[0];
      const r = rule(f, p, lineQ);
      const a = annotate(r, s);
      const e = evaluateObject(lineType, f, p, s, lineQ);
      assert.deepEqual(a.score, e.score);
      const parts = a.sites[0]!.parts;
      assert.equal(parts.length, e.sites[0]!.components.length);
      if (e.score !== null) {
        parts.forEach((part, j) => {
          // An undefined tie-breaker is a null score part: the part shows it undefined, with its reason.
          if (e.score![j] === null) { assert.ok(part.value !== null && typeof part.value === "object" && "undefined" in part.value, `${f.id} part ${j}`); return; }
          const v = part.value as Q;
          assert.ok(Qn.eq(part.sense === "min" ? Qn.neg(v) : v, e.score![j]!), `${f.id} part ${j}`);
        });
      }
      // Every mark lands in exactly one part.
      const owned = parts.flatMap(x => x.marks);
      assert.equal(owned.length, e.sites[0]!.marks.length, f.id);
    }
  }
});

test("moves: each really improves the utility, at the price it quotes; the cheapest for the main part leads, the frontier ascends", () => {
  for (const [f, p, st] of [
    [emptyTank, {}, mc(-3, 10)], [primeGradient, {}, mc(4, -3)], [mMeetsC, {}, mc(1, 5)], [crossingCheck, { k: 1, q: 5 }, mc(1, 0)], [triangleArea, { A: 8 }, mc(-1, 3)],
  ] as const) {
    const r = rule(f as RuleFamily<LineState, unknown>, p, lineQ);
    const before = evaluateObject(lineType, r.family, r.params, st, lineQ).score;
    const ms = moves(r, st, null, { k: 3 });
    assert.ok(ms.length > 0, `${f.id}: a move`);
    for (const [i, m] of ms.entries()) {
      assert.ok(compareScores(m.utility, before) > 0, `${f.id}: ${m.words} improves`);
      // Re-apply the quoted call independently: same result, same price.
      const mu = variantMutators(lineType as ObjectType<unknown>, lineQ).find(x => x.id === m.call.mutator)!;
      const again = applyPriced(lineType as ObjectType<unknown>, lineQ, st, mu, m.call.site, mu.args(lineQ).decode(m.call.args as never));
      assert.ok(!("invalid" in again) && Math.abs(again.price.total - m.price.total) < 1e-9, `${f.id}: price of ${m.words}`);
      assert.equal(m.bits, null);
    }
    // The varied list (moves.ts): the cheapest move for the main part first, then the tie-breaker's, then the frontier.
    const main = (u: typeof before) => (u === null ? null : [u[0] ?? null]);
    const forMain = ms.filter(m => compareScores(main(m.utility), main(before)) > 0);
    if (forMain.length) assert.ok(forMain.every(m => m.price.total >= ms[0]!.price.total), `${f.id}: the cheapest for the main part leads`);
    const fill = ms.filter(m => /^rare/.test(m.reason));
    for (let i = 1; i < fill.length; i++) assert.ok(fill[i]!.price.total >= fill[i - 1]!.price.total, `${f.id}: the frontier ascends`);
  }
});
