/**
 * Mutator cost vs yield. From YOUR agents' transformations (only an agent's owner sees its calls and
 * costs): for each mutator, how many acts used it, what an act cost in bits, and how much your own net
 * bits and payoff changed on the object. Mutators you have not tried yet are listed from the catalogue.
 */
import { useMemo } from "react";
import { definePanel, Table, useEvents, useMutators, fmtBits } from "@sdk";

type Row = { id: string; name: string; emoji: string; acts: number; cost: number; dMine: number; dPayoff: number };

export default definePanel({
  title: "Mutator cost vs yield",
  placement: "left",
  size: "md",
  Component() {
    const { mutators } = useMutators();
    const events = useEvents({ hz: 1, limit: 50 });
    const rows = useMemo(() => {
      const last = new Map<string, { mine: number; payoff: number }>();
      const stats = new Map<string, Row>(mutators.map(m => [m.id, { id: m.id, name: m.name, emoji: m.emoji, acts: 0, cost: 0, dMine: 0, dPayoff: 0 }]));
      for (const e of events) {
        if ((e.type !== "object.spawned" && e.type !== "object.transformed") || !("own" in e) || !e.own) continue;
        const now = { mine: e.own.netBits, payoff: e.payoff! };
        const before = last.get(e.objectId);
        last.set(e.objectId, now);
        if (e.type !== "object.transformed" || !e.mine || !before || !e.calls) continue;
        const ids = [...new Set((e.calls as [string, unknown][]).map(c => c[0]))];
        const cost = typeof e.cost === "object" && e.cost ? (e.cost as { total: number }).total : 0;
        for (const id of ids) {
          const row = stats.get(id) ?? { id, name: id, emoji: "", acts: 0, cost: 0, dMine: 0, dPayoff: 0 };
          row.acts++; row.cost += cost / ids.length; row.dMine += now.mine - before.mine; row.dPayoff += now.payoff - before.payoff;
          stats.set(id, row);
        }
      }
      return [...stats.values()].sort((a, b) => b.acts - a.acts || a.name.localeCompare(b.name));
    }, [events, mutators]);
    const avg = (total: number, n: number) => (n ? fmtBits(total / n) : "–");
    return (
      <div data-testid="example-mutators">
        <Table rows={rows} rowKey={r => r.id} columns={[
          { header: "mutator", cell: r => `${r.emoji} ${r.name}` },
          { header: "acts", cell: r => r.acts, align: "right" },
          { header: "bits/act", cell: r => avg(r.cost, r.acts), align: "right" },
          { header: "Δ mine/act", cell: r => avg(r.dMine, r.acts), align: "right" },
          { header: "Δ payoff/act", cell: r => avg(r.dPayoff, r.acts), align: "right" },
        ]} />
        <p className="mt-1 text-[11px] opacity-70">Over the last 50 engine ticks. Yield is measured on the object each act changed.</p>
      </div>
    );
  },
});
