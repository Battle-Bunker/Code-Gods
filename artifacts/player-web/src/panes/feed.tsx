/**
 * "What just changed", the act log (integration plan §1.6, §3.4; ux-lessons 2.2, 2.3): the moves that concern the
 * viewer, newest first, one sentence each (move-line.ts) from the `v2Moves` row, with the line before → after written
 * by v2-views in the representation that changed. Older pages load on request; every loaded page stays live.
 */
import { fixedLength } from "@/core/timer-text";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { chipRep, defaultRep, repText, RepView } from "@workspace/v2-views";
import { decodeState, objectTypeOf, objectWord, useGame, useGameScope, useMoves, useMyAgents, useMyRule, variantOf, type Move, useOthersBlurred, usePublicLog, type LogEntry } from "@/sdk";
import { num, timeLeft } from "@/core/words";
import { useReplaying } from "@/core/affordance-runtime";
import { callWords, moveSentence, moveWho } from "./move-line";
import { foldTugs, tugSentence, type FeedItem } from "./tug-of-war";
import { noteLines, tugNoteNumber } from "./move-notes";
import { requestForge } from "./forge-request";
import { useOpenPane } from "@/dock/open-pane";
import { logLine } from "./log-line";
import { VirtualRows } from "@/components/virtual-rows";
import { DriftInFeed } from "./drift";
import { CompactText } from "@/core/compact-text";
import { filterMoves, mutatorYield, type FeedWho } from "./feed-filter";

/** What your agents noted for you, by move (each note once, on its newest move). */
const NotesContext = createContext<ReadonlyMap<number, string[]>>(new Map());
/** While the game runs, another player's move is unattributed: no name, agent, calls or cost (v1's public log). */
const AnonymousContext = createContext(true);

/** The line's written form in the representation the move changed (an equation that expresses it, else the first that does). */
function lineText(state: unknown, rep: string, site: number, variant: string): string {
  const type = objectTypeOf(variant);
  return repText(type, state, chipRep(type, state, rep, site), site);
}

function MoveRow({ move, names, variant }: { move: Move; names: ReadonlyMap<string, string>; variant: string }) {
  const anonymous = useContext(AnonymousContext);
  const blurred = useOthersBlurred();
  const g = useGame(); const length = g ? fixedLength(g) : null;
  const notes = useContext(NotesContext).get(move.seq);
  // A grid's change is drawn (a small board, the changed cells marked), not written as sixteen digits.
  const board = useMemo(() => {
    const type = objectTypeOf(variant);
    if (type.id !== "grid") return null;
    try { return { type, before: decodeState(move.stateBefore, variant), after: decodeState(move.stateAfter, variant), site: move.calls[0]?.site ?? 0 }; } catch { return null; }
  }, [move, variant]);
  const text = useMemo(() => {
    const site = move.calls[0]?.site ?? 0;
    let change: { before: string; after: string } | null = null;
    if (!board) try { change = { before: lineText(decodeState(move.stateBefore, variant), move.rep, site, variant), after: lineText(decodeState(move.stateAfter, variant), move.rep, site, variant) }; } catch { change = null; }
    return moveSentence({ noun: objectWord(variant).one, approx: blurred,
      who: moveWho(move, move.agentId ? names.get(move.agentId) : null),
      change, what: move.mine || !anonymous ? callWords(move.calls, variantOf(variant)) : null, before: move.before, after: move.after,
    });
  }, [move, names, variant, board, anonymous, blurred]);
  return (
    <li className={`space-y-0.5 px-4 py-2 ${move.mine ? "" : "text-muted-foreground"}`} data-testid={`row-move-${move.seq}`} data-mine={move.mine || undefined}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {timeLeft(move.worldSeconds, length)}{move.mine && move.charge !== null ? ` · this move cost ${num(move.charge)} energy` : ""}
      </p>
      {board ? (
        <div className="flex items-start gap-3">
          <div className="v2v shrink-0" data-testid="move-board">
            <RepView type={board.type} state={board.after} before={board.before} rep={defaultRep(board.type)} size="compact" site={board.site}
              label={`The ${objectWord(variant).one} after this move, its changed cells marked`} />
          </div>
          <p className="text-sm text-foreground" data-testid="text-move-line"><CompactText text={text} /></p>
        </div>
      ) : <p className="text-sm text-foreground" data-testid="text-move-line"><CompactText text={text} /></p>}
      {notes?.map(n => <AgentNote key={n} text={n} variant={variant} />)}
    </li>
  );
}

