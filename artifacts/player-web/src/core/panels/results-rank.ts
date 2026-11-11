/** The results panel's ranking: the engine's own rule (game-core rankTotals), so equal totals share a rank. */
import { rankTotals } from "@workspace/game-core";

export interface ResultRow { id: string; name: string; isAI: boolean; total: number; rank: number }

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** The live leaderboard as ranked rows, best first. */
export function liveResultRows(board: readonly { godId: string; label: string; isAI: boolean; totalPayoff: number }[]): ResultRow[] {
  const byId = new Map(board.map(r => [r.godId, r]));
  return rankTotals(board.map(r => r.godId), board.map(r => r.totalPayoff)).map(({ godId, totalPayoff, rank }) => {
    const r = byId.get(godId)!;
    return { id: godId, name: r.label, isAI: r.isAI, total: totalPayoff, rank };
  });
}

/** "1st", or "tied for 1st" when another row shares the rank. */
export function finishPlace(rows: readonly ResultRow[], row: ResultRow): string {
  const tied = rows.some(r => r !== row && r.rank === row.rank);
  return `${tied ? "tied for " : ""}${ordinal(row.rank)}`;
}
