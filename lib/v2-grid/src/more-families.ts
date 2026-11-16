/**
 * Seven more grid families, brought over from v1's reward families on the 4×4 digit board (kings_and_subjects,
 * stepping_stones, mountain_climb, young_tableau, staircase_climber, magic_accountant, fillomino). Each is one main
 * layer in a 12-year-old's words and three alternative tie-breakers; the scores are plain counts or distances. Each
 * tie-breaker ties what the main part singles out (the kings, the biggest group, the climb, the rising steps, the stairs,
 * the totals, the patches) to another side of the board, never an unrelated wish.
 */
import { q, ref, type ElementRef, type RuleFamily, type Variant } from "@workspace/v2-core";
import { at, gridParams, type GridState } from "./grid.ts";
import { boxes, cols, corners, rows } from "./units.ts";
import { offTotals, upTo, diagonals, term, distance, family, more, readCells, readNum, type Ctx, type Shape } from "./family-kit.ts";

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
const focusAll = (ctx: Ctx, cells: Cells, which: Iterable<number>, term?: string) => { for (const i of new Set(which)) ctx.mark({ kind: "focus", ref: cells.refs[i]!, ...(term ? { term } : {}) }); };
/** A secondary's note on an element (labelled with its id, so it shows only while that secondary is dealt). */
const noteOn = (ctx: Ctx, term: string, r: ElementRef, text: string) => ctx.mark({ kind: "note", ref: r, text, term });
/** A count, recorded as a term over the given cells. */

// ---------------------------------------------------------------- 1. Kings and Subjects

/** A box with a tied biggest number has no king: it is this far off. */
export const NO_KING = 20;

export function kingsAndSubjects(n: number): RuleFamily<GridState, None> {
  const bx = boxes(n);
  const shape: Shape<None> = {
    main: distance<None>("kings", "every corner box's king equals his subjects",
      () => `In each corner box of four cells, the biggest number (the king) should equal the other three added up, like 9 with 2, 3 and 4. A box whose biggest number appears twice has no king and is ${NO_KING} off.`, "cells"),
    tieBreakers: [
      upTo(more<None>("different-kings", "pairs of kings that are different numbers", "The kings should all be different numbers.", "cells"), (bx.length * (bx.length - 1)) / 2),
      upTo(more<None>("king-multiples", "kings that are a multiple of the smallest number in their box", "Each king should be a multiple of the smallest number in his box, like 8 with a 2.", "cells"), bx.length),
      upTo(more<None>("kings-on-diagonals", "kings on the board's diagonals", "Each king should stand on one of the board's two diagonals.", "cells"), bx.length),
    ],
  };
  return family<None>("kings-and-subjects", "Kings and Subjects", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    let off = 0;
    const kings: { cell: number; king: number; least: number }[] = [];   // the boxes that have a king
    for (const cs of bx) {
      const v = cs.map(i => cells.v[i]!), m = Math.max(...v), king = cs[v.indexOf(m)]!;
      const away = v.filter(x => x === m).length > 1 ? NO_KING : Math.abs(2 * m - v.reduce((t, x) => t + x, 0));
      if (v.filter(x => x === m).length === 1) kings.push({ cell: king, king: m, least: Math.min(...v) });
      off += away;
      ctx.mark(away === 0 ? { kind: "focus", ref: cells.refs[king]! } : { kind: "note", ref: cells.refs[king]!, text: v.filter(x => x === m).length > 1 ? "no king" : `off by ${away}` });
    }
    ctx.term("kings", "how far each box's king is from his subjects added up, added up", q(off), cells.refs);
    const kingRefs = kings.map(k => cells.refs[k.cell]!);
    term(ctx, "different-kings", "pairs of kings that are different numbers", kings.reduce((t, a, k) => t + kings.slice(k + 1).filter(b => b.king !== a.king).length, 0), kingRefs);
    term(ctx, "king-multiples", "kings that are a multiple of the smallest number in their box", kings.filter(k => k.least >= 1 && k.king % k.least === 0).length, kingRefs);
    const onDiagonal = (i: number) => { const r = Math.floor(i / n), c = i % n; return r === c || r + c === n - 1; };
    term(ctx, "kings-on-diagonals", "kings on the board's diagonals", kings.filter(k => onDiagonal(k.cell)).length, kingRefs);
    for (const k of kings) {
      const same = kings.filter(o => o !== k && o.king === k.king).length;
      if (same) noteOn(ctx, "different-kings", cells.refs[k.cell]!, `another king is also ${k.king}`); else focusAll(ctx, cells, [k.cell], "different-kings");
      if (k.least >= 1 && k.king % k.least === 0) focusAll(ctx, cells, [k.cell], "king-multiples");
      else noteOn(ctx, "king-multiples", cells.refs[k.cell]!, k.least === 0 ? "the smallest in his box is 0: nothing is a multiple of 0" : `not a multiple of ${k.least}, the smallest in his box`);
      if (onDiagonal(k.cell)) focusAll(ctx, cells, [k.cell], "kings-on-diagonals");
    }
  }, n);
}

