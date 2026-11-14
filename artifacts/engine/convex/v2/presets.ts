/**
 * The deployed presets the server plays (integration plan §1.2: a room picks a preset plus a few overrides). The pool
 * of rules each deals is W1's (`lib/v2-linear` presets: families, parameters and tie-breakers); this module adds what
 * the server needs to run a game of it: timing, players, the economy and an optional bid phase. The deal
 * (convex/v2/deal.ts) deals only the pool's rules whose artefact converged.
 */
import { CATALOGUE } from "@workspace/v2-agents/pure";
import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { lineType, preset as linearPreset, type PoolRule } from "@workspace/v2-linear";

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

/**
 * The rules of the families the shipped agents cover (lib/v2-agents CATALOGUE), every parameter set and tie-breaker.
 * A stopgap (W3's call, 14 November): W1's beginner pool names families W2 has no starters for yet, and a family
 * nobody can be given a starter for cannot be played by practice partners or new players. Until W2's starters cover
 * W1's pool, each preset's pool is W1's plus these; the deal still takes only converged rules with starters.
 */
const COVERED: readonly PoolRule[] = lineType.families.filter(f => CATALOGUE.some(e => e.family === f.id)).flatMap(f =>
  f.dealable({ id: "", objectType: "line", mutators: [], birthMixSteps: 0, params: {} }).map(params => ({ family: f.id, params, tieBreakers: f.tieBreakers.map(t => t.id) })));

function fromPool(id: string, extra: Partial<Preset> & { id?: string; title?: string } = {}): Preset {
  const p = linearPreset(id);
  const pool = [...p.rules, ...COVERED.filter(c => !p.rules.some(r => r.family === c.family))];
  return {
    id: p.id, title: p.title, variant: p.variant, pool, families: [...new Set(pool.map(r => r.family))],
    minPlayers: 3, planningSeconds: 60, worldSeconds: 300, startingEnergy: LINES_BEGINNER_ECONOMY.startingEnergy, startingObjects: 24,
    economy: ECONOMY, ...extra,
  };
}

const BEGINNER = fromPool("lines-beginner");

export const PRESETS: readonly Preset[] = [
  BEGINNER,
  { ...BEGINNER, id: "lines-beginner-bidding", title: "Lines · beginner with bidding", bid: { pricing: "first", disclosure: "none", seconds: 45 } },
  fromPool("lines-rational"),
  fromPool("lines-four"),
];
export const DEFAULT_PRESET = BEGINNER.id;

export function presetOf(id: string): Preset {
  return PRESETS.find(p => p.id === id) ?? BEGINNER;
}
export const isPreset = (id: string) => PRESETS.some(p => p.id === id);
