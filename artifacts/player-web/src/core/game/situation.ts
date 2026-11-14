/**
 * Where the player stands, in one place: the observation, the room, the phase and the facts the next step, the chips
 * and the palette's gating read (seated, owner, players, agents, ready, pause used). A clock for countdowns.
 */
import { useEffect, useMemo, useState } from "react";
import type { Phase } from "@workspace/player-client/panels";
import { useDockState, useMyAgents, useRoomInfo } from "@/sdk";

export function useSituation() {
  const obs = useDockState({ hz: 1 });
  const room = useRoomInfo();
  const agentList = useMyAgents().agents;
  return useMemo(() => {
    const phase: Phase = obs?.phase ?? "lobby";
    return {
      obs, room, phase,
      seated: !!obs && obs.seated !== false && !!obs.gameId,
      isOwner: !!room && !!obs && room.ownerId === obs.self.godId,
      // Players of the next game: spectators watch (archive/engine-v1:docs/unify-apps-plan.md §2).
      players: room?.members.filter(m => !m.spectator).length ?? 0,
      agents: agentList.length, agentList,
      ready: obs?.self.ready ?? false,
      pauseUsed: !!obs?.self.pauseUsed,
    };
  }, [obs, room, agentList]);
}
export type Situation = ReturnType<typeof useSituation>;

/** The current time, re-rendering every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
