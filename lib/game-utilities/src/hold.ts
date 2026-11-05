/**
 * Hold rarity's lookup (docs/energy-model.md §8): the correction a game with m other players adds to a reward's static
 * surprisal. The tables are estimated by scripts/hold.ts (Node, the engine); this lookup is what every scorer shares:
 * the engine, the client evaluator and the score explainer.
 */
import { cmpOrdinal, surprisal, type CalibrationTable } from "./calibration.ts";
import type { Ordinal } from "./types.ts";

/** The estimator's identity, part of every cached hold table's key. */
export const HOLD_ESTIMATOR = { id: "hold-ams", version: 1 } as const;

/** A hold correction table for one draw and one m: [level, hold bits] with levels strictly increasing. */
export interface HoldTable {
  readonly m: number;
  readonly levels: readonly (readonly [Ordinal, number])[];
  readonly noise: string;
  readonly estimator: typeof HOLD_ESTIMATOR & { readonly seed: string; readonly particles: number };
}

/** Hold bits at `ordinal`: interpolated between levels, 0 below the lowest, the top level's above it (never extrapolated). */
export function holdBits(table: HoldTable | null | undefined, ordinal: Ordinal): number {
  if (!table || table.m === 0 || !table.levels.length) return 0;
  if (cmpOrdinal(ordinal, table.levels[0][0]) < 0) return 0;
  return Math.max(0, surprisal({ levels: table.levels, slope: 0 } as unknown as CalibrationTable, ordinal));
}
