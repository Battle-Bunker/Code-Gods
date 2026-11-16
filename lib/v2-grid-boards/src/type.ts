/** The coloured board object type and its variants: the old game's seeded boards (archive lib/game-core/src/settings.ts SEED_SETUPS). */
import type { ObjectType, Variant } from "@workspace/v2-core";
import { boardParams, cellBits, decodeBoard, encodeBoard, inDomain, isCard, paletteOf, type BoardState, type ColourSet, type SymbolSet, colourSet } from "./board.ts";
import { boardRepresentations } from "./representations.ts";
import { boardMutators } from "./mutators.ts";
import { chessmaster } from "./families/chessmaster.ts";
import { colourBonds, colourMirror, honestMinesweeper, kingdom, parityPainter, pictureFrame, setSpotter } from "./families/annotated-colours.ts";

export function boardVariant(size: number, symbols: SymbolSet, colours: ColourSet): Variant {
  return {
    id: `board-${size}-${symbols}-${colours}`, objectType: `board${size}`, mutators: boardMutators(size, colourSet(colours).length, symbols === "cards").map(m => m.id),
    birthMixSteps: 4 * size * size, params: { size, symbols, colours, step: 0.5 },
  };
}

/** "First steps" and "Annotated colours": 4×4 digits in red, green and blue. */
export const board4rgb = boardVariant(4, "base10", "rgb");
/** "Classic" and "Low income": 5×5 digits in four colours. */
export const board5rgby = boardVariant(5, "base10", "rgby");
/** "Big board": 6×6 hex digits in six colours. */
export const board6hex = boardVariant(6, "base16", "rainbow6");
/** "Master": 7×7 playing cards in six colours. */
export const board7cards = boardVariant(7, "cards", "rainbow6");
export const BOARD_VARIANTS: readonly Variant[] = [board4rgb, board5rgby, board6hex, board7cards];

/**
 * The board type of one size (a type's representations name its cells, so each size is its own type, as the digit
 * grid's): `board4` … `board7`, each with its one variant (the old seeded board of that size).
 */
export function makeBoardType(v: Variant): ObjectType<BoardState> {
  const n = boardParams(v).size, variants = [v];
  return {
    id: `board${n}`,
    version: 1,
    variants,
    canonical: (s, v) => inDomain(s, v),
    encode: encodeBoard,
    decode: decodeBoard,
    readLength: (s, v) => s.sym.reduce((t, x, i) => t + cellBits(v, x, s.col[i]!), 0),
    sites: () => 1,
    origin: v => {
      const n2 = n * n, c = paletteOf(v)[0]!;
      return isCard(boardParams(v).symbols) ? { sym: Array(n2).fill(0), col: Array(n2).fill(c), cards: true } : { sym: Array(n2).fill(0), col: Array(n2).fill(c) };
    },
    representations: boardRepresentations(n, isCard(boardParams(v).symbols)),
    mutators: boardMutators(n, paletteOf(v).length, isCard(boardParams(v).symbols)),
    families: BOARD_FAMILIES,
  };
}

/** The board families, shared by every board size (one object each, so the deal finds one family per id; (each family's own params say which of them the variant can deal). */
export const BOARD_FAMILIES = [chessmaster(), parityPainter(), colourMirror(), pictureFrame(), colourBonds(), honestMinesweeper(), kingdom(), setSpotter()];

export const board4Type = makeBoardType(board4rgb);
export const board5Type = makeBoardType(board5rgby);
export const board6Type = makeBoardType(board6hex);
export const board7Type = makeBoardType(board7cards);
export const BOARD_TYPES = [board4Type, board5Type, board6Type, board7Type] as const;
/** The type a board variant belongs to. */
export const boardTypeOf = (v: Variant): ObjectType<BoardState> => BOARD_TYPES.find(t => t.id === v.objectType)!;
