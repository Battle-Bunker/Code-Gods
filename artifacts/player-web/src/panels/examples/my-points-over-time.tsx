/**
 * My points over time, per line: your points on the lines that matter most to you right now (your highest points),
 * as a line per object over world time, from the moves on them (each move carries your points before and after).
 */
import { definePanel, LineChart, fmtBits, pointsText, useMoves, useMyObjects, useObjectIds, type Series } from "@sdk";

const TOP = 5;

export default definePanel({
  title: "My points over time",
  placement: "bottom",
  size: "lg",
  Component() {
    const ids = useObjectIds("points", TOP);
    const top = ids.results.slice(0, TOP);
    const objects = useMyObjects(top.map(o => o.objectId));
    const moves = useMoves(100);
    if (ids.isLoading) return <p className="text-xs italic opacity-60">Loading…</p>;
    if (!top.length) return <p className="text-xs italic opacity-60">No lines yet.</p>;
    const series: Series[] = top.map((o, i) => {
      const points = [...moves.results].filter(m => m.objectId === o.objectId).reverse()
        .flatMap(m => [{ x: m.worldSeconds, y: m.before.points }, { x: m.worldSeconds, y: m.after.points }]);
      return { key: o.objectId, label: `#${o.number}`, you: i === 0, slot: i, points };
    }).filter(s => s.points.length > 0);
    return (
      <div className="space-y-3" data-testid="example-my-points">
        {series.length
          ? <LineChart series={series} label="Your points on your top lines, at each move on them" />
          : <p className="text-xs italic opacity-60">No moves on your top lines yet.</p>}
        <ol className="m-0 list-none space-y-1 p-0 text-xs">
          {top.map((o, i) => {
            const value = objects[i]?.value;
            return (
              <li key={o.objectId} className="tabular-nums">
                #{o.number}: {value ? `now ${pointsText(value.points)} (your ${fmtBits(value.rarityBits)})` : "…"}
              </li>
            );
          })}
        </ol>
      </div>
    );
  },
});
