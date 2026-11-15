/**
 * The deployed presets the server plays (integration plan §1.2: a room picks a preset plus a few overrides). The pool
 * of rules each deals is W1's (`lib/v2-linear` presets: families, parameters and tie-breakers); this module adds what
 * the server needs to run a game of it: timing, players, the economy and an optional bid phase. The deal
 * (convex/v2/deal.ts) deals only the pool's rules whose artefact converged.
 */
import { LINES_BEGINNER_ECONOMY, readPriceWeightFor, summonPriceScale } from "@workspace/v2-economy";
import { preset as linearPreset, type PoolRule } from "@workspace/v2-linear";
import { gridPresets } from "@workspace/v2-grid";
import { pairPresets } from "@workspace/v2-pair";

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
  /** W1's pool: the rules the dealer may deal (before the artefacts' say). */
  pool: readonly PoolRule[];
  /** The families of the pool, in order (bid screens, rotation previews). */
  families: readonly string[];
  minPlayers: number;
  planningSeconds: number;
  worldSeconds: number;
  startingEnergy: number;
  startingObjects: number;
  /** How its games end (duration.ts): v1's Annotated basics was fixed, 300 s (archive settings.ts ANNOTATED_BASICS_PATCH). */
  durationMode: "fixed" | "halfLife";
  /**
   * The variance, bits², of each reading of the others' sums while live (disclose.ts, owner decision 32): 0 on the
   * beginner presets (the owner); 64 (σ 8, v1's default) elsewhere.
   */
  peerNoiseVariance: number;
  /**
   * The weight on a look's read price (bits ÷ κ; decision 35: "querying 5 objects every second would be easily
   * affordable but doing so 100 times a second would be prohibitive"), derived from the preset's power: 5 looks a second
   * at a typical object (MEDIAN_LOOK_BITS) take a tenth of a player's power (v2-economy readPriceWeightFor).
   */
  readPriceWeight: number;
  /** Parameter drift (drift.ts; the coordinator's trial, call 18): world seconds between redraws, 0 off; 120 on the beginner games. */
  driftSeconds: number;
  /** Births on a regular schedule, birth j at j / birthsPerSecond (decision 31: "1 spawn per 4 minutes so it ends at 5"); else v1's stochastic births. */
  regularBirths?: boolean;
  economy: PresetEconomy;
  bid?: PresetBid;
}

const ECONOMY: PresetEconomy = {
  powerPerSecond: LINES_BEGINNER_ECONOMY.powerPerSecond, fullChargeSeconds: LINES_BEGINNER_ECONOMY.fullChargeSeconds,
  // Births: owner decision 31, "1 spawn per 4 minutes" (one birth per 240 s).
  opportunitiesPerSecond: LINES_BEGINNER_ECONOMY.opportunitiesPerSecond, birthsPerSecond: 1 / 240,
};

/**
 * A typical object's full read, in bits: the median over 1,000 births of each variant a preset plays (measured; the
 * unit test v2-presets keeps it within 10% of the births). The read-price weight is set from it.
 */
export const MEDIAN_LOOK_BITS: Readonly<Record<string, number>> = { "line-q": 13.7, "line-q-lenses": 14.0, "grid-4-d10": 41.1, "pair-q": 26.4 };
export function medianLookBits(variant: string): number {
  const bits = MEDIAN_LOOK_BITS[variant];
  if (bits === undefined) throw new Error(`No median look for the variant ${variant}: measure it (MEDIAN_LOOK_BITS)`);
  return bits;
}

/**
 * The starter a newcomer summons, its summon price before the power scale, in bits: the median over the beginner
 * pool's Simple starters of each variant, both languages (measured; the unit test v2-presets keeps it within 5%: 575
 * on lines, 729 on grids, 15 Nov). Thorough and Bold are dearer and say so on their cards. The beginner game's start
 * buys STARTERS_AT_START of them at the scaled price (the coordinator's call 17), so it follows the power like the read
 * weight.
 */
export const MEDIAN_STARTER_BITS: Readonly<Record<string, number>> = { "line-q": 601, "line-q-lenses": 601, "grid-4-d10": 701 };
export const STARTERS_AT_START = 3;
/** The beginner start at this power: STARTERS_AT_START typical starters at the scaled summon price, to the nearest 10. */
export function beginnerStart(variant: string, powerPerSecond: number): number {
  const bits = MEDIAN_STARTER_BITS[variant];
  if (bits === undefined) throw new Error(`No median starter for the variant ${variant}: measure it (MEDIAN_STARTER_BITS)`);
  return Math.round((STARTERS_AT_START * bits * summonPriceScale(powerPerSecond)) / 10) * 10;
}

/** A pool by id: the line presets' (v2-linear), the grid's (v2-grid) or the two-line systems' (v2-pair). */
function poolPreset(id: string): { id: string; title: string; variant: string; rules: readonly PoolRule[] } {
  const g = gridPresets.find(x => x.id === id) ?? pairPresets.find(x => x.id === id);
  return g ? { id: g.id, title: g.title, variant: g.variant, rules: g.rules as readonly PoolRule[] } : linearPreset(id);
}

