import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, Qn, q, refKey, rng, walkStep, type Q, type RuleFamily } from "@workspace/v2-core";
import { crossingCheck, families, fromMC, lineQ, lineType, lineZ, mMeetsC, primeGradient, triangleArea, type LineState } from "@workspace/v2-linear";
import { annotate, fmtQ, markTerm, nearestImprovement, type RuleRef } from "../src/index.ts";
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

test("Prime Gradient: main part and tie-breaker, values are the scored terms, steps on their own ladders", () => {
  const a = annotate(rule(primeGradient, {}), mc(4, -3));
  // Joint ladder: Z distances 13, 8, 5, 3, 2, 1, 0 (seven main steps), three coarse tie-breaker steps (primes 7, 13, 23)
  // at each main level below the top and all ten (primes 3 … 31) at it. A gap of 1 is main step 6; the prime 3 or 5
  // meets no coarse step: 1 + 3 + 5·4 = step 24.
  assert.equal(a.level, 24);
  assert.equal(a.top, 3 + 6 * 4 + 1 + 10);
  const [p, tie] = a.sites[0]!.parts;
  assert.equal(a.sites[0]!.parts.length, 2);
  assert.equal(p!.name, "main part");
  assert.equal(p!.term, "near");
  assert.equal(Qn.toWire(p!.value as Q), "1");
  assert.equal(p!.rung, 6);
  assert.equal(p!.rungs, 7);
  assert.equal(p!.rungLabel, "gradient to a prime within 1");
  assert.equal(p!.nextLabel, "gradient to a prime exactly");
  assert.equal(tie!.term, "prime");
  assert.equal(annotate(rule(primeGradient, {}, lineZ, null), mc(4, -3)).sites[0]!.parts.length, 1);
  // The main part owns the picture: both nearby primes, drawn as ghosts with their distances.
  assert.deepEqual(p!.marks.filter(m => m.kind === "candidate").map(m => refKey((m as { ref: never }).ref)).sort(), ["cart.ghost(g=3)", "cart.ghost(g=5)"]);
  assert.ok(a.sites[0]!.working.includes("gradient = 4"));
  assert.ok(a.sites[0]!.working.includes("distance to 3 = 1"));
});

test("WORST: the undefined sentence is the reason, level 0", () => {
  const a = annotate(rule(triangleArea, { A: 6 }), mc(3, 0));
  assert.equal(a.score, null);
  assert.equal(a.level, 0);
  assert.match(a.worst!, /no triangle/);
  assert.match(a.sites[0]!.parts[0]!.sentence, /^The line and the axes make no triangle/);
});

test("two parts: main part and tie-breaker each on their own ladder, marks split by term (storyboard §3.4)", () => {
  const r = rule(emptyTank, {}, lineQ);
  const a = annotate(r, mc(-3, 10), { rarities: Array.from({ length: 37 }, (_, i) => i / 10) });
  // T = 10/3, nearest minute 3, gap 1/3: main step 5 of 8, and 3 is prime: the tie-breaker's top. On the joint ladder
  // (three coarse tie-breaker steps at each main level below the top, all four at it) that is 1 + 3 + 4·4 + 3 = step 23.
  assert.equal(a.level, 23);
  assert.equal(a.top, 3 + 7 * 4 + 1 + 4);
  assert.equal(a.rarity, 2.3);
  assert.equal(a.nextRarity, 2.4);
  const [main, tie] = a.sites[0]!.parts;
  assert.equal(main!.name, "main part");
  assert.equal(fmtQ(main!.value as Q), "⅓");
  assert.deepEqual([main!.rung, main!.rungs], [5, 8]);
  assert.equal(tie!.name, "tie-breaker");
  assert.deepEqual([tie!.rung, tie!.rungs], [4, 4]);   // 3 is prime: the top
  assert.ok(main!.marks.some(m => m.kind === "measure"));
  assert.ok(tie!.marks.length > 0 && tie!.marks.every(m => markTerm(m) === "pgap"));
  assert.ok(!main!.marks.some(m => markTerm(m) === "pgap"));

  const off = annotate(r, mc(2, -6));
  assert.equal(off.level, 0);
  assert.match(off.worst!, /not draining/);
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

test("nearest improvement: really raises the level, at the price it quotes", () => {
  const r = rule(emptyTank, {}, lineQ);
  const s = mc(-3, 10);
  const imp = nearestImprovement(r, s)!;
  assert.equal(imp.kind, "level");
  assert.ok(imp.levelAfter > imp.levelBefore);
  // Re-apply the quoted call independently and check level and price.
  const after = annotate(r, imp.result as LineState);
  assert.equal(after.level, imp.levelAfter);
  assert.ok(imp.price.total > 0);
  assert.match(imp.sentence, /⚡\): step \d+ of 36\.$/);

  for (const [f, p, st] of [
    [primeGradient, {}, mc(4, -3)], [mMeetsC, {}, mc(1, 5)], [crossingCheck, { k: 1, q: 5 }, mc(1, 0)], [triangleArea, { A: 8 }, mc(-1, 3)],
  ] as const) {
    const rr = rule(f as RuleFamily<LineState, unknown>, p, lineZ);
    const i2 = nearestImprovement(rr, st);
    assert.ok(i2, f.id);
    assert.ok(i2!.levelAfter >= i2!.levelBefore, f.id);
    assert.equal(annotate(rr, i2!.result as LineState).level, i2!.levelAfter, f.id);
  }
});

test("nearest improvement: none at the top of a ladder with nothing closer", () => {
  assert.equal(nearestImprovement(rule(primeGradient, {}, lineZ, null), mc(3, 0)), null);
});
