/**
 * Your secret goal: the goal card (core/goal/goal-card.tsx): your utility card in plain words, one example object you
 * can randomise or edit (hover it for its annotations), and how scoring works. Above the card: "Your points now" (your
 * total as last counted) and what your agents' latest act did to your rule score and points (score-lines.tsx). The card itself is
 * static: the same component renders a rule family's page in the rule gallery.
 */
import { useMemo } from "react";
import { instantiate } from "@workspace/game-types";
import { UtilityCardView, useGoalExplainer } from "@workspace/object-views";
import { useMutators, useMyAgents, useMyCard } from "@/sdk";
import { GoalCard } from "@/core/goal/goal-card";
import { PanelEmpty, type PanelProps } from "./kit";
import { LatestActLine, PointsNow, useOwnActLines } from "./score-lines";

export default function MyCard({ params }: PanelProps<"my-card">) {
  const card = useMyCard();
  const { instance } = useMutators();
  // Your own goal, as MyGoalProvider gives it to every grid (one explainer per game).
  const goal = useGoalExplainer();
  const inst = useMemo(() => {
    if (!instance) return null;
    try { return instantiate(instance.objectType, instance.args); } catch { return null; }
  }, [instance?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const { agents } = useMyAgents({ hz: 1 });
  const acts = useOwnActLines(agents);
  if (!card) return <PanelEmpty>Your secret goal is dealt when the game starts. Until then, nobody knows what anyone wants.</PanelEmpty>;
  return (
    <div className="space-y-4" data-testid="panel-utility">
      <div className="space-y-1 border-b border-[hsl(var(--card-border))] pb-3" data-testid="score-now">
        <PointsNow />
        <LatestActLine line={acts.latest} />
      </div>
      {/* Without the board's type (not yet observed, or unknown to this client) the card shows without its example object. */}
      {inst ? <GoalCard key={inst.key} card={card} goal={goal} inst={inst} sourceOpen={params.showSource} /> : <UtilityCardView card={card} goal={goal} sourceOpen={params.showSource} />}
    </div>
  );
}
