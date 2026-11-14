/**
 * The previous version a replace replaced (the runner remembers it), bound to its own agent in THIS game
 * (first-agent.ts previousTarget): cleared in another game or when that agent is gone. Here too the new version's
 * first counted moves are accumulated, from the replace on. My agents and the forge both read it here.
 */
import { useEffect } from "react";
import { runner, useRunner } from "@/core/game/runner";
import { COMPARE_OVER, previousTarget, replaceBoundary, type PreviousVersion } from "./first-agent";
import { accumulateFirstMoves } from "./score-line";

type Events = Parameters<typeof accumulateFirstMoves>[1];

export function usePreviousVersion(gameId: string | undefined, agents: readonly { id: string }[], loading: boolean,
  /** The recent events (the act lines' own subscription) to count that agent's first moves from. */ events?: Events,
  /** The world time now: when the replace's own event is not among the events, the time its receipt was first seen stands for it. */ worldNow?: number): { previous: PreviousVersion; agentId: string } | null {
  const { previous } = useRunner();
  // While the agent list loads, an empty list is not "the agent is gone".
  const step = loading ? { wait: true as const } : previousTarget(previous, gameId, agents);
  const clear = "clear" in step;
  useEffect(() => { if (clear) runner.clearPrevious(); }, [clear]);
  // When the replace happened: its OWN `agent.replaced` event's world time (at or after the press), which overwrites
  // the stand-in (the time the receipt was first seen) used until that event arrives (first-agent.ts replaceBoundary).
  useEffect(() => {
    const boundary = replaceBoundary(previous, events ?? [], worldNow);
    if (boundary) runner.setPreviousWorld(boundary.world, boundary.fromEvent);
  }, [previous, events, worldNow]);
  // Its first counted moves since then, accumulated as they arrive and frozen at COMPARE_OVER: the comparison never rolls.
  useEffect(() => {
    if (!previous || previous.replacedWorld === undefined || !events) return;
    const next = accumulateFirstMoves(previous.since, events, previous.agentId, COMPARE_OVER, previous.replacedWorld);
    if (next !== previous.since) runner.setPreviousSince(next);
  }, [previous, events]);
  return previous && "target" in step ? { previous, agentId: step.target } : null;
}
