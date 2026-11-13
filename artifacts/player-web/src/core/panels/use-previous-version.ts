/**
 * The previous version a replace replaced (the runner remembers it), bound to the live agent it belongs to in THIS
 * game (first-agent.ts previousTarget): the agent is identified once the agent list shows it, and the memory is
 * cleared in another game or when that agent is gone. My agents and the forge both read it here.
 */
import { useEffect } from "react";
import { runner, useRunner } from "@/core/game/runner";
import { COMPARE_OVER, previousTarget, type PreviousVersion } from "./first-agent";
import { accumulateFirstMoves } from "./score-line";

export function usePreviousVersion(gameId: string | undefined, agents: readonly { id: string; source?: string }[], loading: boolean,
  /** The recent events (the act lines' own subscription) to count that agent's first moves from; none where the earnings are not counted (paid looks). */ events?: Parameters<typeof accumulateFirstMoves>[1]): { previous: PreviousVersion; agentId: string } | null {
  const { previous } = useRunner();
  // While the agent list loads, an empty list is not "the agent is gone".
  const step = loading ? { wait: true as const } : previousTarget(previous, gameId, agents);
  const adopt = "adopt" in step ? step.adopt : undefined, clear = "clear" in step;
  useEffect(() => {
    if (clear) runner.clearPrevious();
    else if (adopt) runner.adoptPrevious(adopt);
  }, [adopt, clear]);
  // Its first counted moves, accumulated as they arrive and frozen at COMPARE_OVER: the comparison never rolls.
  const agentId = previous?.agentId;
  useEffect(() => {
    if (!previous || !agentId || !events) return;
    const next = accumulateFirstMoves(previous.since, events, agentId, COMPARE_OVER);
    if (next !== previous.since) runner.setPreviousSince(next);
  }, [previous, agentId, events]);
  if (!previous) return null;
  return "target" in step ? { previous, agentId: step.target } : adopt ? { previous, agentId: adopt } : null;
}
