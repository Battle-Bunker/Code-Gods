/**
 * Your secret goal (the `my-card` pane): the dealt rule's card in plain words, a worked example on the expanded face
 * (the family's own example, else a seeded search: ./worked-example.ts), the steps to the top with the ✨ rarity of each
 * as the server calibrated them, and the rule's parts named "(main part, tie-breaker)" (ux-lessons 2.6).
 */
import { useMemo } from "react";
import { GoalCard } from "@workspace/v2-views";
import { useGameScope, useMyRule, type LineRule } from "@/sdk";
import { partsNote } from "./lines";
import { workedExample } from "./worked-example";

function Card({ rule, rarities, parts }: { rule: LineRule; rarities: number[]; parts: number }) {
  const example = useMemo(() => workedExample(rule), [rule]);
  const note = partsNote(parts);
  return (
    <div className="space-y-2 p-3" data-testid="goal-card">
      {note && <p className="text-xs text-muted-foreground" data-testid="text-rule-parts">{note}</p>}
      <GoalCard rule={rule} example={example} rarities={rarities} />
    </div>
  );
}

function SeatedCard() {
  const my = useMyRule();
  if (!my) return <p className="p-4 text-sm text-muted-foreground">Dealing your rule…</p>;
  if (!my.rule) {
    // A deploy ahead of this page: the server's own words, without the drawings.
    return (
      <div className="space-y-1 p-4 text-sm" data-testid="goal-card">
        <p className="font-semibold">{my.row.title}</p>
        <p>{my.row.card}</p>
        <p className="text-muted-foreground">Reload the page to see your rule drawn with a worked example.</p>
      </div>
    );
  }
  return <Card rule={my.rule} rarities={my.rarities} parts={my.row.layers.length} />;
}

export function MyCardPane() {
  return useGameScope().seated ? <SeatedCard /> : <p className="p-4 text-sm text-muted-foreground" data-testid="goal-card-none">You hold no rule in this game.</p>;
}
