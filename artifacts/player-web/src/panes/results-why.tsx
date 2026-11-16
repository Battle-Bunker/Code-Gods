/**
 * "Why: your best and worst lines" on the end page (v1's results, baseline-1 #7): the chart of your best lines' points
 * over the game, then each line's score as your bits × the others' want. The best are the first page of your lines by
 * points; each line's history is its own small read of the moves on it (play.objectMoves), never the act log.
 */
import { forwardRef, useMemo } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { LineChart } from "@/components/charts";
import { scoreFormula } from "@/core/words";
import { usePaneOps } from "@/dock/open-pane";
import { toast } from "@/hooks/use-toast";
import { objectWord, useGame, useMyObjects, useObjectIds, useObjectMovesOf, useStandingsHistory } from "@/sdk";
import type { Series } from "./chart-model";
import { pointsOverGame } from "./results-why-model";

const N = 3;

export const ResultsWhy = forwardRef<HTMLDivElement>(function ResultsWhy(_props, ref) {
  const header = useGame();
  const ids = useObjectIds("points", N);
  const best = useMemo(() => ids.results.slice(0, N), [ids.results]);
  const objects = useMyObjects(useMemo(() => best.map(o => o.objectId), [best]));
  const moves = useObjectMovesOf(useMemo(() => best.map(o => o.number), [best]));
  const endWorld = useStandingsHistory().at(-1)?.worldSeconds;
  const openObject = useAffordance("view.openObject");
  const panes = usePaneOps(header?.phase ?? "ended");
  const word = objectWord(header?.variant);
  if (!header || best.length === 0) return null;
  const series: Series[] = best.map((o, i) => ({
    key: o.objectId, label: `#${o.number}`, you: i === 0, slot: i, points: pointsOverGame(moves[i], objects[i]?.value?.points, endWorld),
  }));
  const open = async (objectId: string) => {
    if (!await panes.open("object")) return;
    try { await openObject.run({ objectId }); }
    catch (e) { toast({ title: `The ${word.one} did not open`, description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  };
  return (
    <section ref={ref} className="scroll-mt-2 space-y-2" data-testid="section-results-why">
      <h3 className="font-medium">Why: your best {word.many}</h3>
      {series.some(s => s.points.length > 1) && <LineChart series={series} height={150} label={`Your best ${word.many}' points over the game`} testId="results-why-chart" />}
      <p className="text-xs text-muted-foreground" data-testid="text-results-formula">
        The chart is these {word.many}' points over the game: they rise and fall as the board changes, so a peak can be higher than the end. Each {word.one}'s points: your bits × how much the others want it. Your total is every {word.one}'s points added up.
      </p>
      <ul className="space-y-1 text-xs">
        {best.map((o, i) => {
          const v = objects[i]?.value;
          return (
            <li key={o.objectId} className="flex items-center gap-2" data-testid={`row-results-why-${o.number}`}>
              <button type="button" className="w-10 text-left font-mono text-muted-foreground hover:text-foreground" onClick={() => void open(o.objectId)}>#{o.number}</button>
              <span className="tabular-nums">{v ? scoreFormula(v.rarityBits, v.want) : "…"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
