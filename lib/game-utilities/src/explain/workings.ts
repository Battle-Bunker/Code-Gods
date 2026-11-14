/**
 * "How this scores": the steps from a board to its bits, worked with the real numbers (the player's own utility only).
 *
 *   1. raw score    the lens's breakdown (parts tallied by kind), verified to add up to the card's ordinal;
 *   2. rarity       P = 2^-bits, the share of random boards (the spawn prior) that score at least this, from the
 *                   calibration table the engine uses; bits are the engine's own `surprisal(table, ordinal)`;
 *   3. defence      a defence goal's badness ordinal -> surprisal -> softHinge, less its prior mean (E_μ h);
 *   4. net bits     n = s⁺ − w (h − E_μ h), the engine's `netBits` (injected: game-core), which then enters
 *                   yours × others' care = payoff.
 *
 * Nothing here re-derives a score: the ordinal is the card program's, the bits are `surprisal`, the penalty terms are
 * `softHinge` and `penaltyMeanBits`; the tests compare them with the engine's own calls.
 */
import type { CalibrationTable } from "../calibration.ts";
import { cmpOrdinal, penaltyMeanBits, softHinge, surprisal } from "../calibration.ts";
import type { Ordinal } from "../types.ts";
import type { Breakdown } from "./model.ts";

export interface WorkingsTables { readonly reward: CalibrationTable; readonly penalty?: CalibrationTable }

/** How the table gave this ordinal's bits: at one of its steps, interpolated between two, or beyond either end. */
export type TableSpot = "step" | "between" | "below" | "above";

export interface RarityWorkings {
  readonly ordinal: readonly number[];
  /** The engine's reward bits s⁺ for this ordinal. */
  readonly bits: number;
  /** P = 2^-bits: the chance a random board scores at least this. */
  readonly probability: number;
  readonly spot: TableSpot;
  /** The distribution: for each value of the first component, the bits of the lowest table step with it. */
  readonly curve: readonly { readonly score: number; readonly bits: number }[];
}

export interface DefenceWorkings {
  readonly ordinal: readonly number[];
  /** s⁻: surprisal of the badness ordinal. */
  readonly badnessBits: number;
  /** h = softHinge(s⁻). */
  readonly penaltyBits: number;
  /** E_μ h: the average penalty over random boards. */
  readonly meanBits: number;
  readonly weight: number;
}

export interface ScoreWorkings {
  readonly components: readonly string[];
  /** The breakdown's own lines, `total` = the card's ordinal. */
  readonly breakdown: Breakdown & { readonly total: readonly number[] };
  readonly rarity: RarityWorkings;
  readonly defence?: DefenceWorkings;
  /** n, the net bits (= s⁺ without a defence goal), when the caller supplied `netBits`. */
  readonly netBits?: number;
}

const arr = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);
const bits0 = (x: number) => (x === 0 ? 0 : x);

function spotOf(table: CalibrationTable, ordinal: Ordinal): TableSpot {
  const L = table.levels;
  if (cmpOrdinal(ordinal, L[0][0]) < 0) return "below";
  if (cmpOrdinal(ordinal, L[L.length - 1][0]) > 0) return "above";
  return L.some(([o]) => cmpOrdinal(o, ordinal) === 0) ? "step" : "between";
}

/** For each value of the first component, the bits of the lowest step that has it (P(first component ≥ value)). */
export function curveOf(table: CalibrationTable): { score: number; bits: number }[] {
  const seen = new Map<number, number>();
  for (const [o, s] of table.levels) { const k = arr(o)[0]; if (!seen.has(k)) seen.set(k, s); }
  return [...seen].map(([score, bits]) => ({ score, bits }));
}

export interface WorkingsInput {
  readonly breakdown: Breakdown;
  readonly components: readonly string[];
  readonly ordinal: Ordinal;
  readonly tables: WorkingsTables;
  /** The defence goal's badness ordinal on this board and the game's weight; with `tables.penalty`. */
  readonly defence?: { readonly ordinal: Ordinal; readonly weight: number };
  /** game-core's netBits, to finish the story (game-utilities does not depend on game-core). */
  readonly netBits?: (input: { rewardBits: number; penaltyBits?: number; penaltyMeanBits?: number }, weight: number) => number;
}

export function scoreWorkings(x: WorkingsInput): ScoreWorkings {
  const bits = bits0(surprisal(x.tables.reward, x.ordinal));
  const rarity: RarityWorkings = {
    ordinal: arr(x.ordinal), bits, probability: 2 ** -bits, spot: spotOf(x.tables.reward, x.ordinal), curve: curveOf(x.tables.reward),
  };
  let defence: DefenceWorkings | undefined, netBits: number | undefined;
  if (x.defence && x.tables.penalty) {
    const badnessBits = surprisal(x.tables.penalty, x.defence.ordinal);
    defence = {
      ordinal: arr(x.defence.ordinal), badnessBits, penaltyBits: bits0(softHinge(badnessBits)),
      meanBits: penaltyMeanBits(x.tables.penalty), weight: x.defence.weight,
    };
    netBits = x.netBits && bits0(x.netBits({ rewardBits: bits, penaltyBits: defence.penaltyBits, penaltyMeanBits: defence.meanBits }, defence.weight));
  } else if (x.netBits) netBits = bits0(x.netBits({ rewardBits: bits }, 0));
  return {
    components: x.components, rarity, ...(defence ? { defence } : {}), ...(netBits !== undefined ? { netBits } : {}),
    breakdown: { ...x.breakdown, total: arr(x.ordinal) },
  };
}
