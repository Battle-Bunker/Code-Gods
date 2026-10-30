/**
 * Inferred opponent interests, from aggregate movements only. You never see another god's utility
 * function or per-object scores; you see how the SUM of the others' net bits moves when objects change.
 * Each transformation is a point (Δ mine, Δ others): changes others' agents make that raise their sum
 * reveal direction, not who or why. Treat every conclusion here as inference.
 */
import { useMemo } from "react";
import { definePanel, ScatterPlot, BarList, useEvents, fmtBits } from "@sdk";

type Point = { objectId: string; dMine: number; dPeers: number; mine: boolean };

export default definePanel({
  title: "Inferred opponent interests",
  placement: "right",
  size: "md",
  Component() {
    const events = useEvents({ hz: 1, limit: 50 });
    const points = useMemo(() => {
      const last = new Map<string, { mine: number; peers: number }>();
      const out: Point[] = [];
      for (const e of events) {
        if (e.type !== "object.spawned" && e.type !== "object.transformed") continue;
        if (!("own" in e) || !e.own) continue;
        const now = { mine: e.own.netBits, peers: e.peerNetBits! };
        const before = last.get(e.objectId);
        if (before && e.type === "object.transformed") out.push({ objectId: e.objectId, dMine: now.mine - before.mine, dPeers: now.peers - before.peers, mine: e.mine });
        last.set(e.objectId, now);
      }
      return out;
    }, [events]);
    const theirs = points.filter(p => !p.mine);
    const quadrant = (f: (p: Point) => boolean) => theirs.filter(f).length;
    return (
      <div className="space-y-2" data-testid="example-opponents">
        <p className="text-[11px] opacity-70">Inference from aggregates over the last {events.length} events; not anyone's actual utility function.</p>
        <ScatterPlot width={300} height={180} xLabel="Δ my bits" yLabel="Δ others' bits"
          points={points.map((p, i) => ({ key: `${p.objectId}-${i}`, x: p.dMine, y: p.dPeers, highlight: p.mine }))} />
        <BarList format={v => String(v)} items={[
          { label: "others gain, I lose", value: quadrant(p => p.dPeers > 0 && p.dMine < 0) },
          { label: "both gain", value: quadrant(p => p.dPeers > 0 && p.dMine > 0) },
          { label: "others lose, I gain", value: quadrant(p => p.dPeers < 0 && p.dMine > 0) },
          { label: "both lose", value: quadrant(p => p.dPeers < 0 && p.dMine < 0) },
        ]} />
        <p className="text-[11px] opacity-70">Squares are your own agents' transformations. Others' changes that raise their sum while lowering yours show where your interests conflict.</p>
      </div>
    );
  },
});
