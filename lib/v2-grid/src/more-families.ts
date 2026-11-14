/**
 * Seven more grid families, brought over from v1's reward families on the 4×4 digit board (kings_and_subjects,
 * stepping_stones, mountain_climb, young_tableau, staircase_climber, magic_accountant, fillomino). Each is one main
 * layer in a 12-year-old's words and three alternative tie-breakers; the scores are plain counts or distances.
 */
import { q, ref, type ElementRef, type RuleFamily } from "@workspace/v2-core";
import { at, type GridState } from "./grid.ts";
import { boxes, cols, corners, rows } from "./units.ts";
import { cornersTie, countCells, distance, family, isPrimeCell, more, primesTie, readCells, readNum, totalOf, zerosTie, type Ctx, type Shape } from "./family-kit.ts";

type None = Record<string, never>;
type Cells = { v: number[]; refs: ElementRef[] };

/** The side-touching cells of cell i. */
function touching(n: number, i: number): number[] {
  const r = Math.floor(i / n), c = i % n;
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y! >= 0 && y! < n && x! >= 0 && x! < n).map(([y, x]) => at(n, y!, x!));
}
/** The groups of side-touching cells joined where `joined` holds for touching neighbours (every cell is in one group). */
function groups(n: number, v: readonly number[], joined: (a: number, b: number) => boolean): number[][] {
  const seen = new Set<number>(), out: number[][] = [];
  for (let s = 0; s < n * n; s++) {
    if (seen.has(s)) continue;
    const g = [s];
    seen.add(s);
    for (let k = 0; k < g.length; k++) for (const o of touching(n, g[k]!)) if (!seen.has(o) && joined(v[g[k]!]!, v[o]!)) { seen.add(o); g.push(o); }
    out.push(g);
  }
  return out;
}
const focusAll = (ctx: Ctx, cells: Cells, which: Iterable<number>) => { for (const i of new Set(which)) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); };
/** The three shared tie-breakers' terms. */
function ties(ctx: Ctx, cells: Cells, n: number): void {
  countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
  countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  totalOf(ctx, "corners", "the four corners' total", cells, corners(n));
}

// ---------------------------------------------------------------- 1. Kings and Subjects

/** A box with a tied biggest number has no king: it is this far off. */
export const NO_KING = 20;

export function kingsAndSubjects(n: number): RuleFamily<GridState, None> {
  const bx = boxes(n);
  const shape: Shape<None> = {
    main: distance<None>("kings", "every corner box's king equals his subjects",
      () => `In each corner box of four cells, the biggest number (the king) should equal the other three added up, like 9 with 2, 3 and 4. A box whose biggest number appears twice has no king and is ${NO_KING} off.`, "cells"),
    tieBreakers: [zerosTie(), primesTie(), cornersTie()],
  };
  return family<None>("kings-and-subjects", "Kings and Subjects", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    let off = 0;
    for (const cs of bx) {
      const v = cs.map(i => cells.v[i]!), m = Math.max(...v), king = cs[v.indexOf(m)]!;
      const away = v.filter(x => x === m).length > 1 ? NO_KING : Math.abs(2 * m - v.reduce((t, x) => t + x, 0));
      off += away;
      ctx.mark(away === 0 ? { kind: "focus", ref: cells.refs[king]! } : { kind: "note", ref: cells.refs[king]!, text: v.filter(x => x === m).length > 1 ? "no king" : `off by ${away}` });
    }
    ctx.term("kings", "how far each box's king is from his subjects added up, added up", q(off), cells.refs);
    ties(ctx, cells, n);
  }, n);
}

// ---------------------------------------------------------------- 2. Stepping Stones

export function steppingStones(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("stones", "the biggest group you can hop between",
      "Make the biggest group of cells you can hop between: you can hop between touching cells whose numbers differ by exactly 2.", "cells"),
    tieBreakers: [zerosTie(), primesTie(), cornersTie()],
  };
  return family<None>("stepping-stones", "Stepping Stones", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const best = groups(n, cells.v, (a, b) => Math.abs(a - b) === 2).reduce((b, g) => (g.length > b.length ? g : b));
    ctx.term("stones", "cells in the biggest group you can hop between", q(best.length), cells.refs);
    if (best.length > 1) focusAll(ctx, cells, best);
    ties(ctx, cells, n);
  }, n);
}

// ---------------------------------------------------------------- 3. Mountain Climb

export function mountainClimb(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("climb", "cells on the longest climb from the top-left cell",
      "Starting at the top-left cell, climb as far as you can: each step goes to a touching cell exactly 1 bigger. Count the cells on your longest climb.", "cells"),
    tieBreakers: [zerosTie(), primesTie(), cornersTie()],
  };
  return family<None>("mountain-climb", "Mountain Climb", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    // Level k holds the cells k steps up a climb from the top-left: every one of them holds the top-left number + k.
    const reached: number[] = [];
    let level = [0], steps = 0;
    while (level.length > 0) {
      steps++;
      reached.push(...level);
      level = [...new Set(level.flatMap(i => touching(n, i).filter(o => cells.v[o] === cells.v[i]! + 1)))];
    }
    ctx.term("climb", "cells on the longest climb from the top-left cell", q(steps), cells.refs);
    focusAll(ctx, cells, reached);
    ties(ctx, cells, n);
  }, n);
}

