/**
 * Calibration boundary of the engine: surprisal tables for (family, params, instantiation).
 *
 * The product implementation is lib/game-utilities/src/calibration.ts (shipped, versioned tables).
 * Until that package exports it with its data generated, this re-exports a server-side fallback with
 * the SAME signatures (calibration-fallback.ts). Wiring the real tables is this one line:
 *
 *   export { tableFor, hasTable, surprisal, penaltyMeanBits, offeredInstantiations } from "@workspace/game-utilities";
 */
export { tableFor, hasTable, surprisal, penaltyMeanBits, offeredInstantiations, type CalibrationTable } from "./calibration-fallback.ts";
