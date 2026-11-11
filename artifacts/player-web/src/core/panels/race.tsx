/**
 * Leaderboard race: who's winning and is anyone catching up. Total payoff per player over world time (you first,
 * in the primary colour and solid), or each player's gap to the leader; the current ranks underneath. The series is
 * every publication of the scoreboard, kept by the server (games.standingsHistory): the same for every viewer, from
 * the game's start, whenever the panel opens.
 */
import { useMemo } from "react";
import { LineChart, Table, useDockState, useGame, useLeaderboard, useMyCard, useStandingsHistory } from "@/sdk";
import { HANDICAP_FOOTNOTE, cardBid, cardHandicap } from "@/site/lib/bidding";
import { PanelEmpty, fmt, type PanelProps } from "./kit";

export default function Race({ params }: PanelProps<"race">) {
  const board = useLeaderboard({ hz: 1 });
  const game = useGame({ hz: 1 });
  const card = useMyCard();
  const world = game?.worldSeconds ?? 0;
  const published = useStandingsHistory(game?.gameId);
  // The history's totals are in the game's roster order (its header's roster).
  const roster = useDockState()?.roster;
  const samples = useMemo(() => published.map(r => ({ x: r.world, totals: Object.fromEntries((roster ?? []).map((id, i) => [id, r.totals[i] ?? 0])) })), [published, roster]);

  if (!board.length) return <PanelEmpty>No standings yet: they start when the world runs.</PanelEmpty>;
  const me = game?.self.godId;
  // Dealt after a bid phase somebody won (your own card says so): everyone's total is after their handicap.
  const bidGame = !!cardBid(card) || cardHandicap(card) > 0;
  const ranked = [...board].sort((a, b) => b.totalPayoff - a.totalPayoff);
  const leader = ranked[0];
  const shown = params.show === "top3" ? ranked.slice(0, 3) : params.show === "me-vs-leader" ? ranked.filter(r => r.godId === me || r.godId === leader.godId) : ranked;
  // You first, so you get the primary colour and the solid line.
  const ordered = [...shown].sort((a, b) => (a.godId === me ? -1 : b.godId === me ? 1 : 0));
  const history = samples.filter(s => s.x >= world - params.window);
  const series = ordered.map(r => ({
    label: `${r.godId === me ? "You" : r.label}${r.isAI ? " (AI)" : ""}`,
    points: history.map(s => ({ x: s.x, y: params.metric === "gap" ? (s.totals[r.godId] ?? 0) - Math.max(...Object.values(s.totals)) : s.totals[r.godId] ?? 0 })),
  }));
  return (
    <div className="space-y-4" data-testid="panel-race">
      {history.length > 1 ? <LineChart series={series} width={420} height={180} xLabel="world s" yLabel={params.metric === "gap" ? "gap to the leader" : "total payoff"} format={fmt} />
        : <p className="text-sm text-muted-foreground">The race fills in as the world runs (each time the scoreboard is published).</p>}
      <Table rows={ranked} rowKey={r => r.godId} columns={[
        { header: "#", cell: r => ranked.indexOf(r) + 1 },
        { header: "player", cell: r => <span className={r.godId === me ? "font-semibold text-primary" : ""} data-testid={`row-leader-${r.godId}`}>{r.godId === me ? `${r.label} (you)` : r.label}{r.isAI ? " · AI" : ""}</span> },
        { header: "payoff", cell: r => fmt(r.totalPayoff), align: "right" },
      ]} />
      {bidGame && <p className="text-xs text-muted-foreground" data-testid="text-handicap-footnote">{HANDICAP_FOOTNOTE}</p>}
    </div>
  );
}
