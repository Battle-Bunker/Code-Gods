/**
 * Presets (integration plan §5.7): the pools a room deals from. A pool names a variant and, per family, the parameter
 * sets and the tie-breakers that may be dealt; a dealt rule is one family, one parameter set and one tie-breaker (the
 * main layer plus one tie-breaker, never a third layer: owner decision 14). The deal (W3-3) further refuses any rule
 * whose artefact is not dealable (spec §7.5), so a pool lists candidates and the artefacts decide what is live.
 */
import { tieBreakersOn, type TieBreaker, type Variant } from "@workspace/v2-core";
import { divisibilityLadder, exactChange, primeLanding, primeStaircase, pythagoreanArea, ruler, sameOnBothRulers, squareArea, treasure, wholeCrossing } from "./beginner.ts";
import { primeGradient } from "./families.ts";
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

/**
 * The beginner pool on a variant: every pool family with each of its
 * tie-breakers that is dealt there (Layer.dealtOn).
 */
/**
 * The beginner pool: the curator's families plus Ruler, Exact Change and Pythagorean Area, restored (owner decision 22:
 * rules no exact sum can value are valued by sampling, with honest intervals).
 */
export const beginnerPool = [primeLanding, squareArea, wholeCrossing, divisibilityLadder, treasure, sameOnBothRulers, primeGradient, primeStaircase, ruler, exactChange, pythagoreanArea] as const;

const beginnerRules = (v: Variant): readonly PoolRule[] => beginnerPool.flatMap(f =>
  f.dealable(v).map(params => ({ family: f.id, params, tieBreakers: tieBreakersOn(f, v).map(t => t.id) })));

export const presets: readonly Preset[] = [
  // Owner decision 2: lines are played on the rationals. Whole numbers are an explicitly chosen, easier variant.
  { id: "lines-beginner", title: "Lines · beginner", variant: "line-q", rules: beginnerRules(lineQ) },
  { id: "lines-whole", title: "Lines · whole numbers (easier)", variant: "line-z", rules: beginnerRules(lineZ) },
  { id: "lines-four", title: "Lines · four lines", variant: "line-z4", rules: beginnerRules(lineZ4) },
  // A trial (lenses-and-mutators.md §5): the beginner pool on line-q with five more ways to move a line. Not the default.
  { id: "lines-lenses", title: "Lines · more ways to move (trial)", variant: "line-q-lenses", rules: beginnerRules(lineQLenses) },
];

export function preset(id: string): Preset {
  const p = presets.find(x => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}
