/**
 * Time dilation (owner decision 37: "Make provision for speeding up time for AI simulations with a single param that
 * dilates everything uniformly by that factor including power and interaction rate and spawn rate and game duration
 * etc."). `dilate(settings, factor)` multiplies every rate by the factor and divides every duration by it, so a game
 * runs `factor` times faster in its own seconds while every per-act and per-object quantity stays the same: the
 * opportunities a window holds (rate × seconds), the energy an account gains in it (power × seconds), every capacity
 * (power × full-charge time), births per game, prices, starting energy. A simulation at 10 plays the same game in a
 * tenth of the time. Pure; the server applies it when a game starts (convex/v2/lobby.ts), simulations call it directly.
 */

/** The time-bearing settings: every per-second rate and every length in seconds a game or simulation has. */
export interface TimedSettings {
  readonly planningSeconds?: number;
  readonly worldSeconds?: number;
  readonly scoreIntervalSeconds?: number;
  readonly economy?: {
    readonly powerPerSecond?: number;
    readonly fullChargeSeconds?: number;
    readonly opportunitiesPerSecond?: number;
    readonly birthsPerSecond?: number;
  };
  readonly bid?: { readonly seconds?: number };
}

const RATES = ["powerPerSecond", "opportunitiesPerSecond", "birthsPerSecond"] as const;
const ECONOMY_DURATIONS = ["fullChargeSeconds"] as const;
const DURATIONS = ["planningSeconds", "worldSeconds", "scoreIntervalSeconds"] as const;

/** Every rate × factor, every duration ÷ factor; everything else as it was. A factor of 1 returns the same values. */
export function dilate<T extends TimedSettings>(settings: T, factor: number): T {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error("The time-dilation factor must be a positive number");
  const out = { ...settings } as Record<string, unknown>;
  for (const k of DURATIONS) if (typeof settings[k] === "number") out[k] = settings[k]! / factor;
  if (settings.economy) {
    const e: Record<string, unknown> = { ...settings.economy };
    for (const k of RATES) if (typeof settings.economy[k] === "number") e[k] = settings.economy[k]! * factor;
    for (const k of ECONOMY_DURATIONS) if (typeof settings.economy[k] === "number") e[k] = settings.economy[k]! / factor;
    out.economy = e;
  }
  if (settings.bid && typeof settings.bid.seconds === "number") out.bid = { ...settings.bid, seconds: settings.bid.seconds / factor };
  return out as T;
}
