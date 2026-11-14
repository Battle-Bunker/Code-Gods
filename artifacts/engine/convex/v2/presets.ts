/**
 * The deployed presets the server plays (integration plan §1.2: a room picks a preset plus a few overrides). The pool
 * of rules each deals is W1's (`lib/v2-linear` presets: families, parameters and tie-breakers); this module adds what
 * the server needs to run a game of it: timing, players, the economy and an optional bid phase. The deal
 * (convex/v2/deal.ts) deals only the pool's rules whose artefact converged.
 */
import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
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
  economy: PresetEconomy;
  bid?: PresetBid;
}

const ECONOMY: PresetEconomy = {
  powerPerSecond: LINES_BEGINNER_ECONOMY.powerPerSecond, fullChargeSeconds: LINES_BEGINNER_ECONOMY.fullChargeSeconds,
  opportunitiesPerSecond: LINES_BEGINNER_ECONOMY.opportunitiesPerSecond, birthsPerSecond: 0.1,
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
    minPlayers: 3, planningSeconds: 60, worldSeconds: 300, startingEnergy: LINES_BEGINNER_ECONOMY.startingEnergy, startingObjects: 24,
    economy: ECONOMY, ...extra,
  };
}

const BEGINNER = fromPool("lines-beginner");
/**
 * The beginner grid (docs/engine-v2/grids.md): the 4×4 board of digits. A board's agents read 16 cells, not y = mx + c,
 * so they are longer and dearer to summon (grid starters cost about 400 to 590 ⚡, line starters 300 to 500): grids
 * start with 900 ⚡ so that a starter takes about the share of the starting energy a line starter takes of 600.
 */
const GRIDS = fromPool("grids-beginner", { startingEnergy: 900 });

export const PRESETS: readonly Preset[] = [
  BEGINNER,
  { ...BEGINNER, id: "lines-beginner-bidding", title: "Lines · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  fromPool("lines-rational"),
  fromPool("lines-four"),
  GRIDS,
  { ...GRIDS, id: "grids-beginner-bidding", title: "Grids · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
];
export const DEFAULT_PRESET = BEGINNER.id;

export function presetOf(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? BEGINNER;
}
export const isPreset = (id: string) => PRESETS.some(p => p.id === id);
