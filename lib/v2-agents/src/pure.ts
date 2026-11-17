/**
 * The parts of this package that run anywhere (no sandbox, no Node APIs): births, the shipped starters and the summon
 * price. The engine's Convex mutations import this entry; `runAct` and `check` need the sandbox and Node.
 */
export * from "./births.ts";
export * from "./starters.ts";
export * from "./summon.ts";
export { CATALOGUE, LENSES, type FamilyEntry, type TieBreakerEntry, type Lens, type LensId } from "./catalogue.ts";
export { GRID_CATALOGUE, GRID_LENSES, type GridFamilyEntry, type GridTieBreakerEntry, type GridLens, type GridLensId } from "./grid-catalogue.ts";
export { gridUndescribed, isGridFamily } from "./grid-starters.ts";
export { boardUndescribed, isBoardFamily, BOARD_CATALOGUE } from "./board-starters.ts";
export * from "./host.ts";
export { readLeave, setLeave } from "./leave.ts";
export { watcherFor, type WatcherAgent, type WatcherType } from "./watcher.ts";
export { agentPrimer, HELPERS } from "./primer.ts";
export { fitRules, nnls, SIGMA_FLOOR_BITS, type FitCandidate, type FitHint, type FitInput, type FitResult, type FitHypothesis } from "./inference.ts";
export { READY_PREDICATES, type ReadyPredicate } from "./ready-predicates.ts";
