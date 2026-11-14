/**
 * How a rule score becomes ✨ rarity, for the player's own rule: the bits of any ordinal as the engine counts them
 * (the reward table's surprisal, as scoreWorkings does), and a short scale of
 * representative rule scores from the table, so the size of a move can be anticipated. Pure.
 */
import { surprisal } from "../calibration.ts";
import type { Ordinal } from "../types.ts";
import type { WorkingsTables } from "./workings.ts";

const arr = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);

/** The ✨ rarity (reward bits) of a rule score under the game's tables: what "How this scores" shows for a board with it. */
export function rarityOf(tables: Pick<WorkingsTables, "reward">, ordinal: Ordinal): number {
  const bits = surprisal(tables.reward, ordinal);
  return bits === 0 ? 0 : bits;
}

export interface RarityScaleRow {
  /** The table step shown: the lowest rule score with this primary value. */
  readonly ordinal: readonly number[];
  readonly bits: number;
}

/**
 * At most `maxRows` rows of the table, lowest first: one step per value of the primary rule score (the lowest step
 * that has it), and when that is still too many, the first, the last and the steps nearest to evenly spaced ✨ between
 * them, so the scale shows how rarity grows over the whole range.
 */
export function rarityScale(tables: Pick<WorkingsTables, "reward">, maxRows = 5): RarityScaleRow[] {
  const seen = new Set<number>(), rows: RarityScaleRow[] = [];
  for (const [o] of tables.reward.levels) {
    const ordinal = arr(o);
    if (seen.has(ordinal[0])) continue;
    seen.add(ordinal[0]);
    rows.push({ ordinal, bits: rarityOf(tables, o) });
  }
  const n = Math.max(2, Math.floor(maxRows));
  if (rows.length <= n) return rows;
  const lo = rows[0].bits, hi = rows[rows.length - 1].bits;
  const picked = new Set<number>([0, rows.length - 1]);
  for (let k = 1; k < n - 1; k++) {
    const target = lo + (hi - lo) * k / (n - 1);
    let best = -1;
    for (let i = 1; i < rows.length - 1; i++) {
      if (picked.has(i)) continue;
      if (best < 0 || Math.abs(rows[i].bits - target) < Math.abs(rows[best].bits - target)) best = i;
    }
    if (best >= 0) picked.add(best);
  }
  return [...picked].sort((a, b) => a - b).map(i => rows[i]);
}