function fromPool(id: string, extra: Partial<Preset> & { id?: string; title?: string } = {}): Preset {
  const p = poolPreset(id);
  const pool = p.rules;
  const base: Omit<Preset, "readPriceWeight"> & { readPriceWeight?: number } = {
    id: p.id, title: p.title, variant: p.variant, pool, families: [...new Set(pool.map(r => r.family))],
    minPlayers: 3, planningSeconds: 60, worldSeconds: 300, startingEnergy: LINES_BEGINNER_ECONOMY.startingEnergy,
    // Owner decision 31: "Let's shrink object quantity for the beginner game to 3 ... I want to concentrate human
    // attention more on specific battlefields for the beginner game."
    // Owner decision 32: each reading of the others' sums is an independent draw of this variance; σ 8 (v1's default)
    // outside the beginner game.
    startingObjects: 3, durationMode: "fixed", peerNoiseVariance: 64, driftSeconds: 0,
    economy: ECONOMY, ...extra,
  };
  return { ...base, readPriceWeight: extra.readPriceWeight ?? readPriceWeightFor(base.economy.powerPerSecond, medianLookBits(base.variant)) };
}

/**
 * The beginner games: ten minutes (owner decision 34, "The beginner game should be 10m long"), so with decision 31's
 * births 5 objects by the end; exact readings (decision 32, "it should be zero for the beginner game").
 */
const BEGINNER_WORLD = { worldSeconds: 600, peerNoiseVariance: 0, driftSeconds: 120, regularBirths: true };
const BEGINNER = fromPool("lines-beginner", { ...BEGINNER_WORLD, startingEnergy: beginnerStart("line-q", ECONOMY.powerPerSecond) });
/**
 * The beginner grid (docs/engine-v2/grids.md): the 4×4 board of digits. A board's agents read 16 cells, not y = mx + c,
 * so they are longer and dearer to summon; its start buys three typical grid starters, as the lines' buys three line ones.
 */
const GRIDS = fromPool("grids-beginner", { ...BEGINNER_WORLD, startingEnergy: beginnerStart("grid-4-d10", ECONOMY.powerPerSecond) });


/**
 * Presets outside the beginner game keep v1's default board (the coordinator's call, 15 Nov; owner decisions 31, 34 and
 * 37 are for the beginner game only): 10 starting objects, a birth every 10 s, the half-life end at 300 s, 100
 * opportunities a second, power 64, a 30 s store, 600 to start (archive lib/game-core settings.ts, the Grid defaults).
 */
const V1_DEFAULT_BOARD: Partial<Preset> = {
  startingObjects: 10, durationMode: "halfLife", worldSeconds: 300, startingEnergy: 600,
  economy: { powerPerSecond: 64, fullChargeSeconds: 30, opportunitiesPerSecond: 100, birthsPerSecond: 0.1 },
};

export const PRESETS: readonly Preset[] = [
  BEGINNER,
  { ...BEGINNER, id: "lines-beginner-bidding", title: "Lines · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  // Whole-number lines are no longer offered (the owner: "there's no advantage to restricting the number type to integers in one
  // representation when the kids have to deal with rationals in another representation anyway"); line-z stays a variant in code
  // and in the collapse check (docs/engine-v2/landscape-analysis.md §4, first run). Several lines per object stays
  // provisional and undealt (coordinator's call 5), so "lines-four" is not offered either.
  // A trial (docs/engine-v2/lenses-and-mutators.md §5): the beginner pool with five more ways to move a line. Not the default.
  fromPool("lines-lenses", V1_DEFAULT_BOARD),
  GRIDS,
  // Two lines as one object (docs/engine-v2/two-line-systems.md): not the default. Its families carry dealt numbers
  // (a remainder, a divisor, a ratio: §8.3); every one is a ladder (keepsParams), so drift never redraws them (§11).
  // Two-line systems on the beginner economy (the coordinator, 15 Nov, playtest rounds 24–25: games ended at hidden
  // moments after 0:45–6:32): ten minutes fixed, as the line beginner game, with its start.
  fromPool("lines-pairs", { ...BEGINNER_WORLD, startingEnergy: BEGINNER.startingEnergy }),
  { ...GRIDS, id: "grids-beginner-bidding", title: "Grids · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  // Grid starters are dearer: 900 to start, so a starter takes about the share of it a line starter takes of 600.
  fromPool("grids-more-rules", { ...V1_DEFAULT_BOARD, startingEnergy: 900 }),
  // A readability playtest, not the default (docs/engine-v2/grid-params.md §13): Divisibility and Leading Digits, the
  // board read as long numbers, on the beginner grid's game and economy.
  fromPool("grids-arithmetic", { ...BEGINNER_WORLD, startingEnergy: GRIDS.startingEnergy }),
];
export const DEFAULT_PRESET = BEGINNER.id;

export function presetOf(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? BEGINNER;
}
export const isPreset = (id: string) => PRESETS.some(p => p.id === id);