/** A back-and-forth on one line, folded: who pulls, how often, what it cost, and to talk; its moves on request. */
function TugRow({ tug, names, variant, kinds }: { tug: Extract<FeedItem<Move>, { kind: "tug" }>; names: ReadonlyMap<string, string>; variant: string; kinds: ReadonlyMap<string, string> }) {
  const anonymous = useContext(AnonymousContext);
  const g = useGame(); const length = g ? fixedLength(g) : null;
  // Its moves' notes show on the entry itself: the moves are folded away below.
  const notesBySeq = useContext(NotesContext);
  const tugNotes = [...new Set(tug.moves.flatMap(m => notesBySeq.get(m.seq) ?? []))];
  return (
    <li className="space-y-1 border-l-4 border-destructive/60 px-4 py-2" data-testid={`row-tug-${tug.objectId}`}>
      <p className="text-xs text-muted-foreground tabular-nums">{timeLeft(tug.to, length)} · contested {objectWord(variant).one}</p>
      <p className="text-sm text-foreground" data-testid="text-tug-line"><CompactText text={tugSentence(tug, kinds, objectWord(variant).one, length, { anonymous })} /></p>
      {tugNotes.map(n => <AgentNote key={n} text={n} variant={variant} />)}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4">Show the {tug.moves.length} moves</summary>
        <ol className="divide-y">{tug.moves.map(m => <MoveRow key={m.seq} move={m} names={names} variant={variant} />)}</ol>
      </details>
    </li>
  );
}

function ConcernsFeed() {
  const header = useGame();
  const replaying = useReplaying();
  const { seated } = useGameScope();
  const rule = useMyRule();
  const agents = useMyAgents();
  const moves = useMoves();
  const names = useMemo(() => new Map((agents ?? []).map(a => [a.agentId as string, a.name])), [agents]);
  const [who, setWho] = useState<FeedWho>("all");
  const [numberText, setNumberText] = useState("");
  const [minText, setMinText] = useState("");
  const filter = useMemo(() => {
    const n = numberText.trim() === "" ? null : Number(numberText);
    const min = Number(minText);
    return { who, number: n !== null && Number.isFinite(n) ? n : null, minImpact: Number.isFinite(min) ? min : 0 };
  }, [who, numberText, minText]);
  const shown = useMemo(() => filterMoves(moves.results, filter), [moves.results, filter]);
  const filtering = who !== "all" || filter.number !== null || filter.minImpact > 0;
  const items = useMemo(() => foldTugs(shown), [shown]);
  const notes = useMemo(() => noteLines(moves.results.map(m => ({ seq: m.seq, agentId: m.agentId, notes: m.notes }))), [moves.results]);
  // Who each seat is (a person, a practice partner, an AI player): practice partners read no chat.
  const kinds = useMemo(() => new Map((header?.roster ?? []).map(r => [r.memberId as string, r.kind as string])), [header?.roster]);
  if (!header) return null;
  if (moves.status === "LoadingFirstPage") return null;
  if (moves.results.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="feed-empty">
        {header.phase === "planning" ? "Nothing has moved yet: the world starts after planning. " : "Nothing has changed your points yet. "}
        Each time your agent moves a {objectWord(header.variant).one}, or another player's move changes your points on a {objectWord(header.variant).one}, it appears here: what changed, your rarity
        in bits (how rarely a random {objectWord(header.variant).one} scores as well), and why your points moved: your bits × the others' bits.
      </p>
    );
  }
  return (
    <div data-testid="feed">
      <FeedFilters who={who} setWho={setWho} numberText={numberText} setNumberText={setNumberText} minText={minText} setMinText={setMinText} noun={objectWord(header.variant).one} />
      <CostAgainstYield moves={moves.results} variant={header.variant} />
      {filtering && items.length === 0 && <p className="p-4 text-sm text-muted-foreground" data-testid="feed-filtered-empty">No loaded move matches these filters.</p>}
      <NotesContext.Provider value={notes}><AnonymousContext.Provider value={!replaying && header.phase !== "ended"}>
      <ol className="divide-y">
        {items.map(i => i.kind === "tug"
          ? <TugRow key={`tug-${i.moves[0]!.seq}`} tug={i} names={names} variant={header.variant} kinds={kinds} />
          : <MoveRow key={i.move.seq} move={i.move} names={names} variant={header.variant} />)}
      </ol>
      </AnonymousContext.Provider></NotesContext.Provider>
      {moves.status === "CanLoadMore" && (
        <button type="button" className="w-full border-t py-2 text-xs underline underline-offset-4 text-muted-foreground" onClick={() => moves.loadMore(30)} data-testid="button-feed-earlier">Earlier moves</button>
      )}
      {moves.status === "LoadingMore" && <p className="border-t py-2 text-center text-xs text-muted-foreground">Loading earlier moves…</p>}
    </div>
  );
}

