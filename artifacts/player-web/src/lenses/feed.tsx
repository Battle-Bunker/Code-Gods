/**
 * What just changed: the latest changes to the world, newest first, and what each did to you (Δ your bits, Δ the
 * others'). Your own agents' changes also show their moves and cost. Grouped by mutator, it becomes the "cost vs
 * yield" table of your moves.
 */
import { useMemo } from "react";
import { TransformationView } from "@workspace/object-views";
import { Table, fmtBits, useEvents, useMutators, useObjectContext, useObjects, useObservation, type GameEvent } from "@/sdk";
import { LensEmpty, Section, referObject, useObjectRanks, type LensProps } from "./kit";

type Change = {
  key: string; objectId: string; agentId?: string; before: unknown; after: unknown; mine: boolean;
  dMine?: number; dOthers?: number; calls?: readonly (readonly [string, unknown])[]; cost?: number; world?: number;
};
type Transformed = Extract<GameEvent, { type: "object.transformed" }>;
const costOf = (cost: unknown) => (typeof cost === "number" ? cost : typeof cost === "object" && cost ? (cost as { total?: number }).total : undefined);

export default function Feed({ params }: LensProps<"feed">) {
  const obs = useObservation({ hz: 1 });
  const events = useEvents({ hz: 1, limit: 50 });
  const objects = useObjects({ hz: 1 });
  const ranks = useObjectRanks(objects);
  const { mutators } = useMutators();
  const { ctx } = useObjectContext();

  const changes = useMemo((): Change[] => {
    if (params.who === "mine") {
      // Your own agents' transformations, as the engine reports them to you.
      return (obs?.transformations ?? []).map(t => ({ key: t.id, objectId: "", agentId: t.agentId, before: t.before, after: t.after, mine: true, calls: t.calls, cost: t.cost }));
    }
    const last = new Map<string, { mine: number; others: number }>();
    const out: Change[] = [];
    for (const e of events as (GameEvent & { seq?: number })[]) {
      if (e.type !== "object.spawned" && e.type !== "object.transformed") continue;
      const scored = "own" in e && e.own ? { mine: e.own.netBits, others: e.peerNetBits ?? 0 } : null;
      const before = last.get(e.objectId);
      if (scored) last.set(e.objectId, scored);
      if (e.type !== "object.transformed") continue;
      const t = e as Transformed;
      if (params.who === "others" && t.mine) continue;
      out.push({
        key: `${e.seq ?? ""}-${t.objectId}-${t.version}`, objectId: t.objectId, agentId: t.agentId, before: t.before, after: t.value, mine: t.mine, world: t.worldSeconds,
        ...(scored && before ? { dMine: scored.mine - before.mine, dOthers: scored.others - before.others } : {}),
        ...(t.mine && t.calls ? { calls: t.calls as Change["calls"], cost: costOf(t.cost) } : {}),
      });
    }
    return out.reverse();
  }, [params.who, obs?.transformations, events]);

  const filtered = changes.filter(c => (!params.objectId || c.objectId === params.objectId) && (params.minImpact <= 0 || c.dMine === undefined || Math.abs(c.dMine) >= params.minImpact))
    .slice(0, params.limit);

  if (!filtered.length) return <LensEmpty>{params.who === "mine" ? "Your agents haven't changed anything yet." : "No changes yet: they appear once agents act in a running world."}</LensEmpty>;

  if (params.groupBy === "mutator") {
    const stats = new Map<string, { id: string; name: string; acts: number; cost: number; dMine: number }>(mutators.map(m => [m.id, { id: m.id, name: `${m.emoji} ${m.name}`, acts: 0, cost: 0, dMine: 0 }]));
    for (const c of changes.filter(x => x.mine && x.calls)) {
      const ids = [...new Set(c.calls!.map(call => call[0]))];
      for (const id of ids) {
        const row = stats.get(id) ?? { id, name: id, acts: 0, cost: 0, dMine: 0 };
        row.acts++; row.cost += (c.cost ?? 0) / ids.length; row.dMine += c.dMine ?? 0;
        stats.set(id, row);
      }
    }
    const rows = [...stats.values()].sort((a, b) => b.acts - a.acts || a.name.localeCompare(b.name));
    const avg = (total: number, n: number) => (n ? fmtBits(total / n) : "–");
    return (
      <Section title="Your moves: cost against yield">
        <Table rows={rows} rowKey={r => r.id} columns={[
          { header: "mutator", cell: r => r.name }, { header: "acts", cell: r => r.acts, align: "right" },
          { header: "bits per act", cell: r => avg(r.cost, r.acts), align: "right" }, { header: "Δ yours per act", cell: r => avg(r.dMine, r.acts), align: "right" },
        ]} />
      </Section>
    );
  }

  const row = (c: Change) => (
    <li key={c.key} data-testid={`row-transformation-${c.key}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 font-mono text-xs">
      <span className={`w-14 shrink-0 ${c.mine ? "font-semibold" : "text-muted-foreground"}`}>{c.mine ? "yours" : "others'"}</span>
      {c.objectId && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => referObject(ranks.get(c.objectId))}>{ranks.get(c.objectId) ? `#${ranks.get(c.objectId)}` : "gone"}</button>}
      <TransformationView before={c.before as never} after={c.after as never} {...ctx} />
      {c.dMine !== undefined && <span className={c.dMine > 0 ? "text-[hsl(var(--accent))]" : c.dMine < 0 ? "text-destructive" : "text-muted-foreground"}>Δ yours {c.dMine >= 0 ? "+" : ""}{fmtBits(c.dMine)}</span>}
      {c.dOthers !== undefined && <span className="text-muted-foreground">Δ others {c.dOthers >= 0 ? "+" : ""}{fmtBits(c.dOthers)}</span>}
      {c.calls && <span className="basis-full text-muted-foreground sm:basis-auto">{c.calls.map(call => call[0]).join("; ")}{c.cost !== undefined ? ` · ${fmtBits(c.cost)} bits` : ""}</span>}
    </li>
  );
  if (params.groupBy === "object") {
    const groups = new Map<string, Change[]>();
    for (const c of filtered) groups.set(c.objectId, [...(groups.get(c.objectId) ?? []), c]);
    return (
      <div className="space-y-4">
        {[...groups.entries()].map(([objectId, list]) => (
          <Section key={objectId || "mine"} title={ranks.get(objectId) ? `Object #${ranks.get(objectId)}` : "An object no longer alive"} aside={list.length}>
            <ul className="divide-y divide-[hsl(var(--card-border))]">{list.map(row)}</ul>
          </Section>
        ))}
      </div>
    );
  }
  return <ul className="divide-y divide-[hsl(var(--card-border))]">{filtered.map(row)}</ul>;
}
