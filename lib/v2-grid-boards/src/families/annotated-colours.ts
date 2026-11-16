/**
 * The old "Annotated colours" setup's colour families (archive lib/game-utilities/src/families/grid: strategy.ts,
 * arithmetic.ts, games.ts, colour.ts), ported as the old game had them (coordinator's call 37): the same score, the old
 * secondary points (where there were any) as the one tie-breaker, the same dealt parameters. Chessmaster is in its own
 * file. Bounded main parts are kept: these are the original-rules baseline, not redesigned rules.
 */
import type { RuleFamily, Variant } from "@workspace/v2-core";
import { boardParams, isCard, paletteOf, symbolCount, symbolGlyph, symbolValue, type BoardState } from "../board.ts";
import { colourNames, family, more, readBoard, term, type Cells, type Ctx, type Shape } from "./kit.ts";
import { sizeOf } from "./kit.ts";

type None = Record<string, never>;
const focus = (ctx: Ctx, cells: Cells, which: Iterable<number>) => { for (const i of new Set(which)) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); };
/** The largest value a symbol of the board can have (9 on digits, 15 on hex, 13 on cards). */
const vmax = (v: Variant) => Math.max(...Array.from({ length: symbolCount(boardParams(v).symbols) }, (_, s) => symbolValue(v, s)));

// ---------------------------------------------------------------- Parity Painter (strategy.ts)

export interface ParityParams { readonly even: string; readonly odd: string }
/** Each cell wears the colour of its kind: even numbers one colour, odd the other; right +1, the other's colour −1. */
export function parityPainter(): RuleFamily<BoardState, ParityParams> {
  const shape: Shape<ParityParams> = {
    main: more<ParityParams>("dressed", "cells in the colour of their kind",
      p => `Even numbers should be ${p.even} and odd numbers ${p.odd}. A cell in its right colour scores 1; a cell in the other kind's colour loses 1.`),
    tieBreakers: [],
  };
  const params = (v: Variant): ParityParams[] => { const c = colourNames(paletteOf(v)); return c.flatMap(even => c.filter(o => o !== even).map(odd => ({ even, odd }))); };
  return family<ParityParams>("parity-painter", "Parity Painter", shape, params, (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let points = 0;
    const right: number[] = [];
    cells.v.forEach((x, i) => {
      const [want, wrong] = x % 2 === 0 ? [p.even, p.odd] : [p.odd, p.even];
      if (cells.c[i] === want) { points++; right.push(i); } else if (cells.c[i] === wrong) points--;
    });
    term(ctx, "dressed", "cells in their kind's colour, less cells in the other kind's", points, cells.refs);
    focus(ctx, cells, right);
  });
}

// ---------------------------------------------------------------- Colour Mirror (strategy.ts)

export interface MirrorParams { readonly axis: "rows" | "columns" }
export function colourMirror(): RuleFamily<BoardState, MirrorParams> {
  const shape: Shape<MirrorParams> = {
    main: more<MirrorParams>("colour-mirrors", "rows or columns that mirror their colours",
      p => `Make ${p.axis} whose colours read the same forwards and backwards.`),
    tieBreakers: [more<MirrorParams>("colour-pairs", "matching colour pairs",
      p => `As many matching pairs (first and last, second and second-last …) in any of the ${p.axis} as possible.`)],
  };
  return family<MirrorParams>("colour-mirror", "Colour Mirror", shape, () => [{ axis: "rows" }, { axis: "columns" }], (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let mirrors = 0, pairs = 0;
    const lit: number[] = [];
    for (let k = 0; k < n; k++) {
      const run = Array.from({ length: n }, (_, j) => (p.axis === "rows" ? k * n + j : j * n + k));
      let matches = 0;
      for (let j = 0; j < n >> 1; j++) if (cells.c[run[j]!] === cells.c[run[n - 1 - j]!]) matches++;
      pairs += matches;
      if (matches === n >> 1) { mirrors++; lit.push(...run); }
    }
    term(ctx, "colour-mirrors", `mirror ${p.axis} of colour`, mirrors, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "colour-pairs", "matching colour pairs", pairs, cells.refs);
  });
}

// ---------------------------------------------------------------- Picture Frame (strategy.ts)

/** The old FRAME_POINTS: an edge cell with your colour or your symbol +1, with both +4; a middle cell −1 or −4. */
export const FRAME_POINTS = { edge: { one: 1, both: 4 }, middle: { one: -1, both: -4 } } as const;
export interface FrameParams { readonly colour: string; readonly symbol: string }
export function pictureFrame(): RuleFamily<BoardState, FrameParams> {
  const shape: Shape<FrameParams> = {
    main: more<FrameParams>("frame", "your colour and your symbol on the edge, a clear middle",
      p => `Put ${p.colour} cells and ${p.symbol}s on the edge (the outside ring) and keep the middle clear. An edge cell that is ${p.colour} or shows ${p.symbol} scores 1, both 4; a middle cell that is either loses 1, both 4.`),
    tieBreakers: [],
  };
  const params = (v: Variant): FrameParams[] => {
    const set = boardParams(v).symbols;
    return colourNames(paletteOf(v)).flatMap(colour => Array.from({ length: symbolCount(set) }, (_, s) => ({ colour, symbol: symbolGlyph(set, s) })));
  };
  return family<FrameParams>("picture-frame", "Picture Frame", shape, params, (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    const set = boardParams(ctx.variant).symbols, sym = ctx.state.sym;
    let score = 0;
    const hit: number[] = [];
    for (let i = 0; i < n * n; i++) {
      const hits = Number(cells.c[i] === p.colour) + Number(symbolGlyph(set, sym[i]!) === p.symbol);
      if (!hits) continue;
      const r = Math.floor(i / n), c = i % n, edge = r === 0 || c === 0 || r === n - 1 || c === n - 1;
      const pts = edge ? FRAME_POINTS.edge : FRAME_POINTS.middle;
      score += hits === 2 ? pts.both : pts.one;
      if (edge) hit.push(i);
    }
    term(ctx, "frame", "points for the frame, less points for the middle", score, cells.refs);
    focus(ctx, cells, hit);
  });
}