// ---------------------------------------------------------------- 2. Stepping Stones

export function steppingStones(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("stones", "the biggest group you can hop between",
      "Make the biggest group of cells you can hop between: you can hop between touching cells whose numbers differ by exactly 2.", "cells"),
    tieBreakers: [
      distance<None>("outside-small", "the cells outside the biggest group, added up", () => "The cells outside the biggest group should add up to as little as possible.", "cells"),
      upTo(more<None>("group-reach", "rows and columns the biggest group reaches", "The biggest group should reach into as many rows and columns as possible.", "cells"), 2 * n),
      upTo(more<None>("group-corners", "board corners in the biggest group", "The biggest group should reach as many of the board's corners as possible.", "cells"), 4),
    ],
  };
  return family<None>("stepping-stones", "Stepping Stones", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const best = groups(n, cells.v, (a, b) => Math.abs(a - b) === 2).reduce((b, g) => (g.length > b.length ? g : b));
    ctx.term("stones", "cells in the biggest group you can hop between", q(best.length), cells.refs);
    if (best.length > 1) focusAll(ctx, cells, best);
    const refs = best.map(i => cells.refs[i]!);
    term(ctx, "outside-small", "the cells outside the biggest group, added up", cells.v.reduce((t, x, i) => (best.includes(i) ? t : t + x), 0), refs);
    term(ctx, "group-reach", "rows and columns the biggest group reaches", new Set(best.map(i => Math.floor(i / n))).size + new Set(best.map(i => i % n)).size, refs);
    term(ctx, "group-corners", "board corners in the biggest group", corners(n).filter(i => best.includes(i)).length, refs);
    focusAll(ctx, cells, cells.v.flatMap((_, i) => (best.includes(i) ? [] : [i])), "outside-small");
    const reachRows = new Set(best.map(i => Math.floor(i / n))).size, reachCols = new Set(best.map(i => i % n)).size;
    noteOn(ctx, "group-reach", cells.refs[best[0]!]!, `the biggest group reaches ${reachRows} of ${n} rows and ${reachCols} of ${n} columns`);
    focusAll(ctx, cells, corners(n).filter(i => best.includes(i)), "group-corners");
  }, n);
}

// ---------------------------------------------------------------- 3. Mountain Climb

export function mountainClimb(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("climb", "cells on the longest climb from the top-left cell",
      "Starting at the top-left cell, climb as far as you can: each step goes to a touching cell exactly 1 bigger. Count the cells on your longest climb.", "cells"),
    tieBreakers: [
      upTo(more<None>("climb-reach", "cells some climb reaches", "As many cells as possible should be on some climb from the top-left.", "cells"), n * n),
      upTo(more<None>("climb-far", "how far the climb gets from the top-left cell", "The climb should end as far from the top-left cell as possible.", "cells"), 2 * (n - 1)),
      more<None>("climb-summit", "the biggest number the climb reaches", "The climb should reach as big a number as possible.", "cells"),
    ],
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
    const refs = reached.map(i => cells.refs[i]!);
    term(ctx, "climb-reach", "cells some climb reaches", reached.length, refs);
    term(ctx, "climb-far", "steps across and down from the top-left cell to the farthest cell the climb reaches", Math.max(...reached.map(i => Math.floor(i / n) + (i % n))), refs);
    term(ctx, "climb-summit", "the biggest number the climb reaches", cells.v[0]! + steps - 1, refs);
    focusAll(ctx, cells, reached, "climb-reach");
    const far = Math.max(...reached.map(i => Math.floor(i / n) + (i % n)));
    focusAll(ctx, cells, reached.filter(i => Math.floor(i / n) + (i % n) === far), "climb-far");
    const summit = cells.v[0]! + steps - 1;
    focusAll(ctx, cells, reached.filter(i => cells.v[i] === summit), "climb-summit");
  }, n);
}

// ---------------------------------------------------------------- 4. Uphill

