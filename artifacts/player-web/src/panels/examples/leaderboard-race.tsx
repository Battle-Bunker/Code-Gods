/**
 * Leaderboard race: every player's total over the last few minutes, from the scoreboard's publications the server
 * keeps (useStandingsHistory: the same for every viewer, from the game's start), each player in the colour the
 * built-in panes give them (raceSeries: a colour follows the player's place in the roster).
 */
import { definePanel, LineChart, raceSeries, useGame, useStandingsHistory } from "@sdk";

const WINDOW_S = 300;

export default definePanel({
  title: "Leaderboard race",
  placement: "bottom",
  size: "md",
  Component() {
    const game = useGame();
    const history = useStandingsHistory();
    if (!game) return <p className="text-xs italic opacity-60">Loading…</p>;
    const latest = history.at(-1)?.worldSeconds ?? 0;
    const series = raceSeries(history.filter(h => h.worldSeconds >= latest - WINDOW_S), game.roster, game.me);
    return (
      <div data-testid="example-race">
        {series.length
          ? <LineChart series={series} label={`Every player's total over the last ${WINDOW_S / 60} minutes`} />
          : <p className="text-xs italic opacity-60">No scores published yet.</p>}
      </div>
    );
  },
});
