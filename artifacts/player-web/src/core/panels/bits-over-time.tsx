/** My points over time: one line per object (payoff, your bits or the others'), for the objects that matter most to you now. */
import { LineChart, Obj, fmtBits, useObjects, useTrajectories, type TrajectoryPoint } from "@/sdk";
import { PanelEmpty, referObject, useObjectRanks, type PanelProps } from "./kit";

const VALUE: Record<string, (p: TrajectoryPoint) => number> = { payoff: p => p.payoff, mine: p => p.ownNetBits, others: p => p.peerNetBits };
const NAME = { payoff: "payoff", mine: "your net bits", others: "others' net bits" } as const;

export default function BitsOverTime({ params }: PanelProps<"bits-over-time">) {
  const objects = useObjects({ hz: 1 });
  const trajectories = useTrajectories({ hz: 1 });
  const ranks = useObjectRanks(objects);
  const ranked = [...objects].sort((a, b) => b.payoff - a.payoff);
  const chosen = params.objects === "ids" ? ranked.filter(o => params.ids.includes(o.id))
    : (params.objects === "top" ? ranked : [...ranked].reverse()).slice(0, params.count);
  if (!chosen.length) return <PanelEmpty>{objects.length ? "None of the chosen objects is alive any more." : "No objects yet: lines appear once the world runs."}</PanelEmpty>;
  const latest = Math.max(0, ...chosen.flatMap(o => (trajectories.get(o.id) ?? []).map(p => p.worldSeconds)));
  const from = params.window > 0 ? latest - params.window : -Infinity;
  const value = VALUE[params.metric];
  const series = chosen.map(o => ({ label: `#${ranks.get(o.id)}`, points: (trajectories.get(o.id) ?? []).filter(p => p.worldSeconds >= from).map(p => ({ x: p.worldSeconds, y: value(p) })) }));
  return (
    <div className="flex flex-wrap items-start gap-6" data-testid="panel-bits-over-time">
      <LineChart series={series} width={420} height={180} xLabel="world s" yLabel={NAME[params.metric]} />
      <ol className="space-y-1 text-xs">
        {chosen.map(o => (
          <li key={o.id} className="flex items-center gap-2">
            <button type="button" className="w-7 text-left font-mono text-muted-foreground hover:text-foreground" onClick={() => referObject(ranks.get(o.id))}>#{ranks.get(o.id)}</button>
            <Obj value={o.value} />
            <span className="tabular-nums">now {fmtBits(o.own.netBits)} yours · payoff {fmtBits(o.payoff)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