export type Corner = "TL" | "TR" | "BL" | "BR";
const CORNER_WORDS: Record<Corner, string> = { TL: "the top-left corner", TR: "the top-right corner", BL: "the bottom-left corner", BR: "the bottom-right corner" };
const OPPOSITE: Record<Corner, Corner> = { TL: "BR", TR: "BL", BL: "TR", BR: "TL" };
/** The corner's cell. */
const cornerCell = (n: number, corner: Corner) => at(n, corner[0] === "B" ? n - 1 : 0, corner[1] === "R" ? n - 1 : 0);

export function uphill(n: number): RuleFamily<GridState, { corner: Corner }> {
  const shape: Shape<{ corner: Corner }> = {
    main: { id: "uphill", title: "rising steps toward the corner", rep: "cells", sense: "max",
      sentence: p => `Walk toward ${CORNER_WORDS[p.corner]} along every row and column: as many steps as possible should reach a bigger number.` },
    tieBreakers: [
      more<{ corner: Corner }>("rise-by-one", "rising steps that rise by exactly 1", "As many of the rising steps as possible should rise by exactly 1.", "cells"),
      more<{ corner: Corner }>("corner-peak", "numbers smaller than the number in the corner you walk toward",
        p => `The number in ${CORNER_WORDS[p.corner]} should be bigger than as many other numbers as possible.`, "cells"),
      more<{ corner: Corner }>("start-low", "numbers bigger than the number in the corner the walks start from",
        p => `The number in ${CORNER_WORDS[OPPOSITE[p.corner]]} should be smaller than as many other numbers as possible.`, "cells"),
    ],
  };
  const params = (["BR", "BL", "TR", "TL"] as const).map(corner => ({ corner }));   // the bottom-right first: v1's young tableau, and the corner the more-rules pool deals
  return family<{ corner: Corner }>("uphill", "Uphill", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n);
    const right = p.corner[1] === "R", down = p.corner[0] === "B";
    const lines = [...rows(n).map(l => (right ? l : [...l].reverse())), ...cols(n).map(l => (down ? l : [...l].reverse()))];
    const ends = lines.flatMap(l => l.slice(1).filter((i, k) => cells.v[i]! > cells.v[l[k]!]!));
    ctx.term("uphill", `rising steps toward ${CORNER_WORDS[p.corner]}`, q(ends.length), cells.refs);
    focusAll(ctx, cells, ends);
    const byOne = lines.flatMap(l => l.slice(1).filter((i, k) => cells.v[i] === cells.v[l[k]!]! + 1));
    term(ctx, "rise-by-one", `rising steps toward ${CORNER_WORDS[p.corner]} that rise by exactly 1`, byOne.length, cells.refs);
    const peak = cells.v[cornerCell(n, p.corner)]!, start = cells.v[cornerCell(n, OPPOSITE[p.corner])]!;
    term(ctx, "corner-peak", `numbers smaller than the one in ${CORNER_WORDS[p.corner]}`, cells.v.filter(x => x < peak).length, cells.refs);
    term(ctx, "start-low", `numbers bigger than the one in ${CORNER_WORDS[OPPOSITE[p.corner]]}`, cells.v.filter(x => x > start).length, cells.refs);
    focusAll(ctx, cells, byOne, "rise-by-one");
    noteOn(ctx, "corner-peak", cells.refs[cornerCell(n, p.corner)]!, `bigger than ${cells.v.filter(x => x < peak).length} of the other numbers`);
    noteOn(ctx, "start-low", cells.refs[cornerCell(n, OPPOSITE[p.corner])]!, `smaller than ${cells.v.filter(x => x > start).length} of the other numbers`);
  }, n);
}

// ---------------------------------------------------------------- 5. Staircase

export type Direction = "right" | "down";

