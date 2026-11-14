/**
 * The leaderboard: the race (every player's points at every scoreboard publication, from the standings history the
 * server keeps, one colour per player by roster order, yours named "You") above the published standings (net of any
 * bid handicap), your row marked. The list is the chart's table view.
 */
import { useMemo } from "react";
import { useGame, useLeaderboard, useStandingsHistory } from "@/sdk";
import { ordinal, pointsText } from "@/core/words";
import { LineChart, slotColour } from "@/components/charts";
import { raceSeries } from "./chart-model";

function RaceChart() {
  const header = useGame();
  const history = useStandingsHistory();
  const series = useMemo(() => (header ? raceSeries(history, header.roster, header.me) : []), [history, header?.roster, header?.me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!series.some(s => s.points.length > 1)) return null;
  return (
    <div className="px-4 pt-3" data-testid="race-chart">
      <LineChart series={series} height={170} label="Every player's points over time" />
      <p className="mt-1 text-xs text-muted-foreground">Points rise and fall as agents change lines and the others' wants change.</p>
    </div>
  );
}

export function RacePane() {
  const header = useGame();
  const standings = useLeaderboard();
  if (!standings) return <p className="p-4 text-sm text-muted-foreground" data-testid="race-empty">The first scores appear once the world runs.</p>;
  const slotOf = (id: string) => header?.roster.findIndex(m => m.memberId === id) ?? -1;
  return (
    <div>
      <RaceChart />
      <ol className="divide-y text-sm" data-testid="leaderboard">
        {standings.rows.map(r => (
          <li key={r.memberId} className={`flex items-center gap-3 px-4 py-2 ${r.memberId === header?.me ? "bg-primary/10 font-medium" : ""}`} data-testid={`row-standing-${r.memberId}`}>
            <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
            <span aria-hidden className="inline-block h-[2px] w-3 shrink-0 rounded" style={{ background: slotColour(slotOf(r.memberId)) }} />
            <span className="flex-1 truncate">{r.name}{r.memberId === header?.me ? " (you)" : ""}</span>
            <span className="tabular-nums">{pointsText(r.net)}</span>
            {r.handicap > 0 && <span className="text-xs text-muted-foreground" title="The bid this player won costs this share of their total.">−{r.handicap}%</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
