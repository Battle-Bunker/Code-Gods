/**
 * Presets (integration plan §5.7): the pools a room deals from. Every line preset deals the dynamic families
 * (docs/engine-v2/energy.md): one family and one parameter set per seat, no tie-breakers. On the whole-number boards
 * only the families whose good states are whole lines are dealt (DynamicLineSpec.whole).
 */
import type { RuleFamily, TieBreaker, Variant } from "@workspace/v2-core";
import { dynamicFamilies } from "./dynamic-families.ts";
import { lineQ, lineQLenses, lineZ, lineZ4 } from "./type.ts";

export interface PoolRule {
  readonly family: string;
  readonly params: unknown;
  readonly tieBreakers: readonly TieBreaker[];
}

export interface Preset {
  readonly id: string;
  /** Player-facing name. */
  readonly title: string;
  readonly variant: string;
  readonly rules: readonly PoolRule[];
}

const dynamicRules = (v: Variant): readonly PoolRule[] => (dynamicFamilies as readonly RuleFamily<unknown, unknown>[]).flatMap(f =>
  f.dealable(v).map(params => ({ family: f.id, params, tieBreakers: [null] })));

export const presets: readonly Preset[] = [
  // Owner decision 2: lines are played on the rationals. Whole numbers are an explicitly chosen, easier variant.
  { id: "lines-beginner", title: "Lines · beginner", variant: "line-q", rules: dynamicRules(lineQ) },
  { id: "lines-whole", title: "Lines · whole numbers (easier)", variant: "line-z", rules: dynamicRules(lineZ) },
  // Four lines an object: a rule scores each line, and the object's energy is the sum of its lines' (type.ts).
  { id: "lines-four", title: "Lines · four lines", variant: "line-z4", rules: dynamicRules(lineZ4) },
  // A trial (lenses-and-mutators.md §5): line-q with five more ways to move a line. Not the default.
  { id: "lines-lenses", title: "Lines · more ways to move (trial)", variant: "line-q-lenses", rules: dynamicRules(lineQLenses) },
];

export function preset(id: string): Preset {
  const p = presets.find(x => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}
