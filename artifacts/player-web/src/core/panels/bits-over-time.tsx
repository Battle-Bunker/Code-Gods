/** My points over time: one line per object (payoff, your bits or the others'), for the objects that matter most to you now. */
import { useMemo } from "react";
import { LineChart, Obj, fmtBits, useDockState, useGameId, useMyObjects, useObjects, useObjectsTop, useTrajectories, type TrajectoryPoint } from "@/sdk";
import { seenHint } from "./knowledge";
import { PanelEmpty, referObjectId, ranksOf, type PanelProps } from "./kit";

const VALUE: Record<string, (p: TrajectoryPoint) => number> = { payoff: p => p.payoff, mine: p => p.ownNetBits, others: p => p.peerNetBits };
const NAME = { payoff: "payoff", mine: "your net bits", others: "others' net bits" } as const;

export default function BitsOverTime({ params }: PanelProps<"bits-over-time">) {
  const objects = useObjects({ hz: 1 });
  const trajectories = useTrajectories({ hz: 1 });
  // Top or bottom by payoff (at most 20 lines), ranked by the server (player.objectsTop); chosen ids each read alone.
  const gameId = useGameId();
  // Paid observation: each object's figures are as the god last saw it (./knowledge.ts), at the world clock's distance.
  const world = useDockState({ hz: 1 })?.economy?.worldSeconds ?? 0;
  const n = Math.min(20, params.count);
  const top = useObjectsTop({ gameId, n, dir: params.objects === "bottom" ? "asc" : "desc" }) ?? [];
  const picked = useMyObjects(params.objects === "ids" ? params.ids : []);
  const chosen = params.objects === "ids" ? picked : top;
  const ranks = useMemo(() => new Map([...ranksOf(objects), ...(params.objects === "top" ? top.map(o => [o.id, o.rank] as const) : [])]), [objects, top, params.objects]);
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
            <button type="button" className="w-7 text-left font-mono text-muted-foreground hover:text-foreground" onClick={() => referObjectId(o.id)}>#{ranks.get(o.id)}</button>
            <Obj value={o.value} />
            <span className="tabular-nums">{seenHint(o, world) ? "last" : "now"} {fmtBits(o.own.netBits)} yours · payoff {fmtBits(o.payoff)}{seenHint(o, world) && <span className="text-muted-foreground" data-testid={`text-seen-${o.id}`}> · {seenHint(o, world)}</span>}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
