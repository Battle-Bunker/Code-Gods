/**
 * Presets (integration plan §5.7): the pools a room deals from. A pool names a variant and, per family, the parameter
 * sets and the tie-breakers that may be dealt; a dealt rule is one family, one parameter set and one tie-breaker (the
 * main layer plus one tie-breaker, never a third layer: owner decision 14). The deal (W3-3) further refuses any rule
 * whose artefact is not dealable (spec §7.5), so a pool lists candidates and the artefacts decide what is live.
 */
import { tieBreakersOn, type TieBreaker, type Variant } from "@workspace/v2-core";
import { beginnerFamilies } from "./beginner.ts";
import { lineQ, lineZ, lineZ4 } from "./type.ts";

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

/**
 * The curator's beginner pool (layered-line-rules.md §8) on a variant: every beginner family with each of its
 * tie-breakers that is dealt there (Layer.dealtOn).
 */
const beginnerRules = (v: Variant): readonly PoolRule[] => beginnerFamilies.flatMap(f =>
  f.dealable(v).map(params => ({ family: f.id, params, tieBreakers: tieBreakersOn(f, v).map(t => t.id) })));

export const presets: readonly Preset[] = [
  { id: "lines-beginner", title: "Lines · beginner", variant: "line-z", rules: beginnerRules(lineZ) },
  { id: "lines-rational", title: "Lines · rational", variant: "line-q", rules: beginnerRules(lineQ) },
  { id: "lines-four", title: "Lines · four lines", variant: "line-z4", rules: beginnerRules(lineZ4) },
];

export function preset(id: string): Preset {
  const p = presets.find(x => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}
