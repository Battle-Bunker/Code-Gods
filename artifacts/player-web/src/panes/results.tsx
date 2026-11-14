/**
 * How the game went (integration plan §1.7; ux-lessons 2.9): the result first ("You finished 1st of 3 with N points",
 * or "Ada won with N points" for a spectator), then the final standings, your row marked.
 */
import { useGame, useLeaderboard } from "@/sdk";
import { ordinal, pointsText } from "@/core/words";
import { resultsHeadline } from "./results-headline";

export function ResultsPane() {
  const header = useGame();
  const standings = useLeaderboard();
  if (!header || standings === undefined) return null;
  const rows = standings ? [...standings.rows].sort((a, b) => a.rank - b.rank) : [];
  return (
    <div className="space-y-3 p-4 text-sm" data-testid="results">
      <p className="text-lg font-semibold leading-snug" data-testid="text-results-headline">{resultsHeadline(standings?.rows, header.me, header.phase === "ended")}</p>
      {rows.length > 0 && (
        <ol className="divide-y border-y" data-testid="results-standings">
          {rows.map(r => (
            <li key={r.memberId} className={`flex items-center gap-3 py-2 ${r.memberId === header.me ? "font-medium" : ""}`} data-testid={`row-result-${r.memberId}`}>
              <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
              <span className="flex-1 truncate">{r.name}{r.memberId === header.me ? " (you)" : ""}</span>
              <span className="tabular-nums">{pointsText(r.net)}</span>
              {r.handicap > 0 && <span className="text-xs text-muted-foreground" title="The bid this player won costs this share of their total.">−{r.handicap}%</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
