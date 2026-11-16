/**
 * The form registry for design-principles.md row 7 (and row 3a's "of a different form"): for every dealt family, the
 * kind of number its main part rewards, and the form of each of its secondaries. The rule check
 * (v2-rule-check.test.ts) fails for a dealt family or a dealt secondary missing here, so a new family declares both.
 *
 * Kinds and forms are names for what a player is pushed towards, chosen by reading each layer's sentence; a session
 * that disagrees with a tag changes it here and says so to the coordinator. They are not read by any game code.
 */

/** What a main part rewards. Row 7: at most MAX_PER_KIND dealt families of one preset share a kind. */
export const KINDS = {
  "large-prime": "a reading on as big a (dealt) prime as possible",
  "prime-run": "a run of primes",
  smooth: "a number made of small (dealt) primes",
  square: "a reading close to a square number",
  "base-ladder": "a reading on a ladder of one base's powers or digits (a whole number leaving r on division by q, then (n − r) ÷ q too, …)",
  figurate: "a reading on a figurate number (a coin pile)",
  palindrome: "a number reading the same backwards",
  symmetry: "a board equal to its mirror image",
  "line-sums": "rows, columns or diagonals adding up to a target",
  "pair-sums": "pairs of cells adding up to a target",
  "box-pattern": "a pattern inside each corner box",
  spread: "the spread (biggest − smallest) of a block",
  coprime: "neighbouring numbers sharing no factor",
  differences: "cells a fixed distance apart differing by a fixed amount",
  "box-sums": "a cell equal to a total of others in its box",
  region: "connected regions of cells",
  path: "a walk through rising cells",
  "monotone-steps": "steps rising by one",
  "power-count": "how often a power divides the board's number",
  "leading-digits": "the board's number's leading digits",
  "written-sum": "rows making a written sum (column addition with carries)",
  "colour-pattern": "a pattern of colours over neighbouring cells (a chessboard, three in a line)",
  "colour-match": "cells wearing the colour their number (or place) asks for",
  "colour-count": "a number counting the colours around it",
  repeats: "equal numbers sharing a row, a column or a side (v1's Full House and Snap!)",
  balance: "two halves of a row or column adding up to the same (v1's Seesaw)",
} as const;
export type Kind = keyof typeof KINDS;

/** What a secondary rewards, given the main part's attained value. Row 7: at most MAX_PER_FORM dealt families of one preset share a form, and no family deals one form twice. */
export const FORMS = {
  "shares-factor": "the rung's number (shifted) shares a big factor with another reading",
  "factor-size": "a number defined by the rung has a big smallest (or largest) prime factor",
  "factor-count": "a number defined by the rung has many prime factors",
  "near-multiple": "another reading near a multiple of the dealt number",
  "neighbour-term": "the term before the run also close to the rung's kind",
  "digit-sum": "the digits of a number defined by the rung, added up",
  "digit-match": "another reading ending in the rung's last digits",
  direction: "the answer far in one direction",
  "second-axis": "the main pattern also along the other axis or fold",
  diagonals: "the pattern on the diagonals",
  "all-different": "the cells taking different numbers",
  "adjacent-step": "neighbours exactly one apart",
  "small-values": "small numbers where the pattern sits",
  "big-values": "big numbers where the pattern sits",
  placement: "the bigger (or smaller) number on a chosen side",
  distance: "how far the pattern's parts are from each other or from a target",
  reach: "how much of the board the pattern reaches",
  "run-length": "the longest run of the pattern",
  count: "how many times the pattern occurs",
  primes: "prime numbers inside the pattern",
} as const;
export type Form = keyof typeof FORMS;

export const MAX_PER_KIND = 3;
export const MAX_PER_FORM = 3;

export interface FamilyForms { readonly kind: Kind; readonly forms: Readonly<Record<string, Form>> }

