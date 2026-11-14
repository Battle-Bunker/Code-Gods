import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";

/**
 * The deployed presets the server knows (integration plan §1.2: a room picks a preset plus a few overrides).
 *
 * A stand-in until W1-5 publishes `lib/v2-linear/presets.ts` (the beginner pool chosen from the calibration report):
 * then this module re-exports that list and keeps only the server's lookup. The families here are every line family;
 * the dealer deals only their rules with a converged artefact (convex/v2/deal.ts).
 */
export interface PresetBid { pricing: "first" | "second"; disclosure: "none" | "handicaps" | "all"; seconds: number }
/** The economy a preset plays (docs/energy-model.md; `lib/v2-economy` owns the maths). */
export interface PresetEconomy {
  powerPerSecond: number;
  /** An account holds at most its power times this many world seconds. */
  fullChargeSeconds: number;
  /** Room-wide mutation opportunities per world second. */
  opportunitiesPerSecond: number;
  /** Object births per world second after the starting objects. */
  birthsPerSecond: number;
}
export interface Preset {
  id: string;
  title: string;
  variant: string;
  minPlayers: number;
  planningSeconds: number;
  worldSeconds: number;
  startingEnergy: number;
  startingObjects: number;
  /** Families the dealer draws from (each needs a converged artefact for every dealable parameter, spec §7.6). */
  families: readonly string[];
  economy: PresetEconomy;
  bid?: PresetBid;
}

const BEGINNER: Preset = {
  id: "lines-beginner", title: "Lines · beginner", variant: "line-z", minPlayers: 3,
  planningSeconds: 60, worldSeconds: 300, startingEnergy: LINES_BEGINNER_ECONOMY.startingEnergy, startingObjects: 24,
  families: ["prime-gradient", "triangle-area", "m-meets-c", "crossing-check", "whole-intercept", "square-area"],
  economy: {
    powerPerSecond: LINES_BEGINNER_ECONOMY.powerPerSecond, fullChargeSeconds: LINES_BEGINNER_ECONOMY.fullChargeSeconds,
    opportunitiesPerSecond: LINES_BEGINNER_ECONOMY.opportunitiesPerSecond, birthsPerSecond: 0.1,
  },
};

export const PRESETS: readonly Preset[] = [
  BEGINNER,
  { ...BEGINNER, id: "lines-beginner-bidding", title: "Lines · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
];
export const DEFAULT_PRESET = BEGINNER.id;

export function presetOf(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? BEGINNER;
}
export const isPreset = (id: string) => PRESETS.some(p => p.id === id);
