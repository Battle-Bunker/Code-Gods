import type { Instantiation, Rng } from "@workspace/game-types";
import type { UtilityDescriptor, UtilityFamily } from "./types.ts";
import { available, context, familiesFor, paramsKey, type Draw } from "./catalog.ts";

export interface SelectOptions {
  /** Probability that a god is also dealt a defence goal (a penalty family). Default 0: opt-in. */
  readonly defenceRate?: number;
  /**
   * Only deal draws that have calibration tables. Called with the raw draw (the predicate canonicalises it, e.g.
   * through `family.canonical`). Default: every draw has one.
   */
  readonly hasTable?: (draw: Draw) => boolean;
  /** Family ids never dealt in this game (settings.excludedFamilies). */
  readonly exclude?: readonly string[];
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

/** A uniform family among `candidates`, then its sampler; redrawn until it has a table. */
function drawFrom(candidates: readonly UtilityFamily<any>[], inst: Instantiation, rng: Rng, hasTable: (d: Draw) => boolean): Draw | null {
  if (!candidates.length) return null;
  const ctx = context(inst);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const f = candidates[rng.int(candidates.length)];
    const d = { familyId: f.id, params: f.sample(rng, ctx) };
    if (hasTable(d)) return d;
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
    + "defence goals on, each god may also be dealt something to hate.",
  select(inst, godCount, rng, options = {}) {
    const hasTable = options.hasTable ?? (() => true);
    const rate = Math.min(1, Math.max(0, options.defenceRate ?? 0));
    const rewards = availableFamilies(inst, "reward", options.exclude);
    const penalties = rate > 0 ? availableFamilies(inst, "penalty", options.exclude) : [];
    const chosen: UtilityDescriptor[] = [];
    const seen = new Set<string>();
    for (let attempt = 0; chosen.length < godCount; attempt++) {
      if (attempt > ATTEMPTS * Math.max(1, godCount)) throw new Error(`Not enough distinct utility functions for ${inst.key}`);
      const reward = drawFrom(rewards, inst, rng, hasTable);
      if (!reward) throw new Error(`No calibrated utility family is available for ${inst.key}`);
      // Defence goal with probability `rate` (resolution 1e-6).
      const penalty = rate > 0 && rng.int(1_000_000) < Math.round(rate * 1_000_000) ? drawFrom(penalties, inst, rng, hasTable) : null;
      const descriptor: UtilityDescriptor = penalty ? { ...reward, penalty } : reward;
      const key = paramsKey(descriptor);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(descriptor);
    }
    return chosen;
  },
};

export const SELECTORS: readonly UtilitySelector[] = [divineLottery];

export function selector(id: string): UtilitySelector {
  const found = SELECTORS.find(s => s.id === id);
  if (!found) throw new Error(`Unknown utility selector: ${id}`);
  return found;
}
