/**
 * Salient to others, not to me: objects the other gods care about (high peer care) while your own
 * net bits are at or below zero. Bargaining chips: you lose little by letting them be shaped.
 */
import { definePanel, ScatterPlot, Table, Obj, useObjects, fmtBits } from "@sdk";

export default definePanel({
  title: "Salient to others, not me",
  placement: "right",
  size: "md",
  Component() {
    const objects = useObjects({ hz: 1 });
    const chips = objects.filter(o => o.peerCare > 0 && o.own.netBits <= 0).sort((a, b) => b.peerCare - a.peerCare);
    return (
      <div className="space-y-2" data-testid="example-salient">
        <ScatterPlot width={300} height={180} xLabel="my net bits" yLabel="peers' net bits"
          points={objects.map(o => ({ key: o.id, x: o.own.netBits, y: o.peerNetBits, highlight: o.peerCare > 0 && o.own.netBits <= 0,
            label: `mine ${fmtBits(o.own.netBits)}, peers ${fmtBits(o.peerNetBits)}` }))} />
        <p className="text-[11px] opacity-70">{chips.length} of {objects.length} objects matter to the others but not to you (squares).</p>
        <Table rows={chips} rowKey={o => o.id} max={8} columns={[
          { header: "object", cell: o => <Obj value={o.value} /> },
          { header: "peer care", cell: o => fmtBits(o.peerCare), align: "right" },
          { header: "mine", cell: o => fmtBits(o.own.netBits), align: "right" },
        ]} />
      </div>
    );
  },
});
