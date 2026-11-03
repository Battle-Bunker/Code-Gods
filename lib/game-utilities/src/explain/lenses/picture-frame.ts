/**
 * 🖼️ Picture Frame: your colour and your symbol (both dealt). One piece per cell: an edge cell scores +1 with either and
 * +4 with both, a middle cell loses the same (FRAME_POINTS, the card's EDGE_ONE … MIDDLE_BOTH).
 */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Part } from "../model.ts";
import { FRAME_POINTS } from "../../families/grid/strategy.ts";

type P = { colour: string; symbol: string };

/** Whether a cell has the colour and the symbol, and what it scores where it is. */
function cellOf(p: P, b: Board, x: Cell) {
  const onEdge = b.isEdge(x), colour = b.colour(x) === p.colour, symbol = b.glyph(x) === p.symbol;
  const table = onEdge ? FRAME_POINTS.edge : FRAME_POINTS.middle;
  const points = colour && symbol ? table.both : colour || symbol ? table.one : table.none;
  return { onEdge, colour, symbol, points };
}
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export const pictureFrame = lens<P>({
  familyId: "picture_frame",
  components: () => ["points"],
  breakdown: (p, b, parts) => {
    const is = (onEdge: boolean, colour: boolean, symbol: boolean) => (t: Part) => {
      const c = cellOf(p, b, t.cells[0]);
      return c.onEdge === onEdge && c.colour === colour && c.symbol === symbol;
    };
    const E = FRAME_POINTS.edge, M = FRAME_POINTS.middle, X = p.colour, S = p.symbol;
    return {
      unit: ["point", "points"],
      items: tally(parts, [
        { of: is(true, true, true), text: n => `${count(n, `${X} ${S} edge cell`)}: ${signed(E.both)} each` },
        { of: is(true, true, false), text: n => `${count(n, `${X} edge cell`)} without ${S}: ${signed(E.one)} each` },
        { of: is(true, false, true), text: n => `${count(n, "edge cell")} showing ${S}, not ${X}: ${signed(E.one)} each` },
        { of: is(true, false, false), text: n => `${count(n, "edge cell")} neither ${X} nor ${S}: no points` },
        { of: is(false, true, true), text: n => `${count(n, `${X} ${S} middle cell`)}: ${signed(M.both)} each` },
        { of: is(false, true, false), text: n => `${count(n, `${X} middle cell`)} without ${S}: ${signed(M.one)} each` },
        { of: is(false, false, true), text: n => `${count(n, "middle cell")} showing ${S}, not ${X}: ${signed(M.one)} each` },
        { of: () => true, text: n => `${count(n, "middle cell")} neither ${X} nor ${S}: nothing lost` },
      ]),
    };
  },
  parts: (p, b) => b.cells.map((x: Cell): Part => {
    const c = cellOf(p, b, x), X = p.colour, S = p.symbol, where = c.onEdge ? "an edge cell" : "a middle cell";
    const why = c.colour && c.symbol ? "both" : c.colour ? "right colour" : c.symbol ? "right symbol" : "";
    const facts = c.onEdge
      ? [
        { text: c.colour ? `${X}: the right colour` : `${b.colour(x)}, not ${X}`, ok: c.colour },
        { text: c.symbol ? `shows ${S}: the right symbol` : `shows ${b.glyph(x)}, not ${S}`, ok: c.symbol },
      ]
      : [
        { text: c.colour ? `${X}: the middle should not be ${X}` : `${b.colour(x)}, not ${X}`, ok: !c.colour },
        { text: c.symbol ? `shows ${S}: the middle should not show it` : `shows ${b.glyph(x)}, not ${S}`, ok: !c.symbol },
      ];
    const title = why ? `${where}, ${signed(c.points)} ${why}` : c.onEdge ? `an edge cell with neither ${X} nor ${S}` : "a clear middle cell";
    return { id: `${c.onEdge ? "edge" : "middle"}:${x.r},${x.c}`, shape: "cell", cells: [x], points: [c.points], title, facts };
  }),
  note: (_parts, _focus, p) => {
    const E = FRAME_POINTS.edge, M = FRAME_POINTS.middle;
    return `Your colour is ${p.colour} and your symbol is ${p.symbol}. An edge cell with one of them scores ${signed(E.one)}, `
      + `with both ${signed(E.both)}. A middle cell with one loses ${-M.one}, with both ${-M.both}.`;
  },
});
