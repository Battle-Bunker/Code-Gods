/**
 * A room's economy settings (docs/energy-model.md §6, §6.1, §7). κ and β are not settings (charge.ts).
 */
import type { Rng } from "@workspace/v2-core";

export interface Economy {
  /** Each player's fixed power budget, bits per world second, split between its agents and its own store. */
  readonly powerPerSecond: number;
  /** World seconds an empty account that spends nothing takes to fill: every account holds at most its power × this. */
  readonly fullChargeSeconds: number;
  /** A player's own store at the start of planning, for its first summons (nothing accrues in planning). */
  readonly startingEnergy: number;
  /** The room-wide rate of opportunities (offers to agents), per world second. */
  readonly opportunitiesPerSecond: number;
}

/**
 * `Lines · beginner`. Owner decision 37: 3 opportunities a second (room-wide). The coordinator's call 13 (15 Nov) keeps
 * energy binding per act as at 25 Hz: power 8 bits/s (64 × 3/25), so a seat at 1 act/s has about 8 ⚡ an act, about 1.5
 * unit moves; a 240 s store keeps the capacity at 8 × 240 = 1920, as before, so the dearest beginner starter is still
 * payable in planning; 600 starting energy.
 */
export const LINES_BEGINNER_ECONOMY: Economy = Object.freeze({
  powerPerSecond: 8,
  fullChargeSeconds: 240,
  startingEnergy: 600,
  opportunitiesPerSecond: 3,
});

/**
 * `Grids · beginner`: the lines' economy with 900 starting energy. A board's agent reads 16 cells, not y = mx + c, so
 * it is longer and dearer to summon; 900 lets a grid starter take about the share of the starting energy a line starter
 * takes of 600 (artifacts/engine test/unit/v2-object-types.test.ts holds the two shares close).
 */
export const GRIDS_BEGINNER_ECONOMY: Economy = Object.freeze({ ...LINES_BEGINNER_ECONOMY, startingEnergy: 900 });

/** The bounds a room's economy must keep. */
export const ECONOMY_LIMITS = Object.freeze({
  powerPerSecond: Object.freeze({ min: 0, max: 1_000_000 }),
  fullChargeSeconds: Object.freeze({ min: 1, max: 1_000_000 }),
  startingEnergy: Object.freeze({ min: 0, max: 1_000_000_000 }),
  opportunitiesPerSecond: Object.freeze({ min: 0, max: 1000 }),
});

/** Throws on a setting that is not a finite number within ECONOMY_LIMITS. */
export function assertEconomy(economy: Economy): void {
  for (const key of Object.keys(ECONOMY_LIMITS) as (keyof Economy)[]) {
    const v = economy[key], { min, max } = ECONOMY_LIMITS[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be from ${min} to ${max}`);
  }
}

/**
 * How many opportunities a window of `seconds` world seconds holds: rate × seconds, stochastically rounded (never
 * accumulated: no opportunity debt carries to the next window). Draws one `rng.unit()` only when the expected count
 * has a fractional part.
 */
export function opportunities(perSecond: number, seconds: number, rng: Rng): number {
  if (!Number.isFinite(perSecond) || perSecond < 0 || !Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid opportunity window");
  const expected = perSecond * seconds;
  const whole = Math.floor(expected);
  const fraction = expected - whole;
  return fraction > 0 && rng.unit() < fraction ? whole + 1 : whole;
}
