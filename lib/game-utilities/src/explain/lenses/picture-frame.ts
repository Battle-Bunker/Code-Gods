/**
 * 🖼️ Picture Frame: your colour and the best edge symbol, each +1 on an edge cell and −1 on a middle cell. One piece per
 * cell, worth its colour point plus its symbol point. The best symbol is the one the card's loop keeps: the first edge
 * cell, in grid order, whose symbol reaches the highest net (any symbol with that net gives the same score).
 */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Part } from "../model.ts";

type P = { X: number };

/** The best edge symbol and its edge and middle counts, chosen as the card's loop chooses (first edge cell to reach the max). */
function bestSymbol(b: Board): { sym: number; edge: number; middle: number } {
  let best: { sym: number; edge: number; middle: number } | null = null;
  for (const x of b.cells.filter(y => b.isEdge(y))) {
    const s = b.sym(x), same = b.cells.filter(y => b.sym(y) === s);
    const edge = same.filter(y => b.isEdge(y)).length, middle = same.length - edge;
    if (!best || edge - middle > best.edge - best.middle) best = { sym: s, edge, middle };
  }
  return best!;
}

const glyphOf = (b: Board, s: number) => b.glyph(b.cells.find(x => b.sym(x) === s)!);

export const pictureFrame = lens<P>({
  familyId: "picture_frame",
  components: () => ["points"],
  breakdown: (p, b, parts) => {
    const X = b.spec.colourNames[p.X], best = bestSymbol(b).sym, S = glyphOf(b, best);
    // Each part is one cell: sort them by where the cell is and what it has.
    const is = (onEdge: boolean, colour: boolean | null, sym: boolean | null) => (t: Part) => {
      const x = t.cells[0];
      return b.isEdge(x) === onEdge && (colour === null || (b.col(x) === p.X) === colour) && (sym === null || (b.sym(x) === best) === sym);
    };
    return {
      unit: ["point", "points"],
      items: tally(parts, [
        { of: is(true, true, true), text: n => `${count(n, `${X} ${S} edge cell`)}: 2 points each` },
        { of: is(true, true, false), text: n => `${count(n, `other ${X} edge cell`)}: 1 point each` },
        { of: is(true, false, true), text: n => `${count(n, "other edge cell")} showing ${S}: 1 point each` },
        { of: is(true, null, null), text: n => `${count(n, "edge cell")} neither ${X} nor ${S}: no points` },
        { of: is(false, true, true), text: n => `${count(n, `${X} ${S} middle cell`)}: lose 2 points each` },
        { of: is(false, true, false), text: n => `${count(n, `other ${X} middle cell`)}: lose 1 point each` },
        { of: is(false, false, true), text: n => `${count(n, "other middle cell")} showing ${S}: lose 1 point each` },
        { of: () => true, text: n => `${count(n, "middle cell")} neither ${X} nor ${S}: nothing lost` },
      ]),
    };
  },
  parts: (p, b) => {
    const X = b.spec.colourNames[p.X], best = bestSymbol(b), S = glyphOf(b, best.sym);
    return b.cells.map((x: Cell): Part => {
      const onEdge = b.isEdge(x), hasColour = b.col(x) === p.X, hasSym = b.sym(x) === best.sym;
      const n = (hasColour ? 1 : 0) + (hasSym ? 1 : 0), points = onEdge || n === 0 ? n : -n;
      const facts = onEdge
        ? [
          { text: hasColour ? X : `${b.colour(x)}, not ${X}`, ok: hasColour },
          { text: hasSym ? `shows ${S}, the best edge symbol` : `shows ${b.glyph(x)}, not ${S}`, ok: hasSym },
        ]
        : [
          { text: hasColour ? `${X}: the middle should not be ${X}` : `${b.colour(x)}, not ${X}`, ok: !hasColour },
          { text: hasSym ? `shows ${S}: the middle should not show it` : `shows ${b.glyph(x)}, not ${S}`, ok: !hasSym },
        ];
      const what = [hasColour ? X : "", hasSym ? S : ""].filter(Boolean).join(" ");
      const title = onEdge
        ? (n ? `an edge cell with ${what}: +${n}` : `an edge cell with neither ${X} nor ${S}`)
        : (n ? `a middle cell with ${what}: −${n}` : "a clear middle cell");
      return { id: `${onEdge ? "edge" : "middle"}:${x.r},${x.c}`, shape: "cell", cells: [x], points: [points], title, facts };
    });
  },
  note: (_parts, _focus, p, b) => {
    const X = b.spec.colourNames[p.X], best = bestSymbol(b);
    const edgeX = b.cells.filter(x => b.isEdge(x) && b.col(x) === p.X).length, midX = b.cells.filter(x => !b.isEdge(x) && b.col(x) === p.X).length;
    return `${X}: ${count(edgeX, "edge cell")} minus ${count(midX, "middle cell")}. The best edge symbol is ${glyphOf(b, best.sym)}: `
      + `${count(best.edge, "edge cell")} show it, ${count(best.middle, "middle cell")} do.`;
  },
});
