/**
 * Equal opportunity (docs/rules-design.md P10): a family's params make PEER rules. Draws in one symmetry orbit share a
 * canonical table, so a family whose params are all symmetries has one table per shape; a family with several canonical
 * tables on a shape deals gods different rules, and those must still offer the same opportunity: the same top
 * achievable bits (within TOP_RATIO) and the same mean bits of a random board (within MEAN_DELTA), per shape.
 *
 * What would break: a new param that adds or removes scoring opportunity (diagonals on/off, rows|cols|both, targets of
 * different difficulty). Families that still violate are listed in VIOLATORS, which only shrinks: the test fails for a
 * violator not listed AND for a listed family that no longer violates (take it off the list).
 *
 * It reads whatever calibration is shipped (data/calibration/v1), so it keeps working when the calibration itself
 * changes (e.g. hold rarity). Tolerances: sampled tables' tops carry estimator noise, so a small band is allowed; 15% on
 * top bits and half a bit on the mean flag real gaps (Set Spotter's diagonals were 17%, Magic Accountant's rows vs both
 * 80%) and can be revisited if the data shows them too tight or too loose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shippedInstanceKeys, shippedFile } from "../src/calibration-data.ts";
import type { CalibrationTable } from "../src/calibration.ts";

/** The largest allowed ratio between a family's top achievable bits on one shape, and the largest mean-bits gap. */
const TOP_RATIO = 1.15, MEAN_DELTA = 0.5;

/** Families whose param classes still differ in opportunity (being fixed in batches). Only shrinks. */
const VIOLATORS: ReadonlySet<string> = new Set([
  "bit-sigil", "border_baron", "castle_keeper", "colour_mixer", "conqueror", "court_parade", "digit-devotee",
  "divisibility_detective", "firstborn", "haiku-master", "homebody", "looking_glass", "magic_accountant",
  "magic_window", "mirrormancer", "number_bonds", "number_sandwich", "numerologist", "odds_evens",
  "othello_sandwich", "palette-keeper", "palindromist", "pinwheel", "power-hoarder", "purist", "refrain",
  "residue-oracle", "round_numbers", "royal_court", "scale-keeper", "seesaw", "smooth-operator", "stepping_stones",
  "straight_shooter", "streaker", "sudoku_scholar", "tailwright", "tallykeeper", "tetromino_tamer",
  "times_table_territory", "twenty_one", "wallpaper_weaver",
]);

function stats(t: CalibrationTable): { top: number; mean: number } {
  const b = t.levels.map(l => l[1]);
  let mean = 0;
  for (let i = 0; i < b.length; i++) mean += (2 ** -b[i] - (i + 1 < b.length ? 2 ** -b[i + 1] : 0)) * b[i];
  return { top: b[b.length - 1], mean };
}

/** Every family whose canonical tables on some shipped shape differ beyond the tolerances, with the worst case. */
export function opportunityGaps(): Map<string, string> {
  const out = new Map<string, string>();
  for (const key of shippedInstanceKeys()) {
    const by = new Map<string, CalibrationTable[]>();
    for (const t of shippedFile(key)!.tables) {
      if ((t as { prior?: unknown }).prior) continue;
      by.set(t.family, [...(by.get(t.family) ?? []), t]);
    }
    for (const [family, ts] of by) {
      if (ts.length < 2) continue;
      const s = ts.map(stats), tops = s.map(x => x.top), means = s.map(x => x.mean);
      const ratio = Math.max(...tops) / Math.max(1e-9, Math.min(...tops)), gap = Math.max(...means) - Math.min(...means);
      if (ratio > TOP_RATIO || gap > MEAN_DELTA) {
        out.set(family, out.get(family) ?? `${key}: top bits ${Math.min(...tops).toFixed(1)}..${Math.max(...tops).toFixed(1)}, mean gap ${gap.toFixed(2)}`);
      }
    }
  }
  return out;
}

test("every family's params make peer rules of equal opportunity (or the family is a listed violator)", () => {
  const gaps = opportunityGaps();
  const fresh = [...gaps].filter(([f]) => !VIOLATORS.has(f)).map(([f, why]) => `${f} (${why})`);
  assert.deepEqual(fresh, [], "unequal opportunity between a family's params: fix the family (rules-design.md P10)");
  const fixed = [...VIOLATORS].filter(f => !gaps.has(f));
  assert.deepEqual(fixed, [], "these families are fixed: take them off VIOLATORS");
});