export function staircase(n: number): RuleFamily<GridState, { direction: Direction }> {
  const shape: Shape<{ direction: Direction }> = {
    main: { id: "staircase", title: "numbers one more than the one before", rep: "cells", sense: "max",
      sentence: p => `As many numbers as possible should be exactly 1 more than the number ${p.direction === "right" ? "to their left" : "above them"}.` },
    tieBreakers: [
      more<{ direction: Direction }>("long-flight", "cells in the longest flight of stairs", "The longest flight of stairs should be as long as possible.", "cells"),
      more<{ direction: Direction }>("double-stairs", "stairs that are also 1 more the other way",
        p => `As many stairs as possible should also be 1 more than the number ${p.direction === "right" ? "above them" : "to their left"}.`, "cells"),
      distance<{ direction: Direction }>("low-stairs", "the numbers the stairs climb from, added up", () => "The stairs should climb from numbers as small as possible.", "cells"),
    ],
  };
  return family<{ direction: Direction }>("staircase", "Staircase", ["cells"], shape, [{ direction: "right" }, { direction: "down" }], (ctx, p) => {
    const cells = readCells(ctx, n);
    const lines = p.direction === "right" ? rows(n) : cols(n);
    const hits = lines.flatMap(l => l.slice(1).filter((i, k) => cells.v[i] === cells.v[l[k]!]! + 1));
    ctx.term("staircase", `numbers 1 more than the one ${p.direction === "right" ? "to their left" : "above them"}`, q(hits.length), cells.refs);
    focusAll(ctx, cells, hits);
    // A flight: stairs one after another along a row (or down a column), counting the cell it starts from.
    let flight = 1, flightCells: number[] = [];
    for (const l of lines) {
      let run = 1;
      for (let k = 1; k < l.length; k++) {
        run = cells.v[l[k]!] === cells.v[l[k - 1]!]! + 1 ? run + 1 : 1;
        if (run > flight) { flight = run; flightCells = l.slice(k - run + 1, k + 1); }
      }
    }
    if (flight > 1) focusAll(ctx, cells, flightCells, "long-flight");
    else noteOn(ctx, "long-flight", cells.refs[0]!, "no stairs yet: a flight is one cell long");
    term(ctx, "long-flight", "cells in the longest flight of stairs", flight, cells.refs);
    const back = p.direction === "right" ? n : 1;   // the number the other way: above, or to the left
    const both = hits.filter(i => (p.direction === "right" ? i >= n : i % n > 0) && cells.v[i] === cells.v[i - back]! + 1);
    term(ctx, "double-stairs", `stairs also 1 more than the number ${p.direction === "right" ? "above them" : "to their left"}`, both.length, cells.refs);
    const before = p.direction === "right" ? 1 : n;   // the number before a stair: to its left, or above
    term(ctx, "low-stairs", "the numbers the stairs climb from, added up", hits.reduce((t, i) => t + cells.v[i - before]!, 0), cells.refs);
    focusAll(ctx, cells, both, "double-stairs");
    focusAll(ctx, cells, hits.map(i => i - before), "low-stairs");
  }, n);
}

// ---------------------------------------------------------------- 6. Magic Accountant

export type Axis = "rows" | "columns";
type Accounts = { axis: Axis; T: number };

export function magicAccountant(n: number): RuleFamily<GridState, Accounts> {
  const shape: Shape<Accounts> = {
    main: distance<Accounts>("accounts", "every row (or column) adds up to the magic number",
      p => `Every ${p.axis === "rows" ? "row" : "column"} should add up to ${p.T}.`, "tally"),
    tieBreakers: [
      distance<Accounts>("other-way", "the other way adds up to the magic number too",
        p => `The ${p.axis === "rows" ? "columns" : "rows"} should add up to ${p.T} too.`, "tally"),
      distance<Accounts>("diagonals", "both diagonals add up to the magic number", p => `Both diagonals should add up to ${p.T} too.`, "cells"),
      more<Accounts>("all-different", "rows (or columns) of four different numbers", p => `Each ${p.axis === "rows" ? "row" : "column"} should hold four different numbers.`, "cells"),
    ],
  };
  // The target is the middle total of n cells (n · cap / 2): 18 on the 4×4 board of digits 0–9. Targets off the middle
  // give peers of unequal opportunity (v1-audit.md #27), so only the middle one is dealt.
  const params = (v: Variant) => { const T = Math.round((n * gridParams(v).cap) / 2); return (["rows", "columns"] as const).map(axis => ({ axis, T })); };
  return family<Accounts>("magic-accountant", "Magic Accountant", ["tally", "cells"], shape, params, (ctx, p) => {
    const refs = rows(n).map((_, k) => ref("tally", `${p.axis === "rows" ? "row" : "col"}${k}`));
    const totals = refs.map(r => readNum(ctx, r));
    ctx.term("accounts", `how far the ${p.axis}' totals are from ${p.T}, added up`, q(totals.reduce((t, x) => t + Math.abs(x - p.T), 0)), refs);
    refs.forEach((r, k) => { const d = totals[k]! - p.T; ctx.mark(d === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: d < 0 ? `${-d} short` : `${d} over` }); });
    const other = p.axis === "rows" ? "columns" : "rows";
    const otherRefs = rows(n).map((_, k) => ref("tally", `${p.axis === "rows" ? "col" : "row"}${k}`));
    term(ctx, "other-way", `how far the ${other}' totals are from ${p.T}, added up`, otherRefs.reduce((t, r) => t + Math.abs(readNum(ctx, r) - p.T), 0), otherRefs);
    for (const r of otherRefs) { const d = readNum(ctx, r) - p.T; if (d === 0) ctx.mark({ kind: "focus", ref: r, term: "other-way" }); else noteOn(ctx, "other-way", r, d < 0 ? `${-d} short` : `${d} over`); }
    const cells = readCells(ctx, n);
    const diag = diagonals(n);
    term(ctx, "diagonals", `how far the diagonals' totals are from ${p.T}, added up`, offTotals(cells.v, diag, p.T), diag.flat().map(i => cells.refs[i]!));
    const dealt = p.axis === "rows" ? rows(n) : cols(n);
    term(ctx, "all-different", `${p.axis} of ${n} different numbers`, dealt.filter(l => new Set(l.map(i => cells.v[i])).size === l.length).length, cells.refs);
    diag.forEach((d, k) => {
      focusAll(ctx, cells, d, "diagonals");
      const x = d.reduce((t, i) => t + cells.v[i]!, 0);
      noteOn(ctx, "diagonals", cells.refs[d[0]!]!, `${k === 0 ? "the diagonal from the top-left" : "the diagonal from the top-right"} adds up to ${x}${x === p.T ? "" : x < p.T ? `: ${p.T - x} short` : `: ${x - p.T} over`}`);
    });
    dealt.forEach((l, k) => {
      const twice = [...new Set(l.map(i => cells.v[i]!))].filter(x => l.filter(i => cells.v[i] === x).length > 1);
      if (!twice.length) focusAll(ctx, cells, l, "all-different");
      else noteOn(ctx, "all-different", cells.refs[l[0]!]!, `${p.axis === "rows" ? "row" : "column"} ${k + 1} repeats ${twice.join(" and ")}`);
    });
  }, n);
}

