/**
 * Bingo Caller, ported from v1 (archive/engine-v1 lib/game-utilities/src/families/grid/games.ts, `bingo_caller`): the
 * rule calls a third of the digits (4 of 0–9 on the beginner board); every cell showing a called number is dabbed and
 * scores 1, and a complete row, column or long diagonal of dabs is BINGO, N more. v1's score was that one number; it is
 * the main part here, unchanged. v1 had no secondary (its shape was a scalar), so the tie-breakers are new, and each reads
 * the dabs the main part counts: rows, columns and diagonals one dab short of BINGO, the dabbed numbers added up, and
 * the dabs on the long diagonals.
 */
import { type RuleFamily, type Variant } from "@workspace/v2-core";
import { gridParams, type GridState } from "./grid.ts";
import { cols, rows } from "./units.ts";
import { diagonals, family, more, readCells, term, markFor, upTo, type Shape } from "./family-kit.ts";

export type Bingo = { called: readonly number[] };

/**
 * The called set the more-rules pool deals (presets.ts), listed first. One of v1's 210, spread over the digits: the
 * smallest set (v1's canonical 0–3) is the law's commonest digits and tops out near 6 bits; the biggest (6–9) reaches
 * about 16 bits by a main part of 12, a rule of another scale. 1, 4, 6, 9 reaches about 16 bits at 34 (sampled, 16 Nov).
 */
export const BINGO_DEALT: Bingo = { called: [1, 4, 6, 9] };

/** All k-subsets of 0 … n − 1, in lexicographic order (v1's `combinations`). */
function* combinations(n: number, k: number, from = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = from; i <= n - k; i++) for (const rest of combinations(n, k - 1, i + 1)) yield [i, ...rest];
}
/** "0, 1, 2 and 3". */
const listed = (xs: readonly number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : `${xs[0]}`);

export function bingoCaller(n: number): RuleFamily<GridState, Bingo> {
  const shape: Shape<Bingo> = {
    main: { id: "bingo", title: "dabs, and BINGOs", rep: "cells", sense: "max",
      sentence: p => `Your called numbers are ${listed(p.called)}. Dab every cell showing one of them: each dab scores 1 point. A complete row, column or long diagonal of dabs is BINGO and scores ${n} more points. Score as many points as possible.` },
    tieBreakers: [
      upTo(more<Bingo>("near-bingo", "rows, columns and long diagonals one dab short of BINGO",
        "As many rows, columns and long diagonals as possible should be one dab short of BINGO.", "cells"), 2 * n + 2),
      more<Bingo>("big-dabs", "the dabbed numbers, added up", "The dabbed numbers should add up to as much as possible.", "cells"),
      upTo(more<Bingo>("diagonal-dabs", "dabs on the long diagonals", "As many dabs as possible should be on the two long diagonals.", "cells"), 2 * n - (n % 2)),
    ],
  };
  // v1's support: every set of ⌈ranks / 3⌉ called numbers, the dealt set first (where the variant has it).
  const params = (v: Variant): Bingo[] => {
    const ranks = gridParams(v).cap + 1, all = [...combinations(ranks, Math.ceil(ranks / 3))].map(called => ({ called }));
    const dealt = all.findIndex(p => p.called.join() === BINGO_DEALT.called.join());
    return dealt < 0 ? all : [all[dealt]!, ...all.slice(0, dealt), ...all.slice(dealt + 1)];
  };
  return family<Bingo>("bingo-caller", "Bingo Caller", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n);
    const dabbed = cells.v.map(x => p.called.includes(x));
    const lines = [...rows(n), ...cols(n), ...diagonals(n)];
    const dabs = dabbed.filter(Boolean).length;
    const bingos = lines.filter(l => l.every(i => dabbed[i]));
    term(ctx, "bingo", `dabs, and ${n} for each BINGO`, dabs + n * bingos.length, cells.refs);
    // Every dabbed cell counts (a called number); a BINGO line's cells also say so.
    cells.refs.forEach((r, i) => { if (dabbed[i]) ctx.mark({ kind: "focus", ref: r }); });
    for (const l of bingos) ctx.mark({ kind: "note", ref: cells.refs[l[0]!]!, text: `BINGO: ${l.map(i => cells.v[i]).join(", ")}: +${n}` });
    const dabRefs = cells.refs.filter((_, i) => dabbed[i]);
    markFor(ctx, "near-bingo", lines.filter(l => l.filter(i => dabbed[i]).length === n - 1).flat().map(i => cells.refs[i]!));
    markFor(ctx, "big-dabs", dabRefs);
    markFor(ctx, "diagonal-dabs", [...new Set(diagonals(n).flat())].filter(i => dabbed[i]).map(i => cells.refs[i]!));
    term(ctx, "near-bingo", "rows, columns and long diagonals one dab short of BINGO", lines.filter(l => l.filter(i => dabbed[i]).length === n - 1).length, cells.refs);
    term(ctx, "big-dabs", "the dabbed numbers, added up", cells.v.reduce((t, x, i) => (dabbed[i] ? t + x : t), 0), dabRefs);
    term(ctx, "diagonal-dabs", "dabs on the long diagonals", [...new Set(diagonals(n).flat())].filter(i => dabbed[i]).length, dabRefs);
  }, n);
}
