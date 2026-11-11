/**
 * How the game went: the final standings and why you finished where you did (your best and worst objects, your
 * payoff on them over the game). In the lobby it shows the room's last finished game; the assistant may pick an
 * older one.
 */
import { dimensionVar } from "@workspace/object-views";
import { LineChart, Obj, Table, useGame, useLeaderboard, useObjectsTop, useRoomInfo, useTrajectories } from "@/sdk";
import { usePastGames } from "@/core/game/past-games";
import { Link } from "@/core/navigation";
import { ObjectRef, PanelEmpty, PreparingNote, Section, fmt, ordinal, referObject, type PanelProps } from "./kit";

/** Your bits × the others' care, in the dimension colours every panel uses. */
const YOURS = dimensionVar("yours"), OTHERS = dimensionVar("others");

type Row = { id: string; name: string; isAI: boolean; total: number; rank: number };

export default function Results({ params, phase }: PanelProps<"results">) {
  const game = useGame({ hz: 1 });
  const board = useLeaderboard({ hz: 1 });
  const past = usePastGames();
  // Your best and worst objects by payoff, ranked by the server (player.objectsTop): never the whole world.
  const top = useObjectsTop({ gameId: game?.gameId, n: 3 }) ?? [];
  const bottom = useObjectsTop({ gameId: game?.gameId, n: 3, dir: "asc" }) ?? [];
  const trajectories = useTrajectories({ hz: 0.5 });
  const me = game?.self.godId;
  const room = useRoomInfo();

  const record = params.gameId ? past?.find(g => g.id === params.gameId || g.shortCode === params.gameId) : phase === "ended" ? undefined : past?.[0];
  const live = !params.gameId && phase === "ended";
  const rows: Row[] = live
    ? [...board].sort((a, b) => b.totalPayoff - a.totalPayoff).map((r, i) => ({ id: r.godId, name: r.label, isAI: r.isAI, total: r.totalPayoff, rank: i + 1 }))
    : (record?.leaderboard ?? []).map(r => ({ id: r.deityId, name: r.name, isAI: r.kind === "ai", total: r.totalPayoff, rank: r.rank }));
  const preparing = (phase === "lobby" || phase === "ended") && !params.gameId ? room?.preparing : null;
  if (!rows.length) {
    if (params.gameId && past && !record) return <PanelEmpty>That game isn't in this room's history.</PanelEmpty>;
    return (
      <div className="space-y-4">
        {preparing && <PreparingNote preparing={preparing} />}
        <PanelEmpty>No finished game yet. Results appear here when a game ends.</PanelEmpty>
      </div>
    );
  }
  const mine = rows.find(r => r.id === me);
  const best = top, worst = bottom.filter(o => !best.some(b => b.id === o.id));
  const ranks = new Map(best.map(o => [o.id, o.rank]));
  const why = mine
    ? `You finished ${ordinal(mine.rank)} of ${rows.length} with ${fmt(mine.total)} bits of payoff.${live && best[0] ? ` Your best object paid ${fmt(best[0].payoff)}${worst[0] && worst[0].payoff < 0 ? `; your worst cost ${fmt(-worst[0].payoff)}` : ""}.` : ""}`
    : "You didn't play in this game.";
  return (
    <div className="space-y-5" data-testid="panel-results">
      {preparing && <PreparingNote preparing={preparing} />}
      {/* The outcome is the panel's headline; once this game has ended, the next step is the room (its next game). */}
      <p className="font-serif text-xl font-semibold leading-snug" data-testid="text-results-headline">{record ? `Game ${record.shortCode}: ` : ""}{why}</p>
      {live && room?.shortCode && (
        <Link to={{ kind: "room", room: room.shortCode }} className="inline-block bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground" data-testid="link-results-room">
          Back to room {room.shortCode} for the next game
        </Link>
      )}
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
                {ranks.has(o.id)
                  ? <button type="button" className="w-7 text-left font-mono text-muted-foreground hover:text-foreground" onClick={() => referObject(ranks.get(o.id))}>#{ranks.get(o.id)}</button>
                  : <span className="w-7 font-mono"><ObjectRef objectId={o.id} /></span>}
                <Obj value={o.value} />
                <span className="tabular-nums" data-testid={`text-result-payoff-${o.id}`}>
                  <span style={{ color: YOURS }}>{fmt(o.own.netBits)}</span> × <span style={{ color: OTHERS }}>{fmt(o.peerCare)}</span> ={" "}
                  <span className={o.payoff < 0 ? "text-destructive" : ""}>payoff {fmt(o.payoff)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
