/**
 * Your own goal, explained (docs/annotations-design.md): `useMyGoal()` is an explainer of YOUR utility on this game's
 * board (null when you are not seated, or the game is not a Grid game); `MyGoalProvider` gives it to every grid below
 * it, so each grid's rich view (hover a compact grid) explains the grid with your goal. Built in this client from your
 * own descriptor (`player.myUtility`); nobody else's goal is ever available here.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GameSettings } from "@workspace/game-core";
import { instantiate } from "@workspace/game-types";
import { explainer, type CalibrationTable, type GoalExplainer, type UtilityDescriptor } from "@workspace/game-utilities";
import { GoalExplainerProvider } from "@workspace/object-views";
import { loadTables } from "@sdk-transport";
import { useMyUtility } from "./hooks";

/**
 * Your calibration tables and the scoring function that finish "How this scores" (rarity, bits, net): loaded once per
 * game from the engine, as the local evaluator does. Until then (or if they fail) the goal explains without that section.
 */
function useScoringInputs(key: string, mine: ReturnType<typeof useMyUtility>) {
  const [loaded, setLoaded] = useState<{ key: string; tables: { reward: CalibrationTable; penalty?: CalibrationTable }; netBits: (typeof import("@workspace/game-core"))["netBits"] }>();
  useEffect(() => {
    if (!mine || loaded?.key === key) return;
    let live = true;
    void Promise.all([loadTables(mine.settings as GameSettings, mine.utility as UtilityDescriptor), import("@workspace/game-core")])
      .then(([tables, core]) => { if (live) setLoaded({ key, tables: tables as { reward: CalibrationTable; penalty?: CalibrationTable }, netBits: core.netBits }); })
      .catch(error => console.warn("[sdk] score workings unavailable:", error));
    return () => { live = false; };
  }, [key, mine, loaded?.key]);
  return loaded?.key === key ? loaded : undefined;
}

export function useMyGoal(): GoalExplainer | null {
  const mine = useMyUtility();
  const descriptor = mine?.utility as UtilityDescriptor | undefined;
  const settings = mine?.settings as { objectType: string; typeArgs?: Record<string, number | string>; penaltyWeight?: number } | undefined;
  const key = mine ? `${mine.gameId}:${mine.godId}` : "";
  const scoring = useScoringInputs(key, mine);
  return useMemo(() => {
    if (!descriptor || !settings) return null;
    try {
      return explainer({ familyId: descriptor.familyId, params: descriptor.params }, instantiate(settings.objectType, settings.typeArgs ?? {}), scoring ? {
        tables: scoring.tables, netBits: scoring.netBits,
        ...(descriptor.penalty ? { defence: { draw: { familyId: descriptor.penalty.familyId, params: descriptor.penalty.params }, weight: settings.penaltyWeight ?? 1 } } : {}),
      } : {});
    } catch { return null; }
    // The game and the player decide the goal; the query re-sends equal objects.
  }, [key, scoring]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function MyGoalProvider({ children }: { children: ReactNode }) {
  return <GoalExplainerProvider value={useMyGoal()}>{children}</GoalExplainerProvider>;
}
