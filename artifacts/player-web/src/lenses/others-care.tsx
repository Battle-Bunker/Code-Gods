/**
 * What others care about, inferred from totals only: you never see another player's goal, only the sum of the
 * others' bits. Snapshot: every object as (your bits, others' bits). Movements: how recent changes moved the two.
 * The assistant may highlight a quadrant: bargaining chips, conflicts or shared interests.
 */
import { useMemo } from "react";
import { BarList, Obj, ScatterPlot, Table, fmtBits, useEvents, useObjects, type LiveObject } from "@/sdk";
import { LensEmpty, Section, referObject, useObjectRanks, type LensProps } from "./kit";

type Quadrant = "chips" | "conflict" | "shared";
const IN: Record<Quadrant, (mine: number, others: number) => boolean> = {
  chips: (mine, others) => others > 0 && mine <= 0,
  conflict: (mine, others) => (mine > 0 && others < 0) || (mine < 0 && others > 0),
  shared: (mine, others) => mine > 0 && others > 0,
};
const LABEL: Record<Quadrant, string> = { chips: "Others care, you don't: bargaining chips", conflict: "Opposed interests", shared: "You both care" };

export default function OthersCare({ params }: LensProps<"others-care">) {
  const objects = useObjects({ hz: 1 });
  const ranks = useObjectRanks(objects);
  const events = useEvents({ hz: 1, limit: params.window });
  const quadrant = params.quadrant === "none" ? null : params.quadrant;
  const moves = useMemo(() => {
    const last = new Map<string, { mine: number; peers: number }>();
    const out: { objectId: string; dMine: number; dPeers: number; mine: boolean }[] = [];
    for (const e of events) {
      if ((e.type !== "object.spawned" && e.type !== "object.transformed") || !("own" in e) || !e.own) continue;
      const now = { mine: e.own.netBits, peers: e.peerNetBits! };
      const before = last.get(e.objectId);
      if (before && e.type === "object.transformed") out.push({ objectId: e.objectId, dMine: now.mine - before.mine, dPeers: now.peers - before.peers, mine: e.mine });
      last.set(e.objectId, now);
    }
    return out;
  }, [events]);

  if (!objects.length) return <LensEmpty>No objects yet: the others' interests show once the world runs.</LensEmpty>;
  const caption = <p className="text-xs text-muted-foreground">Inferred from totals, not anyone's actual goal.</p>;
  if (params.mode === "movements") {
    const theirs = moves.filter(m => !m.mine);
    const count = (q: Quadrant) => theirs.filter(m => IN[q](m.dMine, m.dPeers)).length;
    return (
      <div className="space-y-3">
        {caption}
        {moves.length === 0 ? <p className="text-sm text-muted-foreground">No changes in the last {params.window} ticks.</p> : (
          <ScatterPlot width={320} height={200} xLabel="Δ your bits" yLabel="Δ others' bits"
            points={moves.map((m, i) => ({ key: `${m.objectId}-${i}`, x: m.dMine, y: m.dPeers, highlight: quadrant ? IN[quadrant](m.dMine, m.dPeers) : m.mine }))} />
        )}
        <BarList format={v => String(v)} items={(["shared", "conflict", "chips"] as const).map(q => ({ key: q, label: LABEL[q], value: count(q) }))} />
        <p className="text-xs text-muted-foreground">Squares are {quadrant ? "the highlighted kind of change" : "your own agents' changes"}. Changes others make that raise their total while lowering yours show where you conflict.</p>
      </div>
    );
  }
  const inQuadrant = (o: LiveObject) => (quadrant ? IN[quadrant](o.own.netBits, o.peerNetBits) : false);
  const listed = quadrant ? objects.filter(inQuadrant).sort((a, b) => b.peerCare - a.peerCare) : [];
  return (
    <div className="space-y-3">
      {caption}
      <ScatterPlot width={320} height={200} xLabel="your bits" yLabel="others' bits" onSelect={id => referObject(ranks.get(id))}
        points={objects.map(o => ({ key: o.id, x: o.own.netBits, y: o.peerNetBits, highlight: inQuadrant(o), label: `#${ranks.get(o.id)}: yours ${fmtBits(o.own.netBits)}, others ${fmtBits(o.peerNetBits)}` }))} />
      <BarList format={v => String(v)} items={(["shared", "conflict", "chips"] as const).map(q => ({ key: q, label: LABEL[q], value: objects.filter(o => IN[q](o.own.netBits, o.peerNetBits)).length }))} />
      {quadrant && (
        <Section title={LABEL[quadrant]} aside={listed.length}>
          <Table rows={listed} rowKey={o => o.id} max={8} onRowClick={o => referObject(ranks.get(o.id))} columns={[
            { header: "#", cell: o => ranks.get(o.id) },
            { header: "object", cell: o => <Obj value={o.value} /> },
            { header: "others", cell: o => fmtBits(o.peerNetBits), align: "right" },
            { header: "yours", cell: o => fmtBits(o.own.netBits), align: "right" },
          ]} />
        </Section>
      )}
    </div>
  );
}
