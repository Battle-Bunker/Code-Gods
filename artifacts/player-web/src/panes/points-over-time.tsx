/**
 * Your points over time (integration plan §1.6, the v1 "bits over time" renamed): your total at every scoreboard
 * publication, from the standings history the server keeps (`useStandingsHistory`, every publication, never sampled),
 * with the caption that points rise and fall (ux-lessons 2.9). Also drawn on the results pane.
 */
import { useMemo, useState } from "react";
import { useGame, useStandingsHistory } from "@/sdk";
import { LineChart } from "@/components/charts";
import { clock, pointsText } from "@/core/words";
import { riseAndFall, seriesOf, type Series } from "./chart-model";

/**
 * The chart, its caption and a table view; says why when there is nothing to draw yet. `slot`: the viewer's place in
 * the roster, so their colour is the one the race gives them.
 */
export function MyPointsChart({ me, slot, ended, testId = "points-over-time" }: { me: string; slot: number; ended: boolean; testId?: string }) {
  const history = useStandingsHistory();
  const points = useMemo(() => seriesOf(history, me), [history, me]);
  const series: Series[] = useMemo(() => [{ key: me, label: "You", you: true, slot, points }], [me, slot, points]);
  const [table, setTable] = useState(false);
  if (!points.length) return <p className="text-sm text-muted-foreground" data-testid={`${testId}-empty`}>Your points show here over time once the first scores are published.</p>;
  return (
    <div className="space-y-2" data-testid={testId}>
      <LineChart series={series} label={`Your points over time: ${pointsText(points.at(-1)!.y)} at ${clock(points.at(-1)!.x)}`} />
      <p className="text-xs text-muted-foreground" data-testid={`${testId}-caption`}>{riseAndFall(points, { you: true, ended })}</p>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setTable(t => !t)} data-testid={`${testId}-table-toggle`}>
        {table ? "Hide the table" : "Show as a table"}
      </button>
      {table && (
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="text-muted-foreground"><th className="text-left font-normal">World time</th><th className="text-right font-normal">Your points</th></tr></thead>
          <tbody>{points.map(p => <tr key={p.x}><td>{clock(p.x)}</td><td className="text-right">{pointsText(p.y)}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

export function PointsOverTimePane() {
  const header = useGame();
  if (!header) return null;
  if (!header.me) return <p className="p-4 text-sm text-muted-foreground">You are watching: the Leaderboard shows every player's points over time.</p>;
  return <div className="p-3"><MyPointsChart me={header.me} slot={header.roster.findIndex(m => m.memberId === header.me)} ended={header.phase === "ended"} /></div>;
}
