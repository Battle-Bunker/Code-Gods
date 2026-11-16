/**
 * The leaderboard: the race (every player's points at every scoreboard publication, from the standings history the
 * server keeps, one colour per player by roster order, yours named "You") above the published standings (net of any
 * bid handicap), your row marked. The list is the chart's table view.
 */
import { useMemo } from "react";
import { objectWord, useGame, useLeaderboard, useReplaySource, useStandingsHistory } from "@/sdk";
import { isTied, ordinal, pointsText, TIE_NOTE, totalNote, totalsSumNote } from "@/core/words";
import { LineByLine, TiedMark } from "@/core/score-help";
import { LineChart, slotColour } from "@/components/charts";
import { leadChanges, raceSeries } from "./chart-model";
import { useReplayControls } from "@/replay/controller";
import { useAffordance } from "@workspace/v2-affordances/react";

function RaceChart() {
  const header = useGame();
  const history = useStandingsHistory();
  // In a replay, v1's score chart: the whole game's race, the playhead on it, the lead changes marked; a click goes there.
  const replay = useReplayControls();
  const seek = useAffordance("replay.seek");
  const whole = useMemo(() => replay?.index?.ticks.map(t => t.point), [replay?.index]);
  const series = useMemo(() => (header ? raceSeries(whole ?? history, header.roster, replay?.member ?? header.me) : []), [whole, history, header?.roster, header?.me, replay?.member]); // eslint-disable-line react-hooks/exhaustive-deps
  const leads = useMemo(() => (replay ? leadChanges(series) : undefined), [replay ? series : null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!series.some(s => s.points.length > 1)) return null;
  return (
    <div className="px-4 pt-3" data-testid="race-chart">
      <LineChart series={series} height={170} label="Every player's points over time" testId={replay ? "replay-race" : undefined}
        {...(replay ? { marker: replay.world, marks: leads, onPick: (w: number) => void seek.run({ worldSeconds: Math.max(0, w) }).catch(() => {}) } : {})} />
      {replay && <p className="mt-1 text-xs text-muted-foreground">The line is where the replay is; dashed lines are where the lead changed. Click the chart to go there.</p>}
      <p className="mt-1 text-xs text-muted-foreground">Points rise and fall as agents change {objectWord(header?.variant).many} and the others' wants change.</p>
    </div>
  );
}

export function RacePane() {
  const header = useGame();
  const standings = useLeaderboard();
  const replay = useReplaySource();
  if (!standings) return <p className="p-4 text-sm text-muted-foreground" data-testid="race-empty">The first scores appear once the world runs.</p>;
  const slotOf = (id: string) => header?.roster.findIndex(m => m.memberId === id) ?? -1;
  const tied = standings.rows.some(r => isTied(standings.rows, r));
  // Once the game has ended, the final standings are Results' (a persona walk met the same table three times).
  if (header?.phase === "ended" && !replay) {
    return (
      <div>
        <RaceChart />
        <p className="px-4 py-2 text-xs text-muted-foreground" data-testid="race-ended-note">The final standings are in Results.</p>
      </div>
    );
  }
  return (
    <div>
      <RaceChart />
      <ol className="divide-y text-sm" data-testid="leaderboard">
        {standings.rows.map(r => (
          <li key={r.memberId} className={`flex items-center gap-3 px-4 py-2 ${r.memberId === header?.me ? "bg-primary/10 font-medium" : ""}`} data-testid={`row-standing-${r.memberId}`}>
            <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
            {tied && <span className="w-9 shrink-0">{isTied(standings.rows, r) && <TiedMark testId={`text-tied-${r.memberId}`} />}</span>}
            <span aria-hidden className="inline-block h-[2px] w-3 shrink-0 rounded" style={{ background: slotColour(slotOf(r.memberId)) }} />
            <span className="flex-1 truncate">{r.name}{r.memberId === header?.me ? " (you)" : ""}</span>
            <span className="tabular-nums">{pointsText(r.net)}</span>
            {r.handicap > 0 && <span className="text-xs text-muted-foreground" title="The bid this player won costs this share of their total.">−{r.handicap}%</span>}
          </li>
        ))}
      </ol>
      <div className="space-y-1 border-t px-4 py-2 text-xs text-muted-foreground" data-testid="text-leaderboard-note">
        <p>{totalNote(totalsSumNote(objectWord(header?.variant).one), standings.rows.some(r => r.handicap > 0))}{tied ? ` ${TIE_NOTE}` : ""}</p>
        <LineByLine testId="button-line-by-line-race" />
      </div>
    </div>
  );
}
