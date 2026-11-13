/**
 * The one next step (./next-step.ts) bound to its action: open a panel, the forge, start the game, or a palette
 * command. Shared by Where am I and the objects panel's empty states (the default panel before the world runs).
 */
import type { Phase } from "@workspace/player-client/panels";
import { useMyAgents } from "@/sdk";
import { useDockActions } from "@/dock/actions";
import { useOwnerActions } from "@/core/game/owner";
import { useSituation } from "@/core/game/situation";
import { useStartView } from "@/core/game/start";
import { paletteStore } from "@/core/palette/store";
import { nextStep } from "./next-step";
import { useAffordances } from "@/core/use-affordances";

export function useNextStep(paneId: string, phase: Phase) {
  const situation = useSituation();
  const { agents } = useMyAgents({ hz: 1 });
  const dock = useDockActions();
  const owner = useOwnerActions();
  const start = useStartView();
  const step = nextStep({ phase, seated: situation.seated, isOwner: situation.isOwner, players: situation.players, agents: agents.length, start, aiEnabled: situation.room?.aiEnabled });
  // Read-only (a replay, a read-only credential): only a step that opens a panel is offered; one that acts is not shown.
  const { can } = useAffordances();
  const offered = step.action.kind === "panel" || can.roomStep.ok;
  const go = () => {
    if (step.busy || !offered) return;
    const action = step.action;
    if (action.kind === "panel") dock.show(action.panelId);
    else if (action.kind === "forge") { if (agents.length) dock.forgeEdit(); else dock.summonFirst(); }
    else if (action.kind === "start") void owner.start();
    else paletteStore.open(paneId, step.label);
  };
  return { step, go, offered, situation, agents };
}
