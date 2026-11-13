/**
 * Leaderboard race: every player's total over the last few minutes, from the scoreboard's publications the server
 * keeps (useStandingsHistory: the same for every viewer, from the game's start), each player in the colour the
 * built-in panes give them (usePlayerStyle).
 */
import { definePanel, LineChart, useDockState, useGame, useLeaderboard, usePlayerStyle, useStandingsHistory } from "@sdk";

export default definePanel({
  title: "Leaderboard race",
  placement: "bottom",
  size: "md",
  Component() {
    const board = useLeaderboard({ hz: 1 });
    const game = useGame({ hz: 1 });
    const world = game?.worldSeconds ?? 0;
    // The history's totals are in the game's roster order.
    const roster = useDockState()?.roster ?? [];
    const history = useStandingsHistory(game?.gameId).filter(r => r.world >= world - 300);
    const style = usePlayerStyle();
    const series = board.map(row => {
      const i = roster.indexOf(row.godId);   // once per player, not per point
      return { label: row.label, ...style(row.godId), points: history.map(r => ({ x: r.world, y: r.totals[i] ?? 0 })) };
    });
    return <div data-testid="example-race"><LineChart series={series} width={360} height={160} xLabel="world s" yLabel="total payoff" /></div>;
  },
});
