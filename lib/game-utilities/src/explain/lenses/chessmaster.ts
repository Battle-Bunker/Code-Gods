/** ♟️ Chessmaster: 2×2 blocks that alternate like a chessboard (primary points); every A–B touch (secondary points). */
import { lens, tally, count } from "../lens.ts";
import type { Cell, Part } from "../model.ts";

type P = { colour_a: string; colour_b: string };


export const chessmaster = lens<P>({
  familyId: "chessmaster",
  components: (p, b) => ["chessboards", `places where ${p.colour_a} touches ${p.colour_b}`],
  breakdown: (p, b, parts) => ({
    unit: ["chessboard", "chessboards"],
    items: tally(parts, [
      { of: t => t.shape === "block" && t.points[0] > 0, text: n => `${count(n, "little chessboard")} (2×2 blocks that alternate)` },
      { of: t => t.shape === "block", text: n => `${count(n, "2×2 block")} that ${n === 1 ? "is" : "are"} not a chessboard` },
      { of: () => true, text: n => `${count(n, "place")} where ${p.colour_a} touches ${p.colour_b}` },
    ]),
  }),
  parts: (p, b) => {
    const opposite = (x: Cell, y: Cell) => (b.colour(x) === p.colour_a && b.colour(y) === p.colour_b) || (b.colour(x) === p.colour_b && b.colour(y) === p.colour_a);
    const A = p.colour_a, B = p.colour_b;
    const blocks: Part[] = [], seams: Part[] = [];
    for (const x of b.cells) {
      for (const [name, y] of [["right", { r: x.r, c: x.c + 1 }], ["down", { r: x.r + 1, c: x.c }]] as const) {
        if (b.inside(y.r, y.c) && opposite(x, y)) {
          seams.push({ id: `seam:${x.r},${x.c}:${name}`, shape: "pair", cells: [x, y], points: [0, 1], title: `${A} touches ${B}`, facts: [{ text: `${b.colour(x)} next to ${b.colour(y)}`, ok: true, tier: 1 }], group: "pair" });
        }
      }
      if (x.r === b.N - 1 || x.c === b.N - 1) continue;
      const right = { r: x.r, c: x.c + 1 }, below = { r: x.r + 1, c: x.c }, corner = { r: x.r + 1, c: x.c + 1 };
      const facts = [
        { text: `top row: ${b.colour(x)}, ${b.colour(right)}`, ok: opposite(x, right) },
        { text: `left column: ${b.colour(x)}, ${b.colour(below)}`, ok: opposite(x, below) },
        { text: `opposite corners match: ${b.colour(x)}, ${b.colour(corner)}`, ok: b.col(corner) === b.col(x) },
      ];
      const board = facts.every(f => f.ok);
      blocks.push({ id: `block:${x.r},${x.c}`, shape: "block", cells: [x, right, below, corner], points: [board ? 1 : 0, 0], title: board ? "a little chessboard" : "not a chessboard", facts, group: "block" });
    }
    return [...blocks, ...seams];
  },
  // The board is carved by 2×2 block centres; the touching pairs (secondary points) by their shared edges.
  hover: p => ({ modes: [{ id: "block", label: "2×2 blocks", groups: ["block"] }, { id: "pair", label: `${p.colour_a}–${p.colour_b} touches`, groups: ["pair"] }] }),
});
