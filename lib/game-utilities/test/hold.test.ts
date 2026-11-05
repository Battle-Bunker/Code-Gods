/**
 * Hold rarity (scripts/hold.ts; docs/energy-model.md §8): hold(u, m) = −log2 P(U(x′) ≥ u | U(x) ≥ u), x′ = x after m
 * mutations ∝ 2^(−C). Smoke budget: these check the shape of the estimate, not its precision.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instantiate } from "@workspace/game-types";
import { context, family } from "../src/catalog.ts";
import { SMOKE_HOLD_BUDGET, buildHoldTable, holdBits, holdKeyPart } from "../scripts/hold.ts";

const g4 = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const draw = (id: string) => family(id).support(context(g4)).find(() => true)!;

test("a hold table: levels strictly increasing, bits ≥ 0, about 0 at the bottom; deterministic in its seed", () => {
  const p = draw("chessmaster");
  const t = buildHoldTable("chessmaster", p, g4, 2, "unit", SMOKE_HOLD_BUDGET);
  assert.equal(t.m, 2);
  assert.ok(t.levels.length >= 3, JSON.stringify(t.levels));
  assert.ok(t.levels[0][1] < 0.5, "everything at or above the lowest level holds");
  for (const [, bits] of t.levels) assert.ok(bits >= 0 && Number.isFinite(bits));
  assert.deepEqual(buildHoldTable("chessmaster", p, g4, 2, "unit", SMOKE_HOLD_BUDGET), t);
  assert.notEqual(holdKeyPart(1), holdKeyPart(2));
});

test("more noise holds less: hold bits grow with m at the top level", () => {
  const p = draw("chessmaster");
  const one = buildHoldTable("chessmaster", p, g4, 1, "m", SMOKE_HOLD_BUDGET);
  const four = buildHoldTable("chessmaster", p, g4, 4, "m", SMOKE_HOLD_BUDGET);
  const top = one.levels[one.levels.length - 1][0];
  assert.ok(holdBits(four, top) > holdBits(one, top), `${holdBits(four, top)} vs ${holdBits(one, top)}`);
});

test("holdBits: none for one player or below the lowest level; the top level's above it", () => {
  const t = { m: 1, levels: [[2, 0.1], [5, 1.5], [9, 3]] as [number, number][], noise: "n", estimator: { id: "hold-ams", version: 1, seed: "s", particles: 1 } } as const;
  assert.equal(holdBits(null, 7), 0);
  assert.equal(holdBits({ ...t, m: 0 }, 7), 0);
  assert.equal(holdBits(t, 1), 0);
  assert.equal(holdBits(t, 5), 1.5);
  assert.equal(holdBits(t, 20), 3);
  assert.ok(holdBits(t, 7) > 1.5 && holdBits(t, 7) < 3);
});
