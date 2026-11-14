/**
 * How the game went (integration plan §1.7; ux-lessons 2.9): the result first ("You finished 1st of 3 with N points",
 * or "Ada won with N points" for a spectator), then your points over time with the caption that points rise and fall
 * (a peak above the final figure read as a mismatch), then the final standings, your row marked.
 */
import { Play } from "lucide-react";
import { Link, useParams } from "wouter";
import { roomPath } from "@/site/lib/routes";
import { useMemo } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { GameSummary, summarise, type SummaryTug } from "@workspace/v2-views";
import { usePaneOps } from "@/dock/open-pane";
import { toast } from "@/hooks/use-toast";
import { decodeState, objectWord, useGame, useLeaderboard, useMoves, useMyObjects, useMyRule, useObjectIds, useRotationRound } from "@/sdk";
import { foldTugs } from "./tug-of-war";
import { AffordanceButton } from "@/site/components/action";
import { isTied, ordinal, pointsText, TIE_NOTE, totalNote, totalsSumNote } from "@/core/words";
import { LineByLine, TiedMark } from "@/core/score-help";
import { resultsHeadline, rotationSummary } from "./results-headline";
import { MyPointsChart } from "./points-over-time";

export function ResultsPane() {
  const header = useGame();
  const standings = useLeaderboard();
  const round = useRotationRound();
  const { roomId: code } = useParams<{ roomId?: string }>();
  if (!header || standings === undefined) return null;
  const rows = standings ? [...standings.rows].sort((a, b) => a.rank - b.rank) : [];
  const tied = rows.some(r => isTied(rows, r));
  return (
    <div className="space-y-3 p-4 text-sm" data-testid="results">
      <p className="text-lg font-semibold leading-snug" data-testid="text-results-headline">{resultsHeadline(standings?.rows, header.me, header.phase === "ended")}</p>
      {/* The next step right under the headline (on a phone, above the fold): what to try, then why. */}
      {header.phase === "ended" && header.me && <EndSummary total={rows.find(r => r.memberId === header.me)?.net ?? 0} />}
      {header.phase === "ended" && code && (
        <Link href={roomPath(code)} className="inline-flex items-center bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" data-testid="link-back-to-room">
          Back to the room for the next game
        </Link>
      )}
      {header.phase === "ended" && (
        <AffordanceButton id="replay.open" args={{ gameId: header.gameId }} label="Watch the replay" busyLabel="Opening the replay…" tone="secondary" testId="button-watch-replay"
          icon={<Play className="mr-1.5 h-4 w-4" aria-hidden />} />
      )}
      <Rotation summary={header.phase === "ended" ? rotationSummary(round, header.me, header.gameId) : null} />
      {header.phase === "ended" && round === null && rows.some(r => r.handicap > 0) && (
        <p className="text-muted-foreground" data-testid="text-results-no-rotation">A rule was won in the bid this game, so there is no rotation this round: the next game deals new rules.</p>
      )}
      {header.me && rows.length > 0 && (
        <MyPointsChart me={header.me} slot={header.roster.findIndex(m => m.memberId === header.me)} ended={header.phase === "ended"} testId="results-points" />
      )}
      {rows.length > 0 && (
        <ol className="divide-y border-y" data-testid="results-standings">
          {rows.map(r => (
            <li key={r.memberId} className={`flex items-center gap-3 py-2 ${r.memberId === header.me ? "font-medium" : ""}`} data-testid={`row-result-${r.memberId}`}>
              <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
              {tied && <span className="w-9 shrink-0">{isTied(rows, r) && <TiedMark testId={`text-result-tied-${r.memberId}`} />}</span>}
              <span className="flex-1 truncate">{r.name}{r.memberId === header.me ? " (you)" : ""}</span>
              <span className="tabular-nums">{pointsText(r.net)}</span>
              {r.handicap > 0 && <span className="text-xs text-muted-foreground" title="The bid this player won costs this share of their total.">−{r.handicap}%</span>}
            </li>
          ))}
        </ol>
      )}
      {rows.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground" data-testid="text-results-note">
          <p>{totalNote(totalsSumNote(objectWord(header?.variant).one), rows.some(r => r.handicap > 0))}{tied ? ` ${TIE_NOTE}` : ""}</p>
          <LineByLine testId="button-line-by-line-results" />
        </div>
      )}
    </div>
  );
}

/** The room's rotation round: which game this was and the running totals over the round (ties share a rank). */
function Rotation({ summary }: { summary: ReturnType<typeof rotationSummary> }) {
  if (!summary) return null;
  return (
    <section className="space-y-1" data-testid="results-rotation">
      <p className="text-muted-foreground">{summary.heading}</p>
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
function EndSummary({ total }: { total: number }) {
  const header = useGame();
  const my = useMyRule();
  const ids = useObjectIds("points");
  const moves = useMoves();
  const top = useMemo(() => ids.results.slice(0, 5).map(r => r.objectId), [ids.results]);
  const objects = useMyObjects(top);
  const summary = useMemo(() => {
    if (!my || !header) return null;
    const objs = objects.flatMap(o => (o?.value ? [{ number: o.number, id: o.objectId, state: decodeState(o.state, header.variant), points: o.value.points, bits: o.value.rarityBits, want: o.value.want }] : []));
    const tugs: SummaryTug[] = foldTugs(moves.results).flatMap(i => (i.kind === "tug"
      ? [(() => {
        const others = [...new Map(i.moves.filter(m => !m.mine && m.by).map(m => [m.by!.memberId, m.by!.name])).entries()];
        const practice = others.length > 0 && others.every(([id]) => header.roster.find(r => r.memberId === id)?.kind === "practice");
        return { number: i.number, withNames: others.map(([, n]) => n), flips: i.flips, mySpend: i.mySpend, practice };
      })()]
      : []));
    return summarise({ rule: my.rule as never, value: my.bits ?? undefined, objects: objs as never, tugs, total });
  }, [my, header, objects, moves.results, total]);
  const openObject = useAffordance("view.openObject");
  const panes = usePaneOps(header?.phase ?? "ended");
  const onOpen = async (id: string | undefined) => {
    if (!id || !await panes.open("object")) return;
    try { await openObject.run({ objectId: id }); }
    catch (e) { toast({ title: `The ${objectWord(header?.variant).one} did not open`, description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  };
  // Said only once the page and its objects have loaded: an empty list read "no line scored" to a player with points.
  if (!summary || ids.status === "LoadingFirstPage" || objects.some(o => o === undefined)) return null;
  return <div data-testid="results-summary"><GameSummary summary={summary as never} rule={my!.rule as never} value={my!.bits ?? undefined} onOpen={id => void onOpen(id)} /></div>;
}
