/**
 * How the game went (integration plan §1.7; ux-lessons 2.9): the result first ("You finished 1st of 3 with N points",
 * or "Ada won with N points" for a spectator), then your points over time with the caption that points rise and fall
 * (a peak above the final figure read as a mismatch), then the final standings, your row marked.
 */
import { Play } from "lucide-react";
import { objectWord, useGame, useLeaderboard, useRotationRound } from "@/sdk";
import { AffordanceButton } from "@/site/components/action";
import { isTied, ordinal, pointsText, TIE_NOTE, totalNote, totalsSumNote } from "@/core/words";
import { LineByLine, TiedMark } from "@/core/score-help";
import { resultsHeadline, rotationSummary } from "./results-headline";
import { MyPointsChart } from "./points-over-time";

export function ResultsPane() {
  const header = useGame();
  const standings = useLeaderboard();
  const round = useRotationRound();
  if (!header || standings === undefined) return null;
  const rows = standings ? [...standings.rows].sort((a, b) => a.rank - b.rank) : [];
  const tied = rows.some(r => isTied(rows, r));
  return (
    <div className="space-y-3 p-4 text-sm" data-testid="results">
      <p className="text-lg font-semibold leading-snug" data-testid="text-results-headline">{resultsHeadline(standings?.rows, header.me, header.phase === "ended")}</p>
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
      <ol className="divide-y border-y">
        {summary.rows.map(r => (
          <li key={r.memberId} className={`flex items-center gap-3 py-1.5 ${r.mine ? "font-medium" : ""}`}>
            <span className="w-10 tabular-nums text-muted-foreground">{ordinal(r.rank)}</span>
            <span className="flex-1 truncate">{r.name}{r.mine ? " (you)" : ""}</span>
            <span className="tabular-nums">{pointsText(r.net)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
