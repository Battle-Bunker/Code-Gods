/**
 * The coloured boards' presets: the old game's seeded setups, as an original-rules baseline (coordinator's call 37):
 * every family the old setup dealt, ported as v1, each with its old secondary points (or none). Non-default.
 *
 * - "Grids · original colours": v1's "Annotated colours" (archive lib/game-core/src/settings.ts ANNOTATED_COLOURS_SEED_ID),
 *   4×4 digits in red, green and blue, its colour families (Chessmaster, Parity Painter, Colour Mirror, Picture Frame,
 *   Colour Bonds, Honest Minesweeper, Kingdom, Set Spotter). Its number families (the beginner eight and four more)
 *   are on the digit grid already, as redesigned there; they are not on this board yet.
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
};

export const ANNOTATED_COLOURS = ["chessmaster", "parity-painter", "colour-mirror", "picture-frame", "colour-bonds", "honest-minesweeper", "kingdom", "set-spotter"] as const;

export const boardPresets = [
  {
    id: "grids-original-colours", title: "Grids · original colours", variant: board4rgb.id,
    rules: poolOf(board4rgb, ANNOTATED_COLOURS),
  },
] as const;
