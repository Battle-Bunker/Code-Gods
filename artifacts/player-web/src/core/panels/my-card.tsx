/** Your secret goal: the utility card in plain words, how scoring works, and live objects that score best (or worst) for you. */
import { HowScoringWorks, ScoreBreakdown, UtilityCardView } from "@workspace/object-views";
import { Obj, useMyCard, useObjectContext, useObjects } from "@/sdk";
import { PanelEmpty, Section, referObject, useObjectRanks, type PanelProps } from "./kit";

export default function MyCard({ params, phase }: PanelProps<"my-card">) {
  const card = useMyCard();
  const objects = useObjects({ hz: 1 });
  const ranks = useObjectRanks(objects);
  const { noun, ctx } = useObjectContext();
  if (!card) return <PanelEmpty>Your secret goal is dealt when the game starts. Until then, nobody knows what anyone wants.</PanelEmpty>;
  const examples = [...objects].sort((a, b) => (params.exampleSort === "best" ? b.own.netBits - a.own.netBits : a.own.netBits - b.own.netBits)).slice(0, params.examples);
  return (
    <div className="space-y-5" data-testid="panel-utility">
      <UtilityCardView card={card} grid={ctx.grid} />
      {params.showSource && <pre className="max-h-48 overflow-auto bg-secondary p-3 font-mono text-[12px] text-secondary-foreground">{card.source}</pre>}
      {params.examples > 0 && (
        <Section title={`${phase === "ended" ? "Final" : "Live"} ${noun}s you like ${params.exampleSort === "best" ? "most" : "least"}`}>
          {examples.length === 0 ? <p className="text-sm text-muted-foreground">No {noun}s yet: they appear when the world starts.</p> : (
            <ul className="space-y-2">
              {examples.map(o => (
                <li key={o.id} className="flex items-start gap-3">
                  <button type="button" className="shrink-0 font-mono text-xs" onClick={() => referObject(ranks.get(o.id))} title="Ask your assistant about this object">#{ranks.get(o.id)} <Obj value={o.value} /></button>
                  <span className="min-w-0 text-sm"><ScoreBreakdown score={o} noun={noun} comparative={card.penalty?.comparative} compact /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      <HowScoringWorks noun={noun} />
    </div>
  );
}