/** Which moves the act log shows (v1's feed filters): whose, on which object, and how much they changed your points. */
function FeedFilters(p: { who: FeedWho; setWho: (w: FeedWho) => void; numberText: string; setNumberText: (t: string) => void; minText: string; setMinText: (t: string) => void; noun: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground" role="group" aria-label="Filter the moves" data-testid="feed-filters">
      <label className="flex items-center gap-1">Moved by
        <select className="rounded border bg-background px-1 py-0.5 text-foreground" value={p.who} onChange={e => p.setWho(e.target.value as FeedWho)} data-testid="select-feed-who">
          <option value="all">anyone</option><option value="mine">your agents</option><option value="others">other players</option>
        </select>
      </label>
      <label className="flex items-center gap-1">{p.noun[0]!.toUpperCase() + p.noun.slice(1)}
        <input inputMode="numeric" className="w-14 rounded border bg-background px-1 py-0.5 text-foreground" placeholder="any" value={p.numberText} onChange={e => p.setNumberText(e.target.value)} data-testid="input-feed-object" />
      </label>
      <label className="flex items-center gap-1">Points changed by at least
        <input inputMode="decimal" className="w-14 rounded border bg-background px-1 py-0.5 text-foreground" placeholder="0" value={p.minText} onChange={e => p.setMinText(e.target.value)} data-testid="input-feed-min" />
      </label>
    </div>
  );
}

/** Your loaded moves grouped by what your agents called: energy spent against points gained (v1's "cost against yield"). */
function CostAgainstYield({ moves, variant }: { moves: readonly Move[]; variant: string }) {
  const rows = useMemo(() => mutatorYield(moves), [moves]);
  if (!rows.length) return null;
  const titleOf = (key: string) => key.split(", then ").map(id => objectTypeOf(variant).mutators.find(m => m.id === id)?.title ?? id).join(", then ");
  return (
    <details className="border-b px-4 py-2 text-xs" data-testid="feed-yield">
      <summary className="cursor-pointer text-muted-foreground underline underline-offset-4">Cost against yield, by kind of move</summary>
      <table className="mt-2 w-full tabular-nums">
        <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Your agents' move</th><th className="font-normal text-right">Moves</th><th className="font-normal text-right">Energy</th><th className="font-normal text-right">Points gained</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.mutator} data-testid="row-feed-yield"><td>{titleOf(r.mutator)}</td><td className="text-right">{r.moves}</td><td className="text-right">{num(r.spent)}</td><td className="text-right">{r.gained > 0 ? "+" : ""}{num(r.gained)}</td></tr>
        ))}</tbody>
      </table>
      <p className="mt-1 text-muted-foreground">From the moves loaded here; load earlier moves to count more.</p>
    </details>
  );
}

