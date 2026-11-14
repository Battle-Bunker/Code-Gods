/**
 * The grid's presets (integration plan §5.7) on the beginner board: the beginner pool (the old beginner grid's eight
 * rules, each with the tie-breakers BEGINNER_DEALT lists) and the more-rules pool (v1's seven coupled families, each with
 * every tie-breaker). The deal refuses any rule whose artefact is not dealable, so the artefacts decide what is live.
 */
import { tieBreakersOn } from "@workspace/v2-core";
import { gridType, grid4 } from "./type.ts";
import { beginnerGridFamilies } from "./families.ts";
import { moreGridFamilies } from "./more-families.ts";
import { gridParams } from "./grid.ts";

const BEGINNER = new Set(beginnerGridFamilies(gridParams(grid4).size).map(f => f.id));
const MORE = new Set(moreGridFamilies(gridParams(grid4).size).map(f => f.id));

/**
 * The tie-breakers the beginner pool deals: only those tied to what the main part singles out (owner decision 29; the
 * coordinator's call 14). The families keep their older tie-breakers (primes, zeros, corners, a column's total …), but
 * the pool no longer deals them.
 */
export const BEGINNER_DEALT: Readonly<Record<string, readonly string[]>> = {
  "mirrormancer": ["mirror-columns", "one-apart", "small-middle"],
  "magic-eighteen": ["columns", "diagonals", "different-numbers"],
  "opposite-nines": ["mirror-nines", "different-splits", "big-on-top"],
  "two-pair": ["apart", "diagonal-pairs", "small-pairs"],
  "spread-of-three": ["spread-diagonal", "spread-small", "square-different"],
  "strangers": ["ones", "prime-strangers", "across-strangers"],
  "leapfrog": ["same-way", "columns-leap", "middle-factors"],
  "crosswise-threes": ["bigger-side", "other-fold", "fold-factors"],
};

/** A pool: each family's dealable params, with its tie-breakers (those `dealt` lists for it, when it lists the family). */
const poolOf = (ids: Set<string>, dealt?: Readonly<Record<string, readonly string[]>>): readonly GridPoolRule[] =>
  gridType.families.filter(f => ids.has(f.id)).flatMap(f => f.dealable(grid4).map(params => ({
    family: f.id, params,
    tieBreakers: tieBreakersOn(f, grid4).map(t => t.id).filter(id => !dealt?.[f.id] || dealt[f.id]!.includes(id)),
  })));

export interface GridPoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly string[] }

export const gridPresets = [
  {
    id: "grids-beginner", title: "Grids · beginner", variant: grid4.id,
    rules: poolOf(BEGINNER, BEGINNER_DEALT),
  },
  {
    // v1's coupled reward families, restored as continuous rules (owner-decisions.md, "Grids · more rules").
    id: "grids-more-rules", title: "Grids · more rules", variant: grid4.id,
    rules: poolOf(MORE),
  },
] as const;
