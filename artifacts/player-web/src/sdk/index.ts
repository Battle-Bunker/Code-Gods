/**
 * The Panel SDK: everything a panel may import (`import { … } from "@sdk"`). See docs/panels.md.
 *
 *   definePanel                     declare a panel (one per file in src/panels/)
 *   data hooks                      useGame, useObjects, useMyCard, useMyAgents, useLeaderboard, useChat,
 *                                   useRoomInfo, useMutators, useEvents, useTrajectories, useObjectHistory,
 *                                   useMyUtility, useObservation
 *   local evaluation                useEvaluator → score(value), apply(value, calls)
 *   your goal, explained            useMyGoal → explainer for GoalBoard; MyGoalProvider explains grids' rich views
 *   actions                         useActions → validate, summon, destroy, chat, pause, ready, retry
 *   rate limits                     useThrottled, useSnapshot (every live hook takes { hz }, max 5)
 *   rendering                       Obj, ObjectGrid, ObjectView, TransformationView, useObjectContext,
 *                                   Sparkline, LineChart, BarList, ScatterPlot, Heatmap, Timeline, Table, Legend
 */
export { definePanel } from "../shell/panel-types";
export type { PanelDefinition, Placement, PanelSize } from "../shell/panel-types";
export { useRoom, type PlayerRoom } from "./context";
export * from "./hooks";
export { useActions, type Language } from "./actions";
export { createEvaluator, type Evaluator, type OwnScore } from "./evaluator";
export { useMyGoal, MyGoalProvider } from "./goal";
export { useThrottled, useSnapshot, DEFAULT_HZ, MAX_HZ } from "./throttle";
export * from "./charts";
export * from "./objects";
