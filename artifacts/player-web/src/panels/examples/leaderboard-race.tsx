/**
 * Leaderboard race: every god's total payoff over the last few minutes (public standings, sampled
 * once a second while this panel is open).
 */
import { useEffect, useRef, useState } from "react";
import { definePanel, LineChart, useLeaderboard, useGame } from "@sdk";

export default definePanel({
  title: "Leaderboard race",
  placement: "bottom",
  size: "md",
  Component() {
    const board = useLeaderboard({ hz: 1 });
    const world = useGame({ hz: 1 })?.worldSeconds ?? 0;
    const series = useRef(new Map<string, { label: string; points: { x: number; y: number }[] }>());
    const [, redraw] = useState(0);
    useEffect(() => {
      for (const row of board) {
        const s = series.current.get(row.godId) ?? { label: row.label, points: [] };
        if (s.points.at(-1)?.x !== world) s.points.push({ x: world, y: row.totalPayoff });
        s.points = s.points.filter(p => p.x >= world - 300);
        series.current.set(row.godId, s);
      }
      redraw(n => n + 1);
    }, [board, world]);
    return <div data-testid="example-race"><LineChart series={[...series.current.values()]} width={360} height={160} xLabel="world s" yLabel="total payoff" /></div>;
  },
});
