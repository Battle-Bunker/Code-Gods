/**
 * The grid's presets (integration plan §5.7) on the beginner board: the beginner pool (the old beginner grid's eight
 * rules, each with the tie-breakers BEGINNER_DEALT lists), the more-rules pool (v1's seven coupled families, each with
 * every tie-breaker) and the arithmetic playtest pool (Divisibility and Leading Digits). The deal refuses any rule whose artefact is not dealable, so the artefacts decide what is live.
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
 * the pool no longer deals them. Opposite Nines' big-on-top and Strangers' ones and prime-strangers are undealt
 * (15 Nov): the energy gate found cheap peaks of 37–45 bits for 99–211⚡ on them (bounded counts on a 0–9 board). Until
 * the grid ladder redesign, Strangers deals one tie-breaker and Opposite Nines two, below row 3a's three.
 */
export const BEGINNER_DEALT: Readonly<Record<string, readonly string[]>> = {
  "mirrormancer": ["mirror-other-way", "one-apart", "small-middle"],
  "magic-eighteen": ["other-way", "diagonals", "different-numbers"],
  "opposite-nines": ["mirror-nines", "different-splits"],
  "two-pair": ["apart", "diagonal-pairs", "small-pairs"],
  "spread-of-three": ["spread-diagonal", "spread-small", "square-different"],
  "strangers": ["across-strangers"],
  "leapfrog": ["same-way", "columns-leap", "middle-factors"],
  "crosswise-threes": ["bigger-side", "other-fold", "fold-factors"],
};

/** The parameters the more-rules pool deals, for its families that have several. */
const MORE_PARAMS: Readonly<Record<string, unknown>> = { uphill: { corner: "BR" }, staircase: { direction: "right" }, "magic-accountant": { axis: "rows", T: 18 } };

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
    // One parameter set per family: parameter peers must offer equal opportunity (v1-audit.md #27); the corners,
    // directions and axes are symmetric, but their sampled value functions differ by more than the audit allows.
    rules: poolOf(MORE).filter(r => MORE_PARAMS[r.family] === undefined || JSON.stringify(r.params) === JSON.stringify(MORE_PARAMS[r.family])),
  },
  // Grids · arithmetic (Divisibility and Leading Digits) is withdrawn (16 Nov, the coordinator): a lattice reduction finds
  // Divisibility's top boards by formula (grid-params.md §14). The families keep their code and values, undealt.
] as const;
