/**
 * Number Bonds, ported from v1's number_bonds (archive/engine-v1 lib/game-utilities/src/families/grid/arithmetic.ts):
 * touching cells (side by side or one above the other) whose numbers add up to 10 (the board's biggest number + 1) are
 * a bond; v1 scored the count of bonds. v2 keeps the count as the main part; each tie-breaker reads the bonds it counts.
 */
import type { RuleFamily } from "@workspace/v2-core";
import { at, type GridState } from "./grid.ts";
import { cols, rows } from "./units.ts";
import { term, family, more, readCells, isPrimeCell, type Shape } from "./family-kit.ts";

type None = Record<string, never>;
const TARGET = 10;

/** Every touching pair, each cell with the cell to its right and the cell below it (v1's cell.right, cell.down). */
export const touchingPairs = (n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (c + 1 < n) out.push([at(n, r, c), at(n, r, c + 1)]);
    if (r + 1 < n) out.push([at(n, r, c), at(n, r + 1, c)]);
  }
  return out;
};

export function numberBonds(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("number-bonds", "bonds: touching cells adding up to 10",
      `Two touching cells (side by side, or one above the other) are a bond when their numbers add up to ${TARGET}, like 3 and 7. Make as many bonds as possible; a cell can be in several bonds.`, "cells"),
    tieBreakers: [
      more<None>("far-split", "how far apart the two numbers of each bond are, added up",
        "The two numbers in each bond should be as far apart as possible: 1 and 9 are 8 apart, 5 and 5 are 0 apart. Add up the gaps of all the bonds.", "cells"),
      more<None>("bond-run", "cells in the longest unbroken run of bonds along a row or column",
        "Make the longest run of cells along one row or column where every cell makes a bond with the next, like 2, 8, 2, 8 (count the cells).", "cells"),
      more<None>("prime-bonds", "bonds made of two prime numbers (3 and 7, or 5 and 5)",
        "As many bonds as possible should be made of two prime numbers: 3 and 7, or 5 and 5.", "cells"),
    ],
  };
  return family<None>("number-bonds", "Number Bonds", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const bond = (a: number, b: number) => cells.v[a]! + cells.v[b]! === TARGET;
    const bonds = touchingPairs(n).filter(([a, b]) => bond(a, b));
    const inBond = new Set(bonds.flat());
    term(ctx, "number-bonds", `touching pairs adding up to ${TARGET}`, bonds.length, cells.refs);
    for (const i of inBond) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
    const refs = [...inBond].map(i => cells.refs[i]!);
    term(ctx, "far-split", "how far apart the two numbers of each bond are, added up", bonds.reduce((t, [a, b]) => t + Math.abs(cells.v[a]! - cells.v[b]!), 0), refs);
    let run = 0;   // every bond lies along a row or a column, so a bond makes a run of at least 2
    for (const l of [...rows(n), ...cols(n)]) {
      let cur = 1;
      for (let k = 1; k < l.length; k++) { cur = bond(l[k - 1]!, l[k]!) ? cur + 1 : 1; if (cur > 1) run = Math.max(run, cur); }
    }
    term(ctx, "bond-run", "cells in the longest unbroken run of bonds along a row or column", run, refs);
    term(ctx, "prime-bonds", "bonds made of two prime numbers", bonds.filter(([a, b]) => isPrimeCell(cells.v[a]!) && isPrimeCell(cells.v[b]!)).length, refs);
  }, n);
}
