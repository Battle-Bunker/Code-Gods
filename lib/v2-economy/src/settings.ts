/**
 * A room's economy settings (docs/energy-model.md §6, §6.1, §7). κ and β are not settings (charge.ts).
 */
import type { Physics, Rng } from "@workspace/v2-core";

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
 * the median line starter's 825 bits ÷ 16 ≈ 150 (the server derives it, artifacts/engine convex/v2/presets.ts, and a
 * test holds the two equal; 130 at 715 bits until the beginner lines dealt the dynamic families, 16 Nov).
 */
export const LINES_BEGINNER_ECONOMY: Economy = Object.freeze({
  // 17 Nov (energy IS bits): a typical turn costs about 12 bits (one add on a lens: naming ≈ 11, surprise ≈ 1), so
  // 3 bits a second over a 300 s world buys about 75 typical turns a seat, plus the start.
  powerPerSecond: 3,
  fullChargeSeconds: 240,
  startingEnergy: 100,
  opportunitiesPerSecond: 3,
});

/**
 * `Grids · beginner`: the lines' economy with the start that buys about three typical grid starters (a board's agent
 * reads 16 cells, not y = mx + c, so it is longer and dearer): 3 × the median grid starter's 511 bits ÷ 16 ≈ 100 (17 Nov: the nine dynamic grid rules; 140 before).
 */
export const GRIDS_BEGINNER_ECONOMY: Economy = Object.freeze({ ...LINES_BEGINNER_ECONOMY, startingEnergy: 70 });

/**
 * The beginner games' physics (owner, 17 Nov: "all key params are game config parameters ... including the likes of
 * energy income and gravity strength"). The engine has no defaults: these are the only values, read by the server's and
 * the app's variants (physicsForVariant). Lines: gravity λ = 1 (the resting law ∝ 2^−H; a rise costs λ·s more than a
 * fall), 12 estimator starts within half a bit of the state's size, newborn numbers' bit lengths with P(L) ∝ 2^−L.
 * largestNumber 10,000,000 (17 Nov, docs/engine-v2/balance.md): without it lines ran to 40- to 500-bit numbers within a
 * game, where several rules read NaN (energy 0: a cheap ×10 zeroed a rival) or lost float exactness; at 10^7 every
 * dealt rule is exact (Corner's 2n·top·bottom and Whole Stair's top² + bottom² stay below 2^53, Stepping Coefficients
 * below its 10^10).
 */
export const LINES_BEGINNER_PHYSICS: Physics = Object.freeze({ gravity: 1, estimatorStarts: 12, sameSizeBand: 0.5, newbornBitRate: 1, largestNumber: 10_000_000 });
/** Grids: only the estimator's start count applies (a board has no size, no gravity, no a, b, c, and is born by its walk). */
export const GRIDS_BEGINNER_PHYSICS: Physics = Object.freeze({ gravity: 1, estimatorStarts: 20, sameSizeBand: 0.5, newbornBitRate: 1, largestNumber: 1 });

/** The physics of each variant the beginner configurations deal; undefined for a variant no configuration sets. */
export function physicsForVariant(variantId: string): Physics | undefined {
  if (variantId.startsWith("line-")) return LINES_BEGINNER_PHYSICS;
  if (variantId.startsWith("grid-")) return GRIDS_BEGINNER_PHYSICS;
  return undefined;
}

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
