/**
 * How the game went, in one sentence (ux-lessons 2.9: the end screen leads with the result). Pure, from the published
 * standings (the server's ranks, which equal totals share): "You finished 1st of 3 with 412.5 points." for a seated
 * player, "Ada won with 412.5 points." for a spectator.
 */
import { ordinal, pointsText as points } from "../core/words.ts";

export interface StandingRow { memberId: string; name: string; net: number; handicap: number; rank: number }


/** "1st", or "tied for 1st" when another row shares the rank. */
export function finishPlace(rows: readonly StandingRow[], row: StandingRow): string {
  return `${rows.some(r => r !== row && r.rank === row.rank) ? "tied for " : ""}${ordinal(row.rank)}`;
}

/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
const names = (list: readonly string[]) => (list.length <= 1 ? list[0] ?? "" : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/**
 * The headline. `me` is the viewer's seat (null for a spectator); `ended` false says the standings are so far.
 * Null rows (no standings published) have their own sentence.
 */
export function resultsHeadline(rows: readonly StandingRow[] | null | undefined, me: string | null, ended = true): string {
  if (!rows || rows.length === 0) return ended ? "The game ended before any scores were counted." : "No scores yet: they appear once the world runs.";
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const mine = me ? sorted.find(r => r.memberId === me) : undefined;
  if (mine) {
    const verb = ended ? "You finished" : "So far you are";
    const bid = mine.handicap > 0 ? ` (after your bid's ${mine.handicap}% handicap)` : "";
    return `${verb} ${finishPlace(sorted, mine)} of ${sorted.length} with ${points(mine.net)}${bid}.`;
  }
  const top = sorted.filter(r => r.rank === sorted[0]!.rank);
  if (!ended) return `${names(top.map(r => r.name))} ${top.length > 1 ? "lead" : "leads"} with ${points(top[0]!.net)} so far.`;
  return top.length > 1 ? `${names(top.map(r => r.name))} tied for first with ${points(top[0]!.net)}.` : `${top[0]!.name} won with ${points(top[0]!.net)}.`;
}
