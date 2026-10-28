/**
 * Calibration boundary of the engine: surprisal tables for (family, params, instantiation, prior), from the
 * shipped, versioned tables of lib/game-utilities (src/calibration.ts, data/calibration/v1).
 */
import { UNIFORM_PRIOR, type PriorRef } from "@workspace/game-utilities";
export { tableFor, hasTable, surprisal, penaltyMeanBits, offeredInstantiations, type CalibrationTable } from "@workspace/game-utilities";

/** The reference priors the calibration tables are keyed by (settings.priorId). */
export const PRIORS: Readonly<Record<string, PriorRef>> = Object.freeze({ [UNIFORM_PRIOR.id]: UNIFORM_PRIOR });
export function priorOf(priorId: string): PriorRef {
  const prior = PRIORS[priorId];
  if (!prior) throw Object.assign(new Error(`Unknown prior ${priorId}: choose one of ${Object.keys(PRIORS).join(", ")}`), { status: 400 });
  return prior;
}
