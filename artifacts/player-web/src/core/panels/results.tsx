/**
 * How the game went: the final standings and why you finished where you did (your best and worst objects, your
 * payoff on them over the game). In the lobby it shows the room's last finished game; the assistant may pick an
 * older one.
 */
import { LineChart, Obj, Table, useGame, useLeaderboard, useObjects, useTrajectories } from "@/sdk";
import { usePastGames } from "@/core/game/past-games";
import { PanelEmpty, Section, fmt, ordinal, referObject, useObjectRanks, type PanelProps } from "./kit";

type Row = { id: string; name: string; isAI: boolean; total: number; rank: number };

export default function Results({ params, phase }: PanelProps<"results">) {
  const game = useGame({ hz: 1 });
  const board = useLeaderboard({ hz: 1 });
  const past = usePastGames();
  const objects = useObjects({ hz: 1 });
  const ranks = useObjectRanks(objects);
  const trajectories = useTrajectories({ hz: 0.5 });
  const me = game?.self.godId;

  const record = params.gameId ? past?.find(g => g.id === params.gameId || g.shortCode === params.gameId) : phase === "ended" ? undefined : past?.[0];
  const live = !params.gameId && phase === "ended";
  const rows: Row[] = live
    ? [...board].sort((a, b) => b.totalPayoff - a.totalPayoff).map((r, i) => ({ id: r.godId, name: r.label, isAI: r.isAI, total: r.totalPayoff, rank: i + 1 }))
    : (record?.leaderboard ?? []).map(r => ({ id: r.deityId, name: r.name, isAI: r.kind === "ai", total: r.totalPayoff, rank: r.rank }));
  if (!rows.length) {
    if (params.gameId && past && !record) return <PanelEmpty>That game isn't in this room's history.</PanelEmpty>;
    return <PanelEmpty>No finished game yet. Results appear here when a game ends.</PanelEmpty>;
  }
  const mine = rows.find(r => r.id === me);
  const sorted = [...objects].sort((a, b) => b.payoff - a.payoff);
  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse().filter(o => !best.includes(o));
  const why = mine
    ? `You finished ${ordinal(mine.rank)} of ${rows.length} with ${fmt(mine.total)} bits of payoff.${live && best[0] ? ` Your best object paid ${fmt(best[0].payoff)}${worst[0] && worst[0].payoff < 0 ? `; your worst cost ${fmt(-worst[0].payoff)}` : ""}.` : ""}`
    : "You didn't play in this game.";
  return (
    <div className="space-y-5" data-testid="panel-results">
      <p className="text-base">{record ? `Game ${record.shortCode}: ` : ""}{why}</p>
      {params.section !== "mine" && (
        <Section title="Final standings">
          <Table rows={rows} rowKey={r => r.id} columns={[
            { header: "#", cell: r => r.rank },
            { header: "player", cell: r => <span className={r.id === me ? "font-semibold text-primary" : ""}>{r.name}{r.id === me ? " (you)" : ""}{r.isAI ? " · AI" : ""}</span> },
            { header: "payoff", cell: r => fmt(r.total), align: "right" },
          ]} />
        </Section>
      )}
      {params.section !== "standings" && live && best.length > 0 && (
        <Section title="Why: your best and worst objects">
          <LineChart width={400} height={150} xLabel="world s" yLabel="payoff"
            series={best.map(o => ({ label: `#${ranks.get(o.id)}`, points: (trajectories.get(o.id) ?? []).map(p => ({ x: p.worldSeconds, y: p.payoff })) }))} />
          <ul className="space-y-1 text-xs">
            {[...best, ...worst].map(o => (
              <li key={o.id} className="flex items-center gap-2">
                <button type="button" className="w-7 text-left font-mono text-muted-foreground hover:text-foreground" onClick={() => referObject(ranks.get(o.id))}>#{ranks.get(o.id)}</button>
                <Obj value={o.value} /><span className={`tabular-nums ${o.payoff < 0 ? "text-destructive" : ""}`}>payoff {fmt(o.payoff)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
