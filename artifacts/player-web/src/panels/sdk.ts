/**
 * `@sdk` version 2 as a file panel (src/panels/*.tsx) imports it: the same names as a stored panel's frame SDK
 * (src/frame/sdk.ts), with the app's own hooks running in the page instead of over the bridge. A file panel is the
 * developer's own source, built with the app (v1's file panels ran in-process too); ./sdk-parity.ts keeps the two
 * SDKs' names identical, so a file panel saved as a stored panel runs unchanged.
 */
import { useMemo } from "react";
import { useRuntime } from "../core/affordance-runtime";
import { useGame } from "../sdk/hooks";
import { actionsOver, type PanelActions } from "../sdk/panel-actions-sdk";
import type { AffordanceId } from "@workspace/v2-affordances";
export * from "../sdk/panel-kit";
export {
  useRoomInfo, useGame, useMe, useMyRule, useMyAgents, useAgentCount, useLeaderboard, useStandingsHistory, useDigest,
  useMyObject, useMyObjects, useAgentEnergy, useAgentPrograms, useObjectIds, useSpectatorObjectIds, useMoves, useChat, useOthersBlurred,
} from "../sdk/hooks";


/** A file panel's actions: the developer's own code, so they run through the app's runtime without a confirmation. */
export function useActions(): PanelActions {
  const rt = useRuntime();
  const game = useGame();
  return useMemo(() => actionsOver(async (op, args) => {
    const out = await rt.perform(op as AffordanceId, { ...args, requestId: crypto.randomUUID() });
    return out.ok ? { ok: true, result: out.result } : { ok: false, error: { code: out.error.code, message: out.error.message } };
  }, !!game?.me && game.phase !== "ended"), [rt, game?.me, game?.phase]);
}
