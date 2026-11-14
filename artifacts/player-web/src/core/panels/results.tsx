/**
 * How the game went: the final standings and why you finished where you did (your best and worst objects, your
 * points on them over the game, each as a product that multiplies out as displayed). In the lobby it shows the room's last finished game; the assistant may pick an
 * older one.
 */
import { useRef } from "react";
import { useDock, useDockStore } from "@/dock/store";
import { dimensionVar, productText } from "@workspace/object-views";
import { LineChart, Obj, Table, useDockState, useGame, useLeaderboard, useMyCard, useObjectsTop, useRoomInfo, useTrajectories } from "@/sdk";
import { usePastGames } from "@/core/game/past-games";
import { Link } from "@/core/navigation";
import { finishPlace, liveResultRows } from "./results-rank";
import { liveIsEstimate } from "./score-lines";
import { HANDICAP_FOOTNOTE, auctionLines, cardBid, cardHandicap, handicapLabel, handicapNote, handicapsOf } from "@/site/lib/bidding";
import { ruleName, useAuction } from "@/core/game/auction";
import { RotationNote } from "@/site/components/rotation-note";
import { BiddingNote, ObjectRef, PanelEmpty, PreparingNote, Section, fmt, referObjectId, type PanelProps } from "./kit";

/** Your ✨ rarity × how much the others want it, in the dimension colours every panel uses. */
const YOURS = dimensionVar("yours"), OTHERS = dimensionVar("others");

type Row = { id: string; name: string; isAI: boolean; total: number; rank: number };

