/**
 * A goal card: the utility card in plain words (its source collapsed unless asked), ONE example object you can
 * randomise or edit, and how scoring works. Static: it reads nothing from the server, so the "Your secret goal" panel
 * (core/panels/my-card.tsx) and the rule gallery's family page render it identically.
 * Hovering (or clicking) the example object opens its rich view, explained with `goal` like every grid in a game.
 */
import { useMemo, useState } from "react";
import type { Instantiation, ObjectValue } from "@workspace/game-types";
import type { GoalExplainer } from "@workspace/game-utilities";
import {
  GoalExplainerProvider, HowScoringWorks, ObjectView, UtilityCardView, objectContext, objectNoun, type UtilityCardLike,
} from "@workspace/object-views";
import { randomObject } from "@/lib/object-editor-model";
import { ObjectEditor } from "./object-editors";

export interface GoalCardProps {
  card: UtilityCardLike;
  /** The goal's explainer on this board (null for object types without annotations). */
  goal: GoalExplainer | null;
  inst: Instantiation;
  /** Whether the source starts expanded. */
  sourceOpen?: boolean;
  /** The first example object (default: a random one). */
  initialExample?: ObjectValue;
}

const freshSeed = () => Math.floor(Math.random() * 2 ** 31);
const ordinalText = (o: ReturnType<GoalExplainer["score"]>) => (o === null ? "–" : typeof o === "number" ? String(o) : `(${o.join(", ")})`);

export function GoalCard({ card, goal, inst, sourceOpen = false, initialExample }: GoalCardProps) {
  const ctx = useMemo(() => objectContext({ objectType: inst.objectType, args: inst.args as Record<string, number | string> }), [inst]);
  const noun = objectNoun(inst.objectType);
  const [example, setExample] = useState<ObjectValue>(() => initialExample ?? randomObject(inst, freshSeed()));
  const [editing, setEditing] = useState(false);
  const score = useMemo(() => goal?.score(example) ?? null, [goal, example]);
  return (
    <div className="space-y-5" data-testid="goal-card">
      <UtilityCardView card={card} grid={ctx.grid} goal={goal} sourceOpen={sourceOpen} />
      <section className="space-y-2" data-testid="goal-card-example-object">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="label !text-[hsl(var(--foreground))]">Try a {noun}</h3>
          <span className="flex gap-2">
            <button type="button" className="border px-2 py-0.5 text-xs hover:bg-muted" data-testid="button-randomise-example"
              onClick={() => setExample(randomObject(inst, freshSeed()))}>🎲 Randomise</button>
            <button type="button" className="border px-2 py-0.5 text-xs hover:bg-muted" aria-expanded={editing} data-testid="button-edit-example"
              onClick={() => setEditing(e => !e)}>{editing ? "Done editing" : "✏️ Edit"}</button>
          </span>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <GoalExplainerProvider value={goal}>
            <span data-testid="example-object"><ObjectView value={example} {...ctx} /></span>
          </GoalExplainerProvider>
          {goal && <span className="text-sm">Your rule scores it <span className="font-mono font-semibold" data-testid="example-object-score">{ordinalText(score)}</span>{goal.rich ? "; hover it to see why." : "."}</span>}
        </div>
        {editing && <ObjectEditor value={example} inst={inst} onChange={setExample} />}
      </section>
      <HowScoringWorks noun={noun} />
    </div>
  );
}
