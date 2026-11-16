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
 * v1's Looking-Glass, Pinwheel and Constellation, ported as v1 (16 Nov) into the more-rules pool: both folds, and
 * Constellation's star 0 (v1's canonical star; MORE_PARAMS). v1 dealt every star 0–9, but on v2's law the stars are not
 * peers: their value functions' medians lie 7.5 bits apart (test/unit/v2-params-equal.test.ts) and the energy gate's
 * greedy climb tops 11.8–31.4 bits across them, so one is dealt.
 */
for (const id of ["looking-glass", "pinwheel", "constellation"]) MORE.add(id);
/** The arithmetic playtest pool: readings of the board as long numbers (grid-params.md §12–13). */
const ARITHMETIC = new Set(["divisibility", "leading-digits"]);

/**
 * The tie-breakers the beginner pool deals: only those tied to what the main part singles out (owner decision 29; the
 * coordinator's call 14). The families keep their older tie-breakers (primes, zeros, corners, a column's total …), but
 * the pool no longer deals them. Opposite Nines' big-on-top and Strangers' ones and prime-strangers are undealt
 * (15 Nov): the energy gate found cheap peaks of 37–45 bits for 99–211⚡ on them (bounded counts on a 0–9 board). Until
 * the grid ladder redesign, Strangers deals one tie-breaker and Opposite Nines two, below row 3a's three.
 */
export const BEGINNER_DEALT: Readonly<Record<string, readonly string[]>> = {
  "mirrormancer": ["mirror-columns", "one-apart", "small-middle"],
  "magic-eighteen": ["columns", "diagonals", "different-numbers"],
  "opposite-nines": ["mirror-nines", "different-splits"],
  "two-pair": ["apart", "diagonal-pairs", "small-pairs"],
  "spread-of-three": ["spread-diagonal", "spread-small", "square-different"],
  "strangers": ["across-strangers"],
  "leapfrog": ["same-way", "columns-leap", "middle-factors"],
  "crosswise-threes": ["bigger-side", "other-fold", "fold-factors"],
};

/** The parameters the more-rules pool deals, for its families that have several. */
const MORE_PARAMS: Readonly<Record<string, unknown>> = { uphill: { corner: "BR" }, staircase: { direction: "right" }, "magic-accountant": { axis: "rows", T: 18 }, constellation: { star: 0 } };

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
  {
    // A readability playtest, not the default (grid-params.md §13): Divisibility's four instances (DIVISIBILITY_DEALT)
    // and Leading Digits' four (LEADING_DIGITS_DEALT), each with its one tie-breaker on the attained number.
    id: "grids-arithmetic", title: "Grids · arithmetic", variant: grid4.id,
    rules: poolOf(ARITHMETIC),
  },
] as const;
