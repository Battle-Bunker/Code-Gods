/**
 * The parts of this package that run anywhere (no sandbox, no Node APIs): births, the shipped starters and the summon
 * price. The engine's Convex mutations import this entry; `runAct` and `check` need the sandbox and Node.
 */
export * from "./births.ts";
export * from "./starters.ts";
export * from "./summon.ts";
export { CATALOGUE, LENSES, type FamilyEntry, type TieBreakerEntry, type Lens, type LensId } from "./catalogue.ts";
export * from "./host.ts";
