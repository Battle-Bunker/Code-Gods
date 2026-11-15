/**
 * The deployed presets the server plays (integration plan §1.2: a room picks a preset plus a few overrides). The pool
 * of rules each deals is W1's (`lib/v2-linear` presets: families, parameters and tie-breakers); this module adds what
 * the server needs to run a game of it: timing, players, the economy and an optional bid phase. The deal
 * (convex/v2/deal.ts) deals only the pool's rules whose artefact converged.
 */
import { GRIDS_BEGINNER_ECONOMY, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { preset as linearPreset, type PoolRule } from "@workspace/v2-linear";
import { gridPresets } from "@workspace/v2-grid";

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
   * affordable but doing so 100 times a second would be prohibitive"): a look costs about 1.1 ⚡ on a line (weight 3,
   * median 11.7 bits) and 1.3 ⚡ on a grid (weight 1, median 41 bits), so 5 a second take about a tenth of a player's
   * 64 ⚡/s and 100 a second about twice all of it.
   */
  readPriceWeight: number;
  economy: PresetEconomy;
  bid?: PresetBid;
}

const ECONOMY: PresetEconomy = {
  powerPerSecond: LINES_BEGINNER_ECONOMY.powerPerSecond, fullChargeSeconds: LINES_BEGINNER_ECONOMY.fullChargeSeconds,
  // Births: owner decision 31, "1 spawn per 4 minutes" (one birth per 240 s).
  opportunitiesPerSecond: LINES_BEGINNER_ECONOMY.opportunitiesPerSecond, birthsPerSecond: 1 / 240,
};

/** A pool by id: the line presets' (v2-linear) or the grid's (v2-grid). */
function poolPreset(id: string): { id: string; title: string; variant: string; rules: readonly PoolRule[] } {
  const g = gridPresets.find(x => x.id === id);
  return g ? { id: g.id, title: g.title, variant: g.variant, rules: g.rules as readonly PoolRule[] } : linearPreset(id);
}

function fromPool(id: string, extra: Partial<Preset> & { id?: string; title?: string } = {}): Preset {
  const p = poolPreset(id);
  const pool = p.rules;
  return {
    id: p.id, title: p.title, variant: p.variant, pool, families: [...new Set(pool.map(r => r.family))],
    minPlayers: 3, planningSeconds: 60, worldSeconds: 300, startingEnergy: LINES_BEGINNER_ECONOMY.startingEnergy,
    // Owner decision 31: "Let's shrink object quantity for the beginner game to 3 ... I want to concentrate human
    // attention more on specific battlefields for the beginner game."
    // Owner decision 32: each reading of the others' sums is an independent draw of this variance; σ 8 (v1's default)
    // outside the beginner game.
    startingObjects: 3, durationMode: "fixed", peerNoiseVariance: 64,
    readPriceWeight: p.variant.startsWith("grid") ? 1 : 3,
    economy: ECONOMY, ...extra,
  };
}

/**
 * The beginner games: ten minutes (owner decision 34, "The beginner game should be 10m long"), so with decision 31's
 * births 5 objects by the end; exact readings (decision 32, "it should be zero for the beginner game").
 */
const BEGINNER_WORLD = { worldSeconds: 600, peerNoiseVariance: 0 };
const BEGINNER = fromPool("lines-beginner", BEGINNER_WORLD);
/**
 * The beginner grid (docs/engine-v2/grids.md): the 4×4 board of digits. A board's agents read 16 cells, not y = mx + c,
 * so they are longer and dearer to summon (grid starters cost about 400 to 590 ⚡, line starters 300 to 500): grids
 * start with 900 ⚡ so that a starter takes about the share of the starting energy a line starter takes of 600.
 */
const GRIDS = fromPool("grids-beginner", { ...BEGINNER_WORLD, startingEnergy: GRIDS_BEGINNER_ECONOMY.startingEnergy });


/**
 * Presets outside the beginner game keep v1's default board (the coordinator's call, 15 Nov; owner decisions 31, 34 and
 * 37 are for the beginner game only): 10 starting objects, a birth every 10 s, the half-life end at 300 s, 100
 * opportunities a second, power 64, a 30 s store, 600 to start (archive lib/game-core settings.ts, the Grid defaults).
 */
const V1_DEFAULT_BOARD: Partial<Preset> = {
  startingObjects: 10, durationMode: "halfLife", worldSeconds: 300,
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
  { ...GRIDS, id: "grids-beginner-bidding", title: "Grids · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  fromPool("grids-more-rules", { ...V1_DEFAULT_BOARD, startingEnergy: GRIDS_BEGINNER_ECONOMY.startingEnergy }),
];
export const DEFAULT_PRESET = BEGINNER.id;

export function presetOf(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? BEGINNER;
}
export const isPreset = (id: string) => PRESETS.some(p => p.id === id);
