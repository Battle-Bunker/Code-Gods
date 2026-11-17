/**
 * "Why: your best and worst lines" on the end page (v1's results, baseline-1 #7): the chart of your best lines' points
 * over the game, then each best and worst line's score as your bits × the others' want. The best are the first page of
 * your lines by points, the worst the first page by fewest points ("least"), without the best; each best line's history
 * is its own small read of the moves on it (play.objectMoves), never the act log.
 */
import { ObjectHover } from "@/components/object-hover";
import { forwardRef, useMemo } from "react";
import { LineChart } from "@/components/charts";
import { scoreFormula } from "@/core/words";
import { objectWord, useGame, useMyObjects, useObjectIds, useObjectMovesOf, useStandingsHistory } from "@/sdk";
import type { Series } from "./chart-model";
import { pointsOverGame, worstWithout } from "./results-why-model";

const N = 3;

export const ResultsWhy = forwardRef<HTMLDivElement>(function ResultsWhy(_props, ref) {
  const header = useGame();
  const ids = useObjectIds("points", N);
  const best = useMemo(() => ids.results.slice(0, N), [ids.results]);
  const least = useObjectIds("least", N);
  const worst = useMemo(() => worstWithout(least.results.slice(0, N), best), [least.results, best]);
  const worstObjects = useMyObjects(useMemo(() => worst.map(o => o.objectId), [worst]));
  const objects = useMyObjects(useMemo(() => best.map(o => o.objectId), [best]));
  const moves = useObjectMovesOf(useMemo(() => best.map(o => o.number), [best]));
  const endWorld = useStandingsHistory().at(-1)?.worldSeconds;
  const word = objectWord(header?.variant);
  if (!header || best.length === 0) return null;
  const series: Series[] = best.map((o, i) => ({
    key: o.objectId, label: `#${o.number}`, you: i === 0, slot: i, points: pointsOverGame(moves[i], objects[i]?.value?.points, endWorld),
  }));
  return (
    <section ref={ref} className="scroll-mt-2 space-y-2" data-testid="section-results-why">
      <h3 className="font-medium">Why: your best and worst {word.many}</h3>
      {series.some(s => s.points.length > 1) && <LineChart series={series} height={150} label={`Your best ${word.many}' points over the game`} testId="results-why-chart" />}
      <p className="text-xs text-muted-foreground" data-testid="text-results-formula">
        The chart is these {word.many}' points over the game: they rise and fall as the board changes, so a peak can be higher than the end. Each {word.one}'s points: your bits × how much the others want it. Your total is every {word.one}'s points added up.
      </p>
      <ul className="space-y-1 text-xs">
        {best.map((o, i) => {
          const v = objects[i]?.value;
          return (
            <li key={o.objectId} className="flex items-center gap-2" data-testid={`row-results-why-${o.number}`}>
              <ObjectHover objectId={o.objectId} label={`${word.One} ${o.number}`} className="w-10 font-mono text-muted-foreground hover:text-foreground">#{o.number}</ObjectHover>
              <span className="tabular-nums">{v ? scoreFormula(v.rarityBits, v.want) : "…"}</span>
            </li>
          );
        })}
      </ul>
      {worst.length > 0 && (
        <>
          <p className="pt-1 text-xs font-medium">Your worst {word.many}</p>
          <ul className="space-y-1 text-xs" data-testid="list-results-worst">
            {worst.map((o, i) => {
              const v = worstObjects[i]?.value;
              return (
                <li key={o.objectId} className="flex items-center gap-2" data-testid={`row-results-worst-${o.number}`}>
                  <ObjectHover objectId={o.objectId} label={`${word.One} ${o.number}`} className="w-10 font-mono text-muted-foreground hover:text-foreground">#{o.number}</ObjectHover>
                  <span className="tabular-nums">{v ? scoreFormula(v.rarityBits, v.want) : "…"}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
});
