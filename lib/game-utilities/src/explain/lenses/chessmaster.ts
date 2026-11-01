/** ♟️ Chessmaster: 2×2 blocks that alternate like a chessboard (points); every A–B touch is the tie-break. */
import { lens, orderParts } from "../lens.ts";
import { hasCell, type Cell, type Part } from "../model.ts";

type P = { A: number; B: number };

export const chessmaster = lens<P>({
  familyId: "chessmaster",
  components: (p, b) => ["chessboards", `tie-break: places where ${b.spec.colourNames[p.A]} touches ${b.spec.colourNames[p.B]}`],
  parts: (p, b) => {
    const opposite = (x: Cell, y: Cell) => (b.col(x) === p.A && b.col(y) === p.B) || (b.col(x) === p.B && b.col(y) === p.A);
    const A = b.spec.colourNames[p.A], B = b.spec.colourNames[p.B];
    const blocks: Part[] = [], seams: Part[] = [];
    for (const x of b.cells) {
      for (const [name, y] of [["right", { r: x.r, c: x.c + 1 }], ["down", { r: x.r + 1, c: x.c }]] as const) {
        if (b.inside(y.r, y.c) && opposite(x, y)) {
          seams.push({ id: `seam:${x.r},${x.c}:${name}`, shape: "pair", cells: [x, y], points: [0, 1], title: `${A} touches ${B}`, facts: [{ text: `${b.colour(x)} next to ${b.colour(y)}`, ok: true }] });
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
      blocks.push({ id: `block:${x.r},${x.c}`, shape: "block", cells: [x, right, below, corner], points: [board ? 1 : 0, 0], title: board ? "a little chessboard" : "not a chessboard", facts });
    }
    return [...blocks, ...seams];
  },
  select: (parts, focus) => {
    const mine = parts.filter(t => hasCell(t.cells, focus));
    return [...orderParts(mine.filter(t => t.shape === "block"), 4), ...mine.filter(t => t.shape === "pair")].slice(0, 6);
  },
});
