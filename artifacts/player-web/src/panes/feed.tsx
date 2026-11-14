/**
 * "What just changed", the act log (integration plan §1.6, §3.4; ux-lessons 2.2, 2.3): the moves that concern the
 * viewer, newest first, one sentence each (move-line.ts) from the `v2Moves` row, with the line before → after written
 * by v2-views in the representation that changed. Older pages load on request; every loaded page stays live.
 */
import { createContext, useContext, useMemo } from "react";
import { lineType, type LineState } from "@workspace/v2-linear";
import { chipRep, repText } from "@workspace/v2-views";
import { decodeState, useGame, useGameScope, useMoves, useMyAgents, useMyRule, variantOf, type Move } from "@/sdk";
import { clock, num } from "@/core/words";
import { callWords, moveSentence, moveWho } from "./move-line";
import { foldTugs, tugSentence, type FeedItem } from "./tug-of-war";
import { noteLines } from "./move-notes";

/** What your agents noted for you, by move (each note once, on its newest move). */
const NotesContext = createContext<ReadonlyMap<number, string[]>>(new Map());

/** The line's written form in the representation the move changed (an equation that expresses it, else the first that does). */
function lineText(state: LineState, rep: string, site: number): string {
  return repText(lineType, state, chipRep(lineType, state, rep, site), site);
}

function MoveRow({ move, names, top, variant }: { move: Move; names: ReadonlyMap<string, string>; top: number | null; variant: string }) {
  const notes = useContext(NotesContext).get(move.seq);
  const text = useMemo(() => {
    const site = move.calls[0]?.site ?? 0;
    let change: { before: string; after: string } | null = null;
    try { change = { before: lineText(decodeState(move.stateBefore), move.rep, site), after: lineText(decodeState(move.stateAfter), move.rep, site) }; } catch { change = null; }
    return moveSentence({
      who: moveWho(move, move.agentId ? names.get(move.agentId) : null),
      change, what: callWords(move.calls, variantOf(variant)), before: move.before, after: move.after, top,
    });
  }, [move, names, top, variant]);
  return (
    <li className={`space-y-0.5 px-4 py-2 ${move.mine ? "" : "text-muted-foreground"}`} data-testid={`row-move-${move.seq}`} data-mine={move.mine || undefined}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {clock(move.worldSeconds)}{move.mine && move.charge !== null ? ` · this move cost ${num(move.charge)} ⚡` : ""}
      </p>
      <p className="text-sm text-foreground" data-testid="text-move-line">{text}</p>
      {notes?.map(n => <p key={n} className="border-l-2 border-primary/50 pl-2 text-sm italic text-foreground" data-testid="text-move-note">Your agent says: {n}</p>)}
    </li>
  );
}

/** A back-and-forth on one line, folded: who pulls, how often, what it cost, and to talk; its moves on request. */
function TugRow({ tug, names, top, variant, kinds }: { tug: Extract<FeedItem<Move>, { kind: "tug" }>; names: ReadonlyMap<string, string>; top: number | null; variant: string; kinds: ReadonlyMap<string, string> }) {
  // Its moves' notes show on the entry itself: the moves are folded away below.
  const notesBySeq = useContext(NotesContext);
  const tugNotes = [...new Set(tug.moves.flatMap(m => notesBySeq.get(m.seq) ?? []))];
  return (
    <li className="space-y-1 border-l-4 border-destructive/60 px-4 py-2" data-testid={`row-tug-${tug.objectId}`}>
      <p className="text-xs text-muted-foreground tabular-nums">{clock(tug.to)} · contested line</p>
      <p className="text-sm text-foreground" data-testid="text-tug-line">{tugSentence(tug, kinds)}</p>
      {tugNotes.map(n => <p key={n} className="border-l-2 border-primary/50 pl-2 text-sm italic text-foreground" data-testid="text-move-note">Your agent says: {n}</p>)}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4">Show the {tug.moves.length} moves</summary>
        <ol className="divide-y">{tug.moves.map(m => <MoveRow key={m.seq} move={m} names={names} top={top} variant={variant} />)}</ol>
      </details>
    </li>
  );
}

export function FeedPane() {
  const header = useGame();
  const { seated } = useGameScope();
  const rule = useMyRule();
  const agents = useMyAgents();
  const moves = useMoves();
  const names = useMemo(() => new Map((agents ?? []).map(a => [a.agentId as string, a.name])), [agents]);
  const items = useMemo(() => foldTugs(moves.results), [moves.results]);
  const notes = useMemo(() => noteLines(moves.results.map(m => ({ seq: m.seq, agentId: m.agentId, notes: m.notes }))), [moves.results]);
  // Who each seat is (a person, a practice partner, an AI player): practice partners read no chat.
  const kinds = useMemo(() => new Map((header?.roster ?? []).map(r => [r.memberId as string, r.kind as string])), [header?.roster]);
  if (!header) return null;
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="feed-spectator">Each player sees the moves that changed their own points here. You're watching, so there are none to show.</p>;
  const top = rule ? Math.max(0, ...rule.row.ladder.map(r => r.level)) : null;
  if (moves.status === "LoadingFirstPage") return null;
  if (moves.results.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="feed-empty">
        {header.phase === "planning" ? "Nothing has moved yet: the world starts after planning. " : "Nothing has changed your points yet. "}
        Each time your agent moves a line, or another player's move changes your points on a line, it appears here: what changed, the step on
        your goal, your rarity in bits, and why your points moved: your bits × the others' bits.
      </p>
    );
  }
  return (
    <div data-testid="feed">
      <NotesContext.Provider value={notes}>
      <ol className="divide-y">
        {items.map(i => i.kind === "tug"
          ? <TugRow key={`tug-${i.moves[0]!.seq}`} tug={i} names={names} top={top} variant={header.variant} kinds={kinds} />
          : <MoveRow key={i.move.seq} move={i.move} names={names} top={top} variant={header.variant} />)}
      </ol>
      </NotesContext.Provider>
      {moves.status === "CanLoadMore" && (
        <button type="button" className="w-full border-t py-2 text-xs underline underline-offset-4 text-muted-foreground" onClick={() => moves.loadMore(30)} data-testid="button-feed-earlier">Earlier moves</button>
      )}
      {moves.status === "LoadingMore" && <p className="border-t py-2 text-center text-xs text-muted-foreground">Loading earlier moves…</p>}
    </div>
  );
}
