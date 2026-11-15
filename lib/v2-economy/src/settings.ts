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
 * `Lines · beginner`. Owner decision 37: 3 opportunities a second (room-wide). The coordinator's call 17 (15 Nov, from
 * the spec lead's power study: nothing climbs past about 40 bits, about three moves per seat-minute): power 4 a second
 * and a 240 s store. The start buys about three typical starters at the scaled summon price (bits × power ÷ 64): 3 ×
 * the median line starter's 559 bits ÷ 16 ≈ 100 (the server derives it, artifacts/engine convex/v2/presets.ts, and a
 * test holds the two equal).
 */
export const LINES_BEGINNER_ECONOMY: Economy = Object.freeze({
  powerPerSecond: 4,
  fullChargeSeconds: 240,
  startingEnergy: 100,
  opportunitiesPerSecond: 3,
});

/**
 * `Grids · beginner`: the lines' economy with the start that buys about three typical grid starters (a board's agent
 * reads 16 cells, not y = mx + c, so it is longer and dearer): 3 × the median grid starter's 701 bits ÷ 16 ≈ 130.
 */
export const GRIDS_BEGINNER_ECONOMY: Economy = Object.freeze({ ...LINES_BEGINNER_ECONOMY, startingEnergy: 130 });

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