// ---------------------------------------------------------------- 7. Fillomino

export function fillomino(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("fillomino", "cells in patches of the right size",
      "Every patch of touching equal numbers should have as many cells as its number, like a 3 in a patch of three cells. Count the cells in patches of the right size.", "cells"),
    tieBreakers: [
      more<None>("patch-kinds", "different numbers in right-size patches", "The right-size patches should use as many different numbers as possible.", "cells"),
      more<None>("patch-count", "right-size patches", "There should be as many right-size patches as possible.", "cells"),
      distance<None>("near-misses", "how far the wrong-size patches are from their numbers", () => "Every wrong-size patch should be as close to its number in size as possible.", "cells"),
    ],
  };
  return family<None>("fillomino", "Fillomino", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const patches = groups(n, cells.v, (a, b) => a === b).filter(g => cells.v[g[0]!]! > 0);   // patches of 0s never count
    const fits = patches.filter(g => g.length === cells.v[g[0]!]), right = fits.flat();
    ctx.term("fillomino", "cells in patches of the right size", q(right.length), cells.refs);
    focusAll(ctx, cells, right);
    term(ctx, "patch-kinds", "different numbers in right-size patches", new Set(fits.map(g => cells.v[g[0]!])).size, cells.refs);
    term(ctx, "patch-count", "right-size patches", fits.length, cells.refs);
    term(ctx, "near-misses", "how far the wrong-size patches are from their numbers, added up", patches.reduce((t, g) => t + Math.abs(g.length - cells.v[g[0]!]!), 0), cells.refs);
    const kinds = new Map<number, number[]>();
    for (const g of fits) kinds.set(cells.v[g[0]!]!, [...(kinds.get(cells.v[g[0]!]!) ?? []), ...g]);
    for (const [x, cs] of kinds) { focusAll(ctx, cells, cs, "patch-kinds"); if (cs.length > x) noteOn(ctx, "patch-kinds", cells.refs[cs[0]!]!, `${cs.length / x} patches of ${x}s: they count once`); }
    for (const g of fits) noteOn(ctx, "patch-count", cells.refs[g[0]!]!, `a patch of ${g.length} ${cells.v[g[0]!]}s`);
    for (const g of patches) if (g.length !== cells.v[g[0]!]) noteOn(ctx, "near-misses", cells.refs[g[0]!]!, `a patch of ${g.length} ${g.length === 1 ? "cell" : "cells"} holding ${cells.v[g[0]!]}: ${Math.abs(g.length - cells.v[g[0]!]!)} ${g.length < cells.v[g[0]!]! ? "short" : "over"}`);
  }, n);
}

/** The seven coupled families, in the order the pool lists them. */
export const moreGridFamilies = (n: number): readonly RuleFamily<GridState, any>[] =>
  [kingsAndSubjects(n), steppingStones(n), mountainClimb(n), uphill(n), staircase(n), magicAccountant(n), fillomino(n)];