// ---------------------------------------------------------------- Colour Bonds (arithmetic.ts)

/** The old card's TARGET: one more than the biggest a cell can hold (10 on digits, 16 on hex, 14 on cards). */
export interface BondParams { readonly target: number }
export function colourBonds(): RuleFamily<BoardState, BondParams> {
  const shape: Shape<BondParams> = {
    main: more<BondParams>("colour-bonds", "touching pairs of one colour that make the magic number",
      p => `Make touching cells of one colour whose numbers add up to ${p.target}. Each such pair scores 1.`),
    tieBreakers: [],
  };
  return family<BondParams>("colour-bonds", "Colour Bonds", shape, v => [{ target: vmax(v) + 1 }], (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let bonds = 0;
    const lit: number[] = [];
    for (let i = 0; i < n * n; i++) for (const o of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (o >= 0 && cells.v[i]! + cells.v[o]! === p.target && cells.c[i] === cells.c[o]) { bonds++; lit.push(i, o); }
    }
    term(ctx, "colour-bonds", `touching same-colour pairs that add up to ${p.target}`, bonds, cells.refs);
    focus(ctx, cells, lit);
  });
}

// ---------------------------------------------------------------- Honest Minesweeper (games.ts)

export interface MineParams { readonly mine: string }
export function honestMinesweeper(): RuleFamily<BoardState, MineParams> {
  const shape: Shape<MineParams> = {
    main: more<MineParams>("honest", "points from honest cells",
      p => `${p.mine[0]!.toUpperCase()}${p.mine.slice(1)} cells are mines. Any other cell is honest when its number equals how many mines touch it (corners count). Each honest cell scores its number.`),
    tieBreakers: [],
  };
  return family<MineParams>("honest-minesweeper", "Honest Minesweeper", shape, v => colourNames(paletteOf(v)).map(mine => ({ mine })), (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let points = 0;
    const honest: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (cells.c[i] === p.mine) continue;
      const r = Math.floor(i / n), c = i % n;
      let mines = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const y = r + dr, x = c + dc;
        if ((dr || dc) && y >= 0 && y < n && x >= 0 && x < n && cells.c[y * n + x] === p.mine) mines++;
      }
      if (cells.v[i] === mines) { points += cells.v[i]!; if (mines) honest.push(i); }
    }
    term(ctx, "honest", "honest cells' numbers, added up", points, cells.refs);
    focus(ctx, cells, honest);
  });
}

// ---------------------------------------------------------------- Kingdom (colour.ts)

export interface KingdomParams { readonly colour: string }
export function kingdom(): RuleFamily<BoardState, KingdomParams> {
  const shape: Shape<KingdomParams> = {
    main: more<KingdomParams>("kingdom", "cells in your biggest patch",
      p => `Grow the biggest patch of ${p.colour}, your colour: a group of ${p.colour} cells joined side to side. Each cell in your biggest patch scores 1.`),
    tieBreakers: [],
  };
  return family<KingdomParams>("kingdom", "Kingdom", shape, v => colourNames(paletteOf(v)).map(colour => ({ colour })), (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    const seen = new Set<number>();
    let best: number[] = [];
    for (let s = 0; s < n * n; s++) {
      if (seen.has(s) || cells.c[s] !== p.colour) continue;
      const g = [s];
      seen.add(s);
      for (let k = 0; k < g.length; k++) {
        const i = g[k]!, r = Math.floor(i / n), c = i % n;
        for (const o of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
          if (o >= 0 && !seen.has(o) && cells.c[o] === p.colour) { seen.add(o); g.push(o); }
        }
      }
      if (g.length > best.length) best = g;
    }
    term(ctx, "kingdom", `cells in your biggest ${p.colour} patch`, best.length, cells.refs);
    focus(ctx, cells, best);
  });
}

// ---------------------------------------------------------------- Set Spotter (games.ts)

export function setSpotter(): RuleFamily<BoardState, None> {
  const shape: Shape<None> = {
    main: more<None>("sets", "SETs of three in a row",
      "Spot SETs: 3 cells in a row (across, down or diagonally) whose colours are all the same or all different, and whose numbers are all the same or evenly spaced (like 2, 5, 8). Each SET scores 1."),
    tieBreakers: [],
  };
  return family<None>("set-spotter", "Set Spotter", shape, v => (paletteOf(v).length >= 3 ? [{}] : []), ctx => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let sets = 0;
    const lit: number[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
      const r2 = r + 2 * dr, c2 = c + 2 * dc;
      if (r2 < 0 || r2 >= n || c2 < 0 || c2 >= n) continue;
      const a = r * n + c, b = (r + dr) * n + c + dc, d = r2 * n + c2;
      if (new Set([cells.c[a], cells.c[b], cells.c[d]]).size !== 2 && cells.v[b]! - cells.v[a]! === cells.v[d]! - cells.v[b]!) { sets++; lit.push(a, b, d); }
    }
    term(ctx, "sets", "SETs of three in a row", sets, cells.refs);
    focus(ctx, cells, lit);
  });
}

