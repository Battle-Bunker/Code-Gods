/**
 * How a game ends and how often its standings are published (v1's settings, restored; archive/engine-v1
 * lib/game-core/src/game-timer.ts, random.ts and settings.ts):
 *
 * - `durationMode` "fixed": the world ends exactly `worldSeconds` after it starts, and the end is public (the setting is).
 * - `durationMode` "halfLife": the world ends at a hidden random moment, drawn once when the world starts:
 *   −ln(U)·h/ln 2 for a uniform U in (0, 1), an exponential lifetime with half-life h = `worldSeconds`, so half of
 *   games end within it. The drawn end (`v2Games.endAtWorld`) is never disclosed while live; the app shows the central
 *   90% interval, which never moves (the exponential is memoryless).
 * - `scoreIntervalSeconds`: world seconds between published standings (v1's default 10).
 * Pure.
 */
export type DurationMode = "fixed" | "halfLife";
export const DEFAULT_SCORE_INTERVAL_SECONDS = 10;
/** v1's pre-authored choices (a custom value within 1 to 3,600 is allowed too). */
export const SCORE_INTERVAL_OPTIONS: readonly number[] = [5, 10, 20, 30, 60];
export const PEER_NOISE_OPTIONS: readonly number[] = [0, 2, 4, 8, 16];

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

/** The world second a new game ends at: exactly `worldSeconds` when fixed, else a drawn lifetime with that half-life. */
export function drawEnd(mode: DurationMode, worldSeconds: number, uniform: () => number = openUniform): number {
  return mode === "fixed" ? worldSeconds : lifetimeSeconds(worldSeconds, uniform());
}

/** The world second a game ends at (PRIVATE in halfLife mode). */
export const endWorldOf = (game: { endAtWorld?: number; settings: { worldSeconds: number } }) => game.endAtWorld ?? game.settings.worldSeconds;
export const durationModeOf = (game: { settings: { durationMode?: DurationMode } }): DurationMode => game.settings.durationMode ?? "fixed";
export const scoreIntervalOf = (game: { settings: { scoreIntervalSeconds?: number } }) => game.settings.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS;

/** The central 90% of an exponential lifetime with half-life h: about [0.074·h, 4.32·h] (what the app shows). */
export function halfLifeInterval90(halfLifeSeconds: number): { lo: number; hi: number } {
  const tau = halfLifeSeconds / Math.LN2;
  return { lo: tau * Math.log(1 / 0.95), hi: tau * Math.log(1 / 0.05) };
}
