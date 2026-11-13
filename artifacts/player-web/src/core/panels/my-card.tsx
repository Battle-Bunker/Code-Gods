/**
 * Your secret goal: the goal card (core/goal/goal-card.tsx): your utility card in plain words, one example object you
 * can randomise or edit (hover it for its annotations), and how scoring works. Static apart from your own card: the
 * same component renders a rule family's page in the rule gallery.
 */
import { useMemo } from "react";
import { instantiate } from "@workspace/game-types";
import { UtilityCardView, useGoalExplainer } from "@workspace/object-views";
import { useMutators, useMyCard } from "@/sdk";
import { GoalCard } from "@/core/goal/goal-card";
import { bidOutcomeText, cardBid } from "@/site/lib/bidding";
import { PanelEmpty, type PanelProps } from "./kit";

export default function MyCard({ params }: PanelProps<"my-card">) {
  const card = useMyCard();
  const { instance } = useMutators();
  // Your own goal, as MyGoalProvider gives it to every grid (one explainer per game).
  const goal = useGoalExplainer();
  const inst = useMemo(() => {
    if (!instance) return null;
    try { return instantiate(instance.objectType, instance.args); } catch { return null; }
  }, [instance?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const bid = cardBid(card);
  if (!card) return <PanelEmpty>Your secret goal is dealt when the game starts. Until then, nobody knows what anyone wants.</PanelEmpty>;
  return (
    <div data-testid="panel-utility" className={bid ? "space-y-4" : undefined}>
      {/* A game dealt after a bid phase somebody won (docs/bid-phase.md): how this goal came to you, and what it costs. */}
      {bid && (
        <p className={`border-l-2 pl-3 text-sm ${bid.won ? "border-primary" : "border-[hsl(var(--accent))]"}`} data-testid="text-bid-outcome" data-won={bid.won ? "true" : "false"}>
          {bidOutcomeText(bid, card.name)}
        </p>
      )}
      {/* Without the board's type (not yet observed, or unknown to this client) the card shows without its example object. */}
      {inst ? <GoalCard key={inst.key} card={card} goal={goal} inst={inst} sourceOpen={params.showSource} /> : <UtilityCardView card={card} goal={goal} sourceOpen={params.showSource} />}
    </div>
  );
}
