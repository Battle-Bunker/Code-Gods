/**
 * A line's energy (src/energy.ts on src/lens-routes.ts and v2-core free-energy.ts): routes priced as turns (naming plus
 * surprise), starts of the state's size, and what holds by construction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { argBits, q, Qn, turnSurprise } from "@workspace/v2-core";
import { estimateLine, fromMC, lensById, lensPrice, lineStarts, LENSES, mutationBits, routePrice, TURN_BITS, type LineRule } from "../src/index.ts";
import { LINES_BEGINNER_PHYSICS } from "@workspace/v2-economy";
import { lineQ } from "./config.ts";
const L = LINES_BEGINNER_PHYSICS.gravity;

test("every lens reads a line and names it back", () => {
  const lines = [fromMC(q(3, 4), q(25, 4)), fromMC(q(-2, 7), q(-729)), fromMC(q(5), q(0))];
  for (const l of lines) for (const lens of LENSES) {
    const ns = lens.numbers(l);
    if (!ns) continue;
    const back = lens.line(ns, l);
    if (lens.id === "mA" && !back) continue;   // an area whose root is not rational
    assert.ok(back && back.a === l.a && back.b === l.b && back.c === l.c, `${lens.id}: ${ns.join(" ")}`);
  }
});

test("a route's price is its mutations' naming bits plus the turn's surprise", () => {
  const mc = lensById("mc"), x = fromMC(q(3), q(5)), t = fromMC(q(3), q(9));
  const p = routePrice(L, x, t);
  // Add 4 to c's top: one mutation; the surprise of 3/1 → 3/1 and 5/1 → 9/1.
  const naming = mutationBits(mc, argBits(4n, true)), surprise = turnSurprise(L, [3n, 1n, 5n, 1n], [3n, 1n, 9n, 1n]);
  assert.ok(Math.abs(lensPrice(L, mc, [3n, 1n, 5n, 1n], [3n, 1n, 9n, 1n]).naming - naming) < 1e-9);
  assert.ok(p.total <= naming + surprise + TURN_BITS + 1e-9, `${p.total} > ${naming + surprise}`);
  // Multiplying is a shortcut: 5 → 5·2^20 names a factor, not the path.
  const far = fromMC(q(3), q(5 * 2 ** 20));
  assert.ok(lensPrice(L, mc, [3n, 1n, 5n, 1n], [3n, 1n, 5n * 2n ** 20n, 1n]).naming < mutationBits(mc, argBits(5n * 2n ** 20n - 5n, true)));
  // Crossing zero by an add is dear (the long path's surprise); negating first is the cheaper list.
  assert.ok(routePrice(L, fromMC(q(3), q(1000)), fromMC(q(3), q(-1003))).total < 80);
  void far;
});

test("starts have the state's size in the rule's lens, stratified", () => {
  const s = fromMC(q(7, 3), q(8670001, 10000)), starts = lineStarts(s, "mc", 20, "size", LINES_BEGINNER_PHYSICS.sameSizeBand);
  assert.equal(starts.length, 20);
  for (const x of starts) {
    const c = q(-x.c, x.b), top = Number(c.n < 0n ? -c.n : c.n);
    assert.ok(Math.log2(top) >= Math.log2(8670001) - 1 && Math.log2(top) < Math.log2(8670001) + 1.5, Qn.toWire(c));
  }
});

/** A test rule: the y-intercept near 867. */
const near867: LineRule = { u: l => -Math.abs(Qn.toNumber(q(-l.c, l.b)) - 867), lens: "mc", candidates: () => [fromMC(q(1), q(867))] };

test("energy: 0 at the start's own level, more for a better state; a candidate only lowers it; seeded estimates repeat", () => {
  const good = fromMC(q(2), q(867)), poor = fromMC(q(2), q(500));
  const e = estimateLine(good, near867, lineQ, { K: 8, seed: "a" });
  assert.deepEqual(e, estimateLine(good, near867, lineQ, { K: 8, seed: "a" }));
  assert.ok(e.energy > 0 && e.energy > estimateLine(poor, near867, lineQ, { K: 8, seed: "a" }).energy - 1e-9);
  const bare = estimateLine(good, near867, lineQ, { K: 8, seed: "a", candidates: false });
  assert.ok(e.energy <= bare.energy + 1e-9, `${e.energy} > ${bare.energy}`);
  for (const x of e.samples) assert.ok(x.cost <= x.best + 1e-9 && x.best <= x.universal + 1e-9);
});
