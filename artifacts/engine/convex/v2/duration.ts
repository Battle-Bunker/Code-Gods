/**
 * How a game ends and how often its standings are published (v1's settings, restored; archive/engine-v1
 * lib/game-core/src/game-timer.ts, random.ts and settings.ts):
 *
 * - `durationMode` "fixed": the world ends exactly `worldSeconds` after it starts, and the end is public (the setting is).
 * - `durationMode` "halfLife": the world ends at a hidden random moment, drawn once when the world starts: an exponential
 *   lifetime −ln(U)·h/ln 2 for a uniform U in (0, 1), with half-life h = `worldSeconds`, never shorter than h/10 (the
 *   coordinator's trial, 15 Nov: "a game that ends before anyone can act is no game"; v1 had no floor, so 7% of games
 *   ended within h/10). A draw below the floor is drawn again; the exponential is memoryless, so that is exactly the
 *   floor plus one exponential draw, which is how it is computed. The drawn end (`v2Games.endAtWorld`) is never
 *   disclosed while live; past the floor the time left has the same spread however long the game has run.
 * - `scoreIntervalSeconds`: world seconds between published standings (v1's default 10).
 * Pure.
 */
export type DurationMode = "fixed" | "halfLife";
export const DEFAULT_SCORE_INTERVAL_SECONDS = 10;
/** v1's pre-authored choices (a custom value within 1 to 3,600 is allowed too). */
export const SCORE_INTERVAL_OPTIONS: readonly number[] = [5, 10, 20, 30, 60];
/** The variance, bits², of each reading of the others' sums (decision 32): σ 0, 2, 4, 8 or 16 bits. */
export const PEER_NOISE_VARIANCE_OPTIONS: readonly number[] = [0, 4, 16, 64, 256];

/** An exponential lifetime with this half-life, from a uniform in (0, 1). */
export function lifetimeSeconds(halfLifeSeconds: number, uniformOpen: number): number {
  if (!(halfLifeSeconds > 0) || !(uniformOpen > 0 && uniformOpen < 1)) throw new Error("Invalid lifetime draw");
  return -Math.log(uniformOpen) * halfLifeSeconds / Math.LN2;
}

/** A uniform in (0, 1) from the platform's cryptographic randomness (the drawn end must not be predictable). */
export function openUniform(): number {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let n = 0;
  for (const x of b) n = n * 256 + x;
  return (n + 0.5) / 2 ** 48;
}

/** A half-life game's shortest lifetime, as a fraction of its half-life (the coordinator's trial). */
export const MIN_LIFETIME_FRACTION = 0.1;

/**
 * The world second a new game ends at: exactly `worldSeconds` when fixed, else a drawn lifetime with that half-life,
 * redrawn while below h/10 (computed as h/10 plus one draw: the same law, since the exponential is memoryless).
 */
export function drawEnd(mode: DurationMode, worldSeconds: number, uniform: () => number = openUniform): number {
  return mode === "fixed" ? worldSeconds : MIN_LIFETIME_FRACTION * worldSeconds + lifetimeSeconds(worldSeconds, uniform());
}

/** The world second a game ends at (PRIVATE in halfLife mode). */
export const endWorldOf = (game: { endAtWorld?: number; settings: { worldSeconds: number } }) => game.endAtWorld ?? game.settings.worldSeconds;
export const durationModeOf = (game: { settings: { durationMode?: DurationMode } }): DurationMode => game.settings.durationMode ?? "fixed";
export const scoreIntervalOf = (game: { settings: { scoreIntervalSeconds?: number } }) => game.settings.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS;

/** The central 90% of a half-life game's lifetime (the floor h/10 plus an exponential): about [0.174·h, 4.42·h]. */
export function halfLifeInterval90(halfLifeSeconds: number): { lo: number; hi: number } {
  const tau = halfLifeSeconds / Math.LN2, floor = MIN_LIFETIME_FRACTION * halfLifeSeconds;
  return { lo: floor + tau * Math.log(1 / 0.95), hi: floor + tau * Math.log(1 / 0.05) };
}
