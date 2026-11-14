/**
 * "What just changed", the act log (integration plan §1.6, §3.4; ux-lessons 2.2, 2.3): the moves that concern the
 * viewer, newest first, one sentence each (move-line.ts) from the `v2Moves` row, with the line before → after written
 * by v2-views in the representation that changed. Older pages load on request; every loaded page stays live.
 */
import { useMemo } from "react";
import { lineType, type LineState } from "@workspace/v2-linear";
import { chipRep, repText } from "@workspace/v2-views";
import { decodeState, useGame, useGameScope, useMoves, useMyAgents, useMyRule, variantOf, type Move } from "@/sdk";
import { clock } from "@/core/words";
import { callWords, moveSentence, moveWho, one } from "./move-line";

/** The line's written form in the representation the move changed (an equation that expresses it, else the first that does). */
function lineText(state: LineState, rep: string, site: number): string {
  return repText(lineType, state, chipRep(lineType, state, rep, site), site);
}

function MoveRow({ move, names, top, variant }: { move: Move; names: ReadonlyMap<string, string>; top: number | null; variant: string }) {
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
        {clock(move.worldSeconds)}{move.mine && move.charge !== null ? ` · this move cost ${one(move.charge)} ⚡` : ""}
      </p>
      <p className="text-sm text-foreground" data-testid="text-move-line">{text}</p>
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
  if (!header) return null;
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="feed-spectator">Each player sees the moves that changed their own points here. You're watching, so there are none to show.</p>;
  const top = rule ? Math.max(0, ...rule.row.ladder.map(r => r.level)) : null;
  if (moves.status === "LoadingFirstPage") return null;
  if (moves.results.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="feed-empty">
        {header.phase === "planning" ? "Nothing has moved yet: the world starts after planning. " : "Nothing has changed your points yet. "}
        Each time your agent moves a line, or another player's move changes your points on a line, it appears here: what changed, the step on
        your goal, the ✨ rarity, and why your points moved.
      </p>
    );
  }
  return (
    <div data-testid="feed">
      <ol className="divide-y">
        {moves.results.map(m => <MoveRow key={m.seq} move={m} names={names} top={top} variant={header.variant} />)}
      </ol>
      {moves.status === "CanLoadMore" && (
        <button type="button" className="w-full border-t py-2 text-xs underline underline-offset-4 text-muted-foreground" onClick={() => moves.loadMore(30)} data-testid="button-feed-earlier">Earlier moves</button>
      )}
      {moves.status === "LoadingMore" && <p className="border-t py-2 text-center text-xs text-muted-foreground">Loading earlier moves…</p>}
    </div>
  );
}
