/**
 * How the game went (integration plan §1.7; ux-lessons 2.9): the result first ("You finished 1st of 3 with N points",
 * or "Ada won with N points" for a spectator), then your points over time with the caption that points rise and fall
 * (a peak above the final figure read as a mismatch), then the final standings, your row marked.
 */
import { Play } from "lucide-react";
import { Link, useParams } from "wouter";
import { roomPath } from "@/site/lib/routes";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResultsWhy } from "./results-why";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAffordance } from "@workspace/v2-affordances/react";
import { ANOTHER, GameSummary, summarise, type SummaryClimb, type SummaryTug } from "@workspace/v2-views";
import { usePaneOps } from "@/dock/open-pane";
import { toast } from "@/hooks/use-toast";
import { decodeState, objectWord, useGame, useObjectMovesOf, useLeaderboard, useMoves, useTugs, useMyObjects, useMyRule, useObjectIds, useRotationRound, blursOthers, useStandingsHistory, useMe } from "@/sdk";
import { foldTugs } from "./tug-of-war";
import { AffordanceButton } from "@/site/components/action";
import { blurredEndedNote, isTied, ordinal, pointsText, TIE_NOTE, totalNote, totalsSumNote } from "@/core/words";
import { LineByLine, TiedMark } from "@/core/score-help";
import { endNote, resultsHeadline, rotationSummary } from "./results-headline";
import { MyPointsChart } from "./points-over-time";
import { seriesOf } from "./chart-model";
import { mergeTugs, tugsFromServer } from "./summary-tugs";
import { RetiredLines } from "./retired";

