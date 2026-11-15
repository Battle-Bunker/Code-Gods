/**
 * The parts of this package that run anywhere (no sandbox, no Node APIs): births, the shipped starters and the summon
 * price. The engine's Convex mutations import this entry; `runAct` and `check` need the sandbox and Node.
 */
export * from "./births.ts";
export * from "./starters.ts";
export * from "./summon.ts";
export { CATALOGUE, LENSES, type FamilyEntry, type TieBreakerEntry, type Lens, type LensId } from "./catalogue.ts";
export { GRID_CATALOGUE, GRID_LENSES, type GridFamilyEntry, type GridTieBreakerEntry, type GridLens, type GridLensId } from "./grid-catalogue.ts";
export { gridUndescribed } from "./grid-starters.ts";
export * from "./host.ts";
export * from "./compat.gen.ts";
export { unopposedDirections, unopposedIn, WEAK_BELOW, OPPORTUNITY_FRACTION, LADDER_SLOPE, type UnopposedDirection } from "./unopposed.ts";
export { TENSION, type TensionTable } from "./tension.gen.ts";
export { readLeave, setLeave } from "./leave.ts";
