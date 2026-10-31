/**
 * Leaderboard race: who's winning and is anyone catching up. Total payoff per player over world time (you first,
 * in the primary colour and solid), or each player's gap to the leader; the current ranks underneath. Standings are
 * sampled once a second while a race panel is open (kept per game across panel switches).
 */
import { useEffect, useState } from "react";
import { LineChart, Table, useGame, useLeaderboard } from "@/sdk";
import { PanelEmpty, fmt, type PanelProps } from "./kit";

type Sample = { x: number; totals: Record<string, number> };
const samples = new Map<string, Sample[]>();

export default function Race({ params }: PanelProps<"race">) {
  const board = useLeaderboard({ hz: 1 });
  const game = useGame({ hz: 1 });
  const [, redraw] = useState(0);
  const key = game?.gameId ?? "";
  const world = game?.worldSeconds ?? 0;
  useEffect(() => {
    if (!key || !board.length) return;
    for (const k of [...samples.keys()]) if (k !== key) samples.delete(k);   // past games' samples go
    const list = samples.get(key) ?? [];
    if (list.at(-1)?.x !== world) list.push({ x: world, totals: Object.fromEntries(board.map(r => [r.godId, r.totalPayoff])) });
    samples.set(key, list.slice(-3600));
    redraw(n => n + 1);
  }, [board, world, key]);

  if (!board.length) return <PanelEmpty>No standings yet: they start when the world runs.</PanelEmpty>;
  const me = game?.self.godId;
  const ranked = [...board].sort((a, b) => b.totalPayoff - a.totalPayoff);
  const leader = ranked[0];
  const shown = params.show === "top3" ? ranked.slice(0, 3) : params.show === "me-vs-leader" ? ranked.filter(r => r.godId === me || r.godId === leader.godId) : ranked;
  // You first, so you get the primary colour and the solid line.
  const ordered = [...shown].sort((a, b) => (a.godId === me ? -1 : b.godId === me ? 1 : 0));
  const history = (samples.get(key) ?? []).filter(s => s.x >= world - params.window);
  const series = ordered.map(r => ({
    label: `${r.godId === me ? "You" : r.label}${r.isAI ? " (AI)" : ""}`,
    points: history.map(s => ({ x: s.x, y: params.metric === "gap" ? (s.totals[r.godId] ?? 0) - Math.max(...Object.values(s.totals)) : s.totals[r.godId] ?? 0 })),
  }));
  return (
    <div className="space-y-4" data-testid="panel-race">
      {history.length > 1 ? <LineChart series={series} width={420} height={180} xLabel="world s" yLabel={params.metric === "gap" ? "gap to the leader" : "total payoff"} format={fmt} />
        : <p className="text-sm text-muted-foreground">The race fills in as the world runs (sampled once a second while this panel is open).</p>}
      <Table rows={ranked} rowKey={r => r.godId} columns={[
        { header: "#", cell: r => ranked.indexOf(r) + 1 },
        { header: "player", cell: r => <span className={r.godId === me ? "font-semibold text-primary" : ""} data-testid={`row-leader-${r.godId}`}>{r.godId === me ? `${r.label} (you)` : r.label}{r.isAI ? " · AI" : ""}</span> },
        { header: "payoff", cell: r => fmt(r.totalPayoff), align: "right" },
      ]} />
    </div>
  );
}
