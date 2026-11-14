/** The leaderboard: the published standings (net of any bid handicap), your row marked. */
import { useGame, useLeaderboard } from "@/sdk";
import { ordinal, pointsText } from "@/core/words";

export function RacePane() {
  const header = useGame();
  const standings = useLeaderboard();
  if (!standings) return <p className="p-4 text-sm text-muted-foreground" data-testid="race-empty">The first scores appear once the world runs.</p>;
  return (
    <ol className="divide-y text-sm" data-testid="leaderboard">
      {standings.rows.map(r => (
        <li key={r.memberId} className={`flex items-center gap-3 px-4 py-2 ${r.memberId === header?.me ? "bg-primary/10 font-medium" : ""}`} data-testid={`row-standing-${r.memberId}`}>
          <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
          <span className="flex-1 truncate">{r.name}{r.memberId === header?.me ? " (you)" : ""}</span>
          <span className="tabular-nums">{pointsText(r.net)}</span>
          {r.handicap > 0 && <span className="text-xs text-muted-foreground" title="The bid this player won costs this share of their total.">−{r.handicap}%</span>}
        </li>
      ))}
    </ol>
  );
}