export default function Results({ params, phase }: PanelProps<"results">) {
  const whySection = useRef<HTMLDivElement>(null);
  const store = useDockStore(), dock = useDock();
  const game = useGame({ hz: 1 });
  const board = useLeaderboard({ hz: 1 });
  const past = usePastGames();
  // Your best and worst objects by payoff, ranked by the server (player.objectsTop): never the whole world.
  const top = useObjectsTop({ gameId: game?.gameId, n: 3 }) ?? [];
  const bottom = useObjectsTop({ gameId: game?.gameId, n: 3, dir: "asc" }) ?? [];
  const trajectories = useTrajectories({ hz: 0.5 });
  const me = game?.self.godId;
  const room = useRoomInfo();
  const myCard = useMyCard();
  // The game's own word for its objects ("grid" on a Grid board), as every other line says it ("what object?", a walker asked).
  const noun = useDockState()?.instance?.objectType === "Grid" ? "grid" : "object";

  const record = params.gameId ? past?.find(g => g.id === params.gameId || g.shortCode === params.gameId) : phase === "ended" ? undefined : past?.[0];
  const live = !params.gameId && phase === "ended";
  const rows: Row[] = live
    ? liveResultRows(board)
    : (record?.leaderboard ?? []).map(r => ({ id: r.deityId, name: r.name, isAI: r.kind === "ai", total: r.totalPayoff, rank: r.rank }));
  const preparing = (phase === "lobby" || phase === "ended") && !params.gameId ? room?.preparing : null;
  const bidding = (phase === "lobby" || phase === "ended") && !params.gameId && !preparing ? room?.bidding : null;
  const next = <>{preparing && <PreparingNote preparing={preparing} />}{bidding && <BiddingNote bidding={bidding} room={room?.shortCode} />}</>;
  // This game was dealt after a bid phase somebody won (your own card says so): totals are after handicaps (docs/bid-phase.md).
  const card = live ? myCard : undefined;
  // What the game shown tells about its auction (an ended game tells everything): handicaps beside the scores, who won what.
  const auction = useAuction(live ? game?.gameId : record?.id);
  const handicaps = handicapsOf(auction);
  const handicap = cardHandicap(card), bidGame = !!cardBid(card) || handicap > 0 || !!auction;
  if (!rows.length) {
    if (params.gameId && past && !record) return <PanelEmpty>That game isn't in this room's history.</PanelEmpty>;
    return (
      <div className="space-y-4">
        {next}
        <PanelEmpty>No finished game yet. Results appear here when a game ends.</PanelEmpty>
      </div>
    );
  }
  const mine = rows.find(r => r.id === me);
  const best = top, worst = bottom.filter(o => !best.some(b => b.id === o.id));
  const ranks = new Map(best.map(o => [o.id, o.rank]));
  // A line needs two points: a game that ended at once has none worth drawing.
  const chart = best.map(o => ({ label: `#${ranks.get(o.id)}`, points: (trajectories.get(o.id) ?? []).map(p => ({ x: p.worldSeconds, y: p.payoff })) }));
  const won = auctionLines(auction, id => rows.find(r => r.id === id)?.name ?? "A player", ruleName);
  const note = mine ? handicapNote(mine.total, handicap, fmt) : null;
  const why = mine
    ? `You finished ${finishPlace(rows, mine)} of ${rows.length} with ${fmt(mine.total)} points${note ? ` (${note})` : ""}.${live && best[0] ? ` At the end, your best ${noun} gave you ${fmt(best[0].payoff)} points${worst[0] && worst[0].payoff < 0 ? `; your worst took ${fmt(-worst[0].payoff)}` : ""}.` : ""}`
    : "You didn't play in this game.";
  return (
    // The pane scrolls inside itself; the padding lets its last element scroll clear of the pane's bottom edge (the
    // replay bar sits right under the dock).
    <div className="space-y-5 pb-10" data-testid="panel-results">
      {next}
      {/* The outcome is the panel's headline; once this game has ended, the next step is the room (its next game). */}
      <p className="font-serif text-xl font-semibold leading-snug" data-testid="text-results-headline">{record ? `Game ${record.shortCode}: ` : ""}{why}</p>
      {liveIsEstimate(room?.settings) && <p className="text-xs leading-snug text-muted-foreground" data-testid="text-results-exact">Final points are counted exactly when the game ends. During the game your points were an estimate: how much the others want each object is blurred to keep their rules secret, and that usually reads high.</p>}
      {/* Its place in the rotation: whose rule you get next, and the totals over the rotation so far. */}
      <RotationNote game={live ? past?.find(g => g.id === game?.gameId) : record} history={past} me={me} />
      {live && room?.shortCode && (
        <Link to={{ kind: "room", room: room.shortCode }} className="inline-block bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground" data-testid="link-results-room">
          Back to room {room.shortCode} for the next game
        </Link>
      )}
      {dock.hiddenPanes && (
        // The ended game shows the results and the timeline only; the goal, code, agents and objects are one press away.
        <button type="button" data-testid="button-show-my-panes" onClick={() => store.showMyPanes()}
          className="ml-3 border border-[hsl(var(--input))] px-3 py-1.5 text-sm font-semibold">Show my panes</button>
      )}
      {params.section !== "standings" && live && best.length > 0 && (
        <button type="button" data-testid="button-results-why" onClick={() => whySection.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
          className="ml-3 text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground">Why: your best and worst {noun}s ↓</button>
      )}
      {params.section !== "mine" && (
        <Section title="Final standings">
          <Table rows={rows} rowKey={r => r.id} columns={[
            { header: "#", cell: r => r.rank },
            { header: "player", cell: r => <span className={r.id === me ? "font-semibold text-primary" : ""}>{r.name}{r.id === me ? " (you)" : ""}{r.isAI ? " · AI" : ""}</span> },
            ...(auction ? [{ header: "handicap", cell: (r: Row) => <span data-testid={`text-handicap-${r.id}`}>{handicapLabel(handicaps.get(r.id)) || "–"}</span>, align: "right" as const }] : []),
            { header: "points", cell: r => fmt(r.total), align: "right" },
          ]} />
          {bidGame && <p className="text-xs text-muted-foreground" data-testid="text-handicap-footnote">{HANDICAP_FOOTNOTE}</p>}
        </Section>
      )}
      {params.section !== "mine" && won.length > 0 && (
        <Section title="Bidding">
          <ul className="space-y-0.5 text-sm" data-testid="list-auction">
            {won.map(w => <li key={w.godId} className={w.godId === me ? "font-semibold" : ""}>{w.text}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">Everyone else was dealt a rule at random, with no handicap.</p>
        </Section>
      )}
      {params.section !== "standings" && live && best.length > 0 && (
        // The pane scrolls inside itself (the dock's frame), and the panes below it cut this section at the fold with
        // nothing to say so: the link above brings it into view, and the sentences come before the chart.
        <div ref={whySection} data-testid="section-results-why" className="scroll-mt-2">
        <Section title={`Why: your best and worst ${noun}s`}>
          {/* The chart first, at its own modest height (it scales down to the pane), then the objects it is about. */}
          {chart.some(c => c.points.length > 1) && <LineChart width={400} height={150} xLabel="world s" yLabel="points" format={fmt}
            series={chart} />}
          <p className="text-xs text-muted-foreground" data-testid="text-results-formula">The lines are these {noun}s' points over the game: they rise and fall as the board changes, so a peak can be higher than the end. Each {noun}'s points: your ✨ rarity × how much the others want it. Your total is every {noun}'s points added up.</p>
          <ul className="space-y-1 text-xs">
            {[...best, ...worst].map(o => ({ o, line: productText(o.own.netBits, o.peerCare, o.payoff) })).map(({ o, line }) => (
              <li key={o.id} className="flex items-center gap-2">
                {ranks.has(o.id)
                  ? <button type="button" className="w-7 text-left font-mono text-muted-foreground hover:text-foreground" onClick={() => referObjectId(o.id)}>#{ranks.get(o.id)}</button>
                  : <span className="w-7 font-mono"><ObjectRef objectId={o.id} /></span>}
                <Obj value={o.value} />
                <span className="tabular-nums" data-testid={`text-result-payoff-${o.id}`}>
                  <span style={{ color: YOURS }} title="Your ✨ rarity for this object">✨ {line.a}</span> × <span style={{ color: OTHERS }} title="How much the others want it">{line.b}</span> {line.sign}{" "}
                  <span className={o.payoff < 0 ? "text-destructive" : ""}>{line.product} points</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
        </div>
      )}
    </div>
  );
}
