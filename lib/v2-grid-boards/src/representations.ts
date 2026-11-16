/**
 * The board's representation: the cells, each with its number (a card's value) and its colour. Cells are named r0c0 …
 * as on the digit grid; a cell's colour is a symbol element beside it (`r0c0.colour`), and on a board of cards its suit
 * (`r0c0.suit`).
 */
import { q, ref, type ElementDecl, type Representation } from "@workspace/v2-core";
import { COLOURS, PLAIN, SUIT_NAMES, symbolGlyph, type BoardState } from "./board.ts";
import { cellLabel, cellName } from "./units.ts";

type Decl = ElementDecl<BoardState>;
/** A cell's number: a digit's value, a card's A = 1 … K = 13. */
const valueOf = (s: BoardState, i: number): number => (s.cards ? (s.sym[i]! % 13) + 1 : s.sym[i]!);

/** A board of side n; `cards`: its cells are playing cards, so each also has a suit. */
export function boardRepresentations(n: number, cards: boolean): readonly Representation<BoardState>[] {
  const N2 = n * n;
  const cells: Representation<BoardState> = {
    id: "cells", title: "the board", scene: "grid", perSite: false,
    elements: [
      ...Array.from({ length: N2 }, (_, i): Decl => ({
        name: cellName(n, i), label: cellLabel(n, i), kind: "number", role: "coordinate", meaning: `cell:${cellName(n, i)}`,
        value: s => ({ kind: "number", q: q(valueOf(s, i)) }),
      })),
      ...Array.from({ length: N2 }, (_, i): Decl => ({
        name: `${cellName(n, i)}.colour`, label: `the colour of ${cellLabel(n, i)}`, kind: "symbol", role: "coordinate", meaning: `colour:${cellName(n, i)}`,
        value: s => ({ kind: "symbol", text: COLOURS[s.col[i]!]!.name }),
      })),
      ...Array.from({ length: cards ? N2 : 0 }, (_, i): Decl => ({
        name: `${cellName(n, i)}.suit`, label: `the suit of the card in ${cellLabel(n, i)}`, kind: "symbol", role: "coordinate", meaning: `suit:${cellName(n, i)}`,
        value: s => (s.cards ? { kind: "symbol", text: SUIT_NAMES[Math.floor(s.sym[i]! / 13)]! } : { kind: "undefined", reason: "a digit has no suit" }),
      })),
    ],
    layout: s => ({
      kind: "grid", rows: n, cols: n, cells: Array.from({ length: N2 }, (_, i) => ref("cells", cellName(n, i))),
      // Plain tiles on a one-colour board; every other board shows its colours (and its letters), and cards their glyphs.
      ...(s.col.some(c => c !== PLAIN) ? { cellColours: s.col.map(c => ({ css: COLOURS[c]!.css, ink: COLOURS[c]!.ink, letter: COLOURS[c]!.letter })) } : {}),
      ...(s.cards || s.sym.some(x => x > 9) ? { cellGlyphs: s.sym.map(x => symbolGlyph(s.cards ? "cards" : "base16", x)) } : {}),
    }),
  };
  return [cells];
}
