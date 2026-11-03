/** 🧮 Magic Accountant: each line's total against the magic number; every line's distance is the tie-break. */
import { lens, tally, count } from "../lens.ts";
import type { Cell, Part } from "../model.ts";

type P = { axis: "rows" | "cols" | "both"; target: number };

export const magicAccountant = lens<P>({
  familyId: "magic_accountant",
  components: (p) => [`lines adding up to ${p.target}`, `tie-break: how far the totals are from ${p.target}`],
  breakdown: (p, _b, parts) => ({
    unit: ["line", "lines"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "line")} adding up to ${p.target}` },
      { of: () => true, text: (n, pts) => `${count(n, "line")} that miss ${p.target}, ${-pts[1]} away in all (tie-break)` },
    ]),
  }),
  parts: (p, b) => {
    const lines: [string, Cell[]][] = [];
    if (p.axis !== "cols") for (let r = 0; r < b.N; r++) lines.push([`row ${r + 1}`, b.row(r)]);
    if (p.axis !== "rows") for (let c = 0; c < b.N; c++) lines.push([`column ${c + 1}`, b.column(c)]);
    return lines.map(([name, cells]): Part => {
      const total = cells.reduce((s, x) => s + b.value(x), 0), gap = total - p.target;
      const sum = `${cells.map(x => b.glyph(x)).join(" + ")} = ${total}`;
      return {
        id: `line:${name}`, shape: "line", cells, points: [gap === 0 ? 1 : 0, -Math.abs(gap)],
        title: gap === 0 ? `${name} makes ${p.target}` : `${name}: ${Math.abs(gap)} ${gap < 0 ? "short" : "over"}`,
        facts: [{ text: gap === 0 ? sum : `${sum}, not ${p.target}`, ok: gap === 0 }],
      };
    });
  },
});
