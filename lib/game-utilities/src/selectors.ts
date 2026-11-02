import type { Instantiation, Rng } from "@workspace/game-types";
import { MATRICES } from "../data/synergy/index.js";
import type { UtilityDescriptor, UtilityFamily } from "./types.ts";
import { applicable, available, context, familiesFor, paramsKey, type Draw } from "./catalog.ts";

export interface SelectOptions {
  /**
   * Defence goals (settings.defenceGoals): when true EVERY god is also dealt exactly one defence goal (a penalty
   * family), and when false (the default: opt-in) none is. Never a per-god chance: a defence goal is a handicap.
   */
  readonly defenceGoals?: boolean;
  /**
   * Only deal draws that have calibration tables. Called with the raw draw (the predicate canonicalises it, e.g.
   * through `family.canonical`). Default: every draw has one.
   */
  readonly hasTable?: (draw: Draw) => boolean;
  /** Reward family ids never dealt in this game (settings.excludedFamilies). */
  readonly exclude?: readonly string[];
  /** Defence family ids never dealt in this game (settings.excludedDefenceFamilies). */
  readonly excludeDefence?: readonly string[];
  /** The rarity prior (settings.priorId); selects the synergy matrix. Default "uniform". */
  readonly priorId?: string;
}

/**
 * Decides which utility function each god receives. Selectors are the hook for future balancing (e.g.
 * guaranteeing overlapping interests); the default is pure chance.
 */
export interface UtilitySelector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  select(inst: Instantiation, godCount: number, rng: Rng, options?: SelectOptions): UtilityDescriptor[];
}

const ATTEMPTS = 1000;

/** A uniform family among `candidates`, then its sampler; redrawn until the draw is applicable (its needs) and has a table. */
function drawFrom(candidates: readonly UtilityFamily<any>[], inst: Instantiation, rng: Rng, hasTable: (d: Draw) => boolean): Draw | null {
  if (!candidates.length) return null;
  const ctx = context(inst);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const f = candidates[rng.int(candidates.length)];
    const d = { familyId: f.id, params: f.sample(rng, ctx) };
    if ((!f.needs || applicable(f, inst, d.params).ok) && hasTable(d)) return d;
  }
  return null;
}

/** The families of this instantiation that `resolve` makes available, of one role. */
export const availableFamilies = (inst: Instantiation, role: "reward" | "penalty", exclude: readonly string[] = []) =>
  familiesFor(inst.objectType, role).filter(f => available(f, inst).ok && !exclude.includes(f.id));

export const divineLottery: UtilitySelector = {
  id: "divine-lottery",
  name: "Divine Lottery",
  description: "Every god independently draws a random utility function from the families available for this kind of "
    + "object. Identical draws are redrawn; anything else, including two gods of the same family, can happen. With "
    + "defence goals on, every god is also dealt something to hate from the allowed defence goals.",
  select(inst, godCount, rng, options = {}) {
    const hasTable = options.hasTable ?? (() => true);
    const defence = options.defenceGoals === true;
    const rewards = availableFamilies(inst, "reward", options.exclude);
    const penalties = defence ? availableFamilies(inst, "penalty", options.excludeDefence) : [];
    const chosen: UtilityDescriptor[] = [];
    const seen = new Set<string>();
    for (let attempt = 0; chosen.length < godCount; attempt++) {
      if (attempt > ATTEMPTS * Math.max(1, godCount)) throw new Error(`Not enough distinct utility functions for ${inst.key}`);
      const reward = drawFrom(rewards, inst, rng, hasTable);
      if (!reward) throw new Error(`No calibrated utility family is available for ${inst.key}`);
      const penalty = defence ? drawFrom(penalties, inst, rng, hasTable) : null;
      if (defence && !penalty) throw new Error(`No calibrated defence goal is allowed for ${inst.key}`);
      const descriptor: UtilityDescriptor = penalty ? { ...reward, penalty } : reward;
      const key = paramsKey(descriptor);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(descriptor);
    }
    return chosen;
  },
};

/**
 * A family-level pairwise synergy matrix for one instantiation and prior (lib/grid-lab/docs/explore/synergy.md
 * §1: W_ij = depth-averaged PMI of the two families' upper contour sets under the prior, in bits; > 0 aligned).
 * Shipped with the calibration data under data/synergy/; unmeasured pairs count as 0 (orthogonal).
 */
export interface SynergyMatrix {
  readonly instKey: string;
  readonly priorId: string;
  readonly families: readonly string[];
  /** Symmetric, zero diagonal, families × families. */
  readonly w: readonly (readonly number[])[];
}

const SYNERGY = new Map<string, SynergyMatrix>();
export function registerSynergy(matrix: SynergyMatrix): void {
  SYNERGY.set(`${matrix.instKey}|${matrix.priorId}`, matrix);
}
export const synergyFor = (inst: Instantiation, priorId = "uniform") => SYNERGY.get(`${inst.key}|${priorId}`);
// Shipped matrices (scripts/import-synergy.mjs): exported by lib/grid-lab's synergy atlas.
for (const m of MATRICES as readonly SynergyMatrix[]) registerSynergy(m);

/**
 * Mean pairwise W minus the spread of each god's mean W to the rest of the table (grid-lab `fair_aligned`). Held out,
 * the spread term measured no fairness gain over plain mean W (synergy.md §5); it is kept as the validated recipe.
 */
export function fairAlignedScore(deal: readonly string[], m: SynergyMatrix): number {
  const ix = deal.map(f => m.families.indexOf(f));
  const w = (a: number, b: number) => (a < 0 || b < 0 ? 0 : m.w[a][b]);
  const n = ix.length;
  if (n < 2) return 0;
  let pairSum = 0;
  const perGod = ix.map((a, i) => {
    let s = 0;
    ix.forEach((b, j) => { if (j !== i) s += w(a, b); });
    return s / (n - 1);
  });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairSum += w(ix[i], ix[j]);
  const mean = pairSum / (n * (n - 1) / 2);
  const avg = perGod.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(perGod.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
  return mean - sd;
}

export const FAIR_ALIGNED_CANDIDATES = 32;

/**
 * The default dealer (synergy.md §3, §5): the best of 32 Divine Lottery deals by `fairAlignedScore`. It makes
 * tables of rules that tend to want the same objects (more lasting climbs); it is not a fairness mechanism.
 * Without a synergy matrix for this instantiation and prior it deals exactly like the Divine Lottery.
 */
export const fairAligned: UtilitySelector = {
  id: "fair-aligned",
  name: "Aligned Lottery",
  description: "Deals 32 random tables and keeps the one whose rules most tend to want the same objects, using the "
    + "measured synergy between rules. Where synergy has not been measured, it is the Divine Lottery.",
  select(inst, godCount, rng, options = {}) {
    const matrix = synergyFor(inst, options.priorId);
    if (!matrix) return divineLottery.select(inst, godCount, rng, options);
    let best: UtilityDescriptor[] = [], bestScore = -Infinity;
    for (let k = 0; k < FAIR_ALIGNED_CANDIDATES; k++) {
      const deal = divineLottery.select(inst, godCount, rng, options);
      const score = fairAlignedScore(deal.map(d => d.familyId), matrix);
      if (score > bestScore) { best = deal; bestScore = score; }
    }
    return best;
  },
};

export const SELECTORS: readonly UtilitySelector[] = [fairAligned, divineLottery];

export function selector(id: string): UtilitySelector {
  const found = SELECTORS.find(s => s.id === id);
  if (!found) throw new Error(`Unknown utility selector: ${id}`);
  return found;
}
