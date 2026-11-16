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
import { checkAct, performPanelAction } from "../panes/panel-actions";
export * from "../sdk/panel-kit";
export {
  useRoomInfo, useGame, useMe, useMyRule, useMyAgents, useAgentCount, useLeaderboard, useStandingsHistory, useDigest,
  useMyObject, useMyObjects, useAgentEnergy, useAgentPrograms, useObjectIds, useSpectatorObjectIds, useMoves, useChat, useOthersBlurred,
} from "../sdk/hooks";


/** A file panel's actions: the developer's own code, so they run through the app's runtime without a confirmation. */
export function useActions(): PanelActions {
  const rt = useRuntime();
  const game = useGame();
  const seated = !!game?.me, phase = game?.phase;
  return useMemo(() => actionsOver(async (op, args) => {
    const command = checkAct(op, args);
    return "error" in command ? { ok: false, error: { code: "refused", message: command.error } } : performPanelAction(rt.perform, command);
  }, seated && phase !== "ended"), [rt, seated, phase]);
}
