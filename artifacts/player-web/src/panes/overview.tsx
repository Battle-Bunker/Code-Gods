/**
 * "Where am I": what is happening, how you are doing and the one thing to do next. Explains "your points now" before
 * the first agent exists (ux-lessons 2.4: walkers asked "11 points and I haven't done anything?").
 */
import { summonFirst } from "@/panes/first-summon";
import { useAgentCount, useGame, useGameScope, useLeaderboard, useMe } from "@/sdk";
import { useOpenPane } from "@/dock/open-pane";
import { ordinal, pointsText, powerText } from "@/core/words";

export function OverviewPane() {
  const header = useGame();
  const { seated } = useGameScope();
  const standings = useLeaderboard();
  const me = useMe();
  const openPane = useOpenPane(header?.phase ?? "planning");
  if (!header) return null;
  const mine = standings?.rows.find(r => r.memberId === header.me);
  const count = useAgentCount();
  const none = seated && count === 0;
  const step = !seated ? "You're watching: open Lines to see the world, and the Leaderboard to see who leads."
    : header.phase === "ended" ? "The game is over: How the game went says where you finished."
    : none ? "Summon your first agent: it moves lines towards your goal, and every move that helps raises your points."
    : header.phase === "planning" ? "Your agent is ready. When the world starts, watch What just changed to see each move it makes and why your points moved."
    : "Watch What just changed: each move of your agent says what changed and why your points moved. Try a change to your agent's code in Agent code.";
  return (
    <div className="space-y-3 p-4 text-sm" data-testid="overview">
      <p className="text-base" data-testid="text-next-step">{step}</p>
      {seated && none && header.phase !== "ended" && (
        <button type="button" className="bg-primary text-primary-foreground px-3 py-1.5 font-medium" onClick={() => void summonFirst(header.gameId, openPane)} data-testid="button-overview-summon">Summon my first agent</button>
      )}
      {seated && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Your points now</dt>
          <dd data-testid="text-overview-points">{pointsText(mine?.net ?? 0)}{mine && standings ? ` · ${ordinal(mine.rank)} of ${standings.rows.length}` : ""}</dd>
          {me && <><dt className="text-muted-foreground">Your power</dt><dd>{powerText(me.power)}</dd></>}
        </dl>
      )}
      {seated && (
        <p className="text-muted-foreground" data-testid="text-points-explained">
          Every line already gives everyone some points: on each line, yours are your ✨ rarity (how rarely a random line scores as well on your
          rule) times how much the others want it. Your agent's job is to raise yours.
        </p>
      )}
    </div>
  );
}
