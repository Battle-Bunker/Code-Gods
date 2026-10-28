/**
 * Type-independent random timing. Object spawns are type-specific and live in @workspace/game-types
 * (`ObjectTypeDef.spawn`).
 */

/** Server injects unbiased random integers; seed/state must never enter public snapshots. */
export type RandomBelow = (exclusiveUpperBound: bigint) => bigint;

/** Inverse survival CDF: a uniform draw of 0.5 yields exactly one half-life. */
export function lifetimeSeconds(halfLifeSeconds: number, uniformOpen: number): number {
  if (!Number.isFinite(halfLifeSeconds) || halfLifeSeconds <= 0) {
    throw new Error("Invalid half-life");
  }
  if (!Number.isFinite(uniformOpen) || uniformOpen <= 0 || uniformOpen >= 1) {
    throw new Error("Random sample must be strictly between zero and one");
  }
  return -Math.log(uniformOpen) * halfLifeSeconds / Math.LN2;
}

export function poissonIntervalSeconds(rateHz: number, uniformOpen: number): number {
  if (!Number.isFinite(rateHz) || rateHz < 0) throw new Error("Invalid event rate");
  return rateHz === 0 ? Infinity : lifetimeSeconds(Math.LN2 / rateHz, uniformOpen);
}
