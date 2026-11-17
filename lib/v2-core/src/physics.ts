/**
 * The game's physics settings (owner's standing requirement, 17 Nov: "all key params are game config parameters"). The
 * engine has no default for any of them: a variant carries them (`withPhysics`), set only in the game configurations
 * beside the rule list and the economy, and `physicsOf` throws when they are missing.
 */
import type { Variant } from "./contracts.ts";

export interface Physics {
  /** λ: gravity's strength. The passive jiggle's resting law is ∝ 2^(−λH); a rise of s bits costs λ·s more than a fall. */
  readonly gravity: number;
  /** The estimator's same-size starts per estimate. */
  readonly estimatorStarts: number;
  /** The band of start sizes above the state's own, in bits. */
  readonly sameSizeBand: number;
  /** Newborn numbers: each extra bit of size is 2^rate times rarer (rate 1: P(bit length L) ∝ 2^−L). */
  readonly newbornBitRate: number;
}

/** The bounds each setting must keep. */
export const PHYSICS_LIMITS: Readonly<Record<keyof Physics, { readonly min: number; readonly max: number }>> = Object.freeze({
  gravity: Object.freeze({ min: 0, max: 100 }),
  estimatorStarts: Object.freeze({ min: 1, max: 10_000 }),
  sameSizeBand: Object.freeze({ min: 0, max: 8 }),
  newbornBitRate: Object.freeze({ min: 0.05, max: 16 }),
});

/** Throws on a setting that is missing or not a finite number within PHYSICS_LIMITS. */
export function assertPhysics(p: unknown): asserts p is Physics {
  if (typeof p !== "object" || p === null) throw new Error("the game's physics settings are missing (gravity, estimatorStarts, sameSizeBand, newbornBitRate)");
  for (const key of Object.keys(PHYSICS_LIMITS) as (keyof Physics)[]) {
    const v = (p as Record<string, unknown>)[key], { min, max } = PHYSICS_LIMITS[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`physics setting ${key} must be a number from ${min} to ${max}`);
  }
  if (!Number.isInteger((p as Physics).estimatorStarts)) throw new Error("physics setting estimatorStarts must be a whole number");
}

/** The variant with the game's physics settings (checked). */
export function withPhysics<V extends Variant>(variant: V, physics: Physics): V {
  assertPhysics(physics);
  return { ...variant, physics };
}

/** The variant's physics settings; throws when the game configuration did not set them. */
export function physicsOf(variant: Variant): Physics {
  assertPhysics(variant.physics);
  return variant.physics;
}
