/**
 * Compare analytic survival levels with an empirical calibration table (docs/analytic-calibration/playbook.md §6).
 *
 * Tables record bits only, so the standard error of each level is reconstructed from the estimator budget the
 * table records (scripts/estimator.ts):
 *  - Monte Carlo body (bits ≤ log2(nMc / minMcCount)): se = sqrt((1 − p)/(p·nMc)) / ln 2 with p = 2^−bits;
 *  - splitting tail: the body variance at the deepest MC level plus 1/(particles·ln²2) per bit climbed (each stage
 *    keeps about half the particles, so one stage ≈ one bit), inflated by the estimator's SE_INFLATION (1.6);
 *  - exact tables ("exact", "exact:<id>"): se = 0 (any difference beyond 1e-6 bits is a real disagreement).
 * The model ignores the isotonic clean-up and the MCMC correlation beyond the inflation factor, so |z| up to ~3–4
 * in the tail is ordinary; a wrong formula shows up as |z| ≫ 5 or a systematic drift in Δ.
 */
import type { CalibrationTable } from "../calibration.ts";
import { log2SurvivalAt, type Levels } from "./kit.ts";

const LN2 = Math.LN2;

export function levelSe(table: CalibrationTable, bits: number): number {
  const b = table.estimator.budget;
  if (typeof b === "string") return 0;
  const bMc = Math.log2(b.nMc / b.minMcCount);
  const varAt = (x: number) => { const p = 2 ** -x; return (1 - p) / (p * b.nMc) / LN2 ** 2; };
  if (bits <= bMc + 1e-9) return Math.sqrt(varAt(bits));
  return 1.6 * Math.sqrt(varAt(bMc) + (bits - bMc) / (b.particles * LN2 ** 2));
}

/** Bits at or below this are Monte Carlo body levels (direct counts), above it splitting levels. */
export function bodyBits(table: CalibrationTable): number {
  const b = table.estimator.budget;
  return typeof b === "string" ? Infinity : Math.log2(b.nMc / b.minMcCount);
}

export interface Comparison {
  readonly levels: number;
  /** max |z| over the Monte Carlo body only (direct counts: a wrong formula shows here first). */
  readonly bodyZ: number;
  /** max |Δ| over the splitting tail only (0 when the table has none). */
  readonly tailDelta: number;
  /** max |table bits − analytic bits| over the table's levels. */
  readonly maxAbsDelta: number;
  /** max |Δ| / se (Δ / 1e-6 for exact tables). */
  readonly maxZ: number;
  /** The level with the largest |z|. */
  readonly worst: { readonly ordinal: unknown; readonly table: number; readonly analytic: number; readonly z: number };
}

/** Compare at every level of the table (the analytic side is evaluated at the same ordinals). */
export function compareTable(table: CalibrationTable, analytic: Levels): Comparison {
  let maxAbsDelta = 0, maxZ = 0, bodyZ = 0, tailDelta = 0, worst: Comparison["worst"] = { ordinal: null, table: 0, analytic: 0, z: 0 };
  // se floor: exact tables 1e-6 (rounding); estimates 1e-3 bits (the clean-up's MIN_STEP_BITS increments and p ≈ 1).
  const exact = typeof table.estimator.budget === "string", body = bodyBits(table);
  for (const [o, bits] of table.levels) {
    const a = -log2SurvivalAt(analytic, o);
    const d = bits - a, se = Math.max(levelSe(table, bits), exact ? 1e-6 : 1e-3), z = d / se;
    maxAbsDelta = Math.max(maxAbsDelta, Math.abs(d));
    if (bits <= body) bodyZ = Math.max(bodyZ, Math.abs(z)); else tailDelta = Math.max(tailDelta, Math.abs(d));
    if (Math.abs(z) >= Math.abs(worst.z)) worst = { ordinal: o, table: bits, analytic: a, z };
    maxZ = Math.max(maxZ, Math.abs(z));
  }
  return { levels: table.levels.length, bodyZ, tailDelta, maxAbsDelta, maxZ, worst };
}
