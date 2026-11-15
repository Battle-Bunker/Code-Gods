/**
 * Your secret goal (the `my-card` pane): the dealt rule's card in plain words; the line in your focus explained first
 * (its parts on their rulers, the moves that would make it rarer: docs/engine-v2/annotations-design.md, owner decision
 * 23: no steps); then a worked example (the family's own, else the most legible from a seeded walk: lib/v2-views example.ts); and the rule's
 * parts named "(main part, tie-breaker)" (ux-lessons 2.6).
 */
import { useMemo } from "react";
import { DriftOnCard } from "./drift";
import { GoalCard, workedExample } from "@workspace/v2-views";
import type { Score } from "@workspace/v2-core";
import { decodeState, objectWord, useGame, useGameScope, useMyObject, useMyRule, type GameRule } from "@/sdk";
import { useView } from "@/core/affordance-runtime";
import { partsNote } from "./lines";

/** The line in the human's focus (Lines, One line, the palette), decoded, with its name: "Line 7". */
function useFocusedMine(): { state: unknown; name: string } | null {
  const focus = useView().focus;
  const header = useGame();
  const o = useMyObject(focus?.objectId);
  const state = useMemo(() => (focus && o ? decodeState(o.state, header?.variant) : null), [focus, o?.state, header?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!focus || !o || !state) return null;
  const word = objectWord(header?.variant);
  return { state, name: `${word.One} ${o.number}` };
}

function Card({ rule, parts, value }: { rule: GameRule; parts: number; value: ((u: Score) => number) | null }) {
  const example = useMemo(() => workedExample(rule, value), [rule, value]);
  const mine = useFocusedMine();
  const word = objectWord(rule.variant.id);
  const note = partsNote(parts, word.one, word.many);
  return (
    <div className="space-y-2 p-3" data-testid="goal-card">
      {note && <p className="text-xs text-muted-foreground" data-testid="text-rule-parts">{note}</p>}
      <GoalCard rule={rule} example={example} mine={mine} value={value ?? undefined} />
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
  return (<>
    <DriftOnCard />
    <Card rule={my.rule} parts={my.row.layers.length} value={my.bits} />
  </>);
}

export function MyCardPane() {
  return useGameScope().seated ? <SeatedCard /> : <p className="p-4 text-sm text-muted-foreground" data-testid="goal-card-none">You hold no rule in this game.</p>;
}
