/**
 * My bits over time, per object: your net bits on the objects that matter most to you right now
 * (highest current payoff), as a line per object over world time.
 */
import { definePanel, LineChart, Obj, useObjects, useTrajectories, fmtBits } from "@sdk";

const TOP = 5;

export default definePanel({
  title: "My bits over time",
  placement: "bottom",
  size: "lg",
  Component() {
    const objects = useObjects({ hz: 1 });
    const trajectories = useTrajectories({ hz: 1 });
    const top = [...objects].sort((a, b) => b.payoff - a.payoff).slice(0, TOP);
    if (!top.length) return <p className="text-[12px] italic opacity-60">No objects yet.</p>;
    const series = top.map((o, i) => ({
      label: `#${i + 1}`,
      points: (trajectories.get(o.id) ?? []).map(p => ({ x: p.worldSeconds, y: p.ownNetBits })),
    }));
    return (
      <div className="flex flex-wrap items-start gap-4" data-testid="example-my-bits">
        <LineChart series={series} width={420} height={170} xLabel="world s" yLabel="own net bits" />
        <ol className="m-0 list-none space-y-1 p-0 text-[11px]">
          {top.map((o, i) => (
            <li key={o.id} className="flex items-center gap-2">
              <span className="w-5 opacity-60">#{i + 1}</span><Obj value={o.value} />
              <span className="tabular-nums">now {fmtBits(o.own.netBits)} · payoff {fmtBits(o.payoff)}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  },
});