export function ResultsPane() {
  const header = useGame();
  const standings = useLeaderboard();
  const round = useRotationRound();
  const { roomId: code } = useParams<{ roomId?: string }>();
  const whyRef = useRef<HTMLDivElement>(null);
  if (!header || standings === undefined) return null;
  const rows = standings ? [...standings.rows].sort((a, b) => a.rank - b.rank) : [];
  const tied = rows.some(r => isTied(rows, r));
  const ended = header.phase === "ended";
  const handicaps = rows.some(r => r.handicap > 0);
  const kindOf = (id: string) => header.roster.find(m => m.memberId === id)?.kind;
  return (
    <div className="space-y-3 p-4 text-sm" data-testid="results">
      <p className="text-lg font-semibold leading-snug" data-testid="text-results-headline">{resultsHeadline(standings?.rows, header.me, header.phase === "ended")}</p>
      {header.phase === "ended" && endNote(header) && <p className="text-sm text-muted-foreground" data-testid="text-results-end">{endNote(header)}</p>}
      {header.phase === "ended" && code && (
        <Link href={roomPath(code)} className="inline-flex items-center bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" data-testid="link-back-to-room">
          Back to the room for the next game
        </Link>
      )}
      {header.phase === "ended" && (
        <AffordanceButton id="replay.open" args={{ gameId: header.gameId }} label="Watch the replay" busyLabel="Opening the replay…" tone="secondary" testId="button-watch-replay"
          icon={<Play className="mr-1.5 h-4 w-4" aria-hidden />} />
      )}
      {/* The next step under the actions (round 13's dock check: a summary above them pushed "Watch the replay" out of
          view): what to try, then why. */}
      {header.phase === "ended" && header.me && <EndSummary total={rows.find(r => r.memberId === header.me)?.net ?? 0} />}
      <Rotation summary={header.phase === "ended" ? rotationSummary(round, header.me, header.gameId) : null} />
      {header.phase === "ended" && round === null && rows.some(r => r.handicap > 0) && (
        <p className="text-muted-foreground" data-testid="text-results-no-rotation">A rule was won in the bid this game, so there is no rotation this round: the next game deals new rules.</p>
      )}
      {header.me && rows.length > 0 && (
        <MyPointsChart me={header.me} slot={header.roster.findIndex(m => m.memberId === header.me)} ended={header.phase === "ended"} testId="results-points" />
      )}
      {ended && header.me && (
        <button type="button" data-testid="button-results-why" onClick={() => whyRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">Why: your best and worst {objectWord(header.variant).many} ↓</button>
      )}
      {rows.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-medium">{ended ? "Final standings" : "Standings"}</h3>
          <table className="w-full border-y text-sm" data-testid="results-standings">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-10 py-1 font-normal">#</th>
                {tied && <th className="w-9" />}
                <th className="py-1 font-normal">player</th>
                {handicaps && <th className="py-1 text-right font-normal">handicap</th>}
                <th className="py-1 text-right font-normal">points</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.memberId} className={r.memberId === header.me ? "font-medium" : ""} data-testid={`row-result-${r.memberId}`}>
                  <td className="w-10 py-2 tabular-nums text-muted-foreground">{ordinal(r.rank)}</td>
                  {tied && <td className="w-9">{isTied(rows, r) && <TiedMark testId={`text-result-tied-${r.memberId}`} />}</td>}
                  <td className="truncate py-2">{r.name}{r.memberId === header.me ? " (you)" : ""}{kindOf(r.memberId) === "ai" ? " · AI" : kindOf(r.memberId) === "practice" ? " · practice" : ""}</td>
                  {handicaps && <td className="py-2 text-right text-xs text-muted-foreground" title="The bid this player won costs this share of their total.">{r.handicap > 0 ? `−${r.handicap}%` : "–"}</td>}
                  <td className="py-2 text-right tabular-nums">{pointsText(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {rows.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground" data-testid="text-results-note">
          <p>{totalNote(totalsSumNote(objectWord(header?.variant).one), rows.some(r => r.handicap > 0))}{tied ? ` ${TIE_NOTE}` : ""}</p>
          {blursOthers(header) && <p data-testid="text-results-exact">{blurredEndedNote(objectWord(header?.variant).one)}</p>}
          <LineByLine testId="button-line-by-line-results" />
        </div>
      )}
      {ended && header.me && <ResultsWhy ref={whyRef} />}
      {/* Line turnover: the lines that retired, each with what it banked (the totals above include them when banked). */}
      {header.me && <RetiredLines />}
    </div>
  );
}

/** The room's rotation round: which game this was and the running totals over the round (ties share a rank). */
function Rotation({ summary }: { summary: ReturnType<typeof rotationSummary> }) {
  if (!summary) return null;
  return (
    <section className="space-y-1" data-testid="results-rotation">
      <p className="text-muted-foreground">{summary.heading}</p>
      {summary.next && <p data-testid="text-rotation-line">{summary.next}</p>}
      {summary.rows.length > 0 && <ol className="divide-y border-y">
        {summary.rows.map(r => (
          <li key={r.memberId} className={`flex items-center gap-3 py-1.5 ${r.mine ? "font-medium" : ""}`}>
            <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
            <span className="flex-1 truncate">{r.name}{r.mine ? " (you)" : ""}</span>
            <span className="tabular-nums">{pointsText(r.net)}</span>
          </li>
        ))}
      </ol>}
    </section>
  );
}

/**
 * The end of the game in plain words (coordinator, 14 November: a persona was left with a rank and no next step): what
 * earned your points, what cost you, and one thing to try next game (lib/v2-views summary.tsx). It reads only what the
 * game's panes already share: Lines' skeleton by your points and its objects, the act log's tug-of-wars, your rule.
 */

/** How many contested objects the summary reads the moves of at most. */
const CONTESTED_MAX = 10;

/** How long the summary waits for every read before it speaks from what has arrived. */
const PATIENCE_MS = 4000;

/** The advice when the summary cannot be built (its rule or a face did not load): never an empty Results page. */
function PlainNext({ noun }: { noun: string }) {
  return (
    <div className="v2v v2v-summary">
      <div className="v2v-summary-next" data-testid="text-summary-next">
        <h4 className="v2v-summary-next-title">Try next game</h4>
        <p>Open your secret goal before the world starts, summon a starter that climbs its main part, and watch which {noun}s earn you points.</p>
      </div>
    </div>
  );
}

function EndSummary({ total }: { total: number }) {
  const header = useGame();
  const my = useMyRule();
  const ids = useObjectIds("points");
  // Every tug-of-war of the game as the tick folds them (v2/playState:tugs: paging the act log timed out, round 8/04); a
  // replay folds its own frame's moves.
  const serverTugs = useTugs();
  const moves = useMoves(30, { replayOnly: true });
  const round = useRotationRound();
  // How the game went for this player (round 28): their total over time, the energy left unspent.
  const history = useStandingsHistory();
  const me = useMe();
  const done = serverTugs !== undefined;
  const top = useMemo(() => ids.results.slice(0, 5).map(r => r.objectId), [ids.results]);
  const objects = useMyObjects(top);
  // Each contested object's own moves (one small read each, never the whole act log): climbed together or undone?
  const contestedNumbers = useMemo(() => (serverTugs ?? []).map(t => t.number).slice(0, CONTESTED_MAX), [serverTugs]);
  const contestedMoves = useObjectMovesOf(contestedNumbers);
  const summary = useMemo(() => {
    if (!my || !header) return null;
    const objs = objects.flatMap(o => (o?.value ? [{ number: o.number, id: o.objectId, state: decodeState(o.state, header.variant), points: o.value.points, bits: o.value.rarityBits, want: o.value.want }] : []));
    const tugs: SummaryTug<unknown>[] = serverTugs
      ? tugsFromServer(serverTugs, id => header.roster.find(r => r.memberId === id)?.kind, st => decodeState(st, header.variant))
      : mergeTugs(foldTugs(moves.results).flatMap(i => (i.kind === "tug"
      ? [(() => {
        const others = [...new Map(i.moves.filter(m => !m.mine && m.by).map(m => [m.by!.memberId, m.by!.name])).entries()];
        const practice = others.length > 0 && others.every(([id]) => header.roster.find(r => r.memberId === id)?.kind === "practice");
        // The state the pull passed through that was worth most to you (each move's snapshot is yours).
        const top = [...i.moves].filter(m => m.after && m.stateAfter).sort((x, y) => (y.after!.points ?? 0) - (x.after!.points ?? 0))[0];
        const best = top ? { state: decodeState(top.stateAfter, header.variant), points: top.after!.points ?? 0 } : undefined;
        return { number: i.number, withNames: others.map(([, n]) => n), flips: i.flips, mySpend: i.mySpend, practice, ...(best ? { best } : {}) };
      })()]
      : [])));
    // In a rotation that goes on, the next game deals another rule: the advice is the lesson, not this game's line.
    const rotates = !!round && round.games.some(g => g.gameId === header.gameId) && round.round < round.of;
    const climbs: SummaryClimb[] = contestedNumbers.flatMap((number, i) => {
      const rows = contestedMoves[i];
      return rows ? [{ number, moves: [...rows].reverse().map(m => ({ by: m.mine ? "you" : m.by?.name ?? ANOTHER, before: m.before, after: m.after })) }] : [];
    });
    const points = header.me ? seriesOf(history ?? [], header.me) : [];
    const pace = points.length > 1 && me ? { points, endWorld: points.at(-1)!.x, energyLeft: me.energy, capacity: me.capacity } : undefined;
    return summarise({ rule: my.rule as never, value: my.bits ?? undefined, objects: objs as never, tugs, total, rotates, movesRead: null, climbs, ...(pace ? { pace } : {}) });
  }, [my, header, objects, serverTugs, moves.results, total, round, contestedNumbers, contestedMoves, history, me]);
  const openObject = useAffordance("view.openObject");
  const panes = usePaneOps(header?.phase ?? "ended");
  const onOpen = async (id: string | undefined) => {
    if (!id || !await panes.open("object")) return;
    try { await openObject.run({ objectId: id }); }
    catch (e) { toast({ title: `The ${objectWord(header?.variant).one} did not open`, description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  };
  // Said once the page and its objects have loaded (an empty list read "no line scored" to a player with points), and
  // never nothing: after a few seconds, from what has arrived (round 12: Exact Change's Results said no word of advice).
  const [patient, setPatient] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPatient(true), PATIENCE_MS); return () => clearTimeout(t); }, []);
  const loading = !done || ids.status === "LoadingFirstPage" || objects.some(o => o === undefined);
  if (loading && !patient) return null;
  const plain = <PlainNext noun={objectWord(header?.variant).one} />;
  if (!summary) return <div data-testid="results-summary">{plain}</div>;
  return (
    <div data-testid="results-summary">
      <ErrorBoundary FallbackComponent={() => plain}>
        <GameSummary summary={summary as never} rule={my!.rule as never} value={my!.bits ?? undefined} onOpen={id => void onOpen(id)} />
      </ErrorBoundary>
    </div>
  );
}