export const RULE_FORMS: Readonly<Record<string, FamilyForms>> = {
  // Lines (lib/v2-linear).
  "prime-landing": { kind: "large-prime", forms: { "shared-factor": "shares-factor" } },
  "smooth-intercept": { kind: "smooth", forms: { "shared-factor": "shares-factor" } },
  "square-area": { kind: "square", forms: { spf: "factor-size", lpf: "factor-size", omega: "factor-count" } },
  "whole-crossing": { kind: "base-ladder", forms: { "shared-factor": "shares-factor" } },
  treasure: { kind: "figurate", forms: { "shared-factor": "shares-factor" } },
  "same-on-both-rulers": { kind: "palindrome", forms: { "shared-factor": "shares-factor" } },
  "prime-gradient": { kind: "large-prime", forms: { "shared-factor": "shares-factor" } },
  "prime-staircase": { kind: "prime-run", forms: { "shared-factor": "shares-factor", "step-back": "neighbour-term", "near-miss": "factor-size" } },
  ruler: { kind: "large-prime", forms: { "shared-factor": "shares-factor" } },
  "pythagorean-area": { kind: "large-prime", forms: { "shared-factor": "shares-factor", "same-ending": "digit-match" } },
  // Two-line systems (lib/v2-pair).
  "whole-answer": { kind: "base-ladder", forms: { "x-multiple": "near-multiple", "sum-prime": "factor-size", "y-steep": "shares-factor" } },
  "no-fractions": { kind: "base-ladder", forms: { "numerator-smooth": "factor-count", "numerator-shared": "shares-factor", "numerator-small": "small-values" } },
  "right-angle": { kind: "base-ladder", forms: { "corner-multiple": "near-multiple", "corner-steep": "shares-factor", "corner-prime": "factor-size" } },
  "forty-five": { kind: "base-ladder", forms: { "corner-divisor": "shares-factor", "corner-gap": "near-multiple", "corner-smooth": "factor-count" } },
  "double-gap": { kind: "base-ladder", forms: { "gap-divisor": "shares-factor", "gap-step": "near-multiple", "gap-prime": "factor-size" } },
  "far-crossing": { kind: "base-ladder", forms: { "far-gap": "near-multiple", "far-height": "near-multiple", "far-steep": "shares-factor" } },
  "high-start": { kind: "base-ladder", forms: { "start-echo": "near-multiple", "start-crossing": "near-multiple", "start-prime": "factor-size", "start-steep": "shares-factor" } },
  "steep-ratio": { kind: "base-ladder", forms: { "ratio-gap": "near-multiple", "ratio-prime": "factor-size", "ratio-smooth": "factor-count" } },
  // Grids (lib/v2-grid): tags proposed by the spec lead, 15 Nov, for the grids session to check.
  mirrormancer: { kind: "symmetry", forms: { "mirror-columns": "second-axis", "one-apart": "adjacent-step", "small-middle": "small-values" } },
  "magic-eighteen": { kind: "line-sums", forms: { columns: "second-axis", diagonals: "diagonals", "different-numbers": "all-different" } },
  "opposite-nines": { kind: "pair-sums", forms: { "mirror-nines": "second-axis", "different-splits": "all-different", "big-on-top": "placement" } },
  "two-pair": { kind: "box-pattern", forms: { apart: "distance", "diagonal-pairs": "diagonals", "small-pairs": "small-values" } },
  "spread-of-three": { kind: "spread", forms: { "spread-diagonal": "diagonals", "spread-small": "small-values", "square-different": "all-different" } },
  strangers: { kind: "coprime", forms: { ones: "placement", "prime-strangers": "primes", "across-strangers": "reach" } },
  leapfrog: { kind: "differences", forms: { "same-way": "placement", "columns-leap": "second-axis", "middle-factors": "shares-factor" } },
  "crosswise-threes": { kind: "differences", forms: { "bigger-side": "placement", "other-fold": "second-axis", "fold-factors": "shares-factor" } },
  "kings-and-subjects": { kind: "box-sums", forms: { "different-kings": "all-different", "king-multiples": "shares-factor", "kings-on-diagonals": "diagonals" } },
  "stepping-stones": { kind: "region", forms: { "outside-small": "small-values", "group-reach": "reach", "group-corners": "placement" } },
  "mountain-climb": { kind: "path", forms: { "climb-reach": "reach", "climb-far": "distance", "climb-summit": "big-values" } },
  uphill: { kind: "monotone-steps", forms: { "rise-by-one": "adjacent-step", "corner-peak": "placement", "start-low": "small-values" } },
  staircase: { kind: "monotone-steps", forms: { "long-flight": "run-length", "double-stairs": "second-axis", "low-stairs": "small-values" } },
  "magic-accountant": { kind: "line-sums", forms: { "other-way": "second-axis", diagonals: "diagonals", "all-different": "all-different" } },
  fillomino: { kind: "region", forms: { "patch-kinds": "all-different", "patch-count": "count", "near-misses": "distance" } },
  // v1's grid families ported as v1 (16 Nov, grids session): one tie-breaker each, v1's secondary or one tied to the main part.
  "looking-glass": { kind: "symmetry", forms: { "twin-total": "big-values" } },
  pinwheel: { kind: "symmetry", forms: { commonest: "count" } },
  constellation: { kind: "region", forms: { "cluster-reach": "reach" } },
  divisibility: { kind: "power-count", forms: { "leftover-digits": "digit-sum" } },
  "leading-digits": { kind: "leading-digits", forms: { "exponent-digits": "digit-sum" } },
  // v1 grid baseline ports (16 Nov, grids session: ported as v1).
  "round-numbers": { kind: "line-sums", forms: { "exact-rounds": "count", "big-rounds": "big-values", "round-steps": "adjacent-step" } },
  "number-bonds": { kind: "pair-sums", forms: { "far-split": "distance", "bond-run": "run-length", "prime-bonds": "primes" } },
  "column-addition": { kind: "written-sum", forms: { "right-columns": "count", "near-digits": "distance", "big-answer": "big-values" } },
  // The coloured boards' original-rules baseline (lib/v2-grid-boards; call 37): v1's families as v1 had them.
  chessmaster: { kind: "colour-pattern", forms: { seams: "count" } },
  "parity-painter": { kind: "colour-match", forms: {} },
  "colour-mirror": { kind: "symmetry", forms: { "colour-pairs": "count" } },
  "picture-frame": { kind: "colour-match", forms: {} },
  "colour-bonds": { kind: "pair-sums", forms: {} },
  "honest-minesweeper": { kind: "colour-count", forms: {} },
  kingdom: { kind: "region", forms: {} },
  "set-spotter": { kind: "colour-pattern", forms: {} },
  // v1 ports, 16 Nov (grid baseline): Full House, Twenty-One, Seesaw, Snap!.
  "full-house": { kind: "repeats", forms: { "pair-values": "big-values", "pair-kinds": "all-different", "pairs-apart": "distance" } },
  "twenty-one": { kind: "line-sums", forms: { "bust-by-little": "distance", "crossing-blackjacks": "second-axis", "low-cards": "small-values" } },
  seesaw: { kind: "balance", forms: { "other-way": "second-axis", "heavy-seesaws": "big-values", "ends-and-middle": "distance" } },
  snap: { kind: "repeats", forms: { "snap-values": "big-values", "snap-kinds": "all-different", "snap-reach": "reach" } },
};
