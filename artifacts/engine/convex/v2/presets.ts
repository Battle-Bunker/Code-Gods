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
   * The disclosure noise (disclose.ts). v1's Annotated basics had none (peerNoiseBits: 0): "with noise, a live total
   * reads high (the others' sum is floored at 0 after the noise) and every total drops when the game ends ..., which a
   * new player reads as a bug. Eight known simple rules have little secrecy to protect." Other setups: v1's default, 8.
   */
  peerNoiseBits: number;
  economy: PresetEconomy;
  bid?: PresetBid;
}

const ECONOMY: PresetEconomy = {
  powerPerSecond: LINES_BEGINNER_ECONOMY.powerPerSecond, fullChargeSeconds: LINES_BEGINNER_ECONOMY.fullChargeSeconds,
  // Births: the coordinator's TRIAL (14 Nov, declared to the owner, who wants fewer objects in the beginner game): 0.05/s
  // instead of v1 Annotated basics' 0.1/s.
  opportunitiesPerSecond: LINES_BEGINNER_ECONOMY.opportunitiesPerSecond, birthsPerSecond: 0.05,
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
    // v1 Annotated basics' starting count, restored (coordinator's call, 14 Nov).
    startingObjects: 10, durationMode: "fixed", peerNoiseBits: 0,
    economy: ECONOMY, ...extra,
  };
}

const BEGINNER = fromPool("lines-beginner");
/**
 * The beginner grid (docs/engine-v2/grids.md): the 4×4 board of digits. A board's agents read 16 cells, not y = mx + c,
 * so they are longer and dearer to summon (grid starters cost about 400 to 590 ⚡, line starters 300 to 500): grids
 * start with 900 ⚡ so that a starter takes about the share of the starting energy a line starter takes of 600.
 */
const GRIDS = fromPool("grids-beginner", { startingEnergy: GRIDS_BEGINNER_ECONOMY.startingEnergy });

export const PRESETS: readonly Preset[] = [
  BEGINNER,
  { ...BEGINNER, id: "lines-beginner-bidding", title: "Lines · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  // Whole-number lines are no longer offered (the owner: "there's no advantage to restricting the number type to integers in one
  // representation when the kids have to deal with rationals in another representation anyway"); line-z stays a variant in code
  // and in the collapse check (docs/engine-v2/landscape-analysis.md §4, first run). Several lines per object stays
  // provisional and undealt (coordinator's call 5), so "lines-four" is not offered either.
  // A trial (docs/engine-v2/lenses-and-mutators.md §5): the beginner pool with five more ways to move a line. Not the default.
  fromPool("lines-lenses"),
  GRIDS,
  { ...GRIDS, id: "grids-beginner-bidding", title: "Grids · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  fromPool("grids-more-rules", { startingEnergy: GRIDS_BEGINNER_ECONOMY.startingEnergy }),
];
export const DEFAULT_PRESET = BEGINNER.id;

export function presetOf(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? BEGINNER;
}
export const isPreset = (id: string) => PRESETS.some(p => p.id === id);
