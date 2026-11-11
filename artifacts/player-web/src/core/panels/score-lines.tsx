/**
 * The score a player can read, drawn from subscriptions the dock already holds (no query of its own):
 *   <PointsNow>          "Your points now: X": your own live total (dock.state `self.score`, the number the leaderboard ranks);
 *   useOwnActLines()     one plain sentence per agent for its latest act (score-line.ts): what it changed, what that did to
 *                        your rule score on that object (your goal program on the two values) and to the object's points
 *                        (the recent events, player.events, the feed's own subscription).
 */
import { useMemo } from "react";
import { useGoalExplainer } from "@workspace/object-views";
import { SCORE_LINES, Term } from "@workspace/ui-kit";
import { useDockState, useEvents, useObjectContext } from "@/sdk";
import { agentLabel } from "./agent-name";
import { actLine, latestOwnActs, pointsNowText, type OwnAct } from "./score-line";

/** "Your points now": one running figure, the same number wherever it is shown. */
export function PointsNow({ className = "" }: { className?: string }) {
  const score = useDockState({ hz: 1 })?.self.score;
  if (typeof score !== "number") return null;
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${className}`} title={`${SCORE_LINES.points} ${SCORE_LINES.total}`} data-testid="text-points-now">
      <span className="text-sm font-semibold">Your <Term id="payoff">points</Term> now:</span>
      <span className={`font-mono text-2xl font-semibold leading-none tabular-nums ${score < 0 ? "text-destructive" : ""}`} data-testid="value-points-now">{pointsNowText(score)}</span>
      <span className="text-xs text-muted-foreground">every object's points added up; this is what the leaderboard ranks</span>
    </p>
  );
}

export interface OwnActLines {
  /** Agent id → the sentence for its latest act among the recent events. */
  byAgent: ReadonlyMap<string, string>;
  /** The sentence for the latest act of any of your agents. */
  latest?: string;
}

/** The latest act of each of `agents` as a sentence. Empty before any of them has changed an object. */
export function useOwnActLines(agents: readonly { id: string; name?: string }[]): OwnActLines {
  const events = useEvents({ hz: 1, limit: 50 });
  const goal = useGoalExplainer();
  const { noun } = useObjectContext();
  return useMemo(() => {
    const acts = latestOwnActs(events);
    const say = (act: OwnAct): string => {
      const index = agents.findIndex(a => a.id === act.agentId);
      const score = (value: OwnAct["before"]) => { try { return goal?.score(value) ?? null; } catch { return null; } };
      return actLine({
        agent: agentLabel(agents[index]?.name, Math.max(0, index)), before: act.before, after: act.after, noun,
        ruleBefore: score(act.before), ruleAfter: score(act.after), pointsBefore: act.pointsBefore, pointsAfter: act.pointsAfter,
      });
    };
    const byAgent = new Map<string, string>();
    for (const [id, act] of acts) byAgent.set(id, say(act));
    return { byAgent, latest: acts.latest ? say(acts.latest) : undefined };
  }, [events, goal, noun, agents]);
}

/** The latest act of any of your agents, under "Your points now". */
export function LatestActLine({ line }: { line?: string }) {
  return line ? <p className="text-sm leading-snug" aria-live="polite" data-testid="text-latest-act">{line}</p> : null;
}
