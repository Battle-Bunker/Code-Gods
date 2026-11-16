/**
 * Chessmaster (archive lib/game-utilities/src/families/grid/geometry.ts, "Little chessboards in your two colours"),
 * ported as the old game had it: the main part counts the 2×2 blocks whose colours alternate A and B like a chessboard;
 * the old secondary points (each place an A cell touches a B cell) are its tie-breaker. One rule per unordered pair of
 * the board's colours (the old game's (A, B) and (B, A) scored the same).
 */
import type { RuleFamily, Variant } from "@workspace/v2-core";
import { paletteOf, type BoardState } from "../board.ts";
import { an, colourNames, family, more, readBoard, term, type Shape } from "./kit.ts";
import { sizeOf } from "./kit.ts";

export interface ChessParams { readonly a: string; readonly b: string }

export function chessmaster(): RuleFamily<BoardState, ChessParams> {
  const shape: Shape<ChessParams> = {
    main: more<ChessParams>("chessboards", "little chessboards of your two colours",
      p => `Make little chessboards of ${p.a} and ${p.b}: each 2×2 block whose colours alternate ${p.a} and ${p.b}, like a chessboard, counts.`),
    tieBreakers: [
      more<ChessParams>("seams", "places your two colours touch",
        p => `As many places as possible where ${an(p.a)} cell touches ${an(p.b)} cell (side by side or one above the other).`),
    ],
  };
  const pairs = (v: Variant): ChessParams[] => {
    const names = colourNames(paletteOf(v));
    return names.flatMap((a, i) => names.slice(i + 1).map(b => ({ a, b })));
  };
  return family<ChessParams>("chessmaster", "Chessmaster", shape, pairs, (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    const opposite = (i: number, j: number) => (cells.c[i] === p.a && cells.c[j] === p.b) || (cells.c[i] === p.b && cells.c[j] === p.a);
    let boards = 0, seams = 0;
    const inBoards = new Set<number>(), onSeams = new Set<number>();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c, right = c < n - 1 ? i + 1 : -1, below = r < n - 1 ? i + n : -1;
      for (const o of [right, below]) if (o >= 0 && opposite(i, o)) { seams++; onSeams.add(i).add(o); }
      if (right >= 0 && below >= 0 && opposite(i, right) && opposite(i, below) && cells.c[below + 1] === cells.c[i]) {
        boards++;
        for (const x of [i, right, below, below + 1]) inBoards.add(x);
      }
    }
    term(ctx, "chessboards", `2×2 chessboards of ${p.a} and ${p.b}`, boards, cells.refs);
    for (const i of inBoards) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
    term(ctx, "seams", `places ${an(p.a)} cell touches ${an(p.b)} cell`, seams, [...onSeams].map(i => cells.refs[i]!));
  });
}
