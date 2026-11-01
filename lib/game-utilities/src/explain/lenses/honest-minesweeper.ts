/** 💣 Honest Minesweeper: each non-mine cell and the 8 cells around it; a mine is counted by every cell it touches. */
import { lens, orderParts } from "../lens.ts";
import { hasCell, sameCell, type Part } from "../model.ts";

type P = { X: number };

export const honestMinesweeper = lens<P>({
  familyId: "honest_minesweeper",
  components: () => ["points"],
  parts: (p, b) => b.cells.filter(x => b.col(x) !== p.X).map((x): Part => {
    const around = b.surrounding(x), mines = around.filter(y => b.col(y) === p.X);
    const v = b.value(x), honest = v === mines.length, shows = b.glyph(x);
    return {
      id: `window:${x.r},${x.c}`, shape: "window", cells: [x, ...around], points: [honest ? v : 0],
      title: honest ? (v > 0 ? `this ${shows} is honest` : `this ${shows} is honest, but worth 0 points`) : `this ${shows} is not honest`,
      facts: [{ text: `shows ${shows}, touches ${mines.length} mine${mines.length === 1 ? "" : "s"}`, ok: honest }],
      spots: mines.map(cell => ({ cell, label: "mine", tone: "zero" as const })),
    };
  }),
  select: (parts, focus) => {
    const own = parts.filter(t => sameCell(t.cells[0], focus));
    // A mine: the cells that count it, at most 3 (scoring first), so the board stays readable.
    return own.length ? own : orderParts(parts.filter(t => hasCell(t.cells.slice(1), focus)), 3);
  },
  note: (_parts, focus, p, b) => (b.col(focus) === p.X
    ? `This ${b.spec.colourNames[p.X]} cell is a mine: it scores nothing itself, but every cell around it counts it.`
    : null),
});
