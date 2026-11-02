/** 🏰 Kingdom: patches of your colour; only the biggest scores, one point per cell. */
import { lens } from "../lens.ts";
import { hasCell, type Part } from "../model.ts";

type P = { C: number };

export const kingdom = lens<P>({
  familyId: "kingdom",
  components: () => ["cells in your biggest patch"],
  parts: (p, b) => {
    const mine = b.regions((x, y) => b.col(x) === b.col(y)).filter(patch => b.col(patch[0]) === p.C);
    const biggest = Math.max(0, ...mine.map(patch => patch.length));
    const winner = mine.findIndex(patch => patch.length === biggest);
    const name = b.spec.colourNames[p.C];
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
  note: (_parts, focus, p, b) => (b.col(focus) === p.C ? null
    : `This cell is ${b.colour(focus)}: only ${b.spec.colourNames[p.C]} patches count.`),
});
