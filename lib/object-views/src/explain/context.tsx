/**
 * Which goal explains the grids an app shows (docs/annotations-design.md §3, §7). An app that knows the viewer's own
 * utility provides its explainer; every grid's rich (popover) view then explains the grid with that goal, starting on
 * the top-left cell. Without a provider, grids are drawn as before. Only ever provide the viewer's OWN goal.
 */
import { createContext, useContext } from "react";
import type { GoalExplainer } from "@workspace/game-utilities";

const GoalContext = createContext<GoalExplainer | null>(null);

export const GoalExplainerProvider = GoalContext.Provider;
/** The goal grids are explained with here, or null. */
export const useGoalExplainer = (): GoalExplainer | null => useContext(GoalContext);
