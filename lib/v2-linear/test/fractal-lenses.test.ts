/** The continued-fraction and prime-exponent lenses (src/fractal-lenses.ts): every line reads back, and the moves step as described. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, Qn } from "@workspace/v2-core";
import { applySteps, expandAdd, cfAligned, cfLens, cfMutate, continuedOf, fromMC, peLens, valueOf } from "../src/index.ts";

const lines = [fromMC(q(3, 4), q(25, 4)), fromMC(q(-2, 7), q(-729)), fromMC(q(5), q(0)), fromMC(q(13, 8), q(-1, 3)), fromMC(q(0), q(7, 2))];
const same = (a: { a: bigint; b: bigint; c: bigint } | null, b: { a: bigint; b: bigint; c: bigint }) => assert.ok(a && a.a === b.a && a.b === b.b && a.c === b.c);

test("continued fractions: canonical, exact, and every line reads back in both lenses", () => {
  assert.deepEqual(continuedOf(q(13, 8)), [1n, 1n, 1n, 1n, 2n]);
  assert.deepEqual(continuedOf(q(-7, 3)), [-3n, 1n, 2n]);   // −7/3 = −3 + 2/3 = −3 + 1/(1 + 1/2)
  assert.ok(Qn.eq(valueOf([1n, 1n, 1n, 1n, 2n])!, q(13, 8)));
  for (const l of lines) { same(cfLens.build(cfLens.read(l)!), l); same(peLens.build(peLens.read(l)!), l); }
});

test("continued-fraction moves: a step in the tree of fractions is one small move; lengths pad with 0", () => {
  const ns = cfLens.read(fromMC(q(3, 2), q(1)))!;           // m = [1; 2], c = [1]
  const appended = cfMutate(ns, { kind: "append", which: "m", k: 3n })!;   // [1; 2, 3] = 1 + 1/(2 + 1/3) = 10/7
  assert.ok(Qn.eq(valueOf(appended.m)!, q(10, 7)));
  assert.deepEqual(cfMutate(appended, { kind: "drop", which: "m" })!.m, [1n, 2n]);
  assert.equal(cfMutate(ns, { kind: "drop", which: "c" }), null, "the last coefficient cannot be dropped");
  assert.equal(cfMutate(ns, { kind: "add", which: "m", at: 1, k: -2n }), null, "a later coefficient stays 1 or more");
  const [b, a] = cfAligned(ns, appended);
  assert.deepEqual(b, [1n, 2n, 0n, 1n]);
  assert.deepEqual(a, [1n, 2n, 3n, 1n]);
});

test("prime exponents: adding 1 to an exponent multiplies by that prime", () => {
  const l = fromMC(q(3, 4), q(25, 4)), ns = peLens.read(l)!;
  assert.deepEqual(ns.slice(0, 7), [0n, 1n, 0n, 0n, 0n, 0n, 1n]);   // gradient top 3
  const up = ns.slice(); up[1] = up[1]! + 1n;                     // 3 → 9
  same(peLens.build(up), fromMC(q(9, 4), q(25, 4)));
  const down = ns.slice(); down[7] = down[7]! + 1n;               // gradient bottom 4 → 8
  same(peLens.build(down), fromMC(q(3, 8), q(25, 4)));
  const bad = ns.slice(); bad[0] = -1n;
  assert.equal(peLens.build(bad), null, "an exponent stays 0 or more");
});

test("adding p/q expands into whole-number mutations: 1/2 + 1/3 is multiply the bottom by 3, then add 4 to the top", () => {
  const steps = expandAdd(1n, 2n, 1n, 3n);
  assert.deepEqual(steps, [{ kind: "mul", on: "bottom", k: 3n }, { kind: "add", on: "top", k: 4n }]);
  assert.ok(Qn.eq(applySteps(1n, 2n, steps), q(5, 6)));
  for (const [t, b, p, d] of [[3n, 4n, -5n, 6n], [7n, 1n, 2n, 1n], [-1n, 9n, 1n, 3n]] as const) {
    assert.ok(Qn.eq(applySteps(t, b, expandAdd(t, b, p, d)), Qn.add(q(t, b), q(p, d))), `${t}/${b} + ${p}/${d}`);
  }
});
