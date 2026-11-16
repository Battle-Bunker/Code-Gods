import { test } from "node:test";
import assert from "node:assert/strict";
import { q, rng } from "@workspace/v2-core";
import { biggerRule, cheapestRoute, doublings, finish, fromMC, sidewaysSampled, startAt, targetRule, targetsPrimesEnding, targetsSquares } from "../src/index.ts";

const L = (m: number, c: number) => fromMC(q(m), q(c));
const A = targetRule("A", "m", targetsPrimesEnding("1"));

test("starts are drawn at the state's height (whole-number rounding moves small lines most)", () => {
  const r = rng("sideways-test", 1);
  for (const h of [4, 10, 16]) {
    const hs = Array.from({ length: 300 }, () => doublings(startAt(h, r)));
    const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    assert.ok(Math.abs(mean - h) < 0.6, `h ${h}: mean ${mean}`);
    assert.ok(hs.every(x => Math.abs(x - h) < 1.01), `h ${h}: ${Math.min(...hs)}..${Math.max(...hs)}`);
  }
});

test("a state is in its own class (cost 0), and a route is never dearer than its direct finish", () => {
  const s = L(101, 867);
  for (const rule of [A, targetRule("C", "area", targetsSquares), biggerRule("c")]) {
    const x = rule.reading === "m" ? 101 : rule.reading === "c" ? 867 : 867 ** 2 / 202;
    const cls = rule.classOf(x);
    assert.equal(finish(rule, cls, s), 0, rule.label);
    for (const st of [L(5, 3000), L(-40, 2), L(1, 1)]) assert.ok(cheapestRoute(rule, cls, st) <= finish(rule, cls, st) + 1e-9);
  }
});

test("sideways is finite and positive for a target slot, and the energy adds the height", () => {
  const s = sidewaysSampled(A, L(101, 867), 40);
  assert.ok(s.sideways > 0 && Number.isFinite(s.sideways) && Math.abs(s.energy - s.height - s.sideways) < 1e-9);
});
