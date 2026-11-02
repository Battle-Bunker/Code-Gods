/**
 * Your own goal, explained (docs/annotations-design.md): `useMyGoal()` is an explainer of YOUR utility on this game's
 * board (null when you are not seated, or the game is not a Grid game); `MyGoalProvider` gives it to every grid below
 * it, so each grid's rich view (hover a compact grid) explains the grid with your goal. Built in this client from your
 * own descriptor (`player.myUtility`); nobody else's goal is ever available here.
 */
import { useMemo, type ReactNode } from "react";
import { instantiate } from "@workspace/game-types";
import { explainer, type GoalExplainer, type UtilityDescriptor } from "@workspace/game-utilities";
import { GoalExplainerProvider } from "@workspace/object-views";
import { useMyUtility } from "./hooks";

export function useMyGoal(): GoalExplainer | null {
  const mine = useMyUtility();
  const descriptor = mine?.utility as UtilityDescriptor | undefined;
  const settings = mine?.settings as { objectType: string; typeArgs?: Record<string, number | string> } | undefined;
  const key = mine ? `${mine.gameId}:${mine.godId}` : "";
  return useMemo(() => {
    if (!descriptor || !settings) return null;
    try {
      return explainer({ familyId: descriptor.familyId, params: descriptor.params }, instantiate(settings.objectType, settings.typeArgs ?? {}));
    } catch { return null; }
    // The game and the player decide the goal; the query re-sends equal objects.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function MyGoalProvider({ children }: { children: ReactNode }) {
  return <GoalExplainerProvider value={useMyGoal()}>{children}</GoalExplainerProvider>;
}
