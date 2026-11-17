import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPriced, compareScores, evaluateObject, Qn, q, refKey, rng, variantMutators, walkStep, type ObjectType, type Q, type RuleFamily } from "@workspace/v2-core";
import { crossingSliver, dynamicFamilies as families, fromMC, lineQ, lineType, lineZ, circleKiss, primeHug, squareTriangle, type LineState } from "@workspace/v2-linear";
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
  // Any other fraction is typeset the same way: a mixed number with a small raised numerator over a lowered denominator.
  assert.equal(fmtQ(q(22, 7)), "3¹⁄₇");
  assert.equal(fmtQ(q(8, 11)), "⁸⁄₁₁");
  assert.equal(fmtQ(q(-407, 12)), "−33¹¹⁄₁₂");
  assert.doesNotMatch(fmtQ(q(21, 11)), /\//, "never a slash a reader could misread as division");
});

test("readable: exact fractions up to a denominator of 100, an approximate decimal beyond", async () => {
  const { readable } = await import("../src/format.ts");
  assert.equal(readable(q(147, 64)), "2¹⁹⁄₆₄");
  assert.equal(readable(q(1, 3)), "⅓");
  assert.equal(readable(q(1000, 101)), "9⁹¹⁄₁₀₁", "a three-digit denominator is written exact");
  assert.equal(readable(q(10000, 1001)), "≈ 9.99");
  assert.equal(readable(q(27720)), "27,720");
});

test("two parts: main part and tie-breaker, marks split by term (storyboard §3.4)", () => {
  const r = rule(emptyTank, {}, lineQ);
  const a = annotate(r, mc(-3, 10));
  const [main, tie] = a.sites[0]!.parts;
  assert.equal(main!.name, "main part");
  assert.equal(fmtQ(main!.value as Q), "⅓");
  assert.equal(tie!.name, "secondary preference");
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
      // Every mark of a dealt part (or of no part) lands in exactly one part; a mark of a layer not dealt here (a tuple
      // family's third when only two parts are dealt) has no part to land in.
      const owned = parts.flatMap(x => x.marks), dealt = new Set(e.sites[0]!.components.map(c => c.term));
      assert.equal(owned.length, e.sites[0]!.marks.filter(m => !("term" in m) || m.term === undefined || dealt.has(m.term)).length, f.id);
    }
  }
});

test("moves: each really improves the utility, at the price it quotes; the cheapest for the main part leads, the frontier ascends", () => {
  for (const [f, p, st] of [
    [emptyTank, {}, mc(-3, 10)], [primeHug, { suffix: "3" }, mc(4, -3)], [circleKiss, { k: 5 }, mc(q(3, 4), 6)], [crossingSliver, { pattern: "1" }, mc(7, -2)], [squareTriangle, { k: 3 }, mc(-1, 3)],
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

test("a move no player could pay for is never offered (gallery: a move priced 21,123,744,906,456,000,000.00 energy)", async () => {
  const { MAX_MOVE_PRICE } = await import("../src/moves.ts");
  for (const f of [primeHug, squareTriangle] as RuleFamily<LineState, unknown>[]) {
    const rule = { type: lineType, family: f, params: f.dealable(lineQ)[0], variant: lineQ } as RuleRef<LineState, unknown>;
    for (const s of [fromMC(q(997), q(3)), fromMC(q(-3), q(10))].map(l => ({ lines: [l] }))) {
      for (const m of moves(rule, s, undefined, { k: 4 })) assert.ok(m.price.total <= MAX_MOVE_PRICE, `${f.id}: ${m.words} at ${m.price.total}`);
    }
  }
});