// ---------------------------------------------------------------- 4. Uphill

export type Corner = "TL" | "TR" | "BL" | "BR";
const CORNER_WORDS: Record<Corner, string> = { TL: "the top-left corner", TR: "the top-right corner", BL: "the bottom-left corner", BR: "the bottom-right corner" };

export function uphill(n: number): RuleFamily<GridState, { corner: Corner }> {
  const shape: Shape<{ corner: Corner }> = {
    main: { id: "uphill", title: "rising steps toward the corner", rep: "cells", sense: "max",
      sentence: p => `Walk toward ${CORNER_WORDS[p.corner]} along every row and column: as many steps as possible should reach a bigger number.` },
    tieBreakers: [zerosTie(), primesTie(), cornersTie()],
  };
  const params = (["TL", "TR", "BL", "BR"] as const).map(corner => ({ corner }));
  return family<{ corner: Corner }>("uphill", "Uphill", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n);
    const right = p.corner[1] === "R", down = p.corner[0] === "B";
    const lines = [...rows(n).map(l => (right ? l : [...l].reverse())), ...cols(n).map(l => (down ? l : [...l].reverse()))];
    const ends = lines.flatMap(l => l.slice(1).filter((i, k) => cells.v[i]! > cells.v[l[k]!]!));
    ctx.term("uphill", `rising steps toward ${CORNER_WORDS[p.corner]}`, q(ends.length), cells.refs);
    focusAll(ctx, cells, ends);
    ties(ctx, cells, n);
  }, n);
}

// ---------------------------------------------------------------- 5. Staircase

export type Direction = "right" | "down";

export function staircase(n: number): RuleFamily<GridState, { direction: Direction }> {
  const shape: Shape<{ direction: Direction }> = {
    main: { id: "staircase", title: "numbers one more than the one before", rep: "cells", sense: "max",
      sentence: p => `As many numbers as possible should be exactly 1 more than the number ${p.direction === "right" ? "to their left" : "above them"}.` },
    tieBreakers: [zerosTie(), primesTie(), cornersTie()],
  };
  return family<{ direction: Direction }>("staircase", "Staircase", ["cells"], shape, [{ direction: "right" }, { direction: "down" }], (ctx, p) => {
    const cells = readCells(ctx, n);
    const lines = p.direction === "right" ? rows(n) : cols(n);
    const hits = lines.flatMap(l => l.slice(1).filter((i, k) => cells.v[i] === cells.v[l[k]!]! + 1));
    ctx.term("staircase", `numbers 1 more than the one ${p.direction === "right" ? "to their left" : "above them"}`, q(hits.length), cells.refs);
    focusAll(ctx, cells, hits);
    ties(ctx, cells, n);
  }, n);
}

// ---------------------------------------------------------------- 6. Magic Accountant

export type Axis = "rows" | "columns";
type Accounts = { axis: Axis; T: number };

export function magicAccountant(n: number): RuleFamily<GridState, Accounts> {
  const shape: Shape<Accounts> = {
    main: distance<Accounts>("accounts", "every line adds up to the magic number",
      p => `Every ${p.axis === "rows" ? "row" : "column"} should add up to ${p.T}.`, "tally"),
    tieBreakers: [zerosTie(), primesTie(), cornersTie()],
  };
  const params = (["rows", "columns"] as const).flatMap(axis => [15, 16, 17, 18, 19, 20, 21].map(T => ({ axis, T })));
  return family<Accounts>("magic-accountant", "Magic Accountant", ["tally", "cells"], shape, params, (ctx, p) => {
    const refs = rows(n).map((_, k) => ref("tally", `${p.axis === "rows" ? "row" : "col"}${k}`));
    const totals = refs.map(r => readNum(ctx, r));
    ctx.term("accounts", `how far the ${p.axis}' totals are from ${p.T}, added up`, q(totals.reduce((t, x) => t + Math.abs(x - p.T), 0)), refs);
    refs.forEach((r, k) => { const d = totals[k]! - p.T; ctx.mark(d === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: d < 0 ? `${-d} short` : `${d} over` }); });
    ties(ctx, readCells(ctx, n), n);
  }, n);
}

// ---------------------------------------------------------------- 7. Fillomino

export function fillomino(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("fillomino", "cells in patches of the right size",
      "Every patch of touching equal numbers should have as many cells as its number, like a 3 in a patch of three cells. Count the cells in patches of the right size.", "cells"),
    tieBreakers: [primesTie(), zerosTie(), cornersTie()],
  };
  return family<None>("fillomino", "Fillomino", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const right = groups(n, cells.v, (a, b) => a === b).filter(g => cells.v[g[0]!]! > 0 && g.length === cells.v[g[0]!]).flat();
    ctx.term("fillomino", "cells in patches of the right size", q(right.length), cells.refs);
    focusAll(ctx, cells, right);
    ties(ctx, cells, n);
  }, n);
}

/** The seven coupled families, in the order the pool lists them. */
export const moreGridFamilies = (n: number): readonly RuleFamily<GridState, any>[] =>
  [kingsAndSubjects(n), steppingStones(n), mountainClimb(n), uphill(n), staircase(n), magicAccountant(n), fillomino(n)];
