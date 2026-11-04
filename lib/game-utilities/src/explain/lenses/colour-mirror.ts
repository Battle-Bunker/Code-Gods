/**
 * 🪞 Colour Mirror: each row (or column) folded onto itself; its pairs (first and last, …) are drawn as arcs. A whole
 * mirror scores a point; every matching pair is the tie-break. The board picks the line under the pointer.
 */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Part } from "../model.ts";

type P = { axis: "LR" | "TB" };

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export const colourMirror = lens<P>({
  familyId: "colour_mirror",
  components: () => ["mirror lines", "tie-break: matching pairs"],
  breakdown: (p, _b, parts) => {
    const kind = p.axis === "LR" ? "row" : "column";
    return {
      unit: ["mirror line", "mirror lines"],
      items: tally(parts, [
        { of: t => t.points[0] > 0, text: (n, pts) => `${count(n, kind)} that ${n === 1 ? "is a mirror" : "are mirrors"}; ${count(pts[1], "matching pair")} (tie-break)` },
        { of: () => true, text: (n, pts) => `${count(n, kind)} that ${n === 1 ? "is" : "are"} not a mirror; ${count(pts[1], "matching pair")} (tie-break)` },
      ]),
    };
  },
  parts: (p, b) => {
    const kind = p.axis === "LR" ? "row" : "column";
    const lines = Array.from({ length: b.N }, (_, i) => (p.axis === "LR" ? b.row(i) : b.column(i)));
    const show = (x: Cell) => b.colour(x);
    const same = (x: Cell, y: Cell) => b.col(x) === b.col(y);
    return lines.map((cells, i): Part => {
      const half = Math.floor(cells.length / 2);
      const pairs = Array.from({ length: half }, (_, k) => [cells[k], cells[cells.length - 1 - k]] as const);
      const matches = pairs.filter(([x, y]) => same(x, y)).length, mirror = matches === half;
      return {
        id: `line:${kind}:${i}`, shape: "line", group: kind, cells, points: [mirror ? 1 : 0, matches],
        title: mirror ? `${kind} ${i + 1} is a mirror` : `${kind} ${i + 1} is not a mirror`,
        facts: pairs.map(([x, y], k) => ({
          text: `${ORDINAL[k]} and ${k === 0 ? "last" : `${ORDINAL[k]}-last`}: ${show(x)}, ${show(y)}`, ok: same(x, y),
        })),
        links: pairs.map(([x, y]) => ({ from: x, to: y, ok: same(x, y) })),
      };
    });
  },
});
