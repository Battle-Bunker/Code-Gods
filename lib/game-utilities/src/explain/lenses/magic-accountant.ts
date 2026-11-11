/** 🧮 Magic Accountant: a line that makes the magic number (a primary point); every line's distance from it (deducted secondary points). */
import { lens, tally, count, type Lens } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Part } from "../model.ts";
import type { Params } from "../../types.ts";

type Axis = "rows" | "cols";
type P = { axis: Axis; target: number };

/**
 * The magic-lines lens, for any family that scores the dealt axis's lines against one total (Magic Accountant's dealt
 * magic number, 🎩 Magic Eighteen's fixed middle total): one unit per line.
 */
export function magicLines<Q extends Params & { axis: Axis }>(familyId: string, targetOf: (p: Q, b: Board) => number): Lens {
  return lens<Q>({
    familyId,
    components: (p, b) => { const T = targetOf(p, b); return [`lines adding up to ${T}`, `how far the totals are from ${T}`]; },
    breakdown: (p, b, parts) => {
      const T = targetOf(p, b);
      return {
        unit: ["line", "lines"],
        items: tally(parts, [
          { of: t => t.points[0] > 0, text: n => `${count(n, "line")} adding up to ${T}` },
          { of: () => true, text: (n, pts) => `${count(n, "line")} that ${n === 1 ? "misses" : "miss"} ${T}, ${-pts[1]} away in all` },
        ]),
      };
    },
    parts: (p, b) => {
      const T = targetOf(p, b), lines: [string, Cell[]][] = [];
      if (p.axis === "cols") for (let c = 0; c < b.N; c++) lines.push([`column ${c + 1}`, b.column(c)]);
      else for (let r = 0; r < b.N; r++) lines.push([`row ${r + 1}`, b.row(r)]);
      return lines.map(([name, cells]): Part => {
        const total = cells.reduce((s, x) => s + b.value(x), 0), gap = total - T;
        const sum = `${cells.map(x => b.glyph(x)).join(" + ")} = ${total}`;
        return {
          id: `line:${name}`, shape: "line", group: p.axis === "cols" ? "column" : "row", cells, points: [gap === 0 ? 1 : 0, -Math.abs(gap)],
          title: gap === 0 ? `${name} makes ${T}` : `${name}: ${Math.abs(gap)} ${gap < 0 ? "short" : "over"}`,
          facts: [
            { text: gap === 0 ? sum : `${sum}, not ${T}`, ok: gap === 0 },
            { text: gap === 0 ? `exactly ${T}` : `${Math.max(total, T)} − ${Math.min(total, T)} = ${Math.abs(gap)} ${gap < 0 ? "short" : "over"}`, ok: gap === 0, tier: 1 },
          ],
        };
      });
    },
  });
}

export const magicAccountant = magicLines<P>("magic_accountant", p => p.target);
