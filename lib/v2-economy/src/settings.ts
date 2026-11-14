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
 * `Lines · beginner`: today's beginner economy (game-core's Annotated basics on the Grid defaults): power 64 bits/s,
 * a 30 s store, 600 starting energy (the dearest beginner starter must be payable in planning, under the planning store
 * of 64 × 30 = 1920), 25 opportunities a second.
 */
export const LINES_BEGINNER_ECONOMY: Economy = Object.freeze({
  powerPerSecond: 64,
  fullChargeSeconds: 30,
  startingEnergy: 600,
  opportunitiesPerSecond: 25,
});

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
