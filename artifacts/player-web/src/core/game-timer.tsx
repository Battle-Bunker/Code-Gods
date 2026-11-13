import { useRef } from "react";
import { advanceWorld, gameTimer } from "@workspace/game-core";
import { GameTimerView } from "./game-timer-view";
import { useNow, useSituation } from "./game/situation";

/** The dock's game timer, under the header: counts down from the observation, ticking locally (no per-second reads). */
export function DockGameTimer() {
  const { obs } = useSituation();
  const now = useNow(1000);
  // The observation's world time as of when it arrived; the clock runs on from there while the world runs.
  const base = useRef<{ obs: unknown; at: number }>({ obs: null, at: now });
  if (base.current.obs !== obs) base.current = { obs, at: Date.now() };
  if (!obs || obs.phase === "lobby" || (obs.phase === "ended" && !obs.gameId)) return null;
  // While planning counts down, the planning line under the header carries the one countdown (header.tsx PlanningBar).
  if (obs.phase === "planning" && obs.planningEndsAt && obs.planningEndsAt > now) return null;
  const eco = obs.economy;
  const world = advanceWorld(eco?.worldSeconds ?? 0, base.current.at, now, obs.phase === "running");
  return <GameTimerView timer={gameTimer({ phase: obs.phase, endReason: obs.endReason ?? null, durationMode: eco?.durationMode, lengthSeconds: eco?.lengthSeconds, world, planningEndsAt: obs.planningEndsAt, nowMs: now })} />;
}