/** An agent's note; a tug-of-war note offers to leave that object alone (round 10: it said "add N to LEAVE"). */
function AgentNote({ text, variant }: { text: string; variant: string }) {
  const header = useGame();
  const replaying = useReplaying();
  const openPane = useOpenPane(header?.phase ?? "live");
  const n = tugNoteNumber(text);
  const live = !replaying && header?.phase !== "ended";
  return (
    <p className="border-l-2 border-primary/50 pl-2 text-sm italic text-foreground" data-testid="text-move-note">
      Your agent says: {text}
      {n !== null && live && <> <button type="button" className="not-italic underline underline-offset-4" data-testid="button-note-leave"
        onClick={() => void requestForge({ kind: "leave", numbers: [n] }, openPane)}>Leave {objectWord(variant).one} {n} alone</button></>}
    </p>
  );
}

/** Rows of the public log are one fixed height (two lines), so the busy list is virtualised. */
const LOG_ROW_H = 56;

function LogRowView({ r, variant, approx, length }: { r: LogEntry; variant: string; approx: boolean; length: number | null }) {
  const change = useMemo(() => {
    // A board written out is sixteen digits (round 6): a grid's row says which grid and your points only.
    // A paid game's other players' moves carry no state while live (their content is paid).
    if (objectTypeOf(variant).id === "grid" || r.state === null) return null;
    try {
      const after = lineText(decodeState(r.state, variant), "", 0, variant);
      return { before: r.stateBefore ? lineText(decodeState(r.stateBefore, variant), "", 0, variant) : "", after };
    } catch { return null; }
  }, [r.state, r.stateBefore, variant]);
  return (
    <div className={`h-full overflow-hidden border-b px-4 py-1.5 ${r.mine ? "" : "text-muted-foreground"}`} data-testid="row-log">
      <p className="text-[11px] tabular-nums text-muted-foreground">{timeLeft(r.worldSeconds, length)}</p>
      <p className="line-clamp-2 text-xs text-foreground" data-testid="text-log-line"><CompactText text={logLine(r, { noun: objectWord(variant).one, change, approx })} /></p>
    </div>
  );
}

/** "All moves (the public log)": every move in the game, unattributed while it runs, virtualised (v2/play:log). */
function PublicLog() {
  const header = useGame();
  const blurred = useOthersBlurred();
  const log = usePublicLog();
  const { results, status, loadMore } = log;
  const onNearEnd = useCallback(() => { if (status === "CanLoadMore") loadMore(50); }, [status, loadMore]);
  if (!header || status === "LoadingFirstPage") return null;
  if (!results.length) return <p className="p-4 text-sm text-muted-foreground" data-testid="public-log-empty">No {objectWord(header.variant).one} has been born or moved yet.</p>;
  return (
    <div data-testid="public-log">
      <VirtualRows rows={results} rowHeight={LOG_ROW_H} maxHeight={480} keyOf={r => String(r.seq)} onNearEnd={onNearEnd} testId="public-log-list"
        render={r => <LogRowView r={r} variant={header.variant} approx={blurred} length={fixedLength(header)} />} />
    </div>
  );
}

type FeedMode = "mine" | "all";

export function FeedPane() {
  const header = useGame();
  const replaying = useReplaying();
  const { seated } = useGameScope();
  // A spectator has no points, so no "moves that changed your points": the public log is what they see.
  const [mode, setMode] = useState<FeedMode>(seated ? "mine" : "all");
  if (!header) return null;
  // A replay's frame has the moves that concerned the player it is watched as; the public log is a live read.
  if (replaying) return <ConcernsFeed />;
  const tab = (m: FeedMode, label: string) => (
    <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`button-feed-mode-${m}`}
      className={`px-2 py-1 text-xs ${mode === m ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{label}</button>
  );
  return (
    <div>
      <div className="flex gap-2 border-b px-3" role="group" aria-label="Which moves">
        {seated && tab("mine", "Moves that changed your points")}
        {tab("all", "All moves (the public log)")}
      </div>
      {seated && <div className="px-3 pt-2"><DriftInFeed /></div>}
      {mode === "mine" && seated ? <ConcernsFeed /> : <PublicLog />}
    </div>
  );
}
