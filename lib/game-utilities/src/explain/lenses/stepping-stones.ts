/**
 * 🪨 Stepping Stones: groups of cells joined by hops (touching cells whose numbers differ by exactly 2). Only the biggest
 * group scores, one point per cell (the first in the card's `grid.regions` order on a tie). Each group of 2 or more is a
 * unit with its hops drawn as links; the lone cells (no hop) are folded into one zero-point unit so they don't flood the
 * list. When no cell hops at all, the biggest group is a single cell: that cell is its own unit and scores 1.
 */
import { lens, tally, count } from "../lens.ts";
import type { Cell, Link, Part } from "../model.ts";

type P = Record<string, never>;

/** The card's HOP (families/grid/arithmetic.ts, Stepping Stones). */
const HOP = 2;

export const steppingStones = lens<P>({
  familyId: "stepping_stones",
  components: () => ["cells in your biggest group"],
  breakdown: (_p, _b, parts) => ({
    unit: ["cell", "cells"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: (_n, pts) => `Your biggest group: ${count(pts[0], "cell")}` },
      { of: t => t.id !== "lone", text: n => `${count(n, "smaller group", "other groups")}: only the biggest scores` },
      { of: () => true, text: () => "The cells with no hop: they score nothing" },
    ]),
  }),
  parts: (_p, b) => {
    const hop = (x: Cell, y: Cell) => Math.abs(b.value(x) - b.value(y)) === HOP;
    const groups = b.regions(hop);
    const biggest = Math.max(0, ...groups.map(g => g.length));
    const winner = groups.findIndex(g => g.length === biggest);
    const out: Part[] = [], lone: Cell[] = [];
    const key = (x: Cell) => x.r * b.N + x.c;
    groups.forEach((cells, i) => {
      if (cells.length === 1 && i !== winner) { lone.push(cells[0]); return; }
      const inside = new Set(cells.map(key)), links: Link[] = [];
      for (const x of [...cells].sort((a, c) => key(a) - key(c))) {
        for (const y of [{ r: x.r, c: x.c + 1 }, { r: x.r + 1, c: x.c }]) {
          if (b.inside(y.r, y.c) && inside.has(key(y)) && hop(x, y)) links.push({ from: x, to: y, ok: true });
        }
      }
      const scores = i === winner;
      out.push({
        id: `group:${cells[0].r},${cells[0].c}`, shape: "region", group: "group", cells, points: [scores ? cells.length : 0],
        title: scores ? "your biggest group" : "a group, not the biggest",
        facts: [
          { text: cells.length === 1 ? "1 cell: nothing touching it is 2 away" : `${cells.length} cells joined by hops of ${HOP}`, ok: true },
          ...(scores ? [] : [{ text: cells.length === biggest ? `as big as the biggest (${biggest}), but only one group scores` : `smaller than the biggest (${biggest})`, ok: false }]),
        ],
        ...(links.length ? { links } : {}),
      });
    });
    if (lone.length) {
      out.push({
        id: "lone", shape: "region", group: "group", cells: lone, points: [0], title: "cells with no hop",
        facts: [{ text: `${count(lone.length, "cell")} with no touching number ${HOP} away`, ok: false }],
      });
    }
    return out;
  },
});
