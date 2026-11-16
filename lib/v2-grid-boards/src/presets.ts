/**
 * The coloured boards' presets: the old game's seeded setups, as an original-rules baseline (coordinator's call 37):
 * every family the old setup dealt, ported as v1, each with its old secondary points (or none). Non-default.
 *
 * - "Grids · original colours": v1's "Annotated colours" (archive lib/game-core/src/settings.ts ANNOTATED_COLOURS_SEED_ID),
 *   4×4 digits in red, green and blue, its colour families (Chessmaster, Parity Painter, Colour Mirror, Picture Frame,
 *   Colour Bonds, Honest Minesweeper, Kingdom, Set Spotter) and its number families as v1 had them (the beginner
 *   eight and four more: families/v1-numbers-{a,b,c}.ts), less those the gates leave undealt (UNDEALT below).
 */
import { tieBreakersOn, type Variant } from "@workspace/v2-core";
import { board4rgb } from "./type.ts";
import { BOARD_FAMILIES } from "./type.ts";

export interface BoardPoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly (string | null)[] }

const poolOf = (v: Variant, ids: readonly string[]): BoardPoolRule[] =>
  BOARD_FAMILIES.filter(f => ids.includes(f.id)).flatMap(f => (f.dealable(v) as unknown as Record<string, unknown>[]).filter(p => !UNDEALT[f.id]?.(p)).map(params => {
    const tbs = tieBreakersOn(f as never, v).map(t => t.id);
    return { family: f.id, params, tieBreakers: tbs.length ? tbs : [null] };
  }));

/**
 * Rules of the baseline left undealt, and why (the energy gate, artifacts/engine/test/unit/v2-no-straight-hill.test.ts:
 * nothing dealt may be exempt). Picture Frame with a small symbol (0, 1, 2): its top, every edge cell in your colour
 * and symbol, is exactly 35–41.5 bits and a greedy climber reaches it for 88–235⚡ of one seat's income (16 Nov). With
 * 3 or more the climb tops out under 35 bits.
 */
export const UNDEALT: Readonly<Record<string, (params: Record<string, unknown>) => boolean>> = {
  // Of the symbols that pass the gate, one is dealt: a frame's worth depends on its symbol (a 3 is rarer than a 9),
  // and parameter peers must offer equal opportunity (v1-audit #27; the dealer's fairness test, v2-params-equal), as
  // Grids · more rules deals one parameter set. 7 is the old card's own example; its three colours are equal.
  "picture-frame": p => String(p.symbol) !== "7",
  // v1's number families (16 Nov, boards worker; measured on the committed value functions of board-4-base10-rgb):
  // Mirrormancer: a one-digit board is its top. Any board of one digit mirrors every row (or column) and matches all 8
  // pairs, the most both layers can count (19.2 bits on rows, 18.7 on columns), and the birth law's boards (mostly 0s
  // and 1s) are a few cheap moves from one. The digit grid deals it redesigned, with a guard (v2-grid mirrormancer).
  "original-mirrormancer": () => true,
  // Number Bonds: the all-5s board (every one of the 24 touching pairs makes 10) is its top, at 53.5 bits; so is a
  // 1/9 chessboard. The energy gate's greedy climber stalls at 0 bits from births, but the top is itself a one-digit
  // board, past the gate's 35 bits. Undealt on the digit grid too (lib/v2-grid/src/presets.ts: a cheap peak, 35.4 bits for 150⚡).
  "original-number-bonds": () => true,
  // Magic Accountant: one target is dealt, 18 (rows and columns), as the digit grid deals (MORE_PARAMS). Targets 16
  // and 20 have a one-digit board at the top (all 4s: 20.9 bits; all 5s: 28.5), and across 15–21 the peers' median
  // worth lies 1.6 bits apart (v2-params-equal), so they are not of equal opportunity.
  "original-magic-accountant": p => p.target !== 18,
};

export const ANNOTATED_COLOURS = [
  "chessmaster", "parity-painter", "colour-mirror", "picture-frame", "colour-bonds", "honest-minesweeper", "kingdom", "set-spotter",
  // v1's Annotated colours also dealt the beginner pool and four more number families (ported as v1 had them).
  "original-mirrormancer", "original-magic-eighteen", "original-opposite-nines", "original-two-pair",
  "original-spread-three", "original-strangers", "original-leapfrog", "original-crosswise-threes",
  "original-magic-accountant", "original-number-bonds", "original-stepping-stones", "original-kings-and-subjects",
] as const;

export const boardPresets = [
  {
    id: "grids-original-colours", title: "Grids · original colours", variant: board4rgb.id,
    rules: poolOf(board4rgb, ANNOTATED_COLOURS),
  },
] as const;
