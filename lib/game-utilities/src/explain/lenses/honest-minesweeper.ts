/** 💣 Honest Minesweeper: each non-mine cell and the 8 cells around it; a mine is counted by every cell it touches. */
import { lens, tally, count } from "../lens.ts";
import type { Part } from "../model.ts";

type P = { mine: string };


export const honestMinesweeper = lens<P>({
  familyId: "honest_minesweeper",
  components: () => ["points"],
  breakdown: (_p, _b, parts) => ({
    unit: ["point", "points"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: (n, pts) => `${count(n, "honest number")} that count: ${pts[0]} point${pts[0] === 1 ? "" : "s"} (each is worth what it shows)` },
      { of: t => t.facts[0].ok, text: n => `${count(n, "honest 0")}: worth nothing` },
      { of: () => true, text: n => `${count(n, "number")} that ${n === 1 ? "is" : "are"} not honest: worth nothing` },
    ]),
  }),
  parts: (p, b) => b.cells.filter(x => b.colour(x) !== p.mine).map((x): Part => {
    const around = b.surrounding(x), mines = around.filter(y => b.colour(y) === p.mine);
    const v = b.value(x), honest = v === mines.length, shows = b.glyph(x);
    return {
      id: `window:${x.r},${x.c}`, shape: "window", cells: [x, ...around], points: [honest ? v : 0],
      title: honest ? (v > 0 ? `this ${shows} is honest` : `this ${shows} is honest, but worth 0 points`) : `this ${shows} is not honest`,
      facts: [{ text: `shows ${shows}, touches ${mines.length} mine${mines.length === 1 ? "" : "s"}`, ok: honest }],
      spots: mines.map(cell => ({ cell, label: "mine", tone: "zero" as const })),
      // The unit is the number's own cell; its window overlaps its neighbours'.
      group: "cell", anchor: x,
    };
  }),
});
