/**
 * Cross-family opportunity guard (balance-families, 2026-11-11). Calibration equalises what a random board scores, not
 * the ceiling: on one shape, reward families' top achievable bits differ several-fold, and under skilled play the
 * family with the higher ceiling wins (scripts/family-balance.ts: on Annotated basics, greedy 3-player, colour_bonds at
 * 71 top bits wins 60% and kingdom at 25 bits wins 4%). Prior-mean bits differ too (coarse ordinals with heavy bottom
 * atoms score below the continuous 1/ln 2).
 *
 * What would break: a new family, param or recalibration that widens either gap on a shipped shape. The limits are
 * pinned at the values measured on 2026-11-11 (plus a small margin for estimator noise) and only ratchet DOWN: lower a
 * limit when a change narrows the gap. Unlike test/equal-opportunity.test.ts (one family's params against each other),
 * this compares different families of the same shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shippedInstanceKeys, shippedFile } from "../src/calibration-data.ts";
import { family } from "../src/catalog.ts";
import type { CalibrationTable } from "../src/calibration.ts";

/** The seed setups' shapes (game-core SEED_SETUPS), measured 2026-11-11: the largest top-bits ratio and the largest prior-mean-bits gap allowed. */
const LIMITS: Readonly<Record<string, { topRatio: number; meanGap: number }>> = {
  "Grid(4,base10,rgb)": { topRatio: 21.59, meanGap: 1.39 }, // bridge_builder..conqueror (First steps, Annotated basics)
  "Grid(5,base10,rgby)": { topRatio: 20.16, meanGap: 1.02 }, // bridge_builder..conqueror (Classic, Low income)
  "Grid(6,base16,rainbow6)": { topRatio: 24.81, meanGap: 1.17 }, // ladder_of_numbers..conqueror (Big board)
  "Grid(7,cards,rainbow6)": { topRatio: 28.67, meanGap: 1.27 }, // bridge_builder..lucky_token (Master)
};
/** Estimator noise allowance. */
const MARGIN = 1.02, MEAN_MARGIN = 0.05;

function stats(t: CalibrationTable): { top: number; mean: number } {
  const b = t.levels.map(l => l[1]);
  let mean = 0;
  for (let i = 0; i < b.length; i++) mean += (2 ** -b[i] - (i + 1 < b.length ? 2 ** -b[i + 1] : 0)) * b[i];
  return { top: b[b.length - 1], mean };
}

/** Per shipped shape: the reward families' top-bits ratio (max/min) and prior-mean gap (max−min), uniform prior. */
export function crossFamilyGaps(): Map<string, { topRatio: number; meanGap: number; low: string; high: string }> {
  const out = new Map<string, { topRatio: number; meanGap: number; low: string; high: string }>();
  for (const key of shippedInstanceKeys()) {
    if (!(key in LIMITS)) continue;
    const s = shippedFile(key)!.tables
      .filter(t => !(t as { prior?: unknown }).prior && family(t.family).role === "reward")
      .map(t => ({ f: t.family, ...stats(t) }));
    if (s.length < 2) continue;
    const lo = s.reduce((a, b) => (b.top < a.top ? b : a)), hi = s.reduce((a, b) => (b.top > a.top ? b : a));
    const means = s.map(x => x.mean);
    out.set(key, { topRatio: hi.top / Math.max(1e-9, lo.top), meanGap: Math.max(...means) - Math.min(...means), low: lo.f, high: hi.f });
  }
  return out;
}

if (process.env.PRINT_LIMITS) for (const [k, g] of crossFamilyGaps()) console.log(`  ${JSON.stringify(k)}: { topRatio: ${g.topRatio.toFixed(2)}, meanGap: ${g.meanGap.toFixed(2)} }, // ${g.low}..${g.high}`);

test("no shipped shape widens the gap between reward families' ceilings or prior means", () => {
  const worse: string[] = [];
  for (const [key, g] of crossFamilyGaps()) {
    const lim = LIMITS[key];
    if (g.topRatio > lim.topRatio * MARGIN) worse.push(`${key}: top-bits ratio ${g.topRatio.toFixed(2)} > ${lim.topRatio} (${g.low} vs ${g.high})`);
    if (g.meanGap > lim.meanGap + MEAN_MARGIN) worse.push(`${key}: prior-mean gap ${g.meanGap.toFixed(2)} > ${lim.meanGap}`);
  }
  assert.deepEqual(worse, [], "cross-family opportunity got worse; see scripts/family-balance.ts");
  assert.equal(crossFamilyGaps().size, Object.keys(LIMITS).length, "a seed setup's shape has no shipped calibration");
});
