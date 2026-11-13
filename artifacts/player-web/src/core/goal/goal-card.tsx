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
  exampleRarityLine, scaleRowText, sparkleMeans,
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
  const rarity = useMemo(() => (goal && score !== null ? goal.rarity(score) : null), [goal, score]);
  const scale = useMemo(() => goal?.scale(5) ?? [], [goal]);
  // The scale starts open where there is room for it, closed on a phone.
  const [wide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 640px)").matches);
  return (
    <div className="space-y-5" data-testid="goal-card">
      {/* A tiered rule's ★ block opens once the example object reaches its gate (or already holds a tier point). */}
      <UtilityCardView card={card} grid={ctx.grid} goal={goal} ordinal={score} sourceOpen={sourceOpen} />
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
          {goal && <span className="text-sm">Your rule score for this {noun}: <span className="font-mono font-semibold" data-testid="example-object-score">{ordinalText(score)}</span>{goal.rich ? " (hover it to see why)." : "."}</span>}
        </div>
        {editing && <ObjectEditor value={example} inst={inst} onChange={setExample} />}
        {/* Rule score → ✨ rarity, from the player's own table (the game's; absent in the rule gallery): this board's
            line, then a short scale, so the size of a move can be anticipated. Closed on a phone. */}
        {rarity !== null && score !== null && <p className="text-sm" data-testid="text-example-rarity">{exampleRarityLine(typeof score === "number" ? [score] : score, rarity, noun)}</p>}
        {scale.length > 1 && (
          <details className="text-sm" data-testid="details-rarity-scale" open={wide}>
            <summary className="cursor-pointer font-medium">How rare is each rule score?</summary>
            <ul className="mt-1 space-y-0.5 font-mono text-xs" data-testid="list-rarity-scale">
              {scale.map(row => <li key={row.ordinal.join(",")}>{scaleRowText(row, noun)}</li>)}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="text-sparkle-means">{sparkleMeans(noun)}{scale[0].ordinal.length > 1 ? " Each row is the lowest rule score with that primary value." : ""}</p>
          </details>
        )}
      </section>
      <HowScoringWorks noun={noun} />
    </div>
  );
}
