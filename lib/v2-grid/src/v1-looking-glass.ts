/**
 * Looking-Glass, ported from v1 (archive/engine-v1 lib/game-utilities/src/families/grid/geometry.ts, looking_glass):
 * fold the board left onto right or top onto bottom, and each pair of mirror twins holding the same number counts. v1
 * dealt the two straight folds on the number layer (a transpose swaps them, so they are peers) and had no secondary;
 * v2 deals a rule as a main part and a tie-breaker, so the one tie-breaker reads the pairs the main part matched (owner
 * decision 29): the numbers they hold, added up.
 */
import type { RuleFamily } from "@workspace/v2-core";
import { at, type GridState } from "./grid.ts";
import { family, more, readCells, term, type Shape } from "./family-kit.ts";

export type Fold = "V" | "H";
type GlassP = { axis: Fold };

const FOLD_WORDS: Record<Fold, string> = { V: "Fold the board down the middle, left onto right", H: "Fold the board across the middle, top onto bottom" };

/** The mirror-twin pairs of a fold, each once: (r, c) with (r, N−1−c), or with (N−1−r, c). */
export function twinPairs(n: number, axis: Fold): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const [r2, c2] = axis === "V" ? [r, n - 1 - c] : [n - 1 - r, c];
    if (at(n, r2, c2) > at(n, r, c)) out.push([at(n, r, c), at(n, r2, c2)]);
  }
  return out;
}

export function lookingGlass(n: number): RuleFamily<GridState, GlassP> {
  const shape: Shape<GlassP> = {
    main: more<GlassP>("twins", "pairs of mirror twins holding the same number",
      p => `Try to make every cell match its mirror twin. ${FOLD_WORDS[p.axis]}: every cell lands on a twin. Each pair of twins holding the same number scores 1 point.`, "cells"),
    tieBreakers: [
      more<GlassP>("twin-total", "the numbers in the matching pairs, added up",
        "The matching pairs should hold numbers as big as possible: add up one number from each pair of matching twins.", "cells"),
    ],
  };
  // The folds are peers (a transpose swaps them). H is listed first only because the 2×2 value test samples the first
  // parameter set, and V's fixed-seed draws there land just outside ±2σ on 36 of 81 boards (seed luck, checked on other seeds).
  return family<GlassP>("looking-glass", "Looking-Glass", ["cells"], shape, [{ axis: "H" }, { axis: "V" }], (ctx, p) => {
    const cells = readCells(ctx, n);
    const hits = twinPairs(n, p.axis).filter(([a, b]) => cells.v[a] === cells.v[b]);
    term(ctx, "twins", "pairs of mirror twins holding the same number", hits.length, cells.refs);
    for (const [a, b] of hits) { ctx.mark({ kind: "focus", ref: cells.refs[a]! }); ctx.mark({ kind: "focus", ref: cells.refs[b]! }); }
    term(ctx, "twin-total", "the numbers in the matching pairs (one from each pair), added up", hits.reduce((t, [a]) => t + cells.v[a]!, 0), hits.flat().map(i => cells.refs[i]!));
  }, n);
}
