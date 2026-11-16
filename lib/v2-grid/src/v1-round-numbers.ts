/**
 * Round Numbers, ported from v1's round_numbers (archive/engine-v1 lib/game-utilities/src/families/grid/arithmetic.ts):
 * every row (or column) should add up to a multiple of 10. v1 scored (rows with a round total, Σ 5 − distance to the
 * nearest multiple of 10); v2 keeps the distance as the main part, and v1's own primary (rows exactly round) is a
 * tie-breaker. The other tie-breakers read the round number each total is nearest to.
 */
import { ref, type RuleFamily } from "@workspace/v2-core";
import { type GridState } from "./grid.ts";
import { rows } from "./units.ts";
import { term, distance, family, more, readNum, type Shape } from "./family-kit.ts";
import type { Axis } from "./more-families.ts";

type RoundParams = { axis: Axis };
const BASE = 10;
const word = (p: RoundParams) => (p.axis === "rows" ? "row" : "column");

/** The multiple of 10 nearest a total (a total ending in 5 rounds up: 15 is nearest 20). */
export const nearestRound = (t: number): number => Math.floor((t + BASE / 2) / BASE) * BASE;

export function roundNumbers(n: number): RuleFamily<GridState, RoundParams> {
  const shape: Shape<RoundParams> = {
    main: distance<RoundParams>("round-numbers", "how far each row's (or column's) total is from a round number, added up",
      p => `Every ${word(p)} should add up to a round number: a multiple of 10, like 10, 20 or 30. Each ${word(p)}'s total is as far off as it is from the nearest multiple of 10 (17 is 3 off, 25 is 5 off), and the distances are added up.`, "tally"),
    tieBreakers: [
      more<RoundParams>("exact-rounds", "rows (or columns) whose total is exactly round", p => `As many ${word(p)}s as possible should add up to exactly a multiple of 10.`, "tally"),
      more<RoundParams>("big-rounds", "the round numbers the totals are nearest to, added up",
        p => `The round numbers the ${word(p)}s are nearest to should add up to as much as possible (a total ending in 5 is nearest the round number above it).`, "tally"),
      more<RoundParams>("round-steps", "neighbouring rows (or columns) whose round numbers are 10 apart",
        p => `As many neighbouring ${word(p)}s as possible should be nearest to round numbers exactly 10 apart, like 10 and 20.`, "tally"),
    ],
  };
  const params: RoundParams[] = [{ axis: "rows" }, { axis: "columns" }];   // v1's support; rows were its canonical axis
  return family<RoundParams>("round-numbers", "Round Numbers", ["tally"], shape, params, (ctx, p) => {
    const refs = rows(n).map((_, k) => ref("tally", `${p.axis === "rows" ? "row" : "col"}${k}`));
    const totals = refs.map(r => readNum(ctx, r));
    const rounds = totals.map(nearestRound);
    const off = totals.map((t, k) => Math.abs(t - rounds[k]!));
    term(ctx, "round-numbers", `how far each ${word(p)}'s total is from the nearest multiple of 10, added up`, off.reduce((a, b) => a + b, 0), refs);
    refs.forEach((r, k) => ctx.mark(off[k] === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: `${off[k]} off ${rounds[k]}` }));
    term(ctx, "exact-rounds", `${word(p)}s adding up to exactly a multiple of 10`, off.filter(d => d === 0).length, refs);
    term(ctx, "big-rounds", "the round numbers the totals are nearest to, added up", rounds.reduce((a, b) => a + b, 0), refs);
    term(ctx, "round-steps", `neighbouring ${word(p)}s whose round numbers are 10 apart`, rounds.slice(1).filter((r, k) => Math.abs(r - rounds[k]!) === BASE).length, refs);
  }, n);
}
