/**
 * "Where am I": what is happening, how you are doing and the one thing to do next. Explains "your points now" before
 * the first agent exists (ux-lessons 2.4: walkers asked "11 points and I haven't done anything?").
 */
import { summonFirst } from "@/panes/first-summon";
import { objectWord, useAgentCount, useGame, useGameScope, useLeaderboard, useMe, useMyRule } from "@/sdk";
import { useOpenPane } from "@/dock/open-pane";
import { bidNote, isTied, ordinal, pointsText, powerText, scoreSentence, TIE_NOTE, totalNote, totalSumNote, countedNote } from "@/core/words";
import { BitsHelp, LineByLine, TiedMark } from "@/core/score-help";

export function OverviewPane() {
  const header = useGame();
  const { seated } = useGameScope();
  const standings = useLeaderboard();
  const me = useMe();
  const openPane = useOpenPane(header?.phase ?? "planning");
  const rule = useMyRule();
  const count = useAgentCount();
  if (!header) return null;
  const bid = rule ? bidNote({ bid: rule.row.bid, handicap: rule.row.handicap, title: rule.row.title }) : null;
  const mine = standings?.rows.find(r => r.memberId === header.me);
  const none = seated && count === 0;
  const step = !seated ? "You're watching: open Lines to see the world, and the Leaderboard to see who leads."
    : header.phase === "ended" ? "The game is over: How the game went says where you finished."
    : none ? `Summon your first agent: it moves ${objectWord(header?.variant).many} towards your goal, and every move that helps raises your points.`
    : header.phase === "planning" ? "Your agent is ready. When the world starts, watch What just changed to see each move it makes and why your points moved."
    : "Watch What just changed: each move of your agent says what changed and why your points moved. Try a change to your agent's code in Agent code.";
  return (
    <div className="space-y-3 p-4 text-sm" data-testid="overview">
      <p className="text-base" data-testid="text-next-step">{step}</p>
      {bid && <p className="border-l-2 border-primary pl-2" data-testid="text-overview-bid">{bid}</p>}
      {seated && none && header.phase !== "ended" && (
        <button type="button" className="bg-primary text-primary-foreground px-3 py-1.5 font-medium" onClick={() => void summonFirst(header.gameId, openPane)} data-testid="button-overview-summon">Summon my first agent</button>
      )}
      {seated && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Your points now</dt>
          <dd data-testid="text-overview-points">
            {pointsText(mine?.net ?? 0)}{mine && standings ? ` · ${ordinal(mine.rank)} of ${standings.rows.length}` : ""}
            {mine && standings && isTied(standings.rows, mine) && <> <TiedMark testId="text-overview-tied" /> <span className="text-xs text-muted-foreground">{TIE_NOTE}</span></>}
            {standings && countedNote(standings.worldSeconds) && <span className="block text-xs text-muted-foreground" data-testid="text-overview-counted">{countedNote(standings.worldSeconds)}</span>}
          </dd>
          {me && <><dt className="text-muted-foreground">Your power</dt><dd>{powerText(me.power)}</dd></>}
        </dl>
      )}
      {seated && (
        <div className="space-y-2" data-testid="text-points-explained">
          <p>{scoreSentence(objectWord(header.variant).one, objectWord(header.variant).many)}</p>
          <p className="text-muted-foreground">
            {totalNote(totalSumNote(objectWord(header.variant).one), (mine?.handicap ?? 0) > 0)} Every {objectWord(header.variant).one} counts, not only the {objectWord(header.variant).many} your agent moved, so you can have points before you do anything. Rarity is
            counted in bits <BitsHelp testId="button-bits-help-overview" />. Your agent's job is to raise your total.
          </p>
          <LineByLine testId="button-line-by-line-overview" className="border border-border px-3 py-1.5 text-sm hover:bg-muted" />
        </div>
      )}
    </div>
  );
}
