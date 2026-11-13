/**
 * Leaderboard race: who's winning and is anyone catching up. Total points per player over world time (you first,
 * in the primary colour and solid), or each player's gap to the leader; the current ranks underneath. The series is
 * every publication of the scoreboard, kept by the server (games.standingsHistory): the same for every viewer, from
 * the game's start, whenever the panel opens.
 */
import { useMemo } from "react";
import { LineChart, Table, useDockState, useGame, useLeaderboard, useMyCard, useStandingsHistory } from "@/sdk";
import { HANDICAP_FOOTNOTE, cardBid, cardHandicap, handicapLabel, handicapsOf } from "@/site/lib/bidding";
import { useAuction } from "@/core/game/auction";
import { PanelEmpty, fmt, type PanelProps } from "./kit";
import { useMyTotals, useMyUtility, useStandings } from "@/sdk/hooks";
import { useReplaySource } from "@/sdk/replay-source";
import { fresherPoints } from "./score-line";
import { ownNow, publishedLine } from "./race-text";

export default function Race({ params }: PanelProps<"race">) {
  const board = useLeaderboard({ hz: 1 });
  const game = useGame({ hz: 1 });
  const card = useMyCard();
  // The players' handicaps, when this game tells them (its setup's bid disclosure, or it has ended).
  const auction = useAuction(game?.gameId);
  const handicaps = handicapsOf(auction);
  const world = game?.worldSeconds ?? 0;
  const published = useStandingsHistory(game?.gameId);
  // The history's totals are in the game's roster order (its header's roster).
  const roster = useDockState()?.roster;
  const samples = useMemo(() => published.map(r => ({ x: r.world, totals: Object.fromEntries((roster ?? []).map((id, i) => [id, r.totals[i] ?? 0])) })), [published, roster]);

  // The scoreboard is as last PUBLISHED: its age and the next publication are said, and the player's own row may
  // carry the fresher figure the page already holds (the same one "Your points now" shows), marked "now".
  const standings = useStandings(game?.gameId);
  const totals = useMyTotals(game?.gameId);
  // The interval of THIS game (your own utility's query carries the game's settings; the room's are the next game's).
  // A viewer with no seat has none here: the line then says only the age.
  const interval = (useMyUtility()?.settings as { scoreIntervalSeconds?: number } | undefined)?.scoreIntervalSeconds;
  // A replay shows a past moment: nothing is "published N s ago" there.
  const replay = useReplaySource();
  const phase = useDockState()?.phase;
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
  const mine = board.find(r => r.godId === me);
  const now = mine && phase !== "ended" && !replay ? ownNow({ published: mine.totalPayoff, publishedAt: standings?.world, fresher: fresherPoints([totals && { score: totals.score, world: totals.world }]), format: fmt }) : null;
  const age = replay ? (phase === "ended" ? "Final scores." : null) : publishedLine({ worldNow: world, publishedAt: standings?.world, interval, ended: phase === "ended" });
  return (
    <div className="space-y-4" data-testid="panel-race">
      {age && <p className="text-xs text-muted-foreground" data-testid="text-race-published">{age}</p>}
      {history.length > 1 ? <LineChart series={series} width={420} height={180} xLabel="world s" yLabel={params.metric === "gap" ? "gap to the leader" : "total points"} format={fmt} />
        : <p className="text-sm text-muted-foreground">The race fills in as the world runs (each time the scoreboard is published).</p>}
      <Table rows={ranked} rowKey={r => r.godId} columns={[
        { header: "#", cell: r => ranked.indexOf(r) + 1 },
        { header: "player", cell: r => <span className={r.godId === me ? "font-semibold text-primary" : ""} data-testid={`row-leader-${r.godId}`}>{r.godId === me ? `${r.label} (you)` : r.label}{r.isAI ? " · AI" : ""}</span> },
        ...(auction ? [{ header: "handicap", cell: (r: typeof ranked[number]) => <span data-testid={`text-handicap-${r.godId}`}>{handicapLabel(handicaps.get(r.godId)) || "–"}</span>, align: "right" as const }] : []),
        { header: "points", cell: r => <>{fmt(r.totalPayoff)}{r.godId === me && now && <span className="ml-2 text-muted-foreground" data-testid="text-race-own-now">({now} now)</span>}</>, align: "right" },
      ]} />
      {(bidGame || auction) && <p className="text-xs text-muted-foreground" data-testid="text-handicap-footnote">{HANDICAP_FOOTNOTE}</p>}
    </div>
  );
}
