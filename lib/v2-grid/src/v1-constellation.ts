/**
 * Constellation, ported from v1 (archive/engine-v1 lib/game-utilities/src/families/grid/geometry.ts, constellation):
 * the stars are the cells holding the dealt number; stars touching, even at a corner, form a cluster, and the biggest
 * cluster's stars count. v1 dealt every number (its param `star`) and had no secondary; v2 deals a rule as a main part
 * and a tie-breaker, so the one tie-breaker reads the cluster the main part singles out (owner decision 29): the rows
 * and columns it reaches (on a tie for the biggest, the one reaching furthest).
 */
import type { RuleFamily } from "@workspace/v2-core";
import { at, gridParams, type GridState } from "./grid.ts";
import { family, more, readCells, term, markFor, type Shape } from "./family-kit.ts";

type StarP = { star: number };

/** The cells touching cell i, at a side or a corner. */
function surrounding(n: number, i: number): number[] {
  const r = Math.floor(i / n), c = i % n, out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const y = r + dr, x = c + dc;
    if ((dr || dc) && y >= 0 && y < n && x >= 0 && x < n) out.push(at(n, y, x));
  }
  return out;
}

/** The clusters of cells holding `star`, touching at a side or a corner. */
export function clusters(n: number, v: readonly number[], star: number): number[][] {
  const seen = new Set<number>(), out: number[][] = [];
  for (let s = 0; s < n * n; s++) {
    if (v[s] !== star || seen.has(s)) continue;
    const g = [s];
    seen.add(s);
    for (let k = 0; k < g.length; k++) for (const o of surrounding(n, g[k]!)) if (v[o] === star && !seen.has(o)) { seen.add(o); g.push(o); }
    out.push(g);
  }
  return out;
}

const reach = (n: number, g: readonly number[]) => new Set(g.map(i => Math.floor(i / n))).size + new Set(g.map(i => i % n)).size;

export function constellation(n: number): RuleFamily<GridState, StarP> {
  const shape: Shape<StarP> = {
    main: more<StarP>("stars", "stars in the biggest cluster",
      p => `Try to make one big cluster of stars, the cells holding ${p.star}. Stars that touch, even at a corner, form a cluster. Each star in your biggest cluster scores 1 point.`, "cells"),
    tieBreakers: [
      more<StarP>("cluster-reach", "rows and columns the biggest cluster reaches",
        "The biggest cluster should reach into as many rows and columns as possible (if several clusters tie for the biggest, the one reaching furthest counts).", "cells"),
    ],
  };
  return family<StarP>("constellation", "Constellation", ["cells"], shape, v => Array.from({ length: gridParams(v).cap + 1 }, (_, star) => ({ star })), (ctx, p) => {
    const cells = readCells(ctx, n);
    const cs = clusters(n, cells.v, p.star);
    const size = Math.max(0, ...cs.map(g => g.length));
    const best = cs.filter(g => g.length === size).reduce<number[]>((b, g) => (reach(n, g) > reach(n, b) ? g : b), []);
    term(ctx, "stars", `stars (cells holding ${p.star}) in the biggest cluster`, size, cells.refs);
    for (const i of best) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
    markFor(ctx, "cluster-reach", best.map(i => cells.refs[i]!));
    term(ctx, "cluster-reach", "rows and columns the biggest cluster reaches", reach(n, best), best.length ? best.map(i => cells.refs[i]!) : cells.refs);
  }, n);
}
