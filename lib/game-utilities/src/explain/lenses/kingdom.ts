/** 🏰 Kingdom: patches of your colour; only the biggest scores, one point per cell. */
import { lens, tally, count } from "../lens.ts";
import { hasCell, type Part } from "../model.ts";

type P = { colour: string };


export const kingdom = lens<P>({
  familyId: "kingdom",
  components: () => ["cells in your biggest patch"],
  breakdown: (p, b, parts) => ({
    unit: ["cell", "cells"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: (_n, pts) => `Your biggest ${p.colour} patch: ${count(pts[0], "cell")}` },
      { of: () => true, text: n => `${count(n, "smaller " + p.colour + " patch", "other " + p.colour + " patches")}: only the biggest scores` },
    ]),
  }),
  parts: (p, b) => {
    const mine = b.regions((x, y) => b.col(x) === b.col(y)).filter(patch => b.colour(patch[0]) === p.colour);
    const biggest = Math.max(0, ...mine.map(patch => patch.length));
    const winner = mine.findIndex(patch => patch.length === biggest);
    const name = p.colour;
    return mine.map((cells, i): Part => ({
      id: `patch:${cells[0].r},${cells[0].c}`, shape: "region", cells, points: [i === winner ? cells.length : 0],
      title: i === winner ? `your biggest ${name} patch` : `a ${name} patch, not the biggest`,
      facts: [
        { text: `${cells.length} ${name} cell${cells.length === 1 ? "" : "s"} joined side to side`, ok: true },
        ...(i === winner ? [] : [{ text: cells.length === biggest ? `as big as the biggest (${biggest}), but only one patch scores` : `smaller than the biggest (${biggest})`, ok: false }]),
      ],
    }));
  },
  select: (parts, focus) => {
    const own = parts.filter(t => hasCell(t.cells, focus));
    const best = parts.filter(t => t.points[0] > 0);
    return [...own, ...best.filter(t => !own.includes(t))];
  },
  note: (_parts, focus, p, b) => (b.colour(focus) === p.colour ? null
    : `This cell is ${b.colour(focus)}: only ${p.colour} patches count.`),
});
